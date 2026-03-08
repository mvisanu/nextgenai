"""
Wave 3 — Compute Tool CR-007 fix (test_wave3_compute_tool.py)

Covers:
- CR-007: compute_tool.py run_async() must NOT use asyncio.get_event_loop()
- grep-equivalent check: zero get_event_loop calls in backend/app/
- Verify asyncio.get_running_loop() used instead

AC from Epic 10:
  grep -r "get_event_loop" backend/ returns zero results
"""
from __future__ import annotations

from pathlib import Path

import pytest


BACKEND_APP = Path(__file__).parent.parent / "app"
COMPUTE_TOOL_PATH = BACKEND_APP / "tools" / "compute_tool.py"


# ===========================================================================
# CR-007 fix verification
# ===========================================================================


class TestCR007Fix:
    """AC (Epic 10): asyncio.get_event_loop() must be replaced with get_running_loop()."""

    def test_compute_tool_exists(self):
        assert COMPUTE_TOOL_PATH.exists(), "compute_tool.py not found"

    def test_get_event_loop_not_in_compute_tool(self):
        """AC: compute_tool.py must not call asyncio.get_event_loop()."""
        content = COMPUTE_TOOL_PATH.read_text()
        assert "get_event_loop" not in content, (
            "BUG-CR-007 (OPEN): compute_tool.py still uses asyncio.get_event_loop() "
            "in run_async(). This is deprecated since Python 3.10 and will raise "
            "DeprecationWarning. Must be replaced with asyncio.get_running_loop(). "
            "Epic 10 CR-007 fix has NOT been applied."
        )

    def test_get_running_loop_used_in_compute_tool(self):
        """AC: run_async() should use get_running_loop() instead."""
        content = COMPUTE_TOOL_PATH.read_text()
        # Only relevant if get_event_loop was removed
        if "get_event_loop" in content:
            pytest.skip("get_event_loop still present — checked in separate test")
        assert "get_running_loop" in content, (
            "compute_tool.py removed get_event_loop but doesn't use get_running_loop. "
            "Check the run_async() implementation."
        )

    def test_no_get_event_loop_in_entire_backend(self):
        """AC: grep -r 'get_event_loop' backend/ returns zero results."""
        violations = []
        for py_file in BACKEND_APP.rglob("*.py"):
            content = py_file.read_text(errors="replace")
            if "get_event_loop" in content:
                # Exclude comments
                for i, line in enumerate(content.splitlines(), 1):
                    if "get_event_loop" in line and not line.strip().startswith("#"):
                        violations.append(f"{py_file.relative_to(BACKEND_APP.parent)}:{i}: {line.strip()}")
        assert not violations, (
            f"BUG-CR-007: asyncio.get_event_loop() found in backend code:\n"
            + "\n".join(violations)
            + "\nAll occurrences must be replaced with asyncio.get_running_loop()."
        )

    def test_compute_tool_run_async_is_defined(self):
        """run_async() method must exist in PythonComputeTool."""
        content = COMPUTE_TOOL_PATH.read_text()
        assert "async def run_async" in content, (
            "compute_tool.py has no run_async() method"
        )
