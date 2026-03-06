"""
T-INF-02: /healthz Cache-Control header regression test.

Asserts the endpoint always returns Cache-Control: no-store so that CDNs
and proxies do not cache health-check responses and serve stale status.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

from starlette.testclient import TestClient

from backend.app.main import app


def test_healthz_cache_control_no_store() -> None:
    """GET /healthz must respond 200 with Cache-Control: no-store."""
    # Patch DB health check so this test does not require a live database.
    with patch(
        "backend.app.api.docs.check_db_health",
        new=AsyncMock(return_value=True),
    ):
        with TestClient(app, raise_server_exceptions=True) as client:
            response = client.get("/healthz")

    assert response.status_code == 200, (
        f"/healthz returned {response.status_code}, expected 200"
    )
    assert response.headers.get("cache-control") == "no-store", (
        f"cache-control header is {response.headers.get('cache-control')!r}, expected 'no-store'"
    )
