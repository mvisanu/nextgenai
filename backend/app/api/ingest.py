"""
POST /ingest — triggers the full data ingestion pipeline as a background task.
Returns 202 Accepted immediately; pipeline runs asynchronously.
"""
from __future__ import annotations

import threading
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException

from backend.app.ingest.pipeline import is_ingest_running, run_ingest_pipeline
from backend.app.observability.logging import get_logger
from backend.app.schemas.models import IngestRequest, IngestResponse

logger = get_logger(__name__)
router = APIRouter()


def _run_pipeline_in_thread() -> None:
    """Run the pipeline in a background thread (not async task, because pipeline is sync)."""
    try:
        result = run_ingest_pipeline()
        logger.info("Background ingest complete", extra={"summary": result})
    except Exception as exc:
        logger.error("Background ingest failed", extra={"error": str(exc)})


@router.post(
    "/ingest",
    response_model=IngestResponse,
    status_code=202,
    summary="Trigger data ingestion pipeline",
    description=(
        "Starts the full ingest pipeline: synthetic incidents, Kaggle datasets (or seed CSVs), "
        "chunking, embedding, and graph construction. Returns immediately; monitor logs for progress."
    ),
)
async def trigger_ingest(
    body: IngestRequest | None = None,
    background_tasks: BackgroundTasks = BackgroundTasks(),
) -> IngestResponse:
    if is_ingest_running():
        raise HTTPException(
            status_code=409,
            detail="Ingest pipeline is already running. Wait for it to complete before re-triggering.",
        )

    # Launch in a daemon thread since the pipeline is synchronous and long-running
    t = threading.Thread(target=_run_pipeline_in_thread, daemon=True)
    t.start()

    logger.info("Ingest pipeline triggered via API")
    return IngestResponse(
        status="started",
        message=(
            "Ingest pipeline started. "
            "Generating 10k synthetic incidents, loading Kaggle datasets (or seed CSVs), "
            "embedding chunks, and building knowledge graph. "
            "Monitor server logs for progress. Typically completes in 3–5 minutes."
        ),
    )
