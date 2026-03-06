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
    entities: list[dict[str, Any]] = []
    seen_spans: set[tuple[int, int]] = set()

    nlp = _get_nlp()
    if hasattr(nlp, "pipe_names") and nlp.pipe_names:
        # Full spaCy pipeline available
        doc = nlp(text[:5000])  # Limit for performance
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

    # Supplement with domain regex patterns
    for pattern, entity_type in _DOMAIN_PATTERNS:
        for match in pattern.finditer(text):
            span_key = (match.start(), match.end())
            # Skip if already captured by spaCy (allow override with domain type)
            if span_key not in seen_spans:
                seen_spans.add(span_key)
                entities.append({
                    "label": match.group(0).strip(),
                    "type": entity_type,
                    "char_start": match.start(),
                    "char_end": match.end(),
                })
            else:
                # Update to more specific domain type if spaCy used 'other'
                for entity in entities:
                    if (entity["char_start"], entity["char_end"]) == span_key and entity["type"] == "other":
                        entity["type"] = entity_type

    return entities


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------


def build_graph(session, edge_similarity_threshold: float = 0.80, domain: str = "aircraft") -> dict[str, int]:
    """
    Build the knowledge graph from incident_embeddings (aircraft) or medical_embeddings (medical).

    For each chunk:
      1. Create a chunk node in graph_node.
      2. Extract entities from the chunk text.
      3. Create entity nodes (upsert on label+type).
      4. Create 'mentions' edges (chunk → entity).
      5. Create 'co_occurrence' edges (entity ↔ entity within same chunk).

    After all chunks:
      6. Compute pairwise embedding similarity and create 'similarity' edges
         where cosine similarity > edge_similarity_threshold.

    Returns:
        {"nodes": total_node_count, "edges": total_edge_count}
    """
    logger.info("Building knowledge graph", extra={"domain": domain})

    # Select source table based on domain
    if domain == "medical":
        embed_sql = "SELECT embed_id, case_id AS incident_id, chunk_text, embedding FROM medical_embeddings WHERE embedding IS NOT NULL"
    else:
        embed_sql = "SELECT embed_id, incident_id, chunk_text, embedding FROM incident_embeddings WHERE embedding IS NOT NULL"

    # Fetch all embeddings
    result = session.execute(text(embed_sql))
    embeddings_data = result.fetchall()

    if not embeddings_data:
        logger.warning("No embeddings found — graph build skipped")
        return {"nodes": 0, "edges": 0}

    logger.info("Processing chunks for graph", extra={"chunk_count": len(embeddings_data)})

    entity_label_to_id: dict[str, str] = {}
    node_count = 0
    edge_count = 0

    # Track chunk embeddings for similarity edge computation
    chunk_ids: list[str] = []
    chunk_vectors: list[list[float]] = []

    for row in embeddings_data:
        embed_id = row.embed_id
        chunk_text_str = row.chunk_text
        embedding_raw = row.embedding

        # ---- Create chunk node ----
        chunk_node_id = f"chunk:{embed_id}"
        session.execute(
            text(
                "INSERT INTO graph_node (id, type, label, properties) "
                "VALUES (:id, 'chunk', :label, :properties) "
                "ON CONFLICT (id) DO NOTHING"
            ),
            {
                "id": chunk_node_id,
                "label": chunk_text_str[:100],
                "properties": f'{{"embed_id": "{embed_id}", "incident_id": "{row.incident_id}"}}',
            },
        )
        node_count += 1

        # Parse embedding for similarity computation
        if embedding_raw:
            try:
                if isinstance(embedding_raw, str):
                    import json
                    vec = json.loads(embedding_raw)
                elif hasattr(embedding_raw, '__iter__'):
                    vec = list(embedding_raw)
                else:
                    vec = []
                if vec:
                    chunk_ids.append(chunk_node_id)
                    chunk_vectors.append(vec)
            except Exception:
                pass

        # ---- Extract entities from chunk ----
        entities = extract_entities(chunk_text_str)
        entity_node_ids: list[str] = []

        for entity in entities:
            entity_key = f"{entity['type']}:{entity['label'].lower()}"

            if entity_key not in entity_label_to_id:
                entity_node_id = f"entity:{str(uuid.uuid4())[:8]}"
                entity_label_to_id[entity_key] = entity_node_id
                session.execute(
                    text(
                        "INSERT INTO graph_node (id, type, label, properties) "
                        "VALUES (:id, 'entity', :label, :properties) "
                        "ON CONFLICT (id) DO NOTHING"
                    ),
                    {
                        "id": entity_node_id,
                        "label": entity["label"],
                        "properties": f'{{"entity_type": "{entity["type"]}"}}',
                    },
                )
                node_count += 1

            entity_node_id = entity_label_to_id[entity_key]
            entity_node_ids.append(entity_node_id)

            # ---- 'mentions' edge: chunk → entity ----
            edge_id = f"mentions:{embed_id}:{entity_key[:20]}"
            session.execute(
                text(
                    "INSERT INTO graph_edge (id, from_node, to_node, type, weight, properties) "
                    "VALUES (:id, :from_node, :to_node, 'mentions', 1.0, NULL) "
                    "ON CONFLICT (id) DO NOTHING"
                ),
                {"id": edge_id, "from_node": chunk_node_id, "to_node": entity_node_id},
            )
            edge_count += 1

        # ---- 'co_occurrence' edges: entity ↔ entity within same chunk ----
        for i, eid_a in enumerate(entity_node_ids):
            for eid_b in entity_node_ids[i + 1:]:
                if eid_a == eid_b:
                    continue
                co_edge_id = f"cooc:{eid_a[-8:]}:{eid_b[-8:]}"
                session.execute(
                    text(
                        "INSERT INTO graph_edge (id, from_node, to_node, type, weight, properties) "
                        "VALUES (:id, :from_node, :to_node, 'co_occurrence', 0.5, NULL) "
                        "ON CONFLICT (id) DO NOTHING"
                    ),
                    {"id": co_edge_id, "from_node": eid_a, "to_node": eid_b},
                )
                edge_count += 1

    session.commit()

    # ---- 'similarity' edges: chunk ↔ chunk (cosine similarity > threshold) ----
    # Limit to first 2000 chunks to keep ingest time reasonable
    if len(chunk_vectors) > 1:
        _build_similarity_edges(
            session,
            chunk_ids[:2000],
            chunk_vectors[:2000],
            threshold=edge_similarity_threshold,
        )

    # Recount from DB
    node_result = session.execute(text("SELECT COUNT(*) FROM graph_node"))
    edge_result = session.execute(text("SELECT COUNT(*) FROM graph_edge"))
    final_nodes = node_result.scalar() or 0
    final_edges = edge_result.scalar() or 0

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

    # Batch dot-product for cosine similarity
    edge_count = 0
    batch_size = 200
    for i in range(0, len(chunk_ids), batch_size):
        batch_vecs = matrix[i: i + batch_size]
        # Similarity of batch rows against all rows
        sims = np.dot(batch_vecs, matrix.T)

        for bi, sim_row in enumerate(sims):
            global_i = i + bi
            for j, sim in enumerate(sim_row):
                if j <= global_i:
                    continue  # Avoid self and duplicate pairs
                if sim >= threshold:
                    edge_id = f"sim:{chunk_ids[global_i][-8:]}:{chunk_ids[j][-8:]}"
                    try:
                        session.execute(
                            text(
                                "INSERT INTO graph_edge (id, from_node, to_node, type, weight, properties) "
                                "VALUES (:id, :from_node, :to_node, 'similarity', :weight, NULL) "
                                "ON CONFLICT (id) DO NOTHING"
                            ),
                            {
                                "id": edge_id,
                                "from_node": chunk_ids[global_i],
                                "to_node": chunk_ids[j],
                                "weight": float(sim),
                            },
                        )
                        edge_count += 1
                    except Exception:
                        pass

    session.commit()
    logger.info("Similarity edges created", extra={"count": edge_count, "threshold": threshold})
    return edge_count
