"""
POST /query — run the agent orchestrator and return structured results.
GET /runs/{run_id} — retrieve a previously stored agent run.

T-17: orchestrator.run() is now natively async — run_in_threadpool is no longer
needed. The route handler calls await orchestrator.run(...) directly.
The sync run_in_threadpool import is retained as a comment for traceability.

W3-008/W3-009: SSE streaming variant added. POST /query with Accept: text/event-stream
header triggers SSE synthesis streaming. Gated by STREAMING_ENABLED env var (default true).
"""
from __future__ import annotations

import json
import os
from typing import Any, AsyncGenerator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import text

from backend.app.agent.orchestrator import AgentOrchestrator
from backend.app.db.session import get_session
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
        "and returns a cited, confidence-scored answer.\n\n"
        "W3-008: Send Accept: text/event-stream to receive SSE streaming synthesis output. "
        "Gated by STREAMING_ENABLED env var (default true)."
    ),
    responses={
        200: {"description": "Successful query response with evidence, claims, and graph path"},
        500: {"description": "Agent error — LLM or tool failure"},
        413: {"description": "Request body exceeds 1 MB limit"},
    },
)
async def run_query(
    body: QueryRequest,
    request: Request,
):
    logger.info("Query received", extra={"query": body.query[:200]})

    # Auth removed — all requests accepted anonymously; user_id always None.
    user_id = None

    # W3-008/W3-009: Check for SSE streaming request
    # If the client sends Accept: text/event-stream, route to SSE generator (if enabled).
    # If STREAMING_ENABLED=false, fall back to SSE-format response (avoids 500 from non-stream path).
    accept_header = request.headers.get("accept", "")
    streaming_enabled = os.environ.get("STREAMING_ENABLED", "true").lower() != "false"
    wants_sse = "text/event-stream" in accept_header

    if wants_sse:
        # Return SSE regardless of flag — when disabled, generator omits token events
        # and just emits done/error. This avoids returning 500 on a streaming request.
        return StreamingResponse(
            _sse_generator(body, streaming_tokens=streaming_enabled, user_id=user_id),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    # Non-streaming path (default)
    try:
        orchestrator = _get_orchestrator()
        # T-17: orchestrator.run() is natively async — no run_in_threadpool needed.
        # W3-005: pass session_id and conversation_history for conversational memory
        # W4-007: pass user_id for per-user run storage
        result = await orchestrator.run(
            body.query,
            domain=body.domain,
            session_id=body.session_id,
            conversation_history=body.conversation_history,
            user_id=user_id,
        )
        result_dict = result.to_dict()

        # Convert to response schema
        return QueryResponse(**_normalise_result(result_dict))

    except Exception as exc:
        logger.error("Query failed", extra={"error": str(exc), "query": body.query[:100]})
        raise HTTPException(status_code=500, detail=f"Agent error: {str(exc)}")


async def _sse_generator(
    body: QueryRequest,
    streaming_tokens: bool = True,
    user_id: str | None = None,
) -> AsyncGenerator[str, None]:
    """
    W3-008: SSE generator for streaming synthesis.
    Runs the full agent pipeline, then emits events in SSE format.

    Args:
        body:             The QueryRequest body.
        streaming_tokens: When True, emits word-by-word token events before 'done'.
                          When False (STREAMING_ENABLED=false), emits only 'done'/'error'.
        user_id:          Supabase user UUID from the verified JWT sub claim (W4-007).
    """
    try:
        orchestrator = _get_orchestrator()
        result = await orchestrator.run(
            body.query,
            domain=body.domain,
            session_id=body.session_id,
            conversation_history=body.conversation_history,
            user_id=user_id,
        )
        result_dict = result.to_dict()
        response = QueryResponse(**_normalise_result(result_dict))

        # Emit token events when streaming is enabled
        if streaming_tokens:
            answer_text = response.answer or ""
            words = answer_text.split()
            for i, word in enumerate(words):
                chunk = word + (" " if i < len(words) - 1 else "")
                token_event = json.dumps({"type": "token", "text": chunk})
                yield f"data: {token_event}\n\n"

        # Always emit done event with full run data
        done_payload = json.dumps({"type": "done", "run": response.model_dump(mode="json")})
        yield f"data: {done_payload}\n\n"

    except Exception as exc:
        logger.error("SSE streaming failed", extra={"error": str(exc), "query": body.query[:100]})
        error_payload = json.dumps({"type": "error", "message": str(exc)})
        yield f"data: {error_payload}\n\n"


@router.get(
    "/runs/{run_id}",
    response_model=RunRecord,
    summary="Retrieve stored agent run",
    description="Fetch the full result of a previously executed agent run by its run_id.",
)
async def get_run(
    run_id: str,
) -> RunRecord:
    # T3-08: use async session to avoid blocking the event loop
    # Auth removed — any caller may retrieve any run by run_id.
    try:
        async with get_session() as session:
            result = await session.execute(
                text(
                    "SELECT run_id, query, result, created_at, user_id "
                    "FROM agent_runs WHERE run_id = :run_id"
                ),
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
            "state_timings_ms": run_summary.get("state_timings_ms", {}),
            "cached": run_summary.get("cached", False),
        },
        "assumptions": d.get("assumptions", []),
        "next_steps": d.get("next_steps", []),
    }
