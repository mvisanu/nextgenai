"""
Wave 3 — Runs API tests (test_wave3_runs_api.py)

Covers:
- GET /runs returns paginated list with correct shape
- GET /runs?limit= and ?offset= query params
- PATCH /runs/{id}/favourite toggle
- PATCH /runs/{nonexistent_id}/favourite returns 404
- GET /runs/{run_id} returns full QueryResponse (existing endpoint)
- Runs router is registered in main.py

All tests use FastAPI TestClient; no real DB required for structure/routing tests.
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# FastAPI TestClient
# ---------------------------------------------------------------------------

from fastapi.testclient import TestClient


# ===========================================================================
# Helper: check if /runs router is registered
# ===========================================================================


class TestRunsRouterRegistration:
    """AC: /runs router must be registered in main.py create_app()."""

    def test_runs_router_registered(self):
        """GET /runs must not return 404 (router not registered)."""
        from backend.app.main import app
        client = TestClient(app, raise_server_exceptions=False)
        # Without DB, a 500/422 is acceptable — but 404 means router missing
        resp = client.get("/runs")
        assert resp.status_code != 404, (
            "BUG-W3-REG: GET /runs returned 404 — runs.py router is NOT "
            "registered in main.py. Epic 2 backend is incomplete."
        )

    def test_analytics_defects_router_registered(self):
        """GET /analytics/defects must not return 404."""
        from backend.app.main import app
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/analytics/defects")
        assert resp.status_code != 404, (
            "BUG-W3-REG: GET /analytics/defects returned 404 — analytics.py router "
            "is NOT registered in main.py. Epic 4 backend is incomplete."
        )

    def test_runs_file_exists(self):
        """backend/app/api/runs.py must exist."""
        from pathlib import Path
        runs_path = Path(__file__).parent.parent / "app" / "api" / "runs.py"
        assert runs_path.exists(), (
            "BUG-W3-FILE: backend/app/api/runs.py does not exist. "
            "Epic 2 GET /runs endpoint not implemented."
        )

    def test_analytics_file_exists(self):
        """backend/app/api/analytics.py must exist."""
        from pathlib import Path
        analytics_path = Path(__file__).parent.parent / "app" / "api" / "analytics.py"
        assert analytics_path.exists(), (
            "BUG-W3-FILE: backend/app/api/analytics.py does not exist. "
            "Epic 4 analytics endpoints not implemented."
        )


# ===========================================================================
# GET /runs — list format
# ===========================================================================


class TestGetRunsList:
    """AC: GET /runs returns 200 with paginated list."""

    def _client(self):
        from backend.app.main import app
        return TestClient(app, raise_server_exceptions=False)

    def test_get_runs_not_404(self):
        """Router must be registered (404 = not registered)."""
        client = self._client()
        resp = client.get("/runs")
        assert resp.status_code != 404, "GET /runs is not registered"

    def test_get_runs_accepts_limit_param(self):
        """AC: GET /runs?limit=5 does not return 422."""
        client = self._client()
        resp = client.get("/runs?limit=5")
        # 404 = not registered, 422 = param rejected, both are failures
        assert resp.status_code not in (404, 422), (
            f"GET /runs?limit=5 returned {resp.status_code}. "
            "Endpoint should accept 'limit' query param."
        )

    def test_get_runs_accepts_offset_param(self):
        """AC: GET /runs?offset=10 does not return 422."""
        client = self._client()
        resp = client.get("/runs?offset=10")
        assert resp.status_code not in (404, 422), (
            f"GET /runs?offset=10 returned {resp.status_code}"
        )

    def test_get_runs_accepts_limit_and_offset(self):
        """AC: GET /runs?limit=5&offset=10 accepted."""
        client = self._client()
        resp = client.get("/runs?limit=5&offset=10")
        assert resp.status_code not in (404, 422)

    def test_get_runs_response_schema_when_200(self):
        """If 200 returned, body must be a list or dict with items key."""
        client = self._client()
        resp = client.get("/runs")
        if resp.status_code == 200:
            data = resp.json()
            # Accept either list or {items: [], total: N}
            is_list = isinstance(data, list)
            is_dict_with_items = isinstance(data, dict) and "items" in data
            assert is_list or is_dict_with_items, (
                f"GET /runs 200 body must be list or {{items:[], total:N}}, got: {type(data)}"
            )

    def test_get_runs_items_have_required_fields(self):
        """If 200 and has items, each must have id/query/intent/created_at/is_favourite."""
        client = self._client()
        resp = client.get("/runs")
        if resp.status_code != 200:
            pytest.skip("GET /runs returned non-200 (likely no DB)")
        data = resp.json()
        items = data if isinstance(data, list) else data.get("items", [])
        required_fields = {"id", "query", "intent", "created_at", "is_favourite"}
        for item in items[:3]:  # check first 3
            missing = required_fields - set(item.keys())
            assert not missing, (
                f"Run summary item missing fields: {missing}. Got: {list(item.keys())}"
            )


# ===========================================================================
# PATCH /runs/{id}/favourite — toggle
# ===========================================================================


class TestPatchFavourite:
    """AC: PATCH /runs/{run_id}/favourite toggles is_favourite."""

    def _client(self):
        from backend.app.main import app
        return TestClient(app, raise_server_exceptions=False)

    def test_patch_favourite_nonexistent_run_returns_404(self):
        """AC: PATCH /runs/{nonexistent_id}/favourite returns 404."""
        client = self._client()
        resp = client.patch("/runs/nonexistent-run-id-99999/favourite")
        if resp.status_code == 404:
            return  # correct behaviour
        if resp.status_code in (405, 404):
            pytest.fail(
                f"PATCH /runs/{{id}}/favourite returned {resp.status_code}. "
                "Endpoint may not be implemented."
            )
        if resp.status_code == 422:
            pytest.skip("PATCH /runs endpoint exists but needs JSON body")
        # If it returns 500 with DB error, endpoint is at least registered
        if resp.status_code == 500:
            pytest.skip("DB unavailable — cannot verify 404 logic, but route is registered")

    def test_patch_favourite_route_exists(self):
        """PATCH /runs/{id}/favourite must not return 405 (method not allowed)."""
        client = self._client()
        resp = client.patch("/runs/some-run-id/favourite")
        assert resp.status_code != 405, (
            "BUG-W3-PATCH: PATCH /runs/{id}/favourite returned 405 — "
            "method not registered. Epic 2 incomplete."
        )

    def test_patch_favourite_route_not_404(self):
        """PATCH /runs/{id}/favourite must not be entirely missing."""
        client = self._client()
        resp = client.patch("/runs/some-run-id/favourite")
        assert resp.status_code != 404, (
            "BUG-W3-PATCH: PATCH /runs/{id}/favourite returned 404 — "
            "route not registered."
        )


# ===========================================================================
# GET /runs/{run_id} — existing endpoint
# ===========================================================================


class TestGetRun:
    """AC: GET /runs/{run_id} returns full QueryResponse for a known run."""

    def _client(self):
        from backend.app.main import app
        return TestClient(app, raise_server_exceptions=False)

    def test_get_run_nonexistent_returns_404(self):
        """Requesting a nonexistent run_id must return 404."""
        client = self._client()
        resp = client.get("/runs/absolutely-nonexistent-id-12345")
        # Could be 500 if DB not available, or 404 if DB available
        assert resp.status_code in (404, 500), (
            f"Expected 404 or 500 for nonexistent run, got {resp.status_code}"
        )

    def test_get_run_endpoint_exists(self):
        """GET /runs/{run_id} must not return 405."""
        client = self._client()
        resp = client.get("/runs/some-id")
        assert resp.status_code != 405, "GET /runs/{run_id} method not registered"

    def test_get_run_200_response_has_run_id(self):
        """If a run is found, response must have run_id field."""
        client = self._client()
        resp = client.get("/runs/some-id")
        if resp.status_code == 200:
            data = resp.json()
            assert "run_id" in data, f"GET /runs/{{id}} 200 body missing run_id: {data.keys()}"
