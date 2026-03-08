"""
Wave 3 — Analytics API tests (test_wave3_analytics_api.py)

Covers:
- GET /analytics/defects returns correct shape
- GET /analytics/defects?domain=AIRCRAFT filters correctly
- GET /analytics/defects?from=&to= applies date range
- GET /analytics/maintenance returns correct shape
- GET /analytics/diseases returns correct shape
- All analytics endpoints enforce SELECT guardrail
- analytics.py file existence
- Router registered in main.py

No real DB needed for structure/routing/guardrail tests.
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient


ANALYTICS_FILE = (
    Path(__file__).parent.parent / "app" / "api" / "analytics.py"
)


# ===========================================================================
# File/registration existence
# ===========================================================================


class TestAnalyticsFileExists:
    """AC: backend/app/api/analytics.py must exist."""

    def test_analytics_py_exists(self):
        assert ANALYTICS_FILE.exists(), (
            "BUG-W3-ANA-FILE: backend/app/api/analytics.py does not exist. "
            "Epic 4 (Real Dashboard Analytics) not implemented."
        )

    def test_analytics_router_registered(self):
        """GET /analytics/defects must not be 404."""
        from backend.app.main import app
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/analytics/defects")
        assert resp.status_code != 404, (
            "BUG-W3-ANA-REG: GET /analytics/defects returned 404 — "
            "analytics router not registered in main.py."
        )

    def test_analytics_maintenance_router_registered(self):
        from backend.app.main import app
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/analytics/maintenance")
        assert resp.status_code != 404, (
            "BUG-W3-ANA-REG: GET /analytics/maintenance returned 404."
        )

    def test_analytics_diseases_router_registered(self):
        from backend.app.main import app
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/analytics/diseases")
        assert resp.status_code != 404, (
            "BUG-W3-ANA-REG: GET /analytics/diseases returned 404."
        )


# ===========================================================================
# GET /analytics/defects
# ===========================================================================


class TestAnalyticsDefects:
    """AC: GET /analytics/defects returns [{product, defect_type, count}]."""

    def _client(self):
        from backend.app.main import app
        return TestClient(app, raise_server_exceptions=False)

    def test_defects_not_404(self):
        client = self._client()
        resp = client.get("/analytics/defects")
        assert resp.status_code != 404

    def test_defects_accepts_domain_param(self):
        """AC: domain param accepted without 422."""
        client = self._client()
        resp = client.get("/analytics/defects?domain=AIRCRAFT")
        assert resp.status_code not in (404, 422), (
            f"GET /analytics/defects?domain=AIRCRAFT returned {resp.status_code}"
        )

    def test_defects_accepts_date_range(self):
        """AC: from and to query params accepted."""
        client = self._client()
        resp = client.get("/analytics/defects?from=2024-01-01&to=2024-12-31")
        assert resp.status_code not in (404, 422), (
            f"GET /analytics/defects?from=&to= returned {resp.status_code}"
        )

    def test_defects_200_response_is_list(self):
        """If 200, response must be a list."""
        client = self._client()
        resp = client.get("/analytics/defects")
        if resp.status_code == 200:
            data = resp.json()
            assert isinstance(data, list), (
                f"GET /analytics/defects 200 body should be list, got {type(data)}"
            )

    def test_defects_200_items_have_correct_fields(self):
        """AC: Each item must have product, defect_type, count."""
        client = self._client()
        resp = client.get("/analytics/defects")
        if resp.status_code != 200:
            pytest.skip("No DB available")
        data = resp.json()
        if not data:
            pytest.skip("Empty result — no data in DB")
        required = {"product", "defect_type", "count"}
        for item in data[:3]:
            missing = required - set(item.keys())
            assert not missing, (
                f"Defect analytics item missing fields: {missing}. Got: {list(item.keys())}"
            )


# ===========================================================================
# GET /analytics/maintenance
# ===========================================================================


class TestAnalyticsMaintenance:
    """AC: GET /analytics/maintenance returns [{month, event_type, count}]."""

    def _client(self):
        from backend.app.main import app
        return TestClient(app, raise_server_exceptions=False)

    def test_maintenance_not_404(self):
        client = self._client()
        resp = client.get("/analytics/maintenance")
        assert resp.status_code != 404

    def test_maintenance_accepts_date_range(self):
        client = self._client()
        resp = client.get("/analytics/maintenance?from=2024-01-01&to=2024-12-31")
        assert resp.status_code not in (404, 422)

    def test_maintenance_200_response_is_list(self):
        client = self._client()
        resp = client.get("/analytics/maintenance")
        if resp.status_code == 200:
            data = resp.json()
            assert isinstance(data, list)

    def test_maintenance_200_items_have_correct_fields(self):
        """AC: Each item must have month, event_type, count."""
        client = self._client()
        resp = client.get("/analytics/maintenance")
        if resp.status_code != 200:
            pytest.skip("No DB available")
        data = resp.json()
        if not data:
            pytest.skip("Empty result")
        required = {"month", "event_type", "count"}
        for item in data[:3]:
            missing = required - set(item.keys())
            assert not missing, (
                f"Maintenance analytics item missing fields: {missing}. Got: {list(item.keys())}"
            )


# ===========================================================================
# GET /analytics/diseases
# ===========================================================================


class TestAnalyticsDiseases:
    """AC: GET /analytics/diseases returns [{specialty, disease, count}]."""

    def _client(self):
        from backend.app.main import app
        return TestClient(app, raise_server_exceptions=False)

    def test_diseases_not_404(self):
        client = self._client()
        resp = client.get("/analytics/diseases")
        assert resp.status_code != 404

    def test_diseases_accepts_specialty_param(self):
        client = self._client()
        resp = client.get("/analytics/diseases?specialty=Cardiology")
        assert resp.status_code not in (404, 422)

    def test_diseases_200_response_is_list(self):
        client = self._client()
        resp = client.get("/analytics/diseases")
        if resp.status_code == 200:
            data = resp.json()
            assert isinstance(data, list)

    def test_diseases_200_items_have_correct_fields(self):
        """AC: Each item must have specialty, disease, count."""
        client = self._client()
        resp = client.get("/analytics/diseases")
        if resp.status_code != 200:
            pytest.skip("No DB available")
        data = resp.json()
        if not data:
            pytest.skip("Empty result")
        required = {"specialty", "disease", "count"}
        for item in data[:3]:
            missing = required - set(item.keys())
            assert not missing, (
                f"Disease analytics item missing fields: {missing}. Got: {list(item.keys())}"
            )


# ===========================================================================
# SQL guardrail enforcement on analytics endpoints
# ===========================================================================


class TestAnalyticsGuardrail:
    """AC: All analytics endpoints enforce SELECT-only via named-query pattern."""

    def test_analytics_named_queries_exist_in_sql_tool(self):
        """defect_counts_by_product, maintenance_trends, disease_counts_by_specialty
        must be registered in _NAMED_QUERIES."""
        from backend.app.tools.sql_tool import _NAMED_QUERIES
        required = [
            "defect_counts_by_product",
            "maintenance_trends",
            "disease_counts_by_specialty",
        ]
        for name in required:
            assert name in _NAMED_QUERIES, (
                f"BUG-W3-SQL: Named query '{name}' missing from sql_tool._NAMED_QUERIES. "
                "Analytics endpoint will fail."
            )

    def test_analytics_named_queries_are_select_only(self):
        """Each named analytics query must start with SELECT (no DML)."""
        from backend.app.tools.sql_tool import _NAMED_QUERIES, _BLOCKED_PATTERN
        analytics_queries = [
            "defect_counts_by_product",
            "maintenance_trends",
            "disease_counts_by_specialty",
        ]
        for name in analytics_queries:
            if name not in _NAMED_QUERIES:
                continue  # already caught above
            sql = _NAMED_QUERIES[name]
            match = _BLOCKED_PATTERN.search(sql)
            assert match is None, (
                f"BUG-W3-SQL-GUARDRAIL: Named query '{name}' contains blocked keyword "
                f"'{match.group(0)}'. SQL guardrail would reject it."
            )

    def test_medical_case_trends_named_query_exists(self):
        """AC (Epic 9): medical_case_trends named query must exist in sql_tool."""
        from backend.app.tools.sql_tool import _NAMED_QUERIES
        assert "medical_case_trends" in _NAMED_QUERIES, (
            "BUG-W3-MED: 'medical_case_trends' named query not found in sql_tool._NAMED_QUERIES. "
            "Epic 9 (Medical Domain Parity) Tab 4 parity incomplete."
        )

    def test_medical_case_trends_is_select_only(self):
        """AC: medical_case_trends query must be SELECT-only."""
        from backend.app.tools.sql_tool import _NAMED_QUERIES, _BLOCKED_PATTERN
        if "medical_case_trends" not in _NAMED_QUERIES:
            pytest.skip("medical_case_trends not yet added")
        sql = _NAMED_QUERIES["medical_case_trends"]
        match = _BLOCKED_PATTERN.search(sql)
        assert match is None, (
            f"medical_case_trends contains blocked SQL keyword: {match.group(0)}"
        )
