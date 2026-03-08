"""
SQLQueryTool — SELECT-only SQL execution with regex guardrail.
Rejects any DML/DDL statements before they reach the database.

T-17: run_async() and run_named_async() added. Both use the async SQLAlchemy
session so they do not block the event loop during DB I/O.
"""
from __future__ import annotations

import re
import time
from typing import Any

from sqlalchemy import text

from backend.app.db.session import get_session, get_sync_session
from backend.app.observability.logging import get_logger

logger = get_logger(__name__)

TOOL_NAME = "SQLQueryTool"

# TTL cache for named query results (T-14)
CACHE_TTL_SECONDS = 300  # 5 minutes
_named_query_cache: dict[str, tuple[float, dict[str, Any]]] = {}

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

    # ── Medical domain named queries ────────────────────────────────────────

    # Disease counts by specialty and disease name
    "disease_counts_by_specialty": """
        SELECT
            specialty,
            disease,
            COUNT(*) AS case_count
        FROM disease_records
        WHERE inspection_date >= CURRENT_DATE - INTERVAL ':days days'
        GROUP BY specialty, disease
        ORDER BY case_count DESC
        LIMIT 50
    """,

    # Severity/outcome distribution for medical records
    "disease_severity_distribution": """
        SELECT
            severity,
            outcome,
            COUNT(*) AS count,
            ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS percentage
        FROM disease_records
        WHERE severity IS NOT NULL
        GROUP BY severity, outcome
        ORDER BY count DESC
    """,

    # Symptom profile for a given disease
    "disease_symptom_profile": """
        SELECT
            disease,
            COUNT(*) AS total_cases,
            ROUND(AVG(CASE WHEN fever THEN 1 ELSE 0 END) * 100, 1)                AS fever_pct,
            ROUND(AVG(CASE WHEN cough THEN 1 ELSE 0 END) * 100, 1)                AS cough_pct,
            ROUND(AVG(CASE WHEN fatigue THEN 1 ELSE 0 END) * 100, 1)              AS fatigue_pct,
            ROUND(AVG(CASE WHEN difficulty_breathing THEN 1 ELSE 0 END) * 100, 1) AS dyspnea_pct,
            ROUND(AVG(age), 1)                                                     AS avg_age,
            ROUND(AVG(CASE WHEN outcome = 'Positive' THEN 1 ELSE 0 END) * 100, 1) AS positive_outcome_pct
        FROM disease_records
        GROUP BY disease
        ORDER BY total_cases DESC
        LIMIT 20
    """,

    # Medical case body-system severity summary
    "medical_system_summary": """
        SELECT
            system,
            COUNT(*) AS total_cases,
            SUM(CASE WHEN severity = 'Critical' THEN 1 ELSE 0 END) AS critical_count,
            SUM(CASE WHEN severity = 'High' THEN 1 ELSE 0 END)     AS high_count,
            SUM(CASE WHEN severity = 'Medium' THEN 1 ELSE 0 END)   AS medium_count,
            SUM(CASE WHEN severity = 'Low' THEN 1 ELSE 0 END)      AS low_count
        FROM medical_cases
        GROUP BY system
        ORDER BY total_cases DESC
    """,

    # W3-020 — Epic 9: Medical Domain Parity
    # Monthly medical case trends by specialty (Tab 4 analytics parity)
    # Uses inspection_date column (actual column name in disease_records ORM model)
    "medical_case_trends": """
        SELECT
            DATE_TRUNC('month', inspection_date) AS month,
            specialty,
            COUNT(*) AS case_count
        FROM disease_records
        WHERE inspection_date >= CURRENT_DATE - INTERVAL ':days days'
        GROUP BY month, specialty
        ORDER BY month
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

    def run_named_cached(
        self, name: str, params: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """
        Execute a named query with TTL-based result caching (T-14).

        Results are cached for CACHE_TTL_SECONDS (300s). The cache key
        is the query name plus the serialised params dict so different
        parameter values are cached independently.

        Args:
            name:   Named query identifier (same as run_named()).
            params: Optional parameter dict (same as run_named()).

        Returns:
            Same structure as run_named(), with an added "cached" bool field.
        """
        params = params or {}
        cache_key = f"{name}:{sorted(params.items())}"
        now = time.monotonic()

        cached_ts, cached_result = _named_query_cache.get(cache_key, (0.0, {}))
        if cached_result and (now - cached_ts) < CACHE_TTL_SECONDS:
            logger.info(
                "SQLQueryTool cache hit",
                extra={"name": name, "age_s": round(now - cached_ts, 1)},
            )
            result = dict(cached_result)
            result["cached"] = True
            return result

        result = self.run_named(name, params)
        _named_query_cache[cache_key] = (now, result)
        result = dict(result)
        result["cached"] = False
        return result

    # ------------------------------------------------------------------
    # Async variants (T-17)
    # ------------------------------------------------------------------

    async def run_async(self, sql: str) -> dict[str, Any]:
        """
        Async variant of run(). Uses the async SQLAlchemy session.

        The guardrail check is performed synchronously before any DB I/O
        (it is pure string matching — no blocking cost).

        Args and return value are identical to run().
        """
        t_start = time.perf_counter()

        match = _BLOCKED_PATTERN.search(sql)
        if match:
            raise SQLGuardrailError(
                f"SQL guardrail violation: statement contains blocked keyword '{match.group(0)}'. "
                f"Only SELECT queries are permitted."
            )

        try:
            async with get_session() as session:
                result = await session.execute(text(sql))
                columns = list(result.keys())
                rows = [list(row) for row in result.fetchall()]

        except SQLGuardrailError:
            raise
        except Exception as exc:
            elapsed = (time.perf_counter() - t_start) * 1000
            logger.error(
                "SQLQueryTool async error",
                extra={"error": str(exc), "sql": sql[:200]},
            )
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
            "SQLQueryTool async complete",
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

    async def run_named_async(
        self, name: str, params: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """
        Async variant of run_named(). Resolves the template synchronously
        then delegates to run_async() for non-blocking DB execution.

        Args and return value are identical to run_named().
        """
        if name not in _NAMED_QUERIES:
            raise ValueError(
                f"Unknown named query '{name}'. "
                f"Available: {list(_NAMED_QUERIES.keys())}"
            )

        params = params or {}
        sql = _NAMED_QUERIES[name]
        days = params.get("days", 90)
        sql = sql.replace(":days days", f"{int(days)} days")

        return await self.run_async(sql)
