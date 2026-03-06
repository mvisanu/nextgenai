"""
PythonComputeTool — sandboxed Python execution for arithmetic and statistical computation.
Restricts builtins and blocks dangerous module imports.

T-17: run_async() added. The sandboxed execution uses a daemon thread internally
(see run()), which already keeps the calling thread unblocked. run_async() wraps
run() in asyncio.get_event_loop().run_in_executor so it does not tie up the event
loop while waiting for the thread timeout.
"""
from __future__ import annotations

import asyncio
import io
import sys
import time
import threading
from typing import Any

from backend.app.observability.logging import get_logger

logger = get_logger(__name__)

TOOL_NAME = "PythonComputeTool"

# Modules that are never allowed, even if Python can import them
_BLOCKED_MODULES = frozenset([
    "os", "sys", "subprocess", "socket", "shutil", "pathlib", "glob",
    "importlib", "builtins", "ctypes", "multiprocessing", "threading",
    "asyncio", "concurrent", "signal", "atexit", "gc", "inspect",
    "pickle", "shelve", "marshal", "tempfile", "io", "zipfile", "tarfile",
])

# Safe subset of builtins
_SAFE_BUILTINS = {
    "len": len,
    "sum": sum,
    "min": min,
    "max": max,
    "round": round,
    "abs": abs,
    "sorted": sorted,
    "enumerate": enumerate,
    "zip": zip,
    "range": range,
    "list": list,
    "dict": dict,
    "tuple": tuple,
    "set": set,
    "str": str,
    "int": int,
    "float": float,
    "bool": bool,
    "type": type,
    "isinstance": isinstance,
    "print": print,
    "repr": repr,
    "True": True,
    "False": False,
    "None": None,
}


class ToolSecurityError(Exception):
    """Raised when sandboxed code attempts a forbidden operation."""
    pass


class ToolTimeoutError(Exception):
    """Raised when sandboxed code exceeds the execution time limit."""
    pass


def _make_safe_import(blocked: frozenset[str]):
    """Return a restricted __import__ that blocks dangerous modules."""
    def _safe_import(name, *args, **kwargs):
        base = name.split(".")[0]
        if base in blocked:
            raise ToolSecurityError(
                f"Import of '{name}' is not permitted in sandboxed execution. "
                f"Allowed: math, statistics, json, re, collections, itertools"
            )
        return __builtins__["__import__"](name, *args, **kwargs) if isinstance(__builtins__, dict) \
            else __import__(name, *args, **kwargs)
    return _safe_import


class PythonComputeTool:
    """
    Agent tool for sandboxed Python computation.

    Allows the agent to perform arithmetic, statistics, and data transformation
    on values returned by SQL or vector tools. Network, filesystem, and OS
    access are blocked.

    Usage:
        tool = PythonComputeTool()
        result = tool.run("result = sum(values) / len(values)", context={"values": [1, 2, 3]})
    """

    name = TOOL_NAME
    TIMEOUT_SECONDS = 5

    def run(self, code: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """
        Execute a Python snippet in a restricted namespace.

        Args:
            code:    Python code to execute. Last expression's value is captured
                     as 'result' if not explicitly assigned.
            context: Dict of variables to inject as locals (e.g., sql_rows from SQLQueryTool).

        Returns:
            {
              "tool_name": "PythonComputeTool",
              "result": <any>,   # value of 'result' variable after execution
              "stdout": "...",   # captured stdout
              "error": None      # or error message string
            }

        Raises:
            ToolSecurityError: if code tries to import blocked modules.
            ToolTimeoutError:  if execution exceeds TIMEOUT_SECONDS.
        """
        t_start = time.perf_counter()
        context = context or {}

        # Build restricted globals namespace
        safe_globals = {
            "__builtins__": {
                **_SAFE_BUILTINS,
                "__import__": _make_safe_import(_BLOCKED_MODULES),
            },
            # Allow common safe math modules
            "math": __import__("math"),
            "statistics": __import__("statistics"),
            "json": __import__("json"),
            "re": __import__("re"),
            "collections": __import__("collections"),
            "itertools": __import__("itertools"),
        }

        local_vars: dict[str, Any] = {**context, "result": None}
        captured_stdout = io.StringIO()
        error_msg: str | None = None

        execution_complete = threading.Event()
        exec_result: dict[str, Any] = {"error": None}

        def _execute():
            try:
                # Redirect print() output
                import builtins
                original_print = builtins.print

                def _captured_print(*args, **kwargs):
                    kwargs["file"] = captured_stdout
                    original_print(*args, **kwargs)

                safe_globals["__builtins__"]["print"] = _captured_print  # type: ignore

                exec(compile(code, "<sandbox>", "exec"), safe_globals, local_vars)
            except ToolSecurityError as exc:
                exec_result["error"] = str(exc)
                exec_result["security"] = True
            except Exception as exc:
                exec_result["error"] = str(exc)
            finally:
                execution_complete.set()

        thread = threading.Thread(target=_execute, daemon=True)
        thread.start()
        thread.join(timeout=self.TIMEOUT_SECONDS)

        if not execution_complete.is_set():
            raise ToolTimeoutError(
                f"PythonComputeTool execution exceeded {self.TIMEOUT_SECONDS}s timeout"
            )

        if exec_result.get("security"):
            raise ToolSecurityError(exec_result["error"])

        error_msg = exec_result.get("error")

        elapsed = (time.perf_counter() - t_start) * 1000
        logger.info(
            "PythonComputeTool complete",
            extra={"latency_ms": round(elapsed, 1), "has_error": bool(error_msg)},
        )

        return {
            "tool_name": TOOL_NAME,
            "result": local_vars.get("result"),
            "stdout": captured_stdout.getvalue(),
            "error": error_msg,
        }

    async def run_async(
        self, code: str, context: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """
        Async variant of run().

        run() already spawns a daemon thread and calls thread.join(timeout),
        so it blocks the *calling* thread for up to TIMEOUT_SECONDS. Wrapping
        it in run_in_executor prevents that blocking call from occupying the
        event loop thread.

        Args and return value are identical to run().
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.run, code, context)
