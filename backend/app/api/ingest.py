"""
POST /ingest — triggers the full data ingestion pipeline as a background task.
Returns 202 Accepted immediately; pipeline runs asynchronously.
"""
from __future__ import annotations

import threading

from fastapi import APIRouter, HTTPException

from backend.app.ingest.medical_pipeline import run_medical_ingest_pipeline
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


_medical_ingest_running = threading.Event()


def _run_medical_pipeline_in_thread() -> None:
    """Run the medical ingest pipeline in a background daemon thread."""
    try:
        result = run_medical_ingest_pipeline()
        logger.info("Medical ingest complete", extra={"summary": result})
    except Exception as exc:
        logger.error("Medical ingest failed", extra={"error": str(exc)})
    finally:
        _medical_ingest_running.clear()


@router.post(
    "/ingest/medical",
    response_model=IngestResponse,
    status_code=202,
    summary="Trigger medical domain ingestion pipeline",
    description=(
        "Loads MACCROBAT clinical case reports (HuggingFace) or generates synthetic cases, "
        "plus Disease Symptoms & Patient Profile CSV (Kaggle) or synthetic disease records. "
        "Chunks, embeds, and stores to medical_cases, disease_records, medical_embeddings tables."
    ),
)
async def trigger_medical_ingest() -> IngestResponse:
    if _medical_ingest_running.is_set():
        raise HTTPException(
            status_code=409,
            detail="Medical ingest pipeline is already running.",
        )

    _medical_ingest_running.set()
    t = threading.Thread(target=_run_medical_pipeline_in_thread, daemon=True)
    t.start()

    logger.info("Medical ingest pipeline triggered via API")
    return IngestResponse(
        status="started",
        message=(
            "Medical ingest pipeline started. "
            "Loading MACCROBAT clinical cases (or synthetic fallback) and Disease Symptoms CSV. "
            "Monitor server logs for progress."
        ),
    )
