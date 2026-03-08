"""
GET /runs — paginated query history list
GET /runs/{run_id} — full QueryResponse for a single run
PATCH /runs/{run_id}/favourite — toggle is_favourite, return updated summary

W3-004 — Epic 2: Query History & Favourites
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import text

from backend.app.auth.jwt import get_optional_user
from backend.app.db.session import get_session
from backend.app.observability.logging import get_logger
from backend.app.schemas.models import HistoryRunSummary, RunListResponse, RunRecord


class FavouriteRequest(BaseModel):
    is_favourite: bool

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
    current_user: dict | None = Depends(get_optional_user),
) -> RunListResponse:
    """
    Paginated list of agent runs from agent_runs table.
    When authenticated (W4-007), filtered to the requesting user's runs only.
    When anonymous (no token), returns an empty list rather than 401.
    Returns HistoryRunSummary items sorted by created_at DESC.
    """
    user_id = current_user.get("sub") if current_user else None

    # Anonymous requests have no user_id — return empty list immediately
    # rather than attempting a ::uuid cast on NULL.
    if not user_id:
        return RunListResponse(items=[], total=0)

    try:
        async with get_session() as session:
            # Get total count for this user's runs
            count_result = await session.execute(
                text("SELECT COUNT(*) FROM agent_runs WHERE user_id = :user_id::uuid"),
                {"user_id": user_id},
            )
            total = count_result.scalar() or 0

            # Get paginated rows for this user
            rows_result = await session.execute(
                text(
                    "SELECT run_id, query, result, created_at, is_favourite "
                    "FROM agent_runs "
                    "WHERE user_id = :user_id::uuid "
                    "ORDER BY created_at DESC "
                    "LIMIT :limit OFFSET :offset"
                ),
                {"user_id": user_id, "limit": limit, "offset": offset},
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
    summary="Set favourite status for a run",
    description="Sets is_favourite to the provided value and returns the updated summary.",
)
async def toggle_favourite(
    run_id: str,
    body: FavouriteRequest,
    current_user: dict | None = Depends(get_optional_user),
) -> HistoryRunSummary:
    """
    Set is_favourite on an agent_run to the value provided in the request body.
    Returns 401 if unauthenticated (write operation requires identity).
    Returns 404 if run_id not found or belongs to a different user (W4-007).
    """
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required.")
    user_id = current_user.get("sub")
    try:
        async with get_session() as session:
            # Fetch current state — include user_id for ownership check
            result = await session.execute(
                text(
                    "SELECT run_id, query, result, created_at, is_favourite, user_id "
                    "FROM agent_runs WHERE run_id = :run_id"
                ),
                {"run_id": run_id},
            )
            row = result.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")

            # Return 404 (not 403) to avoid leaking run existence to other users
            row_user_id = str(row.user_id) if row.user_id else None
            if row_user_id and row_user_id != user_id:
                raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")

            # Use the desired value from the request body
            new_value = body.is_favourite

            await session.execute(
                text(
                    "UPDATE agent_runs SET is_favourite = :desired "
                    "WHERE run_id = :run_id AND user_id = :user_id::uuid"
                ),
                {"desired": new_value, "run_id": run_id, "user_id": user_id},
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
