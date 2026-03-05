"""
SQLQueryTool — SELECT-only SQL execution with regex guardrail.
Rejects any DML/DDL statements before they reach the database.
"""
from __future__ import annotations

import re
import time
from typing import Any

from sqlalchemy import text

from backend.app.db.session import get_sync_session
from backend.app.observability.logging import get_logger

logger = get_logger(__name__)

TOOL_NAME = "SQLQueryTool"

# Guardrail: reject any statement containing these DML/DDL keywords
# Case-insensitive, word-boundary anchored to avoid false positives in identifiers
_BLOCKED_PATTERN = re.compile(
    r"\b(DROP|DELETE|UPDATE|INSERT|CREATE|ALTER|TRUNCATE)\b",
    re.IGNORECASE,
)


class SQLGuardrailError(Exception):
    """Raised when a SQL statement violates the SELECT-only guardrail."""
    pass


# ---------------------------------------------------------------------------
# Pre-built named queries
# ---------------------------------------------------------------------------

_NAMED_QUERIES: dict[str, str] = {
    # Count defects grouped by product and defect_type, filtered to last N days
    "defect_counts_by_product": """
        SELECT
            product,
            defect_type,
            COUNT(*) AS defect_count
        FROM manufacturing_defects
        WHERE inspection_date >= CURRENT_DATE - INTERVAL ':days days'
        GROUP BY product, defect_type
        ORDER BY defect_count DESC
        LIMIT 50
    """,

    # Distribution of severity levels across all defects
    "severity_distribution": """
        SELECT
            severity,
            COUNT(*) AS count,
            ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS percentage
        FROM manufacturing_defects
        WHERE severity IS NOT NULL
        GROUP BY severity
        ORDER BY count DESC
    """,

    # Maintenance event counts grouped by metric_name and month
    "maintenance_trends": """
        SELECT
            metric_name,
            DATE_TRUNC('month', ts) AS month,
            COUNT(*) AS event_count,
            AVG(metric_value) AS avg_value
        FROM maintenance_logs
        WHERE ts IS NOT NULL
        GROUP BY metric_name, DATE_TRUNC('month', ts)
        ORDER BY month DESC, event_count DESC
        LIMIT 100
    """,

    # Join incident reports with manufacturing defects on shared asset_id
    "incidents_defects_join": """
        SELECT
            ir.incident_id,
            ir.asset_id,
            ir.system,
            ir.severity     AS incident_severity,
            ir.event_date,
            md.defect_id,
            md.defect_type,
            md.severity     AS defect_severity,
            md.inspection_date
        FROM incident_reports ir
        JOIN manufacturing_defects md ON md.product ILIKE '%' || ir.system || '%'
        ORDER BY ir.event_date DESC
        LIMIT 50
    """,
}


class SQLQueryTool:
    """
    Agent tool for executing read-only SQL queries.

    The guardrail is the primary safety control — it rejects any statement
    containing DML or DDL keywords before execution.

    Usage:
        tool = SQLQueryTool()
        result = tool.run("SELECT COUNT(*) FROM incident_reports")
        result = tool.run_named("severity_distribution")
    """

    name = TOOL_NAME

    def run(self, sql: str) -> dict[str, Any]:
        """
        Execute a SELECT query and return results.

        Args:
            sql: SQL query string. Must not contain DML/DDL keywords.

        Returns:
            {
              "tool_name": "SQLQueryTool",
              "columns": ["col1", "col2", ...],
              "rows": [[val1, val2], ...],
              "row_count": 42,
              "latency_ms": 12.3,
              "error": None
            }

        Raises:
            SQLGuardrailError: if the query contains blocked keywords.
        """
        t_start = time.perf_counter()

        # --- Guardrail check ---
        match = _BLOCKED_PATTERN.search(sql)
        if match:
            raise SQLGuardrailError(
                f"SQL guardrail violation: statement contains blocked keyword '{match.group(0)}'. "
                f"Only SELECT queries are permitted."
            )

        try:
            with get_sync_session() as session:
                result = session.execute(text(sql))
                columns = list(result.keys())
                rows = [list(row) for row in result.fetchall()]

        except SQLGuardrailError:
            raise
        except Exception as exc:
            elapsed = (time.perf_counter() - t_start) * 1000
            logger.error("SQLQueryTool error", extra={"error": str(exc), "sql": sql[:200]})
            return {
                "tool_name": TOOL_NAME,
                "columns": [],
                "rows": [],
                "row_count": 0,
                "latency_ms": round(elapsed, 1),
                "error": str(exc),
            }

        elapsed = (time.perf_counter() - t_start) * 1000
        logger.info(
            "SQLQueryTool complete",
            extra={"row_count": len(rows), "latency_ms": round(elapsed, 1)},
        )
        return {
            "tool_name": TOOL_NAME,
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
            "latency_ms": round(elapsed, 1),
            "error": None,
        }

    def run_named(self, name: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        """
        Execute a pre-built named query.

        Args:
            name:   One of: defect_counts_by_product, severity_distribution,
                    maintenance_trends, incidents_defects_join.
            params: Optional parameter dict. Currently supports:
                      days (int) — for defect_counts_by_product (default 90)

        Returns:
            Same structure as run().

        Raises:
            ValueError: if name is not a known named query.
        """
        if name not in _NAMED_QUERIES:
            raise ValueError(
                f"Unknown named query '{name}'. "
                f"Available: {list(_NAMED_QUERIES.keys())}"
            )

        params = params or {}
        sql = _NAMED_QUERIES[name]

        # Simple parameter substitution (safe — these are our own templates)
        days = params.get("days", 90)
        sql = sql.replace(":days days", f"{int(days)} days")

        return self.run(sql)
