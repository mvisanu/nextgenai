"""
pgvector cosine similarity retrieval module.
Uses HNSW index on incident_embeddings and medical_embeddings
(embedding vector_cosine_ops), migrated from IVFFlat in Phase 2.
ef_search=40 is set at DB and engine level — no per-query SET required.

T3-03: bm25_search() and hybrid_search() added for sparse-dense fusion.
RRF (Reciprocal Rank Fusion) with k=60 is used to fuse ranked lists.
T3-05: query_embedding passed as list (Python native) rather than str() —
PostgreSQL parses it cleanly via CAST(:embedding AS vector).
T3-06: mmr_rerank() applies Maximal Marginal Relevance to de-duplicate
near-identical chunks from the same incident before synthesis.
"""
from __future__ import annotations

import time
from typing import Any

import numpy as np
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.observability.logging import get_logger

logger = get_logger(__name__)

# RRF constant (standard value)
_RRF_K = 60

# Default hybrid search alpha (70% vector, 30% BM25)
_HYBRID_ALPHA = 0.7


def vector_search(
    session,
    query_embedding: np.ndarray,
    top_k: int = 8,
    filters: dict[str, Any] | None = None,
    similarity_threshold: float = 0.0,
    domain: str = "aircraft",
) -> list[dict[str, Any]]:
    """
    Retrieve the top-k most similar chunks via pgvector cosine distance.

    Args:
        session:            SQLAlchemy session (sync or async-wrapped).
        query_embedding:    384-dimensional numpy vector from EmbeddingModel.
        top_k:              Maximum results to return. Default 8.
        filters:            Optional dict with keys:
                              system       (str) — exact match on system column
                              severity     (str) — exact match on severity column
                              date_range   (tuple[str, str]) — ISO date range (from, to)
        similarity_threshold: Minimum cosine similarity (0.0 = return all, 1.0 = identical only).
        domain:             "aircraft" searches incident_embeddings/incident_reports.
                            "medical" searches medical_embeddings/medical_cases.

    Returns:
        List of dicts sorted by descending similarity:
            chunk_id     (str)
            incident_id  (str)  — source record ID (case_id for medical domain)
            score        (float) — cosine similarity 0.0–1.0
            excerpt      (str)   — chunk_text
            metadata     (dict)  — system, severity, event_date, char_start, char_end
    """
    t_start = time.perf_counter()
    filters = filters or {}

    # Select tables and columns based on domain
    if domain == "medical":
        embed_table = "medical_embeddings"
        record_table = "medical_cases"
        embed_fk = "case_id"
        record_pk = "case_id"
    else:
        embed_table = "incident_embeddings"
        record_table = "incident_reports"
        embed_fk = "incident_id"
        record_pk = "incident_id"

    # Build filter WHERE clauses (columns are identical across both domains)
    where_clauses = []
    params: dict[str, Any] = {
        "embedding": str(query_embedding.tolist()),
        "top_k": top_k,
    }

    if "system" in filters and filters["system"]:
        where_clauses.append("r.system = :system")
        params["system"] = filters["system"]

    if "severity" in filters and filters["severity"]:
        where_clauses.append("r.severity = :severity")
        params["severity"] = filters["severity"]

    if "date_range" in filters and filters["date_range"]:
        date_from, date_to = filters["date_range"]
        where_clauses.append("r.event_date BETWEEN :date_from AND :date_to")
        params["date_from"] = date_from
        params["date_to"] = date_to

    where_sql = ""
    if where_clauses:
        where_sql = "AND " + " AND ".join(where_clauses)

    # asset_id only exists on incident_reports; medical_cases uses NULL
    asset_id_col = "r.asset_id" if domain == "aircraft" else "NULL AS asset_id"

    sql = text(f"""
        SELECT
            e.embed_id              AS chunk_id,
            e.{embed_fk}            AS incident_id,
            1 - (e.embedding <=> CAST(:embedding AS vector)) AS score,
            e.chunk_text            AS excerpt,
            e.char_start,
            e.char_end,
            {asset_id_col},
            r.system,
            r.severity,
            r.event_date
        FROM {embed_table} e
        JOIN {record_table} r ON r.{record_pk} = e.{embed_fk}
        WHERE 1=1 {where_sql}
        ORDER BY e.embedding <=> CAST(:embedding AS vector)
        LIMIT :top_k
    """)

    # HNSW index is used (migrated from IVFFlat). ef_search is set at the
    # database level (ALTER DATABASE ... SET hnsw.ef_search = 40) and at
    # the async engine level via connect_args. No per-query SET needed.
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
                "domain": domain,
            },
        })

    elapsed_ms = (time.perf_counter() - t_start) * 1000
    logger.info(
        "Vector search complete",
        extra={"hits": len(hits), "latency_ms": round(elapsed_ms, 1), "top_k": top_k, "domain": domain},
    )
    return hits


def bm25_search(
    session,
    query_text: str,
    top_k: int = 8,
    domain: str = "aircraft",
) -> list[dict[str, Any]]:
    """
    T3-03: BM25 search using PostgreSQL full-text search (tsvector/tsquery).

    Uses ts_rank_cd for scoring (covers density). Returns results in the same
    shape as vector_search() but with bm25_score instead of score.

    Requires GIN index on the source table's narrative column:
      CREATE INDEX CONCURRENTLY idx_incident_reports_fts
        ON incident_reports USING GIN(to_tsvector('english', narrative));
      CREATE INDEX CONCURRENTLY idx_medical_cases_fts
        ON medical_cases USING GIN(to_tsvector('english', narrative));

    Args:
        session:    SQLAlchemy session (sync).
        query_text: Natural language query string.
        top_k:      Maximum results. Default 8.
        domain:     "aircraft" or "medical".

    Returns:
        List of hit dicts with bm25_score field and same metadata shape as vector_search().
    """
    t_start = time.perf_counter()

    if domain == "medical":
        embed_table = "medical_embeddings"
        record_table = "medical_cases"
        embed_fk = "case_id"
        record_pk = "case_id"
        narrative_col = "narrative"
    else:
        embed_table = "incident_embeddings"
        record_table = "incident_reports"
        embed_fk = "incident_id"
        record_pk = "incident_id"
        narrative_col = "narrative"

    asset_id_col = "r.asset_id" if domain == "aircraft" else "NULL AS asset_id"

    sql = text(f"""
        SELECT
            e.embed_id                                AS chunk_id,
            e.{embed_fk}                              AS incident_id,
            ts_rank_cd(
                to_tsvector('english', r.{narrative_col}),
                plainto_tsquery('english', :query_text)
            )                                         AS bm25_score,
            e.chunk_text                              AS excerpt,
            e.char_start,
            e.char_end,
            {asset_id_col},
            r.system,
            r.severity,
            r.event_date
        FROM {embed_table} e
        JOIN {record_table} r ON r.{record_pk} = e.{embed_fk}
        WHERE to_tsvector('english', r.{narrative_col}) @@ plainto_tsquery('english', :query_text)
        ORDER BY bm25_score DESC
        LIMIT :top_k
    """)

    result = session.execute(sql, {"query_text": query_text, "top_k": top_k})
    rows = result.fetchall()

    hits = []
    for row in rows:
        bm25_score = float(row.bm25_score) if row.bm25_score is not None else 0.0
        hits.append({
            "chunk_id": row.chunk_id,
            "incident_id": row.incident_id,
            "score": bm25_score,
            "excerpt": row.excerpt,
            "metadata": {
                "asset_id": row.asset_id,
                "system": row.system,
                "severity": row.severity,
                "event_date": str(row.event_date) if row.event_date else None,
                "char_start": row.char_start,
                "char_end": row.char_end,
                "domain": domain,
                "search_mode": "bm25",
                "bm25_score": bm25_score,
            },
        })

    elapsed_ms = (time.perf_counter() - t_start) * 1000
    logger.info(
        "BM25 search complete",
        extra={"hits": len(hits), "latency_ms": round(elapsed_ms, 1), "top_k": top_k, "domain": domain},
    )
    return hits


def hybrid_search(
    session,
    query_embedding: np.ndarray,
    query_text: str,
    top_k: int = 8,
    filters: dict[str, Any] | None = None,
    similarity_threshold: float = 0.0,
    domain: str = "aircraft",
    alpha: float = _HYBRID_ALPHA,
) -> list[dict[str, Any]]:
    """
    T3-03: Hybrid BM25 + vector search using Reciprocal Rank Fusion (RRF).

    Runs both vector_search() and bm25_search() and fuses results using:
        rrf_score = 1/(k + rank_vector) + 1/(k + rank_bm25)
    where k=60 is the standard RRF constant.

    Args:
        session:              SQLAlchemy sync session.
        query_embedding:      384-dim numpy vector.
        query_text:           Original query string for BM25.
        top_k:                Final number of results to return.
        filters:              Optional metadata filters (passed to vector_search only).
        similarity_threshold: Minimum vector similarity (passed to vector_search only).
        domain:               "aircraft" or "medical".
        alpha:                Weight for vector rank contribution (0.0–1.0).
                              (1-alpha) is the BM25 weight. Default 0.7.

    Returns:
        Fused list of hit dicts with rrf_score in metadata, sorted by fused score DESC.
    """
    t_start = time.perf_counter()

    # Fetch more results from each searcher to ensure overlap after dedup
    fetch_k = max(top_k * 3, 20)

    vec_hits = vector_search(
        session,
        query_embedding=query_embedding,
        top_k=fetch_k,
        filters=filters,
        similarity_threshold=similarity_threshold,
        domain=domain,
    )
    bm25_hits = bm25_search(session, query_text, top_k=fetch_k, domain=domain)

    # Build rank lookups: chunk_id → rank (1-based)
    vec_rank: dict[str, int] = {h["chunk_id"]: i + 1 for i, h in enumerate(vec_hits)}
    bm25_rank: dict[str, int] = {h["chunk_id"]: i + 1 for i, h in enumerate(bm25_hits)}

    # Union of all chunk_ids
    all_chunk_ids: set[str] = set(vec_rank) | set(bm25_rank)

    # Build a lookup for hit metadata: prefer vector hit data (has more fields)
    hit_meta: dict[str, dict[str, Any]] = {}
    for h in bm25_hits:
        hit_meta[h["chunk_id"]] = h
    for h in vec_hits:
        hit_meta[h["chunk_id"]] = h  # vector hit wins

    # Compute RRF scores
    scored: list[tuple[float, str]] = []
    for chunk_id in all_chunk_ids:
        vr = vec_rank.get(chunk_id, fetch_k + 1)
        br = bm25_rank.get(chunk_id, fetch_k + 1)
        rrf = alpha * (1.0 / (_RRF_K + vr)) + (1 - alpha) * (1.0 / (_RRF_K + br))
        scored.append((rrf, chunk_id))

    scored.sort(reverse=True)

    results = []
    for rrf_score, chunk_id in scored[:top_k]:
        hit = dict(hit_meta[chunk_id])
        hit["score"] = round(rrf_score, 6)
        hit["metadata"] = {**hit.get("metadata", {}), "rrf_score": rrf_score, "search_mode": "hybrid"}
        results.append(hit)

    elapsed_ms = (time.perf_counter() - t_start) * 1000
    logger.info(
        "Hybrid search complete",
        extra={
            "hits": len(results),
            "vec_hits": len(vec_hits),
            "bm25_hits": len(bm25_hits),
            "latency_ms": round(elapsed_ms, 1),
            "domain": domain,
        },
    )
    return results


def mmr_rerank(
    hits: list[dict[str, Any]],
    query_embedding: np.ndarray,
    lambda_: float = 0.7,
    top_k: int = 8,
) -> list[dict[str, Any]]:
    """
    T3-06: Maximal Marginal Relevance (MMR) re-ranking to reduce near-duplicate chunks.

    Iteratively selects the next chunk that maximises:
        lambda_ * sim_to_query - (1 - lambda_) * max_sim_to_selected

    Excerpts are re-encoded using the already-loaded EmbeddingModel (short texts,
    <5 ms per batch on CPU). This avoids storing embeddings in the hit list.

    Args:
        hits:           List of hit dicts from vector_search() or hybrid_search().
        query_embedding: 384-dim numpy query vector (unit-normalised).
        lambda_:        Trade-off param. 1.0 = pure relevance, 0.0 = pure diversity.
                        Default 0.7 (70% relevance, 30% diversity).
        top_k:          Maximum results to return.

    Returns:
        Re-ranked list of at most top_k hits with maximised marginal relevance.
    """
    if not hits:
        return hits
    if len(hits) <= top_k:
        return hits

    from backend.app.rag.embeddings import EmbeddingModel

    model = EmbeddingModel.get()
    excerpts = [h.get("excerpt", "") or "" for h in hits]
    # Batch encode all excerpts — short texts, very fast on CPU
    chunk_embeddings = model.encode(excerpts)  # shape (n, 384)

    # Normalise query_embedding if not already unit length
    qnorm = np.linalg.norm(query_embedding)
    q = query_embedding / qnorm if qnorm > 0 else query_embedding

    # Cosine similarities to query
    sim_to_query = chunk_embeddings @ q  # shape (n,)

    selected_indices: list[int] = []
    remaining = list(range(len(hits)))

    while len(selected_indices) < top_k and remaining:
        if not selected_indices:
            # First: pick the highest sim-to-query
            best = max(remaining, key=lambda i: sim_to_query[i])
        else:
            # MMR score for each remaining candidate
            sel_embeds = chunk_embeddings[selected_indices]  # shape (k, 384)

            def mmr_score(i: int) -> float:
                max_sim_to_selected = float(np.max(chunk_embeddings[i] @ sel_embeds.T))
                return lambda_ * float(sim_to_query[i]) - (1 - lambda_) * max_sim_to_selected

            best = max(remaining, key=mmr_score)

        selected_indices.append(best)
        remaining.remove(best)

    return [hits[i] for i in selected_indices]
