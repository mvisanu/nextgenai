"""
pgvector cosine similarity retrieval module.
Uses IVFFlat index on incident_embeddings(embedding vector_cosine_ops).
"""
from __future__ import annotations

import time
from typing import Any

import numpy as np
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.observability.logging import get_logger

logger = get_logger(__name__)


def vector_search(
    session,
    query_embedding: np.ndarray,
    top_k: int = 8,
    filters: dict[str, Any] | None = None,
    similarity_threshold: float = 0.0,
) -> list[dict[str, Any]]:
    """
    Retrieve the top-k most similar incident chunks via pgvector cosine distance.

    Args:
        session:            SQLAlchemy session (sync or async-wrapped).
        query_embedding:    384-dimensional numpy vector from EmbeddingModel.
        top_k:              Maximum results to return. Default 8.
        filters:            Optional dict with keys:
                              system       (str) — exact match on incident_reports.system
                              severity     (str) — exact match on incident_reports.severity
                              date_range   (tuple[str, str]) — ISO date range (from, to)
        similarity_threshold: Minimum cosine similarity (0.0 = return all, 1.0 = identical only).

    Returns:
        List of dicts sorted by descending similarity:
            chunk_id     (str)
            incident_id  (str)
            score        (float) — cosine similarity 0.0–1.0
            excerpt      (str)   — chunk_text
            metadata     (dict)  — asset_id, system, severity, event_date, char_start, char_end
    """
    t_start = time.perf_counter()
    filters = filters or {}

    # Build filter WHERE clauses
    where_clauses = []
    params: dict[str, Any] = {
        "embedding": str(query_embedding.tolist()),
        "top_k": top_k,
    }

    if "system" in filters and filters["system"]:
        where_clauses.append("ir.system = :system")
        params["system"] = filters["system"]

    if "severity" in filters and filters["severity"]:
        where_clauses.append("ir.severity = :severity")
        params["severity"] = filters["severity"]

    if "date_range" in filters and filters["date_range"]:
        date_from, date_to = filters["date_range"]
        where_clauses.append("ir.event_date BETWEEN :date_from AND :date_to")
        params["date_from"] = date_from
        params["date_to"] = date_to

    where_sql = ""
    if where_clauses:
        where_sql = "AND " + " AND ".join(where_clauses)

    # pgvector uses <=> for cosine distance (lower = more similar)
    # similarity = 1 - cosine_distance
    sql = text(f"""
        SELECT
            e.embed_id        AS chunk_id,
            e.incident_id,
            1 - (e.embedding <=> CAST(:embedding AS vector)) AS score,
            e.chunk_text      AS excerpt,
            e.char_start,
            e.char_end,
            ir.asset_id,
            ir.system,
            ir.severity,
            ir.event_date
        FROM incident_embeddings e
        JOIN incident_reports ir ON ir.incident_id = e.incident_id
        WHERE 1=1 {where_sql}
        ORDER BY e.embedding <=> CAST(:embedding AS vector)
        LIMIT :top_k
    """)

    result = session.execute(sql, params)
    rows = result.fetchall()

    hits = []
    for row in rows:
        score = float(row.score) if row.score is not None else 0.0
        if score < similarity_threshold:
            continue
        hits.append({
            "chunk_id": row.chunk_id,
            "incident_id": row.incident_id,
            "score": round(score, 4),
            "excerpt": row.excerpt,
            "metadata": {
                "asset_id": row.asset_id,
                "system": row.system,
                "severity": row.severity,
                "event_date": str(row.event_date) if row.event_date else None,
                "char_start": row.char_start,
                "char_end": row.char_end,
            },
        })

    elapsed_ms = (time.perf_counter() - t_start) * 1000
    logger.info(
        "Vector search complete",
        extra={"hits": len(hits), "latency_ms": round(elapsed_ms, 1), "top_k": top_k},
    )
    return hits
