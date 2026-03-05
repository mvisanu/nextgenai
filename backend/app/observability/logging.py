"""
Structured JSON logging for NextAgentAI.
All log entries are newline-delimited JSON emitted to stdout.
Secrets (API keys, DSNs) are automatically scrubbed before emission.
"""
from __future__ import annotations

import logging
import os
import re
import sys
from typing import Any

from pythonjsonlogger import jsonlogger

# ---------------------------------------------------------------------------
# Secret scrubbing patterns — add patterns here as new secrets are introduced
# ---------------------------------------------------------------------------
_SECRET_PATTERNS: list[re.Pattern] = [
    re.compile(r"sk-ant-[A-Za-z0-9\-_]{20,}", re.IGNORECASE),   # Anthropic API key
    re.compile(r"postgresql(?:\+\w+)?://[^@\s]+@[^\s]+"),         # DB DSN with credentials
    re.compile(r"postgres(?:ql)?://[^@\s]+@[^\s]+"),
    re.compile(r"ANTHROPIC_API_KEY\s*=\s*\S+", re.IGNORECASE),
]

_REPLACEMENT = "[REDACTED]"


def scrub_secrets(value: Any) -> Any:
    """
    Recursively scrub secret values from dicts, lists, and strings.
    Returns a sanitised copy; never mutates the original.
    """
    if isinstance(value, str):
        for pattern in _SECRET_PATTERNS:
            value = pattern.sub(_REPLACEMENT, value)
        return value
    if isinstance(value, dict):
        return {k: scrub_secrets(v) for k, v in value.items()}
    if isinstance(value, list):
        return [scrub_secrets(item) for item in value]
    return value


class _ScrubFilter(logging.Filter):
    """Log filter that scrubs secrets from all string and dict fields in a LogRecord."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = scrub_secrets(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = scrub_secrets(record.args)
            elif isinstance(record.args, tuple):
                record.args = tuple(scrub_secrets(a) for a in record.args)
        # Scrub any extra fields that were added directly to the record
        for key in list(vars(record).keys()):
            if key.startswith("_") or key in (
                "name", "msg", "args", "levelname", "levelno",
                "pathname", "filename", "module", "exc_info",
                "exc_text", "stack_info", "lineno", "funcName",
                "created", "msecs", "relativeCreated", "thread",
                "threadName", "processName", "process",
            ):
                continue
            setattr(record, key, scrub_secrets(getattr(record, key)))
        return True


# ---------------------------------------------------------------------------
# Logger factory — call once per module
# ---------------------------------------------------------------------------

_loggers: dict[str, logging.Logger] = {}
_handler_installed = False


def _install_root_handler() -> None:
    """Install the JSON handler on the root logger exactly once."""
    global _handler_installed
    if _handler_installed:
        return

    handler = logging.StreamHandler(sys.stdout)
    formatter = jsonlogger.JsonFormatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
        rename_fields={"asctime": "timestamp", "levelname": "level", "name": "logger"},
    )
    handler.setFormatter(formatter)
    handler.addFilter(_ScrubFilter())

    root = logging.getLogger()
    root.setLevel(logging.INFO)
    # Avoid duplicate handlers when module is reloaded in tests
    if not any(isinstance(h, logging.StreamHandler) for h in root.handlers):
        root.addHandler(handler)

    _handler_installed = True


def get_logger(name: str) -> logging.Logger:
    """
    Return a module-level structured JSON logger.

    Usage:
        logger = get_logger(__name__)
        logger.info("Ingest started", extra={"rows": 10000})
    """
    _install_root_handler()

    if name not in _loggers:
        logger = logging.getLogger(name)
        _loggers[name] = logger
    return _loggers[name]
