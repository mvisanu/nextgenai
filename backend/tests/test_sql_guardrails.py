"""
T-042: SQL guardrail tests.
Verifies that SQLQueryTool rejects all DML/DDL and accepts valid SELECT.
Does NOT require a database connection — guardrail operates purely on the SQL string.
"""
from __future__ import annotations

import pytest

from backend.app.tools.sql_tool import SQLGuardrailError, _BLOCKED_PATTERN


# ---------------------------------------------------------------------------
# Helper: test only the regex guardrail without executing SQL
# ---------------------------------------------------------------------------

def _check_guardrail(sql: str) -> None:
    """Raise SQLGuardrailError if sql matches the blocked pattern."""
    match = _BLOCKED_PATTERN.search(sql)
    if match:
        raise SQLGuardrailError(
            f"SQL guardrail violation: statement contains blocked keyword '{match.group(0)}'"
        )


# ---------------------------------------------------------------------------
# Blocked statements — must raise SQLGuardrailError
# ---------------------------------------------------------------------------


class TestBlockedStatements:

    def test_drop_table(self):
        with pytest.raises(SQLGuardrailError, match="DROP"):
            _check_guardrail("DROP TABLE incident_reports")

    def test_drop_table_if_exists(self):
        with pytest.raises(SQLGuardrailError):
            _check_guardrail("DROP TABLE IF EXISTS foo")

    def test_delete_from(self):
        with pytest.raises(SQLGuardrailError, match="DELETE"):
            _check_guardrail("DELETE FROM manufacturing_defects WHERE 1=1")

    def test_delete_lowercase(self):
        with pytest.raises(SQLGuardrailError):
            _check_guardrail("delete from bar")

    def test_update_set(self):
        with pytest.raises(SQLGuardrailError, match="UPDATE"):
            _check_guardrail("UPDATE incident_reports SET severity = 'critical'")

    def test_update_mixed_case(self):
        with pytest.raises(SQLGuardrailError):
            _check_guardrail("UpDaTe x SET y=1")

    def test_insert_into(self):
        with pytest.raises(SQLGuardrailError, match="INSERT"):
            _check_guardrail("INSERT INTO manufacturing_defects (defect_id) VALUES ('x')")

    def test_insert_lowercase(self):
        with pytest.raises(SQLGuardrailError):
            _check_guardrail("insert into z values (1, 2)")

    def test_create_index(self):
        with pytest.raises(SQLGuardrailError, match="CREATE"):
            _check_guardrail("CREATE INDEX idx_foo ON bar(col)")

    def test_create_table(self):
        with pytest.raises(SQLGuardrailError):
            _check_guardrail("CREATE TABLE evil (id TEXT)")

    def test_alter_table(self):
        with pytest.raises(SQLGuardrailError, match="ALTER"):
            _check_guardrail("ALTER TABLE incident_reports ADD COLUMN foo TEXT")

    def test_truncate(self):
        with pytest.raises(SQLGuardrailError, match="TRUNCATE"):
            _check_guardrail("TRUNCATE foo")

    def test_truncate_lowercase(self):
        with pytest.raises(SQLGuardrailError):
            _check_guardrail("truncate table agent_runs")

    def test_drop_extension(self):
        with pytest.raises(SQLGuardrailError):
            _check_guardrail("DROP EXTENSION IF EXISTS vector")

    def test_delete_embedded_in_longer_sql(self):
        """Guardrail must catch DML even when mixed with SELECT."""
        with pytest.raises(SQLGuardrailError):
            _check_guardrail("SELECT * FROM foo; DELETE FROM foo WHERE 1=1")


# ---------------------------------------------------------------------------
# Allowed statements — must NOT raise
# ---------------------------------------------------------------------------


class TestAllowedStatements:

    def test_simple_select(self):
        _check_guardrail("SELECT COUNT(*) FROM incident_reports")

    def test_select_with_where(self):
        _check_guardrail("SELECT * FROM manufacturing_defects WHERE severity = 'critical'")

    def test_select_with_join(self):
        _check_guardrail(
            "SELECT ir.incident_id, md.defect_type "
            "FROM incident_reports ir "
            "JOIN manufacturing_defects md ON ir.asset_id = md.product"
        )

    def test_select_aggregate(self):
        _check_guardrail(
            "SELECT product, COUNT(*) AS cnt FROM manufacturing_defects GROUP BY product"
        )

    def test_select_with_cte(self):
        _check_guardrail(
            "WITH counts AS (SELECT severity, COUNT(*) c FROM manufacturing_defects GROUP BY severity) "
            "SELECT * FROM counts ORDER BY c DESC"
        )

    def test_select_star(self):
        _check_guardrail("SELECT * FROM agent_runs LIMIT 10")

    def test_select_1(self):
        _check_guardrail("SELECT 1")

    def test_select_with_subquery(self):
        _check_guardrail(
            "SELECT * FROM incident_reports "
            "WHERE incident_id IN (SELECT incident_id FROM incident_embeddings LIMIT 5)"
        )

    def test_identifier_containing_keyword(self):
        """
        Column names containing blocked keywords as substrings should NOT be blocked.
        e.g. 'update_time' or 'order_deleted_at' should be fine.
        The regex uses word boundaries so 'update_time' must NOT match 'UPDATE'.
        """
        _check_guardrail("SELECT update_status, created_at FROM jobs")

    def test_drop_as_column_alias(self):
        """'drop' as a word in a string literal — tricky edge case."""
        # This one legitimately trips the guardrail because DROP is a whole word.
        # We accept this conservative behaviour (false positive is safe).
        with pytest.raises(SQLGuardrailError):
            _check_guardrail("SELECT 'drop it' AS note FROM foo")
