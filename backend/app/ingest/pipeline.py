"""
Ingest pipeline orchestrator.
Runs all phases in dependency order:
  1. Generate synthetic incidents
  2. Load Kaggle datasets (or seed CSVs)
  3. Bulk-load all three canonical tables
  4. Chunk narratives + embed + store to incident_embeddings
  5. Build knowledge graph (nodes + edges)
"""
from __future__ import annotations

import threading
import uuid
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import text

from backend.app.db.session import get_sync_session
from backend.app.ingest.kaggle_loader import (
    load_defects_supplemental,
    load_maintenance_logs,
    load_manufacturing_defects,
)
from backend.app.ingest.synthetic import generate_synthetic_incidents
from backend.app.observability.logging import get_logger
from backend.app.rag.chunker import chunk_text
from backend.app.rag.embeddings import EmbeddingModel

logger = get_logger(__name__)

# Global flag to prevent concurrent ingest runs
_ingest_running = threading.Event()


def is_ingest_running() -> bool:
    return _ingest_running.is_set()


# ---------------------------------------------------------------------------
# Phase 3: Bulk-load canonical tables
# ---------------------------------------------------------------------------


def _upsert_dataframe_sync(session, table_name: str, df: pd.DataFrame, pk_col: str) -> int:
    """
    Upsert a pandas DataFrame into a PostgreSQL table using ON CONFLICT DO NOTHING.
    Returns number of rows inserted.
    """
    if df.empty:
        return 0

    rows = df.to_dict(orient="records")
    cols = list(rows[0].keys())
    col_list = ", ".join(cols)
    placeholders = ", ".join(f":{c}" for c in cols)

    sql = text(
        f"INSERT INTO {table_name} ({col_list}) VALUES ({placeholders}) "
        f"ON CONFLICT ({pk_col}) DO NOTHING"
    )

    inserted = 0
    for row in rows:
        try:
            # Convert NaN/NaT to None for SQL compatibility
            clean_row = {
                k: (None if (isinstance(v, float) and v != v) else v)
                for k, v in row.items()
            }
            result = session.execute(sql, clean_row)
            inserted += result.rowcount
        except Exception as exc:
            logger.warning("Row insert failed", extra={"table": table_name, "error": str(exc)})
    session.commit()
    logger.info("Upserted rows", extra={"table": table_name, "inserted": inserted, "total": len(rows)})
    return inserted


# ---------------------------------------------------------------------------
# Phase 4: Chunk + embed + store
# ---------------------------------------------------------------------------


def _embed_and_store_sync(session, chunk_size: int = 400, overlap: int = 75, batch_size: int = 256) -> int:
    """
    For each incident in incident_reports that has no embeddings yet:
      - Chunk the narrative
      - Embed all chunks in batch
      - Insert into incident_embeddings

    Idempotent: skips incidents already embedded.
    Returns total chunks stored.
    """
    # Find incidents without embeddings
    result = session.execute(text(
        """
        SELECT i.incident_id, i.narrative
        FROM incident_reports i
        LEFT JOIN incident_embeddings e ON e.incident_id = i.incident_id
        WHERE e.embed_id IS NULL AND i.narrative IS NOT NULL AND i.narrative != ''
        """
    ))
    incidents = result.fetchall()

    if not incidents:
        logger.info("All incidents already embedded — skipping")
        return 0

    logger.info("Embedding incidents", extra={"count": len(incidents)})
    model = EmbeddingModel.get()

    # Build all chunk records first, then batch embed
    chunk_records: list[dict[str, Any]] = []
    for incident_id, narrative in incidents:
        chunks = chunk_text(narrative, chunk_size=chunk_size, overlap=overlap)
        for chunk in chunks:
            chunk_records.append({
                "embed_id": str(uuid.uuid4()),
                "incident_id": incident_id,
                "chunk_index": chunk["chunk_index"],
                "chunk_text": chunk["chunk_text"],
                "char_start": chunk["char_start"],
                "char_end": chunk["char_end"],
                "embedding": None,  # filled in batch below
            })

    # Embed in batches
    total_stored = 0
    for batch_start in range(0, len(chunk_records), batch_size):
        batch = chunk_records[batch_start: batch_start + batch_size]
        texts = [r["chunk_text"] for r in batch]
        vectors = model.encode(texts)

        for record, vector in zip(batch, vectors):
            record["embedding"] = vector.tolist()

        # Insert batch
        for record in batch:
            try:
                session.execute(
                    text(
                        "INSERT INTO incident_embeddings "
                        "(embed_id, incident_id, chunk_index, chunk_text, embedding, char_start, char_end) "
                        "VALUES (:embed_id, :incident_id, :chunk_index, :chunk_text, :embedding, :char_start, :char_end) "
                        "ON CONFLICT (embed_id) DO NOTHING"
                    ),
                    {**record, "embedding": str(record["embedding"])},
                )
                total_stored += 1
            except Exception as exc:
                logger.warning("Chunk insert failed", extra={"error": str(exc)})
        session.commit()
        logger.info(
            "Embedding batch stored",
            extra={"batch": batch_start // batch_size + 1, "stored_so_far": total_stored},
        )

    logger.info("Embedding complete", extra={"total_chunks": total_stored})
    return total_stored


# ---------------------------------------------------------------------------
# Main pipeline entry point
# ---------------------------------------------------------------------------


def run_ingest_pipeline(config: Any = None) -> dict[str, Any]:
    """
    Execute the full ingest pipeline synchronously.
    Returns a summary dict with row counts per table.

    This function is designed to be called from a background thread.
    """
    summary: dict[str, Any] = {
        "incidents_loaded": 0,
        "defects_loaded": 0,
        "maintenance_loaded": 0,
        "chunks_embedded": 0,
        "graph_nodes": 0,
        "graph_edges": 0,
        "status": "running",
    }

    try:
        _ingest_running.set()
        logger.info("Ingest pipeline starting")

        # --- Phase 1: Generate synthetic incidents ---
        from pathlib import Path
        synthetic_csv = Path("data/synthetic/incidents_synth.csv")
        df_incidents = generate_synthetic_incidents(n=10000, output_path=synthetic_csv)

        # --- Phase 2: Load Kaggle / seed datasets ---
        df_defects = load_manufacturing_defects(config)
        df_defects_supp = load_defects_supplemental(config)
        df_maintenance = load_maintenance_logs(config)

        # Combine supplemental defects with primary defects
        df_all_defects = pd.concat([df_defects, df_defects_supp], ignore_index=True)

        # --- Phase 3: Bulk-load canonical tables ---
        with get_sync_session() as session:
            inc_count = _upsert_dataframe_sync(session, "incident_reports", df_incidents, "incident_id")
            def_count = _upsert_dataframe_sync(session, "manufacturing_defects", df_all_defects, "defect_id")
            mnt_count = _upsert_dataframe_sync(session, "maintenance_logs", df_maintenance, "log_id")

        summary["incidents_loaded"] = inc_count
        summary["defects_loaded"] = def_count
        summary["maintenance_loaded"] = mnt_count

        # --- Phase 4: Chunk + embed ---
        with get_sync_session() as session:
            chunks = _embed_and_store_sync(session)
        summary["chunks_embedded"] = chunks

        # --- Phase 5: Build knowledge graph ---
        try:
            from backend.app.graph.builder import build_graph
            with get_sync_session() as session:
                graph_result = build_graph(session)
                summary["graph_nodes"] = graph_result.get("nodes", 0)
                summary["graph_edges"] = graph_result.get("edges", 0)
        except Exception as exc:
            logger.warning("Graph build failed (non-fatal)", extra={"error": str(exc)})

        summary["status"] = "complete"
        logger.info("Ingest pipeline complete", extra=summary)

    except Exception as exc:
        summary["status"] = "failed"
        summary["error"] = str(exc)
        logger.error("Ingest pipeline failed", extra={"error": str(exc)})
        raise
    finally:
        _ingest_running.clear()

    return summary
