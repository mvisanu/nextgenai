"""
GET /analytics/defects — defect counts by product and type
GET /analytics/maintenance — maintenance event trends by month
GET /analytics/diseases — disease counts by specialty

All endpoints use the named-query pattern from sql_tool.py (SELECT-only enforced).

W3-012 — Epic 4: Real Dashboard Analytics
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text

from backend.app.auth.jwt import get_optional_user
from backend.app.db.session import get_session
from backend.app.observability.logging import get_logger
from backend.app.tools.sql_tool import _NAMED_QUERIES

logger = get_logger(__name__)
router = APIRouter(prefix="/analytics")

# Default date range: last 90 days
_DEFAULT_DAYS = 90


def _default_from() -> str:
    return (date.today() - timedelta(days=_DEFAULT_DAYS)).isoformat()


def _default_to() -> str:
    return date.today().isoformat()


@router.get(
    "/defects",
    summary="Defect counts by product and type",
    description="Returns aggregated defect counts from manufacturing_defects, filtered by date range.",
)
async def get_defects(
    from_date: str | None = Query(None, alias="from", description="Start date ISO (YYYY-MM-DD)"),
    to_date: str | None = Query(None, alias="to", description="End date ISO (YYYY-MM-DD)"),
    domain: str | None = Query(None, description="Domain filter (currently unused — always manufacturing)"),
    current_user: dict | None = Depends(get_optional_user),
) -> list[dict[str, Any]]:
    """
    Returns [{product, defect_type, count}] sorted by count DESC.
    Uses defect_counts_by_product named query (SELECT-only).
    """
    from_dt = from_date or _default_from()
    to_dt = to_date or _default_to()

    # Calculate days span for the named query parameter
    try:
        d_from = datetime.fromisoformat(from_dt).date()
        d_to = datetime.fromisoformat(to_dt).date()
        days = max(1, (d_to - d_from).days)
    except (ValueError, TypeError):
        days = _DEFAULT_DAYS

    try:
        async with get_session() as session:
            result = await session.execute(
                text(
                    _NAMED_QUERIES["defect_counts_by_product"].replace(
                        ":days days", f"{int(days)} days"
                    )
                )
            )
            rows = result.fetchall()
            columns = list(result.keys()) if rows else ["product", "defect_type", "defect_count"]
    except Exception as exc:
        logger.error("Analytics defects query failed", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

    output = []
    for row in rows:
        row_dict = dict(zip(columns, row))
        output.append({
            "product": row_dict.get("product", ""),
            "defect_type": row_dict.get("defect_type", ""),
            "count": row_dict.get("defect_count", 0),
        })
    return output


@router.get(
    "/maintenance",
    summary="Maintenance event trends by month",
    description="Returns monthly maintenance event counts from maintenance_logs.",
)
async def get_maintenance(
    from_date: str | None = Query(None, alias="from", description="Start date ISO (YYYY-MM-DD)"),
    to_date: str | None = Query(None, alias="to", description="End date ISO (YYYY-MM-DD)"),
    current_user: dict | None = Depends(get_optional_user),
) -> list[dict[str, Any]]:
    """
    Returns [{month, event_type, count}] sorted by month DESC.
    Uses maintenance_trends named query (SELECT-only).
    """
    try:
        async with get_session() as session:
            result = await session.execute(text(_NAMED_QUERIES["maintenance_trends"]))
            rows = result.fetchall()
            columns = list(result.keys()) if rows else ["metric_name", "month", "event_count", "avg_value"]
    except Exception as exc:
        logger.error("Analytics maintenance query failed", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

    output = []
    for row in rows:
        row_dict = dict(zip(columns, row))
        month_val = row_dict.get("month")
        output.append({
            "month": month_val.isoformat() if hasattr(month_val, "isoformat") else str(month_val or ""),
            "event_type": row_dict.get("metric_name", ""),
            "count": row_dict.get("event_count", 0),
        })
    return output


@router.get(
    "/diseases",
    summary="Disease counts by specialty",
    description="Returns disease case counts from disease_records, grouped by specialty.",
)
async def get_diseases(
    from_date: str | None = Query(None, alias="from", description="Start date ISO (YYYY-MM-DD)"),
    to_date: str | None = Query(None, alias="to", description="End date ISO (YYYY-MM-DD)"),
    specialty: str | None = Query(None, description="Filter by specialty name"),
    current_user: dict | None = Depends(get_optional_user),
) -> list[dict[str, Any]]:
    """
    Returns [{specialty, disease, count}] sorted by count DESC.
    Uses disease_counts_by_specialty named query (SELECT-only).
    """
    try:
        d_from = datetime.fromisoformat(from_date).date() if from_date else date.today() - timedelta(days=_DEFAULT_DAYS)
        d_to = datetime.fromisoformat(to_date).date() if to_date else date.today()
        days = max(1, (d_to - d_from).days)
    except (ValueError, TypeError):
        days = _DEFAULT_DAYS

    try:
        async with get_session() as session:
            result = await session.execute(
                text(
                    _NAMED_QUERIES["disease_counts_by_specialty"].replace(
                        ":days days", f"{int(days)} days"
                    )
                )
            )
            rows = result.fetchall()
            columns = list(result.keys()) if rows else ["specialty", "disease", "case_count"]
    except Exception as exc:
        logger.error("Analytics diseases query failed", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

    output = []
    for row in rows:
        row_dict = dict(zip(columns, row))
        # Apply specialty filter client-side if provided (named query doesn't parameterise it)
        if specialty and row_dict.get("specialty", "").lower() != specialty.lower():
            continue
        output.append({
            "specialty": row_dict.get("specialty", ""),
            "disease": row_dict.get("disease", ""),
            "count": row_dict.get("case_count", 0),
        })
    return output
