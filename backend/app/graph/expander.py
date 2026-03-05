"""
k-hop graph neighbourhood expander.
Starting from seed chunk/entity node IDs, expands the knowledge graph
by following edges up to k hops out.
"""
from __future__ import annotations

import time
from typing import Any

from sqlalchemy import text

from backend.app.observability.logging import get_logger

logger = get_logger(__name__)


def expand_graph(
    session,
    seed_ids: list[str],
    k: int = 2,
) -> dict[str, list[dict[str, Any]]]:
    """
    Expand the knowledge graph k hops from seed node IDs.

    Args:
        session:  SQLAlchemy session.
        seed_ids: List of graph_node IDs to start expansion from.
                  Typically these are chunk node IDs from vector search results.
        k:        Number of hops to expand. Default 2 (per PRD config).
                  k=0 returns only seed nodes with no edges.

    Returns:
        {
          "nodes": list of graph_node dicts (id, type, label, properties),
          "edges": list of graph_edge dicts (id, from_node, to_node, type, weight)
        }

    Notes:
        - Expansion follows 'mentions' and 'co_occurrence' edges at all hops.
        - 'similarity' edges included at hop 1 only (to avoid runaway expansion).
        - Uses iterative SQL queries rather than recursive CTEs for compatibility.
        - Expansion capped internally at 500 nodes to prevent memory issues.
    """
    t_start = time.perf_counter()

    if not seed_ids:
        return {"nodes": [], "edges": []}

    visited_node_ids: set[str] = set(seed_ids)
    collected_edges: list[dict[str, Any]] = []
    frontier: set[str] = set(seed_ids)

    for hop in range(k):
        if not frontier:
            break

        # Expand from current frontier
        frontier_list = list(frontier)

        # For hop 0 (first expansion from seeds): include similarity edges
        # For subsequent hops: only follows and co_occurrence (structural edges)
        if hop == 0:
            type_filter = "IN ('mentions', 'co_occurrence', 'similarity')"
        else:
            type_filter = "IN ('mentions', 'co_occurrence')"

        # Chunk frontier for large seed sets (PostgreSQL has parameter limits)
        CHUNK = 100
        new_frontier: set[str] = set()

        for chunk_start in range(0, len(frontier_list), CHUNK):
            chunk = frontier_list[chunk_start: chunk_start + CHUNK]
            placeholders = ", ".join(f"'{nid}'" for nid in chunk)

            # Outgoing edges
            result = session.execute(text(f"""
                SELECT id, from_node, to_node, type, weight
                FROM graph_edge
                WHERE from_node IN ({placeholders}) AND type {type_filter}
            """))
            for row in result.fetchall():
                edge_dict = {
                    "id": row.id,
                    "from_node": row.from_node,
                    "to_node": row.to_node,
                    "type": row.type,
                    "weight": row.weight,
                }
                collected_edges.append(edge_dict)
                if row.to_node not in visited_node_ids:
                    new_frontier.add(row.to_node)
                    visited_node_ids.add(row.to_node)

            # Incoming edges (bidirectional traversal)
            result = session.execute(text(f"""
                SELECT id, from_node, to_node, type, weight
                FROM graph_edge
                WHERE to_node IN ({placeholders}) AND type {type_filter}
            """))
            for row in result.fetchall():
                edge_dict = {
                    "id": row.id,
                    "from_node": row.from_node,
                    "to_node": row.to_node,
                    "type": row.type,
                    "weight": row.weight,
                }
                collected_edges.append(edge_dict)
                if row.from_node not in visited_node_ids:
                    new_frontier.add(row.from_node)
                    visited_node_ids.add(row.from_node)

        frontier = new_frontier

        # Safety cap
        if len(visited_node_ids) > 500:
            logger.warning(
                "Graph expansion capped at 500 nodes",
                extra={"hop": hop, "node_count": len(visited_node_ids)},
            )
            break

    # Deduplicate edges
    seen_edge_ids: set[str] = set()
    unique_edges = []
    for edge in collected_edges:
        if edge["id"] not in seen_edge_ids:
            seen_edge_ids.add(edge["id"])
            unique_edges.append(edge)

    # Fetch all visited node metadata in one query
    nodes: list[dict[str, Any]] = []
    if visited_node_ids:
        all_ids = list(visited_node_ids)
        CHUNK = 100
        for chunk_start in range(0, len(all_ids), CHUNK):
            chunk = all_ids[chunk_start: chunk_start + CHUNK]
            placeholders = ", ".join(f"'{nid}'" for nid in chunk)
            result = session.execute(text(f"""
                SELECT id, type, label, properties
                FROM graph_node
                WHERE id IN ({placeholders})
            """))
            for row in result.fetchall():
                nodes.append({
                    "id": row.id,
                    "type": row.type,
                    "label": row.label,
                    "properties": row.properties,
                })

    elapsed_ms = (time.perf_counter() - t_start) * 1000
    logger.info(
        "Graph expansion complete",
        extra={
            "seed_count": len(seed_ids),
            "k": k,
            "nodes": len(nodes),
            "edges": len(unique_edges),
            "latency_ms": round(elapsed_ms, 1),
        },
    )
    return {"nodes": nodes, "edges": unique_edges}
