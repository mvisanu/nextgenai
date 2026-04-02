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

    # Access the underlying NetworkX graph
    # LightRAG stores it in chunk_entity_relation_graph which is a NetworkXStorage
    try:
        G = rag.chunk_entity_relation_graph._graph  # type: ignore[attr-defined]
    except AttributeError:
        G = None

    if G is None or G.number_of_nodes() == 0:
        return {
            "nodes": [],
            "edges": [],
            "status": "not_indexed",
            "domain": domain,
            "node_count": 0,
            "edge_count": 0,
        }

    # Sample nodes if graph is large — prioritise high-degree nodes
    all_nodes = list(G.nodes(data=True))
    if len(all_nodes) > max_nodes:
        # Sort by degree descending, take top max_nodes
        degrees = dict(G.degree())
        all_nodes = sorted(all_nodes, key=lambda n: degrees.get(n[0], 0), reverse=True)
        all_nodes = all_nodes[:max_nodes]

    node_ids = {n[0] for n in all_nodes}

    nodes = []
    for node_id, data in all_nodes:
        nodes.append({
            "id": str(node_id),
            "label": str(node_id),
            "type": str(data.get("entity_type", data.get("type", "entity"))).lower(),
            "description": str(data.get("description", "")),
            "weight": float(data.get("weight", 1.0)),
        })

    edges = []
    seen_edges: set[str] = set()
    for u, v, data in G.edges(data=True):
        if u not in node_ids or v not in node_ids:
            continue
        edge_id = f"{u}||{v}"
        if edge_id in seen_edges:
            continue
        seen_edges.add(edge_id)
        edges.append({
            "id": edge_id,
            "source": str(u),
            "target": str(v),
            "label": str(data.get("keywords", data.get("relation", ""))),
            "weight": float(data.get("weight", 1.0)),
            "description": str(data.get("description", "")),
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
