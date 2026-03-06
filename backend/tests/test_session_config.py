"""
T-INF-01: Pool configuration regression tests for session.py.

Asserts that both sync and async engines are created with pool_timeout=30
so that a regression to the default (30s is correct; a change to e.g. 5)
is caught immediately.
"""
from __future__ import annotations

import os

import pytest

# Provide a dummy DSN so session.py does not raise EnvironmentError at import time.
# The engines are lazily created, so the DSN is only consumed when get_*_engine()
# is first called.  We patch it before any engine is constructed.
os.environ.setdefault("PG_DSN", "postgresql://test:test@localhost:5432/test")


def test_sync_engine_pool_timeout() -> None:
    """sync_engine must be configured with pool_timeout=30."""
    from backend.app.db.session import get_sync_engine

    engine = get_sync_engine()
    assert engine.pool.timeout() == 30, (
        f"sync_engine pool_timeout is {engine.pool.timeout()}, expected 30"
    )


def test_async_engine_pool_timeout() -> None:
    """async_engine must be configured with pool_timeout=30."""
    from backend.app.db.session import get_async_engine

    engine = get_async_engine()
    # AsyncEngine wraps a sync pool; access via .sync_engine.pool
    assert engine.sync_engine.pool.timeout() == 30, (
        f"async_engine pool_timeout is {engine.sync_engine.pool.timeout()}, expected 30"
    )
