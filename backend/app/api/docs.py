"""
GET /docs — list ingested incident documents.
GET /docs/{doc_id}/chunks/{chunk_id} — fetch a specific chunk with full text and metadata.
GET /healthz — liveness and DB health check.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import ORJSONResponse
from sqlalchemy import text

from backend.app.db.session import check_db_health, get_sync_session
from backend.app.observability.logging import get_logger
from backend.app.schemas.models import ChunkResponse, DocListItem, HealthResponse

logger = get_logger(__name__)
router = APIRouter()


@router.get(
    "/healthz",
    summary="Health check",
    description="Returns service health status and DB connectivity.",
    tags=["Health"],
)
async def health_check() -> ORJSONResponse:
    db_ok = await check_db_health()
    return ORJSONResponse(
        content={
            "status": "ok" if db_ok else "degraded",
            "db": db_ok,
            "version": "1.0.0",
        },
        headers={"Cache-Control": "no-store"},
    )


@router.get(
    "/docs",
    response_model=list[DocListItem],
    summary="List ingested incident documents",
    description=(
        "Returns a paginated list of ingested incident reports with their chunk count. "
        "Use doc_id with /docs/{doc_id}/chunks/{chunk_id} to fetch specific chunks."
    ),
)
async def list_docs(
    limit: int = 50,
    offset: int = 0,
    system: str | None = None,
    severity: str | None = None,
) -> list[DocListItem]:
    where_clauses = []
    params: dict = {"limit": limit, "offset": offset}

    if system:
        where_clauses.append("ir.system = :system")
        params["system"] = system
    if severity:
        where_clauses.append("ir.severity = :severity")
        params["severity"] = severity

    where_sql = ""
    if where_clauses:
        where_sql = "WHERE " + " AND ".join(where_clauses)

    sql = text(f"""
        SELECT
            ir.incident_id,
            ir.asset_id,
            ir.system,
            ir.severity,
            ir.event_date::TEXT AS event_date,
            ir.source,
            COUNT(e.embed_id) AS chunk_count
        FROM incident_reports ir
        LEFT JOIN incident_embeddings e ON e.incident_id = ir.incident_id
        {where_sql}
        GROUP BY ir.incident_id, ir.asset_id, ir.system, ir.severity, ir.event_date, ir.source
        ORDER BY ir.event_date DESC NULLS LAST
        LIMIT :limit OFFSET :offset
    """)

    try:
        with get_sync_session() as session:
            result = session.execute(sql, params)
            rows = result.fetchall()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

    return [
        DocListItem(
            incident_id=row.incident_id,
            asset_id=row.asset_id,
            system=row.system,
            severity=row.severity,
            event_date=row.event_date,
            source=row.source,
            chunk_count=row.chunk_count,
        )
        for row in rows
    ]


@router.get(
    "/docs/{doc_id}/chunks/{chunk_id}",
    response_model=ChunkResponse,
    summary="Fetch a specific document chunk",
    description=(
        "Returns the full text of a specific embedding chunk, including character offsets "
        "for highlighting cited spans in the frontend Citations drawer."
    ),
)
async def get_chunk(doc_id: str, chunk_id: str) -> ChunkResponse:
    sql = text("""
        SELECT
            e.embed_id,
            e.incident_id,
            e.chunk_text,
            e.chunk_index,
            e.char_start,
            e.char_end,
            ir.asset_id,
            ir.system,
            ir.severity,
            ir.event_date::TEXT AS event_date,
            ir.source
        FROM incident_embeddings e
        JOIN incident_reports ir ON ir.incident_id = e.incident_id
        WHERE e.incident_id = :doc_id AND e.embed_id = :chunk_id
    """)

    try:
        with get_sync_session() as session:
            result = session.execute(sql, {"doc_id": doc_id, "chunk_id": chunk_id})
            row = result.fetchone()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Chunk '{chunk_id}' not found in document '{doc_id}'.",
        )

    return ChunkResponse(
        chunk_id=row.embed_id,
        incident_id=row.incident_id,
        chunk_text=row.chunk_text,
        chunk_index=row.chunk_index,
        char_start=row.char_start or 0,
        char_end=row.char_end or len(row.chunk_text),
        metadata={
            "asset_id": row.asset_id,
            "system": row.system,
            "severity": row.severity,
            "event_date": row.event_date,
            "source": row.source,
        },
    )
