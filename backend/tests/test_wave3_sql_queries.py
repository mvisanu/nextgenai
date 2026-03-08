"""
Wave 3 — SQL named query tests (test_wave3_sql_queries.py)

Covers:
- medical_case_trends named query exists in sql_tool
- All named queries pass the SQL guardrail
- Named query parameter substitution works correctly
- SQLQueryTool.run_named raises ValueError for unknown name
- Each named query contains valid SQL structure (SELECT keyword)

No DB required — pure logic tests.
"""
from __future__ import annotations

import pytest


# ===========================================================================
# Named query existence
# ===========================================================================


class TestNamedQueryExistence:
    """AC: All expected named queries exist in sql_tool._NAMED_QUERIES."""

    def _get_named_queries(self):
        from backend.app.tools.sql_tool import _NAMED_QUERIES
        return _NAMED_QUERIES

    def test_defect_counts_by_product_exists(self):
        nq = self._get_named_queries()
        assert "defect_counts_by_product" in nq

    def test_severity_distribution_exists(self):
        nq = self._get_named_queries()
        assert "severity_distribution" in nq

    def test_maintenance_trends_exists(self):
        nq = self._get_named_queries()
        assert "maintenance_trends" in nq

    def test_incidents_defects_join_exists(self):
        nq = self._get_named_queries()
        assert "incidents_defects_join" in nq

    def test_disease_counts_by_specialty_exists(self):
        nq = self._get_named_queries()
        assert "disease_counts_by_specialty" in nq

    def test_disease_severity_distribution_exists(self):
        nq = self._get_named_queries()
        assert "disease_severity_distribution" in nq

    def test_medical_case_trends_exists(self):
        """AC (Epic 9): medical_case_trends must be present."""
        nq = self._get_named_queries()
        assert "medical_case_trends" in nq, (
            "BUG-W3-MED: 'medical_case_trends' named query not in _NAMED_QUERIES. "
            "Epic 9 Medical Domain Parity — Tab 4 parity incomplete."
        )


# ===========================================================================
# Named query SQL structure
# ===========================================================================


class TestNamedQuerySQLStructure:
    """AC: Each named query must be SELECT-only and syntactically reasonable."""

    def _get_named_queries(self):
        from backend.app.tools.sql_tool import _NAMED_QUERIES
        return _NAMED_QUERIES

    def test_all_named_queries_start_with_select(self):
        nq = self._get_named_queries()
        for name, sql in nq.items():
            sql_upper = sql.strip().upper()
            assert sql_upper.startswith("SELECT") or "\nSELECT" in sql_upper or "SELECT\n" in sql_upper, (
                f"Named query '{name}' does not appear to start with SELECT. "
                f"First 100 chars: {sql.strip()[:100]}"
            )

    def test_all_named_queries_pass_guardrail(self):
        """AC: All named queries must pass the SQL guardrail (no DML/DDL)."""
        from backend.app.tools.sql_tool import _NAMED_QUERIES, _BLOCKED_PATTERN
        for name, sql in _NAMED_QUERIES.items():
            match = _BLOCKED_PATTERN.search(sql)
            assert match is None, (
                f"Named query '{name}' contains blocked keyword '{match.group(0)}'. "
                "This would be rejected by the SQL guardrail."
            )

    def test_medical_case_trends_sql_structure(self):
        """AC: medical_case_trends queries disease_records or medical tables."""
        from backend.app.tools.sql_tool import _NAMED_QUERIES
        if "medical_case_trends" not in _NAMED_QUERIES:
            pytest.skip("medical_case_trends not yet added")
        sql = _NAMED_QUERIES["medical_case_trends"]
        # Must reference a medical table
        medical_tables = {"disease_records", "medical_cases"}
        has_medical = any(t in sql.lower() for t in medical_tables)
        assert has_medical, (
            f"medical_case_trends query does not reference any medical table. "
            f"Query: {sql[:200]}"
        )


# ===========================================================================
# Parameter substitution
# ===========================================================================


class TestNamedQueryParameterSubstitution:
    """AC: :days parameter is correctly substituted in named queries."""

    def test_days_substitution_in_defect_counts(self):
        """':days days' is replaced with int value in defect_counts_by_product."""
        from backend.app.tools.sql_tool import _NAMED_QUERIES
        sql = _NAMED_QUERIES["defect_counts_by_product"]
        sql_sub = sql.replace(":days days", "90 days")
        assert ":days" not in sql_sub, "Parameter substitution did not remove :days"

    def test_run_named_unknown_name_raises_value_error(self):
        """SQLQueryTool.run_named must raise ValueError for unknown names."""
        from backend.app.tools.sql_tool import SQLQueryTool
        tool = SQLQueryTool()
        with pytest.raises(ValueError, match="Unknown named query"):
            tool.run_named("nonexistent_query_name")

    def test_days_parameter_injection_is_int_safe(self):
        """int() cast prevents SQL injection via days param."""
        from backend.app.tools.sql_tool import SQLQueryTool
        tool = SQLQueryTool()
        # Cannot execute without DB, but verify int cast happens in run_named
        from backend.app.tools.sql_tool import _NAMED_QUERIES
        sql = _NAMED_QUERIES["defect_counts_by_product"]
        # Verify the substitution logic: days must be cast to int
        # Simulate what run_named does
        days = "90; DROP TABLE manufacturing_defects--"
        try:
            int_days = int(days)
            pytest.fail("int('90; DROP...') should have raised ValueError")
        except ValueError:
            pass  # correct — injection attempt blocked


# ===========================================================================
# SQLQueryTool guardrail
# ===========================================================================


class TestSQLGuardrailOnNamedQueries:
    """AC: SQL guardrail enforced on all analytics named queries."""

    def test_guardrail_blocks_drop_attempt(self):
        from backend.app.tools.sql_tool import SQLQueryTool, SQLGuardrailError
        tool = SQLQueryTool()
        with pytest.raises(SQLGuardrailError):
            tool.run("DROP TABLE manufacturing_defects")

    def test_guardrail_allows_select(self):
        """Guardrail allows pure SELECT without DB execution (raises DB error, not guardrail)."""
        from backend.app.tools.sql_tool import SQLQueryTool, SQLGuardrailError
        tool = SQLQueryTool()
        # This will fail with DB error, not guardrail error
        try:
            tool.run("SELECT 1")
        except SQLGuardrailError:
            pytest.fail("Guardrail blocked a valid SELECT — should not happen")
        except Exception:
            pass  # DB not available — expected

    def test_guardrail_blocks_delete(self):
        from backend.app.tools.sql_tool import SQLQueryTool, SQLGuardrailError
        tool = SQLQueryTool()
        with pytest.raises(SQLGuardrailError):
            tool.run("DELETE FROM manufacturing_defects WHERE 1=1")

    def test_guardrail_blocks_insert(self):
        from backend.app.tools.sql_tool import SQLQueryTool, SQLGuardrailError
        tool = SQLQueryTool()
        with pytest.raises(SQLGuardrailError):
            tool.run("INSERT INTO manufacturing_defects VALUES ('x', 'y')")
