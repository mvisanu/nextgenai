"""
POST /query — run the agent orchestrator and return structured results.
GET /runs/{run_id} — retrieve a previously stored agent run.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from backend.app.agent.orchestrator import AgentOrchestrator
from backend.app.db.session import get_sync_session
from backend.app.observability.logging import get_logger
from backend.app.schemas.models import QueryRequest, QueryResponse, RunRecord

logger = get_logger(__name__)
router = APIRouter()

# Singleton orchestrator (reuses LLM client and embedding model)
_orchestrator: AgentOrchestrator | None = None


def _get_orchestrator() -> AgentOrchestrator:
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = AgentOrchestrator()
    return _orchestrator


@router.post(
    "/query",
    response_model=QueryResponse,
    summary="Run agent query with GraphRAG",
    description=(
        "Submit a natural language question. The agent classifies intent, generates a plan, "
        "executes tools (vector search, SQL, compute), expands the knowledge graph, "
        "and returns a cited, confidence-scored answer."
    ),
)
async def run_query(body: QueryRequest) -> QueryResponse:
    logger.info("Query received", extra={"query": body.query[:200]})

    try:
        orchestrator = _get_orchestrator()
        result = orchestrator.run(body.query)
        result_dict = result.to_dict()

        # Convert to response schema
        return QueryResponse(**_normalise_result(result_dict))

    except Exception as exc:
        logger.error("Query failed", extra={"error": str(exc), "query": body.query[:100]})
        raise HTTPException(status_code=500, detail=f"Agent error: {str(exc)}")


@router.get(
    "/runs/{run_id}",
    response_model=RunRecord,
    summary="Retrieve stored agent run",
    description="Fetch the full result of a previously executed agent run by its run_id.",
)
async def get_run(run_id: str) -> RunRecord:
    try:
        with get_sync_session() as session:
            result = session.execute(
                text("SELECT run_id, query, result, created_at FROM agent_runs WHERE run_id = :run_id"),
                {"run_id": run_id},
            )
            row = result.fetchone()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

    if not row:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")

    result_data = row.result
    if isinstance(result_data, str):
        result_data = json.loads(result_data)

    return RunRecord(
        run_id=row.run_id,
        query=row.query,
        result=result_data or {},
        created_at=row.created_at,
    )


def _normalise_result(d: dict[str, Any]) -> dict[str, Any]:
    """
    Coerce raw AgentRunResult dict into fields that match QueryResponse schema.
    Handles missing fields gracefully.
    """
    evidence = d.get("evidence", {})
    graph_path = d.get("graph_path", {})
    run_summary = d.get("run_summary", {})

    return {
        "run_id": d.get("run_id", ""),
        "query": d.get("query", ""),
        "answer": d.get("answer", ""),
        "claims": d.get("claims", []),
        "evidence": {
            "vector_hits": evidence.get("vector_hits", []),
            "sql_rows": evidence.get("sql_rows", []),
        },
        "graph_path": {
            "nodes": graph_path.get("nodes", []),
            "edges": graph_path.get("edges", []),
        },
        "run_summary": {
            "intent": run_summary.get("intent", "hybrid"),
            "plan_text": run_summary.get("plan_text", ""),
            "steps": run_summary.get("steps", []),
            "tools_used": run_summary.get("tools_used", []),
            "total_latency_ms": run_summary.get("total_latency_ms", 0.0),
            "halted_at_step_limit": run_summary.get("halted_at_step_limit", False),
        },
        "assumptions": d.get("assumptions", []),
        "next_steps": d.get("next_steps", []),
    }
