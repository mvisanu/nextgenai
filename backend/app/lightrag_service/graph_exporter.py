"""
Graph exporter: converts LightRAG's NetworkX graph to React Flow-compatible JSON.
Also provides the LightRAG query wrapper.
"""
from __future__ import annotations

import logging
from typing import Any

from lightrag import QueryParam

from backend.app.lightrag_service.rag_instance import get_lightrag

logger = logging.getLogger(__name__)

VALID_MODES = {"local", "global", "hybrid", "naive", "mix"}


async def export_graph(domain: str, max_nodes: int = 200) -> dict:
    """
    Exports the LightRAG knowledge graph for the given domain as JSON.

    Returns:
        {
          nodes: [{id, label, type, description, weight}],
          edges: [{id, source, target, label, weight, description}],
          status: "ok" | "not_indexed",
          domain: str,
          node_count: int,
          edge_count: int,
        }
    """
    rag = await get_lightrag(domain)

    # Use the public async API to read nodes and edges — this correctly handles
    # disk reload on process change (avoids stale ._graph direct access).
    try:
        raw_nodes = await rag.chunk_entity_relation_graph.get_all_nodes()
        raw_edges = await rag.chunk_entity_relation_graph.get_all_edges()
    except Exception as exc:
        logger.error("Graph read failed for '%s': %s", domain, exc)
        raw_nodes = []
        raw_edges = []

    if not raw_nodes:
        return {
            "nodes": [],
            "edges": [],
            "status": "not_indexed",
            "domain": domain,
            "node_count": 0,
            "edge_count": 0,
        }

    # Sample nodes if graph is large — prioritise high-degree nodes.
    # Build a degree map from the edge list to avoid loading NetworkX here.
    degree_map: dict[str, int] = {}
    for edge in raw_edges:
        src = edge.get("source", "")
        tgt = edge.get("target", "")
        degree_map[src] = degree_map.get(src, 0) + 1
        degree_map[tgt] = degree_map.get(tgt, 0) + 1

    if len(raw_nodes) > max_nodes:
        raw_nodes = sorted(
            raw_nodes,
            key=lambda n: degree_map.get(n.get("id", ""), 0),
            reverse=True,
        )
        raw_nodes = raw_nodes[:max_nodes]

    node_ids = {n.get("id", "") for n in raw_nodes}

    nodes = []
    for n in raw_nodes:
        node_id = str(n.get("id", ""))
        nodes.append({
            "id": node_id,
            "label": node_id,
            "type": str(n.get("entity_type", n.get("type", "entity"))).lower(),
            "description": str(n.get("description", "")),
            "weight": float(n.get("weight", 1.0)),
        })

    edges = []
    seen_edges: set[str] = set()
    for e in raw_edges:
        src = str(e.get("source", ""))
        tgt = str(e.get("target", ""))
        if src not in node_ids or tgt not in node_ids:
            continue
        edge_id = f"{src}||{tgt}"
        if edge_id in seen_edges:
            continue
        seen_edges.add(edge_id)
        edges.append({
            "id": edge_id,
            "source": src,
            "target": tgt,
            "label": str(e.get("keywords", e.get("relation", ""))),
            "weight": float(e.get("weight", 1.0)),
            "description": str(e.get("description", "")),
        })

    return {
        "nodes": nodes,
        "edges": edges,
        "status": "ok",
        "domain": domain,
        "node_count": len(nodes),
        "edge_count": len(edges),
    }


async def search_graph(domain: str, query: str, mode: str = "hybrid") -> dict:
    """
    Runs a LightRAG query against the domain knowledge graph.

    Args:
        domain: "aircraft" or "medical"
        query: natural language question
        mode: one of local | global | hybrid | naive | mix

    Returns:
        {answer: str, mode: str, domain: str}
    """
    if mode not in VALID_MODES:
        raise ValueError(f"Invalid mode '{mode}'. Must be one of: {sorted(VALID_MODES)}")

    rag = await get_lightrag(domain)

    answer = await rag.aquery(
        query,
        param=QueryParam(mode=mode),  # type: ignore[call-arg]
    )

    return {
        "answer": str(answer),
        "mode": mode,
        "domain": domain,
    }
