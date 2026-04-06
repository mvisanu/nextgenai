"""
GET /graph/preloaded/{domain}

Serves the Kaggle-ingested knowledge graph from the PostgreSQL graph_node +
graph_edge tables. Used as an immediate data source for the Obsidian-style
graph page before (or instead of) the LightRAG file-based index is ready.

Domain inference for chunk nodes: join embed_id to incident_embeddings
(aircraft) vs medical_embeddings (medical).

Entity nodes inherit domain from their most-connected chunk neighbour.

Returns the same shape as GET /lightrag/graph/{domain} so the frontend can
use either endpoint interchangeably.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from fastapi.responses import ORJSONResponse
from sqlalchemy import text

from backend.app.db.session import get_session
from backend.app.observability.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/graph")

_MAX_NODES = 600
_MAX_EDGES = 2000


@router.get(
    "/preloaded/{domain}",
    response_class=ORJSONResponse,
    summary="Preloaded KG from Kaggle-ingested graph_node/graph_edge tables",
    description=(
        "Returns the PostgreSQL knowledge graph for the given domain. "
        "Domain is inferred by joining chunk node embed_ids to "
        "incident_embeddings (aircraft) or medical_embeddings (medical). "
        "Same shape as GET /lightrag/graph/{domain}."
    ),
)
async def get_preloaded_graph(domain: str) -> dict[str, Any]:
    if domain not in ("aircraft", "medical"):
        return ORJSONResponse(
            status_code=400,
            content={"detail": f"Unknown domain '{domain}'. Valid: aircraft, medical"},
        )

    embed_table = (
        "incident_embeddings" if domain == "aircraft" else "medical_embeddings"
    )

    try:
        async with get_session() as session:
            # ── Step 1: fetch chunk nodes that belong to this domain ──────────
            # A chunk node's properties JSONB has {"embed_id": "..."}
            # We join to the appropriate embeddings table to confirm domain.
            chunk_rows = (
                await session.execute(
                    text(
                        f"""
                        SELECT
                            n.id,
                            n.label,
                            n.type,
                            n.properties
                        FROM graph_node n
                        JOIN {embed_table} e
                          ON e.embed_id = (n.properties->>'embed_id')
                        WHERE n.type = 'chunk'
                        LIMIT :max_nodes
                        """
                    ),
                    {"max_nodes": _MAX_NODES},
                )
            ).fetchall()

            chunk_ids: set[str] = {r.id for r in chunk_rows}

            # ── Step 2: fetch entity nodes connected to those chunks ──────────
            entity_rows = (
                await session.execute(
                    text(
                        """
                        SELECT DISTINCT
                            n.id,
                            n.label,
                            n.type,
                            n.properties
                        FROM graph_node n
                        JOIN graph_edge e
                          ON (e.from_node = n.id OR e.to_node = n.id)
                        WHERE n.type = 'entity'
                          AND (
                            e.from_node = ANY(:chunk_ids)
                            OR e.to_node  = ANY(:chunk_ids)
                          )
                        LIMIT :max_nodes
                        """
                    ),
                    {
                        "chunk_ids": list(chunk_ids),
                        "max_nodes": _MAX_NODES - len(chunk_ids),
                    },
                )
            ).fetchall() if chunk_ids else []

            all_node_ids: set[str] = chunk_ids | {r.id for r in entity_rows}

            # ── Step 3: fetch edges between domain-relevant nodes ─────────────
            edge_rows = (
                await session.execute(
                    text(
                        """
                        SELECT
                            e.id,
                            e.from_node  AS source,
                            e.to_node    AS target,
                            e.type       AS label,
                            e.weight
                        FROM graph_edge e
                        WHERE e.from_node = ANY(:node_ids)
                          AND e.to_node   = ANY(:node_ids)
                        LIMIT :max_edges
                        """
                    ),
                    {"node_ids": list(all_node_ids), "max_edges": _MAX_EDGES},
                )
            ).fetchall() if all_node_ids else []

    except Exception as exc:
        logger.error(
            "Preloaded graph query failed",
            extra={"domain": domain, "error": str(exc)},
        )
        return {
            "nodes": [],
            "edges": [],
            "status": "error",
            "domain": domain,
            "node_count": 0,
            "edge_count": 0,
        }

    # ── Build response in LightRAGGraphData shape ─────────────────────────────
    nodes = []
    for r in [*chunk_rows, *entity_rows]:
        props = r.properties or {}
        nodes.append(
            {
                "id": r.id,
                "label": r.label or r.id[:40],
                "type": r.type,
                "description": props.get("entity_type", "") or props.get("incident_id", ""),
                "weight": 1.0,
            }
        )

    edges = []
    for r in edge_rows:
        edges.append(
            {
                "id": r.id,
                "source": r.source,
                "target": r.target,
                "label": r.label or "related",
                "weight": float(r.weight or 1.0),
                "description": "",
            }
        )

    return {
        "nodes": nodes,
        "edges": edges,
        "status": "ok",
        "domain": domain,
        "node_count": len(nodes),
        "edge_count": len(edges),
    }
