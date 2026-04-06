"""
Indexer: reads from existing DB tables and inserts formatted text into LightRAG.
Falls back to demo docs if tables are empty (< 5 rows).
"""
from __future__ import annotations

import logging
import os
from typing import Any

from sqlalchemy import text

from backend.app.db.session import get_sync_session
from backend.app.lightrag_service.rag_instance import get_lightrag

logger = logging.getLogger(__name__)

# ── Env-var-configurable batch size ───────────────────────────────────────────
LIGHTRAG_BATCH_SIZE: int = int(os.getenv("LIGHTRAG_BATCH_SIZE", "10"))

# ── Module-level graph stats cache (keyed by domain) ──────────────────────────
# Populated after successful indexing; cleared when re-indexing begins.
# Schema: {"aircraft": {"doc_count": int, "entity_count": int, "relation_count": int}}
_graph_stats: dict[str, dict[str, int]] = {}

# ── Document formatters ────────────────────────────────────────────────────────

def _fmt_incident(row: Any) -> str:
    return (
        f"NCR Report: {row.incident_id}\n"
        f"Date: {row.event_date} | System: {row.system} | Severity: {row.severity}\n"
        f"Narrative: {row.narrative or 'No narrative recorded'}\n"
        f"Corrective Action: {row.corrective_action or 'Pending'}"
    )

def _fmt_defect(row: Any) -> str:
    return (
        f"Manufacturing Defect: {row.defect_id}\n"
        f"Date: {row.inspection_date} | Product: {row.product} | Plant: {getattr(row, 'plant', 'N/A')}\n"
        f"Type: {row.defect_type} | Severity: {row.severity}\n"
        f"Action Taken: {getattr(row, 'action_taken', None) or 'Pending'}"
    )

def _fmt_medical_case(row: Any) -> str:
    return (
        f"Clinical Case: {row.case_id}\n"
        f"Date: {getattr(row, 'event_date', 'Unknown')} | System: {getattr(row, 'system', 'N/A')} | Severity: {getattr(row, 'severity', 'N/A')}\n"
        f"Narrative: {row.narrative or 'No narrative recorded'}\n"
        f"Corrective Action: {getattr(row, 'corrective_action', None) or 'Pending'}"
    )

# ── Main indexing functions ────────────────────────────────────────────────────

async def index_aircraft_data(batch_size: int = LIGHTRAG_BATCH_SIZE) -> dict:
    """
    Reads incident_reports + manufacturing_defects → inserts into aircraft LightRAG.
    Returns {indexed: int, domain: str, sources: list[str]}.
    """
    rag = await get_lightrag("aircraft")
    docs: list[str] = []
    sources: list[str] = []

    with get_sync_session() as session:
        # Incident reports — project only the columns needed for _fmt_incident
        incidents = session.execute(
            text(
                "SELECT incident_id, event_date, system, severity, narrative, corrective_action"
                " FROM incident_reports ORDER BY event_date DESC LIMIT 500"
            )
        ).fetchall()
        for row in incidents:
            docs.append(_fmt_incident(row))
            sources.append(f"incident:{row.incident_id}")

        # Manufacturing defects — project only the columns needed for _fmt_defect
        defects = session.execute(
            text(
                "SELECT defect_id, inspection_date, product, plant, defect_type, severity, action_taken"
                " FROM manufacturing_defects ORDER BY inspection_date DESC LIMIT 500"
            )
        ).fetchall()
        for row in defects:
            docs.append(_fmt_defect(row))
            sources.append(f"defect:{row.defect_id}")

    if not docs:
        logger.warning("No aircraft data found in DB — falling back to demo docs.")
        from backend.app.lightrag_service.demo_indexer import index_demo_docs
        result = await index_demo_docs("aircraft")
        _graph_stats.pop("aircraft", None)  # invalidate; check_index_status will re-read
        return result

    # Clear stale cache before indexing so check_index_status reads fresh data
    _graph_stats.pop("aircraft", None)

    # Insert in batches to respect LightRAG's max_parallel_insert
    indexed = 0
    for i in range(0, len(docs), batch_size):
        batch = docs[i : i + batch_size]
        await rag.ainsert(batch)
        indexed += len(batch)
        logger.info("Aircraft LightRAG: indexed %d / %d docs", indexed, len(docs))

    return {"indexed": indexed, "domain": "aircraft", "sources": sources[:10]}


async def index_medical_data(batch_size: int = LIGHTRAG_BATCH_SIZE) -> dict:
    """
    Reads medical_cases → inserts into medical LightRAG.
    Returns {indexed: int, domain: str, sources: list[str]}.
    """
    rag = await get_lightrag("medical")
    docs: list[str] = []
    sources: list[str] = []

    with get_sync_session() as session:
        # Medical cases — project only the columns needed for _fmt_medical_case
        cases = session.execute(
            text(
                "SELECT case_id, event_date, system, severity, narrative, corrective_action"
                " FROM medical_cases ORDER BY event_date DESC LIMIT 500"
            )
        ).fetchall()
        for row in cases:
            docs.append(_fmt_medical_case(row))
            sources.append(f"case:{row.case_id}")

    if not docs:
        logger.warning("No medical data found in DB — falling back to demo docs.")
        from backend.app.lightrag_service.demo_indexer import index_demo_docs
        result = await index_demo_docs("medical")
        _graph_stats.pop("medical", None)  # invalidate; check_index_status will re-read
        return result

    # Clear stale cache before indexing so check_index_status reads fresh data
    _graph_stats.pop("medical", None)

    indexed = 0
    for i in range(0, len(docs), batch_size):
        batch = docs[i : i + batch_size]
        await rag.ainsert(batch)
        indexed += len(batch)
        logger.info("Medical LightRAG: indexed %d / %d docs", indexed, len(docs))

    return {"indexed": indexed, "domain": "medical", "sources": sources[:10]}


async def index_domain(domain: str, batch_size: int = LIGHTRAG_BATCH_SIZE) -> dict:
    """Dispatcher — routes to the correct domain indexer."""
    if domain == "aircraft":
        return await index_aircraft_data(batch_size)
    elif domain == "medical":
        return await index_medical_data(batch_size)
    else:
        raise ValueError(f"Unknown domain: {domain}")


async def check_index_status(domain: str) -> dict:
    """
    Returns indexing status without triggering initialization.
    Reads working dir for presence of data files.

    Expensive operations (JSON parse + graphml parse) are cached in the
    module-level ``_graph_stats`` dict after the first successful read and
    re-used on subsequent calls.  The cache is invalidated at the start of
    ``index_aircraft_data`` / ``index_medical_data`` so fresh stats appear
    once re-indexing completes.
    """
    from pathlib import Path
    from backend.app.lightrag_service.rag_instance import DOMAIN_DIRS

    if domain not in DOMAIN_DIRS:
        raise ValueError(f"Unknown domain: {domain}")

    working_dir = Path(DOMAIN_DIRS[domain])
    kv_file = working_dir / "kv_store_full_docs.json"
    graph_file = working_dir / "graph_chunk_entity_relation.graphml"

    indexed = kv_file.exists() and kv_file.stat().st_size > 100

    doc_count = 0
    entity_count = 0
    relation_count = 0

    if indexed:
        cached = _graph_stats.get(domain)
        if cached is not None:
            # Serve from cache — no file I/O needed
            doc_count = cached["doc_count"]
            entity_count = cached["entity_count"]
            relation_count = cached["relation_count"]
        else:
            # Cold read: parse files once, then store in cache
            try:
                import json
                with open(kv_file) as f:
                    kv_data = json.load(f)
                    doc_count = len(kv_data)
            except Exception:
                pass

            try:
                import networkx as nx
                G = nx.read_graphml(str(graph_file))
                entity_count = G.number_of_nodes()
                relation_count = G.number_of_edges()
            except Exception:
                pass

            _graph_stats[domain] = {
                "doc_count": doc_count,
                "entity_count": entity_count,
                "relation_count": relation_count,
            }

    return {
        "domain": domain,
        "indexed": indexed,
        "doc_count": doc_count,
        "entity_count": entity_count,
        "relation_count": relation_count,
    }
