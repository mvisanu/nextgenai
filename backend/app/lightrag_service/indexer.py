"""
Indexer: reads from existing DB tables and inserts formatted text into LightRAG.
Falls back to demo docs if tables are empty (< 5 rows).
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text

from backend.app.db.session import get_sync_session
from backend.app.lightrag_service.rag_instance import get_lightrag

logger = logging.getLogger(__name__)

# ── Document formatters ────────────────────────────────────────────────────────

def _fmt_incident(row: Any) -> str:
    return (
        f"NCR Report: {row.incident_id}\n"
        f"Date: {row.date} | System: {row.system} | Severity: {row.severity}\n"
        f"Narrative: {row.narrative_text}\n"
        f"Root Cause: {row.root_cause or 'Unknown'}\n"
        f"Corrective Action: {row.corrective_action or 'Pending'}"
    )

def _fmt_defect(row: Any) -> str:
    return (
        f"Manufacturing Defect: {row.defect_id}\n"
        f"Date: {row.date} | Product: {row.product} | Part: {getattr(row, 'part', 'N/A')}\n"
        f"Type: {row.defect_type} | Severity: {row.severity}\n"
        f"Description: {row.defect_description}\n"
        f"Disposition: {getattr(row, 'disposition', 'Pending') or 'Pending'}"
    )

def _fmt_maintenance(row: Any) -> str:
    return (
        f"Maintenance Event: {row.log_id}\n"
        f"Date: {row.date} | Asset: {row.asset_id} | Product: {getattr(row, 'product', 'N/A')}\n"
        f"Event Type: {row.event_type}\n"
        f"Notes: {row.notes or 'No notes recorded'}"
    )

# ── Main indexing functions ────────────────────────────────────────────────────

async def index_aircraft_data(batch_size: int = 10) -> dict:
    """
    Reads incident_reports + manufacturing_defects → inserts into aircraft LightRAG.
    Returns {indexed: int, domain: str, sources: list[str]}.
    """
    rag = await get_lightrag("aircraft")
    docs: list[str] = []
    sources: list[str] = []

    with get_sync_session() as session:
        # Incident reports
        incidents = session.execute(
            text("SELECT * FROM incident_reports ORDER BY date DESC LIMIT 500")
        ).fetchall()
        for row in incidents:
            docs.append(_fmt_incident(row))
            sources.append(f"incident:{row.incident_id}")

        # Manufacturing defects
        defects = session.execute(
            text("SELECT * FROM manufacturing_defects ORDER BY date DESC LIMIT 500")
        ).fetchall()
        for row in defects:
            docs.append(_fmt_defect(row))
            sources.append(f"defect:{row.defect_id}")

    if not docs:
        logger.warning("No aircraft data found in DB — falling back to demo docs.")
        from backend.app.lightrag_service.demo_indexer import index_demo_docs
        return await index_demo_docs("aircraft")

    # Insert in batches to respect LightRAG's max_parallel_insert
    indexed = 0
    for i in range(0, len(docs), batch_size):
        batch = docs[i : i + batch_size]
        await rag.ainsert(batch)
        indexed += len(batch)
        logger.info("Aircraft LightRAG: indexed %d / %d docs", indexed, len(docs))

    return {"indexed": indexed, "domain": "aircraft", "sources": sources[:10]}


async def index_medical_data(batch_size: int = 10) -> dict:
    """
    Reads maintenance_logs → inserts into medical LightRAG.
    Returns {indexed: int, domain: str, sources: list[str]}.
    """
    rag = await get_lightrag("medical")
    docs: list[str] = []
    sources: list[str] = []

    with get_sync_session() as session:
        logs = session.execute(
            text("SELECT * FROM maintenance_logs ORDER BY date DESC LIMIT 500")
        ).fetchall()
        for row in logs:
            docs.append(_fmt_maintenance(row))
            sources.append(f"log:{row.log_id}")

    if not docs:
        logger.warning("No medical data found in DB — falling back to demo docs.")
        from backend.app.lightrag_service.demo_indexer import index_demo_docs
        return await index_demo_docs("medical")

    indexed = 0
    for i in range(0, len(docs), batch_size):
        batch = docs[i : i + batch_size]
        await rag.ainsert(batch)
        indexed += len(batch)
        logger.info("Medical LightRAG: indexed %d / %d docs", indexed, len(docs))

    return {"indexed": indexed, "domain": "medical", "sources": sources[:10]}


async def index_domain(domain: str, batch_size: int = 10) -> dict:
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

    return {
        "domain": domain,
        "indexed": indexed,
        "doc_count": doc_count,
        "entity_count": entity_count,
        "relation_count": relation_count,
    }
