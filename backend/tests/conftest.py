"""
Pytest configuration for backend test suite.

Inserts the versioned anthropic stub (tests/stubs/) at sys.path[0] so it
takes precedence over any installed anthropic package.  This keeps tests
hermetic and independent of the venv-installed stub.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Resolve: backend/tests/stubs
_STUBS_DIR = str(Path(__file__).parent / "stubs")

if _STUBS_DIR not in sys.path:
    sys.path.insert(0, _STUBS_DIR)
