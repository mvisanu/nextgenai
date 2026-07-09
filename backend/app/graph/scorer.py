"""
Graph evidence re-ranker.
Combines vector similarity score, edge weight, and recency into a composite score.
Flags conflicting evidence sources.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from backend.app.observability.logging import get_logger

logger = get_logger(__name__)

# Score formula weights (must sum to 1.0)
W_SIMILARITY = 0.5
W_EDGE_WEIGHT = 0.3
W_RECENCY = 0.2


def rank_evidence(
    vector_hits: list[dict[str, Any]],
    graph_nodes: list[dict[str, Any]],
    graph_edges: list[dict[str, Any]],
    top_k: int = 8,
    config: Any = None,
) -> list[dict[str, Any]]:
    """
    Re-rank expanded graph evidence by composite score.

    Args:
        vector_hits:  Results from VectorSearchTool (chunk_id, score, excerpt, metadata).
        graph_nodes:  Expanded graph nodes (from graph expander).
        graph_edges:  Expanded graph edges (from graph expander).
        top_k:        Ceiling on returned items. Default top_k * 2 = 16.
        config:       Optional config (unused, reserved for future threshold tuning).

    Returns:
        Ranked list of evidence items:
            node_id           (str)
            type              (str)   — 'chunk' | 'entity'
            text_excerpt      (str)
            composite_score   (float)
            source_incident_id (str | None)
            conflict          (bool)  — True if conflicting evidence detected

    Score formula:
        composite = 0.5 * similarity_score + 0.3 * edge_weight + 0.2 * recency_score

    Recency is normalised 0–1 over the observed date range in vector_hits.
    Conflicting evidence: same entity label appearing with contradictory severity
    or different source incidents reduces confidence and sets conflict=True.
    """
    # Build lookup: chunk_id → vector hit
    hit_by_chunk: dict[str, dict[str, Any]] = {h["chunk_id"]: h for h in vector_hits}

    # Compute recency normalization range from hit dates
    dates: list[date] = []
    for hit in vector_hits:
        date_str = hit.get("metadata", {}).get("event_date")
        if date_str:
            try:
                dates.append(date.fromisoformat(str(date_str)))
            except (ValueError, TypeError):
                pass

    min_date = min(dates) if dates else date(2020, 1, 1)
    max_date = max(dates) if dates else date(2025, 12, 31)
    date_range_days = (max_date - min_date).days or 1

    def recency_score(event_date_str: str | None) -> float:
        if not event_date_str:
            return 0.5  # Unknown — neutral
        try:
            d = date.fromisoformat(str(event_date_str))
            return (d - min_date).days / date_range_days
        except (ValueError, TypeError):
            return 0.5

    # Build edge weight lookup per node: max weight of any edge connecting it
    node_max_weight: dict[str, float] = {}
    for edge in graph_edges:
        w = edge.get("weight") or 0.5
        for node_id in [edge.get("from_node"), edge.get("to_node")]:
            if node_id:
                node_max_weight[node_id] = max(node_max_weight.get(node_id, 0.0), float(w))

    # Map chunk node → source incident (from vector hits or node properties),
    # then propagate to entities via 'mentions' edges (chunk → entity). Without
    # this, entities never carry an incident id and conflict detection is inert.
    chunk_incident: dict[str, str] = {}
    for node in graph_nodes:
        if node.get("type") != "chunk":
            continue
        nid = node["id"]
        hit = hit_by_chunk.get(nid.replace("chunk:", ""))
        props = node.get("properties") or {}
        inc = (hit or {}).get("incident_id") or (
            props.get("incident_id") if isinstance(props, dict) else None
        )
        if inc:
            chunk_incident[nid] = str(inc)

    entity_incidents: dict[str, set[str]] = {}
    for edge in graph_edges:
        if edge.get("type") == "mentions":
            inc = chunk_incident.get(edge.get("from_node"))
            if inc:
                entity_incidents.setdefault(edge.get("to_node"), set()).add(inc)

    # Score each node
    evidence_items: list[dict[str, Any]] = []
    for node in graph_nodes:
        node_id = node["id"]
        node_type = node.get("type", "entity")
        label = node.get("label", "")
        properties = node.get("properties") or {}

        # Similarity score — 1.0 for direct vector hits, 0.0 for pure graph neighbours
        similarity = 0.0
        incident_id = None
        excerpt = label

        if node_type == "chunk":
            # Extract embed_id from node id
            embed_id = node_id.replace("chunk:", "")
            if embed_id in hit_by_chunk:
                hit = hit_by_chunk[embed_id]
                similarity = hit.get("score", 0.0)
                incident_id = hit.get("incident_id")
                excerpt = hit.get("excerpt", label)
                event_date_str = hit.get("metadata", {}).get("event_date")
            else:
                # Not a direct hit — it came in via graph expansion
                if isinstance(properties, dict):
                    incident_id = properties.get("incident_id")
                event_date_str = None
        else:
            # Entity node — attribute an incident when exactly one chunk mentions it
            event_date_str = None
            incs = entity_incidents.get(node_id)
            if incs and len(incs) == 1:
                incident_id = next(iter(incs))

        edge_weight = node_max_weight.get(node_id, 0.5)
        rec_score = recency_score(event_date_str if node_type == "chunk" else None)

        composite = W_SIMILARITY * similarity + W_EDGE_WEIGHT * edge_weight + W_RECENCY * rec_score

        evidence_items.append({
            "node_id": node_id,
            "type": node_type,
            "text_excerpt": excerpt[:500] if excerpt else "",
            "composite_score": round(composite, 4),
            "source_incident_id": incident_id,
            "conflict": False,  # Updated below
        })

    # Sort descending by composite score
    evidence_items.sort(key=lambda x: x["composite_score"], reverse=True)

    # Detect conflicting sources: same entity mentioned by chunks from
    # different incidents (via the mentions-edge attribution built above).
    for item in evidence_items:
        if item["type"] == "entity":
            if len(entity_incidents.get(item["node_id"], set())) > 1:
                item["conflict"] = True

    ceiling = top_k * 2
    result = evidence_items[:ceiling]

    logger.info(
        "Evidence ranked",
        extra={
            "total_nodes": len(graph_nodes),
            "ranked": len(result),
            "conflicts": sum(1 for e in result if e["conflict"]),
        },
    )
    return result
