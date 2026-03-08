"""
GET /runs — paginated query history list
GET /runs/{run_id} — full QueryResponse for a single run
PATCH /runs/{run_id}/favourite — toggle is_favourite, return updated summary

W3-004 — Epic 2: Query History & Favourites
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from backend.app.db.session import get_session
from backend.app.observability.logging import get_logger
from backend.app.schemas.models import HistoryRunSummary, RunListResponse, RunRecord

logger = get_logger(__name__)
router = APIRouter()


@router.get(
    "/runs",
    response_model=RunListResponse,
    summary="Get paginated query history",
    description="Returns the last N agent runs, newest first. Favourites are not pinned server-side.",
)
async def get_runs(
    limit: int = Query(20, ge=1, le=100, description="Number of runs to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
) -> RunListResponse:
    """
    Paginated list of agent runs from agent_runs table.
    Returns HistoryRunSummary items sorted by created_at DESC.
    """
    try:
        async with get_session() as session:
            # Get total count
            count_result = await session.execute(text("SELECT COUNT(*) FROM agent_runs"))
            total = count_result.scalar() or 0

            # Get paginated rows
            rows_result = await session.execute(
                text(
                    "SELECT run_id, query, result, created_at, is_favourite "
                    "FROM agent_runs "
                    "ORDER BY created_at DESC "
                    "LIMIT :limit OFFSET :offset"
                ),
                {"limit": limit, "offset": offset},
            )
            rows = rows_result.fetchall()
    except Exception as exc:
        logger.error("Failed to fetch runs", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

    items = []
    for row in rows:
        result_data = row.result
        if isinstance(result_data, str):
            try:
                result_data = json.loads(result_data)
            except json.JSONDecodeError:
                result_data = {}
        result_data = result_data or {}

        run_summary = result_data.get("run_summary", {})
        items.append(
            HistoryRunSummary(
                id=row.run_id,
                query=row.query or "",
                intent=run_summary.get("intent", "unknown"),
                created_at=row.created_at,
                cached=run_summary.get("cached", False),
                latency_ms=run_summary.get("total_latency_ms", 0.0),
                is_favourite=bool(row.is_favourite),
            )
        )

    return RunListResponse(items=items, total=total)


@router.patch(
    "/runs/{run_id}/favourite",
    response_model=HistoryRunSummary,
    summary="Toggle favourite status for a run",
    description="Toggles is_favourite on the specified run and returns the updated summary.",
)
async def toggle_favourite(run_id: str) -> HistoryRunSummary:
    """
    Toggle is_favourite on an agent_run. Returns 404 if run_id not found.
    """
    try:
        async with get_session() as session:
            # Fetch current state
            result = await session.execute(
                text(
                    "SELECT run_id, query, result, created_at, is_favourite "
                    "FROM agent_runs WHERE run_id = :run_id"
                ),
                {"run_id": run_id},
            )
            row = result.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")

            # Toggle the value
            new_value = not bool(row.is_favourite)

            await session.execute(
                text("UPDATE agent_runs SET is_favourite = :val WHERE run_id = :run_id"),
                {"val": new_value, "run_id": run_id},
            )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to toggle favourite", extra={"run_id": run_id, "error": str(exc)})
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

    result_data = row.result
    if isinstance(result_data, str):
        try:
            result_data = json.loads(result_data)
        except json.JSONDecodeError:
            result_data = {}
    result_data = result_data or {}

    run_summary = result_data.get("run_summary", {})
    return HistoryRunSummary(
        id=row.run_id,
        query=row.query or "",
        intent=run_summary.get("intent", "unknown"),
        created_at=row.created_at,
        cached=run_summary.get("cached", False),
        latency_ms=run_summary.get("total_latency_ms", 0.0),
        is_favourite=new_value,
    )
