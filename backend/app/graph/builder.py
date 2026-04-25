"""
Knowledge graph builder.
Phase 1: Entity extraction from narratives (spaCy + domain regex).
Phase 2: Graph node/edge construction from embedded chunks.
"""
from __future__ import annotations

import re
import uuid
from typing import Any

import numpy as np
from sqlalchemy import text

from backend.app.observability.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# spaCy model singleton
# ---------------------------------------------------------------------------

_NLP = None


def _get_nlp():
    global _NLP
    if _NLP is None:
        import spacy
        try:
            _NLP = spacy.load("en_core_web_sm")
            logger.info("spaCy model loaded", extra={"model": "en_core_web_sm"})
        except OSError:
            logger.warning(
                "en_core_web_sm not installed — using blank English model. "
                "Run: python -m spacy download en_core_web_sm"
            )
            import spacy
            _NLP = spacy.blank("en")
    return _NLP


# ---------------------------------------------------------------------------
# Domain-specific regex patterns (supplement spaCy NER)
# ---------------------------------------------------------------------------

_DOMAIN_PATTERNS = [
    (re.compile(r"\bASSET-\d+\b"), "asset"),
    (re.compile(r"\bLine\s+\d+\b", re.IGNORECASE), "asset"),
    (re.compile(r"\bSN-\d+\b", re.IGNORECASE), "asset"),
    (re.compile(r"\bENG-\d+\b", re.IGNORECASE), "asset"),
    (re.compile(r"\bHYD-\d+\b", re.IGNORECASE), "asset"),
    (re.compile(r"\bBAY\s+[A-Z]\b", re.IGNORECASE), "asset"),
    (re.compile(r"\b(?:hydraulic|pneumatic|electrical|mechanical|structural|avionics|propulsion)\b", re.IGNORECASE), "system"),
    (re.compile(r"\b(?:actuator|pump|valve|sensor|bearing|connector|harness|bracket|manifold|filter|seal|relay|compressor|regulator|cylinder|piston)\b", re.IGNORECASE), "subsystem"),
    (re.compile(r"\b(?:crack|corrosion|wear|contamination|misalignment|fatigue|delamination|erosion|leakage|vibration|overheating|loosening)\b", re.IGNORECASE), "defect_type"),
]

# spaCy entity type → canonical domain type
_SPACY_TYPE_MAP = {
    "PRODUCT": "product",
    "ORG": "product",
    "FAC": "asset",
    "GPE": "other",
    "LOC": "other",
    "PERSON": "other",
    "DATE": "other",
    "CARDINAL": "other",
    "ORD": "other",
}


def extract_entities(text: str) -> list[dict[str, Any]]:
    """
    Extract named entities from text using spaCy NER + domain regex patterns.

    Args:
        text: Source narrative text.

    Returns:
        List of entity dicts:
            label      (str): Entity surface form
            type       (str): One of asset | system | subsystem | product | defect_type | other
            char_start (int): Start character offset in text
            char_end   (int): End character offset in text
    """
    nlp = _get_nlp()
    doc = nlp(text[:5000]) if hasattr(nlp, "pipe_names") and nlp.pipe_names else None
    return _entities_from_doc_and_text(doc, text)


def _entities_from_doc_and_text(doc, text: str) -> list[dict[str, Any]]:
    """Internal: derive entity list from a (possibly None) spaCy Doc + raw text."""
    entities: list[dict[str, Any]] = []
    seen_spans: set[tuple[int, int]] = set()

    if doc is not None:
        for ent in doc.ents:
            canonical_type = _SPACY_TYPE_MAP.get(ent.label_, "other")
            span_key = (ent.start_char, ent.end_char)
            if span_key not in seen_spans:
                seen_spans.add(span_key)
                entities.append({
                    "label": ent.text.strip(),
                    "type": canonical_type,
                    "char_start": ent.start_char,
                    "char_end": ent.end_char,
                })

    for pattern, entity_type in _DOMAIN_PATTERNS:
        for match in pattern.finditer(text):
            span_key = (match.start(), match.end())
            if span_key not in seen_spans:
                seen_spans.add(span_key)
                entities.append({
                    "label": match.group(0).strip(),
                    "type": entity_type,
                    "char_start": match.start(),
                    "char_end": match.end(),
                })
            else:
                for entity in entities:
                    if (entity["char_start"], entity["char_end"]) == span_key and entity["type"] == "other":
                        entity["type"] = entity_type

    return entities


def _batch_extract_entities(texts: list[str]) -> list[list[dict[str, Any]]]:
    """Run spaCy NER over many texts at once via nlp.pipe (much faster than per-call)."""
    nlp = _get_nlp()
    truncated = [t[:5000] for t in texts]
    if hasattr(nlp, "pipe_names") and nlp.pipe_names:
        docs = list(nlp.pipe(truncated, batch_size=64))
    else:
        docs = [None] * len(truncated)
    return [_entities_from_doc_and_text(doc, raw) for doc, raw in zip(docs, texts)]


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------


_NODE_INSERT_SQL = text(
    "INSERT INTO graph_node (id, type, label, properties) "
    "VALUES (:id, :type, :label, :properties) "
    "ON CONFLICT (id) DO NOTHING"
)
_EDGE_INSERT_SQL = text(
    "INSERT INTO graph_edge (id, from_node, to_node, type, weight, properties) "
    "VALUES (:id, :from_node, :to_node, :type, :weight, NULL) "
    "ON CONFLICT (id) DO NOTHING"
)


def _flush(session, sql, rows: list[dict], batch_size: int = 500) -> None:
    """executemany flush: send `rows` in chunks of `batch_size`."""
    for i in range(0, len(rows), batch_size):
        session.execute(sql, rows[i: i + batch_size])


def build_graph(
    session,
    edge_similarity_threshold: float = 0.80,
    domain: str = "aircraft",
    limit: int | None = None,
) -> dict[str, int]:
    """
    Build the knowledge graph from incident_embeddings (aircraft) or medical_embeddings (medical).

    Args:
        session: SQLAlchemy sync session.
        edge_similarity_threshold: cosine threshold for 'similarity' edges.
        domain: 'aircraft' or 'medical'.
        limit: Optional cap on number of source chunks. When set, only the first
            `limit` chunks (ordered by embed_id) are processed — useful for
            partial / incremental builds (e.g. build half first to validate).

    Pipeline per chunk:
      1. Create a chunk node.
      2. Batch-extract entities (spaCy nlp.pipe).
      3. Create entity nodes (deduped by label+type).
      4. Create 'mentions' edges (chunk → entity).
      5. Create 'co_occurrence' edges (entity ↔ entity within chunk).
    Then:
      6. Compute pairwise embedding similarity and create 'similarity' edges.

    All INSERTs are buffered and flushed via executemany every 500 rows for
    ~10–20× speedup over per-row execute() against a remote Postgres.

    Returns:
        {"nodes": final_node_count, "edges": final_edge_count}
    """
    logger.info("Building knowledge graph", extra={"domain": domain, "limit": limit})

    if domain == "medical":
        base_sql = (
            "SELECT embed_id, case_id AS incident_id, chunk_text, embedding "
            "FROM medical_embeddings WHERE embedding IS NOT NULL "
            "ORDER BY embed_id"
        )
    else:
        base_sql = (
            "SELECT embed_id, incident_id, chunk_text, embedding "
            "FROM incident_embeddings WHERE embedding IS NOT NULL "
            "ORDER BY embed_id"
        )
    embed_sql = base_sql + (f" LIMIT {int(limit)}" if limit else "")

    result = session.execute(text(embed_sql))
    embeddings_data = result.fetchall()

    if not embeddings_data:
        logger.warning("No embeddings found — graph build skipped")
        return {"nodes": 0, "edges": 0}

    logger.info("Processing chunks for graph", extra={"chunk_count": len(embeddings_data)})

    # Buffers — flushed in batches to amortize roundtrip cost.
    node_rows: list[dict] = []
    edge_rows: list[dict] = []
    entity_label_to_id: dict[str, str] = {}
    chunk_ids: list[str] = []
    chunk_vectors: list[list[float]] = []

    # Phase A: chunk nodes + collect texts for batched NER
    chunk_texts: list[str] = []
    chunk_meta: list[tuple[str, str, str]] = []  # (embed_id, chunk_node_id, incident_id)

    for row in embeddings_data:
        embed_id = row.embed_id
        chunk_text_str = row.chunk_text
        chunk_node_id = f"chunk:{embed_id}"
        chunk_texts.append(chunk_text_str)
        chunk_meta.append((embed_id, chunk_node_id, str(row.incident_id)))

        node_rows.append({
            "id": chunk_node_id,
            "type": "chunk",
            "label": chunk_text_str[:100],
            "properties": f'{{"embed_id": "{embed_id}", "incident_id": "{row.incident_id}"}}',
        })

        embedding_raw = row.embedding
        if embedding_raw:
            try:
                if isinstance(embedding_raw, str):
                    import json
                    vec = json.loads(embedding_raw)
                elif hasattr(embedding_raw, "__iter__"):
                    vec = list(embedding_raw)
                else:
                    vec = []
                if vec:
                    chunk_ids.append(chunk_node_id)
                    chunk_vectors.append(vec)
            except Exception:
                pass

    # Phase B: batched spaCy NER (single nlp.pipe pass instead of N calls)
    all_entities = _batch_extract_entities(chunk_texts)

    # Phase C: build entity nodes + mentions + co_occurrence
    for (embed_id, chunk_node_id, _incident_id), entities in zip(chunk_meta, all_entities):
        entity_node_ids: list[str] = []
        for entity in entities:
            entity_key = f"{entity['type']}:{entity['label'].lower()}"
            if entity_key not in entity_label_to_id:
                entity_node_id = f"entity:{str(uuid.uuid4())[:8]}"
                entity_label_to_id[entity_key] = entity_node_id
                node_rows.append({
                    "id": entity_node_id,
                    "type": "entity",
                    "label": entity["label"],
                    "properties": f'{{"entity_type": "{entity["type"]}"}}',
                })

            entity_node_id = entity_label_to_id[entity_key]
            entity_node_ids.append(entity_node_id)

            edge_rows.append({
                "id": f"mentions:{embed_id}:{entity_key[:20]}",
                "from_node": chunk_node_id,
                "to_node": entity_node_id,
                "type": "mentions",
                "weight": 1.0,
            })

        for i, eid_a in enumerate(entity_node_ids):
            for eid_b in entity_node_ids[i + 1:]:
                if eid_a == eid_b:
                    continue
                edge_rows.append({
                    "id": f"cooc:{eid_a[-8:]}:{eid_b[-8:]}",
                    "from_node": eid_a,
                    "to_node": eid_b,
                    "type": "co_occurrence",
                    "weight": 0.5,
                })

    # Phase D: bulk flush
    _flush(session, _NODE_INSERT_SQL, node_rows)
    _flush(session, _EDGE_INSERT_SQL, edge_rows)
    session.commit()

    # Phase E: similarity edges (already vectorized; cap at 2000 chunks for runtime)
    if len(chunk_vectors) > 1:
        _build_similarity_edges(
            session,
            chunk_ids[:2000],
            chunk_vectors[:2000],
            threshold=edge_similarity_threshold,
        )

    final_nodes = session.execute(text("SELECT COUNT(*) FROM graph_node")).scalar() or 0
    final_edges = session.execute(text("SELECT COUNT(*) FROM graph_edge")).scalar() or 0
    logger.info("Graph build complete", extra={"nodes": final_nodes, "edges": final_edges})
    return {"nodes": final_nodes, "edges": final_edges}


def _build_similarity_edges(
    session,
    chunk_ids: list[str],
    chunk_vectors: list[list[float]],
    threshold: float = 0.80,
) -> int:
    """
    Compute pairwise cosine similarity and insert 'similarity' edges.
    Uses numpy for batch computation.
    Returns number of edges created.
    """
    matrix = np.array(chunk_vectors, dtype=np.float32)
    # Normalize rows
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    matrix = matrix / norms

    # Batch dot-product for cosine similarity, then bulk-insert edges
    sim_rows: list[dict] = []
    batch_size = 200
    for i in range(0, len(chunk_ids), batch_size):
        batch_vecs = matrix[i: i + batch_size]
        sims = np.dot(batch_vecs, matrix.T)
        for bi, sim_row in enumerate(sims):
            global_i = i + bi
            for j, sim in enumerate(sim_row):
                if j <= global_i:
                    continue
                if sim >= threshold:
                    sim_rows.append({
                        "id": f"sim:{chunk_ids[global_i][-8:]}:{chunk_ids[j][-8:]}",
                        "from_node": chunk_ids[global_i],
                        "to_node": chunk_ids[j],
                        "type": "similarity",
                        "weight": float(sim),
                    })

    _flush(session, _EDGE_INSERT_SQL, sim_rows)
    session.commit()
    logger.info("Similarity edges created", extra={"count": len(sim_rows), "threshold": threshold})
    return len(sim_rows)
