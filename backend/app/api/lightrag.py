"""
LightRAG API router.
All endpoints are public (no auth required for GET).
Index endpoints use BackgroundTasks to return immediately.
"""
from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import ORJSONResponse
from pydantic import BaseModel, field_validator

from backend.app.lightrag_service.graph_exporter import (
    VALID_MODES,
    export_graph,
    search_graph,
)
from backend.app.lightrag_service.indexer import check_index_status, index_domain

logger = logging.getLogger(__name__)
router = APIRouter()

# ── In-memory index status tracker ────────────────────────────────────────────
_index_status: dict[str, str] = {
    "aircraft": "idle",
    "medical": "idle",
}

VALID_DOMAINS = {"aircraft", "medical"}

# ── Request / Response schemas ─────────────────────────────────────────────────

class LightRAGQueryRequest(BaseModel):
    domain: str
    query: str
    mode: str = "hybrid"

    @field_validator("domain")
    @classmethod
    def validate_domain(cls, v: str) -> str:
        if v not in VALID_DOMAINS:
            raise ValueError(f"domain must be one of {sorted(VALID_DOMAINS)}")
        return v

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, v: str) -> str:
        if v not in VALID_MODES:
            raise ValueError(f"mode must be one of {sorted(VALID_MODES)}")
        return v

# ── Background indexing task ───────────────────────────────────────────────────

async def _run_indexing(domain: str) -> None:
    _index_status[domain] = "indexing"
    try:
        result = await index_domain(domain)
        logger.info("LightRAG indexing complete for '%s': %s", domain, result)
        _index_status[domain] = "done"
    except Exception as exc:
        logger.error("LightRAG indexing failed for '%s': %s", domain, exc)
        _index_status[domain] = "error"

# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/status/{domain}", response_class=ORJSONResponse)
async def get_status(domain: str) -> dict:
    """Returns indexing status and graph stats for the domain."""
    if domain not in VALID_DOMAINS:
        raise HTTPException(status_code=422, detail=f"domain must be one of {sorted(VALID_DOMAINS)}")
    status = await check_index_status(domain)
    status["index_job_status"] = _index_status.get(domain, "idle")
    return status


@router.post("/index/{domain}", response_class=ORJSONResponse)
async def trigger_index(domain: str, background_tasks: BackgroundTasks) -> dict:
    """
    Triggers background indexing for the domain.
    Returns immediately — poll /status/{domain} for progress.
    """
    if domain not in VALID_DOMAINS:
        raise HTTPException(status_code=422, detail=f"domain must be one of {sorted(VALID_DOMAINS)}")

    if _index_status.get(domain) == "indexing":
        return {
            "message": f"Indexing already in progress for '{domain}'.",
            "domain": domain,
            "status": "indexing",
        }

    background_tasks.add_task(_run_indexing, domain)
    return {
        "message": f"Indexing started for '{domain}'. Poll /lightrag/status/{domain} for progress.",
        "domain": domain,
        "status": "indexing",
    }


@router.get("/graph/{domain}", response_class=ORJSONResponse)
async def get_graph(
    domain: str,
    max_nodes: int = Query(default=200, ge=10, le=1000),
) -> dict:
    """Returns the knowledge graph nodes and edges for visualization."""
    if domain not in VALID_DOMAINS:
        raise HTTPException(status_code=422, detail=f"domain must be one of {sorted(VALID_DOMAINS)}")
    try:
        return await export_graph(domain, max_nodes=max_nodes)
    except Exception as exc:
        logger.error("Graph export failed for '%s': %s", domain, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/query", response_class=ORJSONResponse)
async def query_graph(body: LightRAGQueryRequest) -> dict:
    """Runs a LightRAG query against the domain knowledge graph."""
    try:
        return await search_graph(body.domain, body.query, body.mode)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error("LightRAG query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/modes", response_class=ORJSONResponse)
async def get_modes() -> dict:
    """Returns the list of supported LightRAG query modes."""
    return {
        "modes": sorted(VALID_MODES),
        "default": "hybrid",
        "descriptions": {
            "local":  "Context-dependent, entity-focused retrieval",
            "global": "Global knowledge, relationship-focused retrieval",
            "hybrid": "Combines local + global (recommended)",
            "naive":  "Basic vector search without graph expansion",
            "mix":    "Integrates knowledge graph and vector retrieval",
        },
    }


@router.get("/index-status", response_class=ORJSONResponse)
async def get_all_index_status() -> dict:
    """Returns current indexing job status for all domains."""
    return {"status": _index_status}
