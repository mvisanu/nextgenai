"""
AgentOrchestrator — the top-level agentic state machine.

State transitions:
  CLASSIFY+PLAN → EXECUTE_TOOLS → EXPAND_GRAPH → RE_RANK →
  SYNTHESISE → VERIFY → SAVE → DONE

Max 10 tool steps enforced. Each step logged with tool name, inputs, latency.
Final output conforms to the full AgentRunResult schema from PRD F4.

T-17: AgentOrchestrator.run() is now an async coroutine. Key parallelizations:
  - For hybrid/compute intents: VectorSearchTool and SQLQueryTool run concurrently
    via asyncio.gather (they query independent tables with no data dependency).
  - Graph expansion starts immediately after vector hits are available, while
    synthesise + verify are still sequential (verify needs synthesis output).
  - All LLM calls use complete_async() — non-blocking HTTP round-trips.

The synchronous run_sync() is preserved for backwards-compatibility. The
run_in_threadpool wrapper in query.py has been removed (now uses await
orchestrator.run() directly).
"""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError
from sqlalchemy import text

from backend.app.agent.intent import classify_and_plan_async
from backend.app.agent.verifier import verify_claims_async
from backend.app.db.session import get_session, get_sync_session
from backend.app.graph.expander import expand_graph, expand_graph_async
from backend.app.graph.scorer import rank_evidence
from backend.app.llm.client import (
    LLMClient,
    get_async_fast_llm_client,
    get_async_llm_client,
    get_fast_llm_client,
    get_llm_client,
)
from backend.app.observability.logging import get_logger
from backend.app.schemas.llm_outputs import SynthesisOutput
from backend.app.tools.compute_tool import PythonComputeTool
from backend.app.tools.sql_tool import SQLQueryTool
from backend.app.tools.vector_tool import VectorSearchTool

logger = get_logger(__name__)

MAX_STEPS = 10
TOOL_TIMEOUT_SECONDS = 30


@dataclass
class StepLog:
    step_number: int
    tool_name: str
    inputs: dict[str, Any]
    output_summary: str
    latency_ms: float
    error: str | None = None


@dataclass
class AgentRunResult:
    run_id: str
    query: str
    answer: str
    claims: list[dict[str, Any]]
    evidence: dict[str, Any]
    graph_path: dict[str, Any]
    run_summary: dict[str, Any]
    assumptions: list[str]
    next_steps: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "query": self.query,
            "answer": self.answer,
            "claims": self.claims,
            "evidence": self.evidence,
            "graph_path": self.graph_path,
            "run_summary": self.run_summary,
            "assumptions": self.assumptions,
            "next_steps": self.next_steps,
        }


_SYNTHESIS_SYSTEM_AIRCRAFT = """\
You are a manufacturing intelligence analyst specialising in aviation maintenance and quality engineering.
Synthesise a concise answer from the provided evidence in 2-3 sentences maximum.
Every factual claim must be directly grounded in the evidence. Do not speculate.
Frame recommendations as engineering hypotheses requiring qualified review.
If evidence is insufficient, say so in one sentence.
Limit: 2 claims, 1 assumption, 1 next_step.

Return JSON ONLY:
{
  "answer": "...",
  "claims": [{"text": "..."}],
  "assumptions": ["..."],
  "next_steps": ["..."]
}
"""

_SYNTHESIS_SYSTEM_MEDICAL = """\
You are a clinical intelligence assistant supporting healthcare quality analysis.
Synthesise a concise answer from the provided clinical evidence in 2-3 sentences maximum.
Every factual claim must be directly grounded in the case data. Do not speculate.
Limit: 2 claims, 1 assumption, 1 next_step.

IMPORTANT: All outputs are AI-generated hypotheses for research purposes only.
They require review by a qualified medical professional. Never provide diagnoses
or treatment recommendations as clinical advice.

Return JSON ONLY:
{
  "answer": "...",
  "claims": [{"text": "..."}],
  "assumptions": ["..."],
  "next_steps": ["..."]
}
"""


class AgentOrchestrator:
    """
    Drives the full agentic loop for a single query.

    Primary path (T-17):
        result = await orchestrator.run("Find incidents similar to hydraulic actuator crack")

    Sync fallback:
        result = orchestrator.run_sync("...")   # blocks — use only outside async context
    """

    def __init__(
        self,
        llm: LLMClient | None = None,
        max_steps: int = MAX_STEPS,
        tool_timeout_seconds: int = TOOL_TIMEOUT_SECONDS,
    ) -> None:
        # Sync clients retained for run_sync() fallback
        self.llm = llm or get_llm_client()
        self._fast_llm = get_fast_llm_client()

        # Async clients for the primary async run() path
        self._async_llm = get_async_llm_client()
        self._async_fast_llm = get_async_fast_llm_client()

        self.max_steps = max_steps
        self.tool_timeout_seconds = tool_timeout_seconds

        self._vector_tool = VectorSearchTool(timeout_seconds=tool_timeout_seconds)
        self._sql_tool = SQLQueryTool()
        self._compute_tool = PythonComputeTool()

    # ------------------------------------------------------------------
    # Primary async path (T-17)
    # ------------------------------------------------------------------

    async def run(
        self,
        query: str,
        domain: str = "aircraft",
        session_id: str | None = None,
        conversation_history: list[dict] | None = None,
        user_id: str | None = None,
    ) -> AgentRunResult:
        """
        Execute the full agentic loop asynchronously.

        Parallelization strategy:
          - For hybrid/compute intents: VectorSearchTool and SQLQueryTool fire
            concurrently via asyncio.gather — they touch independent tables.
          - Graph expansion uses the async session and runs after vector hits
            are available.
          - All three LLM calls (classify+plan, synthesise, verify) use
            complete_async() — non-blocking HTTP.
          - Synthesise and verify remain sequential (verify depends on synthesis).

        W3-005 — Epic 1: Conversational Memory
          - session_id stored in agent_runs for history retrieval
          - conversation_history injected into synthesis prompt (max 5 turns)
          - Gated by CONVERSATIONAL_MEMORY_ENABLED env var (default true)

        Args:
            query:                Natural language question from the user.
            domain:               "aircraft" or "medical".
            session_id:           Client session UUID for multi-turn context (optional).
            conversation_history: Prior turns [{role, content} or {query, answer_summary}] (optional).
            user_id:              Supabase user UUID (from JWT 'sub' claim). Stored on agent_runs
                                  for per-user history filtering. None for unauthenticated callers.

        Returns:
            AgentRunResult with full structured output.
        """
        run_id = str(uuid.uuid4())
        t_run_start = time.perf_counter()
        _state_timings: dict[str, float] = {}  # T3-02: per-state latency tracking

        logger.info(
            "Agent async run started",
            extra={"run_id": run_id, "query": query[:200], "domain": domain},
        )

        # T3-04: check exact-match query cache before running full agent loop
        cached_result = await _check_query_cache(query)
        if cached_result is not None:
            logger.info("Query cache hit — returning cached result", extra={"run_id": run_id})
            # Patch in the new run_id and mark as cached
            cached_result["run_id"] = run_id
            run_summary = cached_result.get("run_summary", {})
            run_summary["cached"] = True
            cached_result["run_summary"] = run_summary
            return AgentRunResult(
                run_id=run_id,
                query=query,
                answer=cached_result.get("answer", ""),
                claims=cached_result.get("claims", []),
                evidence=cached_result.get("evidence", {"vector_hits": [], "sql_rows": []}),
                graph_path=cached_result.get("graph_path", {"nodes": [], "edges": []}),
                run_summary=run_summary,
                assumptions=cached_result.get("assumptions", []),
                next_steps=cached_result.get("next_steps", []),
            )

        steps: list[StepLog] = []
        vector_hits: list[dict[str, Any]] = []
        sql_rows: list[dict[str, Any]] = []
        graph_nodes: list[dict[str, Any]] = []
        graph_edges: list[dict[str, Any]] = []
        halted_at_step_limit = False

        # ---------------------------------------------------------- CLASSIFY + PLAN
        logger.info("State: CLASSIFY+PLAN", extra={"run_id": run_id})
        _t_classify_start = time.perf_counter()
        combined = await classify_and_plan_async(query, self._async_fast_llm, domain=domain)
        _state_timings["classify_plan_ms"] = round((time.perf_counter() - _t_classify_start) * 1000, 1)
        intent = combined["intent"]
        plan_text = combined.get("plan_text", "")
        plan_steps = combined.get("steps", [])
        logger.info(
            "Intent and plan resolved",
            extra={"run_id": run_id, "intent": intent, "step_count": len(plan_steps)},
        )

        # ---------------------------------------------------------- EXECUTE_TOOLS
        logger.info(
            "State: EXECUTE_TOOLS",
            extra={"run_id": run_id, "steps": len(plan_steps)},
        )
        _t_execute_start = time.perf_counter()

        # Identify whether we can parallelize independent vector + SQL steps.
        # For hybrid/compute intents, gather the first VectorSearchTool and the
        # first SQLQueryTool step concurrently — they have no data dependency.
        vector_step_indices = [
            i for i, s in enumerate(plan_steps) if s.get("tool") == "VectorSearchTool"
        ]
        sql_step_indices = [
            i for i, s in enumerate(plan_steps) if s.get("tool") == "SQLQueryTool"
        ]

        if (
            intent in ("hybrid", "compute")
            and vector_step_indices
            and sql_step_indices
        ):
            # Run the first vector + first SQL step in parallel
            first_vec_idx = vector_step_indices[0]
            first_sql_idx = sql_step_indices[0]
            parallel_indices = {first_vec_idx, first_sql_idx}
        else:
            parallel_indices = set()

        # Build per-step coroutines where needed, run sequentially otherwise
        # Collect indices we've already handled via parallel gather
        handled_indices: set[int] = set()

        if parallel_indices:
            vec_idx = min(parallel_indices & set(vector_step_indices))
            sql_idx = min(parallel_indices & set(sql_step_indices))

            vec_step = plan_steps[vec_idx]
            sql_step = plan_steps[sql_idx]

            t_parallel_start = time.perf_counter()
            logger.info(
                "Parallel tool execution: VectorSearchTool + SQLQueryTool",
                extra={"run_id": run_id},
            )

            # T3-14: wrap each coroutine with asyncio.wait_for to bound hang time
            vec_result, sql_result = await asyncio.gather(
                asyncio.wait_for(
                    self._run_vector_step_async(vec_step, query, domain, intent=intent),
                    timeout=self.tool_timeout_seconds,
                ),
                asyncio.wait_for(
                    self._run_sql_step_async(sql_step, domain),
                    timeout=self.tool_timeout_seconds,
                ),
                return_exceptions=True,
            )

            parallel_latency = (time.perf_counter() - t_parallel_start) * 1000

            # Process vector result
            if isinstance(vec_result, Exception):
                err = str(vec_result)
                steps.append(StepLog(
                    step_number=vec_step.get("step_number", vec_idx + 1),
                    tool_name="VectorSearchTool",
                    inputs=vec_step.get("tool_inputs", {}),
                    output_summary=f"Error: {err[:100]}",
                    latency_ms=round(parallel_latency, 1),
                    error=err,
                ))
                logger.error(
                    "VectorSearchTool parallel error",
                    extra={"run_id": run_id, "error": err},
                )
            else:
                hits = vec_result.get("results", [])
                vector_hits.extend(hits)
                steps.append(StepLog(
                    step_number=vec_step.get("step_number", vec_idx + 1),
                    tool_name="VectorSearchTool",
                    inputs=vec_step.get("tool_inputs", {}),
                    output_summary=f"Found {len(hits)} similar chunks",
                    latency_ms=round(parallel_latency, 1),
                ))

            # Process SQL result
            if isinstance(sql_result, Exception):
                err = str(sql_result)
                steps.append(StepLog(
                    step_number=sql_step.get("step_number", sql_idx + 1),
                    tool_name="SQLQueryTool",
                    inputs=sql_step.get("tool_inputs", {}),
                    output_summary=f"Error: {err[:100]}",
                    latency_ms=round(parallel_latency, 1),
                    error=err,
                ))
                logger.error(
                    "SQLQueryTool parallel error",
                    extra={"run_id": run_id, "error": err},
                )
            else:
                output = sql_result
                if not output.get("error"):
                    row_count = output.get("row_count", 0)
                    tool_inputs = sql_step.get("tool_inputs", {})
                    sql_rows.append({
                        "query": tool_inputs.get("named_query") or tool_inputs.get("sql", ""),
                        "columns": output.get("columns", []),
                        "rows": output.get("rows", [])[:50],
                        "row_count": row_count,
                    })
                    steps.append(StepLog(
                        step_number=sql_step.get("step_number", sql_idx + 1),
                        tool_name="SQLQueryTool",
                        inputs=sql_step.get("tool_inputs", {}),
                        output_summary=f"Returned {row_count} rows",
                        latency_ms=round(parallel_latency, 1),
                    ))
                else:
                    err = output.get("error", "unknown error")
                    steps.append(StepLog(
                        step_number=sql_step.get("step_number", sql_idx + 1),
                        tool_name="SQLQueryTool",
                        inputs=sql_step.get("tool_inputs", {}),
                        output_summary=f"SQL error: {err}",
                        latency_ms=round(parallel_latency, 1),
                        error=err,
                    ))

            handled_indices = {vec_idx, sql_idx}

        # Sequential pass for remaining steps (PythonComputeTool and any extra steps)
        for idx, step in enumerate(plan_steps):
            if idx in handled_indices:
                continue
            if len(steps) >= self.max_steps:
                halted_at_step_limit = True
                logger.warning("Max step limit reached", extra={"run_id": run_id})
                break

            tool_name = step.get("tool", "VectorSearchTool")
            tool_inputs = step.get("tool_inputs", {})
            step_num = step.get("step_number", len(steps) + 1)

            t_tool_start = time.perf_counter()
            tool_output_summary = ""
            tool_error = None

            try:
                logger.info(
                    "Tool start",
                    extra={"run_id": run_id, "tool": tool_name, "step": step_num},
                )

                if tool_name == "VectorSearchTool":
                    # T3-14: bound hang time with asyncio.wait_for
                    output = await asyncio.wait_for(
                        self._run_vector_step_async(step, query, domain, intent=intent),
                        timeout=self.tool_timeout_seconds,
                    )
                    hits = output.get("results", [])
                    vector_hits.extend(hits)
                    tool_output_summary = f"Found {len(hits)} similar chunks"

                elif tool_name == "SQLQueryTool":
                    output = await asyncio.wait_for(
                        self._run_sql_step_async(step, domain),
                        timeout=self.tool_timeout_seconds,
                    )
                    if not output.get("error"):
                        row_count = output.get("row_count", 0)
                        sql_rows.append({
                            "query": tool_inputs.get("named_query") or tool_inputs.get("sql", ""),
                            "columns": output.get("columns", []),
                            "rows": output.get("rows", [])[:50],
                            "row_count": row_count,
                        })
                        tool_output_summary = f"Returned {row_count} rows"
                    else:
                        tool_error = output.get("error")
                        tool_output_summary = f"SQL error: {tool_error}"

                elif tool_name == "PythonComputeTool":
                    code = tool_inputs.get("code", "result = None")
                    ctx = tool_inputs.get("context", {})
                    if sql_rows and "rows" not in ctx:
                        ctx["rows"] = sql_rows[-1].get("rows", [])
                        ctx["columns"] = sql_rows[-1].get("columns", [])
                    output = await asyncio.wait_for(
                        self._compute_tool.run_async(code, ctx),
                        timeout=self.tool_timeout_seconds,
                    )
                    tool_output_summary = f"Computed: {str(output.get('result'))[:100]}"
                    if output.get("error"):
                        tool_error = output["error"]

                else:
                    tool_output_summary = f"Unknown tool: {tool_name}"

            except asyncio.TimeoutError:
                tool_error = f"Tool timed out after {self.tool_timeout_seconds}s"
                tool_output_summary = f"Timeout: {tool_error}"
                logger.warning(
                    "Tool timeout",
                    extra={"run_id": run_id, "tool": tool_name, "timeout_seconds": self.tool_timeout_seconds},
                )
            except Exception as exc:
                tool_error = str(exc)
                tool_output_summary = f"Error: {tool_error[:100]}"
                logger.error(
                    "Tool execution error",
                    extra={"run_id": run_id, "tool": tool_name, "error": tool_error},
                )

            tool_latency = (time.perf_counter() - t_tool_start) * 1000
            steps.append(StepLog(
                step_number=step_num,
                tool_name=tool_name,
                inputs=tool_inputs,
                output_summary=tool_output_summary,
                latency_ms=round(tool_latency, 1),
                error=tool_error,
            ))
            logger.info(
                "Tool end",
                extra={
                    "run_id": run_id,
                    "tool": tool_name,
                    "latency_ms": round(tool_latency, 1),
                    "error": tool_error,
                },
            )

        _state_timings["execute_tools_ms"] = round((time.perf_counter() - _t_execute_start) * 1000, 1)

        # ---------------------------------------------------------- EXPAND_GRAPH
        logger.info("State: EXPAND_GRAPH", extra={"run_id": run_id})
        _t_expand_start = time.perf_counter()
        if vector_hits:
            seed_ids = [f"chunk:{h['chunk_id']}" for h in vector_hits]
            try:
                graph_result = await expand_graph_async(seed_ids, k=1)
                graph_nodes = graph_result.get("nodes", [])
                graph_edges = graph_result.get("edges", [])
            except Exception as exc:
                logger.warning("Graph expansion failed", extra={"error": str(exc)})
        _state_timings["expand_graph_ms"] = round((time.perf_counter() - _t_expand_start) * 1000, 1)

        # ---------------------------------------------------------- RE_RANK
        logger.info("State: RE_RANK", extra={"run_id": run_id})
        all_evidence = vector_hits.copy()
        if graph_nodes or graph_edges:
            ranked = rank_evidence(
                vector_hits=vector_hits,
                graph_nodes=graph_nodes,
                graph_edges=graph_edges,
                top_k=8,
            )
            for item in ranked:
                if item not in all_evidence:
                    all_evidence.append(item)

        # ---------------------------------------------------------- SYNTHESISE
        logger.info("State: SYNTHESISE", extra={"run_id": run_id})
        _t_synthesise_start = time.perf_counter()
        evidence_for_synthesis = _build_evidence_context(vector_hits, sql_rows)

        # W3-005: Conversational Memory — inject prior turns into synthesis context
        # Gated by CONVERSATIONAL_MEMORY_ENABLED env var (default: true)
        import os as _os
        _memory_enabled = _os.environ.get("CONVERSATIONAL_MEMORY_ENABLED", "true").lower() != "false"
        _history_context = ""
        if _memory_enabled and conversation_history:
            # Truncate to last 5 turns; format each as "Prior turn N: Q: ... | A: ..."
            recent_turns = conversation_history[-5:]
            prior_lines = []
            for i, turn in enumerate(recent_turns, 1):
                # Support both {role/content} and {query/answer_summary} shapes
                if "query" in turn and "answer_summary" in turn:
                    q_text = turn["query"]
                    a_text = turn["answer_summary"]
                else:
                    role = turn.get("role", "")
                    content = turn.get("content", "")
                    if role == "user":
                        q_text = content
                        a_text = ""
                    else:
                        q_text = ""
                        a_text = content
                if q_text or a_text:
                    prior_lines.append(f"Prior turn {i}: Q: {q_text} | A: {a_text}")
            if prior_lines:
                _history_context = "\n\nConversation history (most recent turns):\n" + "\n".join(prior_lines) + "\n"

        synthesis_prompt = (
            f"User query: {query}\n\n"
            f"Intent: {intent}\n\n"
            f"Execution plan: {plan_text}\n\n"
            f"Evidence from search:\n{evidence_for_synthesis}"
            + _history_context
            + "\n\nSynthesise a comprehensive answer."
        )

        system_prompt = (
            _SYNTHESIS_SYSTEM_MEDICAL if domain == "medical" else _SYNTHESIS_SYSTEM_AIRCRAFT
        )
        # Haiku for simple vector/sql queries; Sonnet for hybrid/compute
        synthesis_llm = (
            self._async_llm if intent in ("hybrid", "compute") else self._async_fast_llm
        )

        async def _do_synthesis(p: str) -> SynthesisOutput:
            raw = await synthesis_llm.complete_async(
                prompt=p,
                system=system_prompt,
                json_mode=True,
                max_tokens=1024,
            )
            data = json.loads(raw)
            return SynthesisOutput.model_validate(data)

        try:
            try:
                synth = await _do_synthesis(synthesis_prompt)
            except (json.JSONDecodeError, ValidationError) as first_err:
                # T3-01: one-shot retry with error-correction prefix
                logger.warning("Synthesis validation failed — retrying", extra={"error": str(first_err)[:300]})
                retry_prompt = (
                    f"{synthesis_prompt}\n\n"
                    f"Your previous response failed validation: {first_err}. "
                    "Please return valid JSON matching the schema exactly."
                )
                synth = await _do_synthesis(retry_prompt)

            answer = synth.answer
            raw_claims = [c.model_dump() for c in synth.claims]
            assumptions = synth.assumptions
            next_steps_list = synth.next_steps
        except Exception as exc:
            logger.warning("Synthesis failed", extra={"error": str(exc)})
            answer = _fallback_answer(query, vector_hits, sql_rows)
            raw_claims = []
            assumptions = []
            next_steps_list = [
                "Try rephrasing your query with more specific terms.",
                "Ensure data has been ingested with: POST /ingest",
            ]
        _state_timings["synthesise_ms"] = round((time.perf_counter() - _t_synthesise_start) * 1000, 1)

        # Handle no-evidence case
        if not all_evidence:
            if not answer:
                answer = (
                    f"No evidence was found for the query: '{query}'. "
                    f"The following was searched: vector similarity over incident narratives"
                    + (", structured defect data" if intent in ("sql_only", "hybrid") else "")
                    + ". Consider running the ingest pipeline first."
                )
            next_steps_list = next_steps_list or [
                "Run POST /ingest to load data before querying.",
                "Try a broader query with fewer specific filters.",
            ]

        # ---------------------------------------------------------- VERIFY
        logger.info("State: VERIFY", extra={"run_id": run_id})
        _t_verify_start = time.perf_counter()
        if raw_claims:
            verified_claims = await verify_claims_async(
                raw_claims, all_evidence, self._async_fast_llm
            )
        else:
            # Early exit: skip LLM verify call when synthesis produced no claims
            verified_claims = []
        _state_timings["verify_ms"] = round((time.perf_counter() - _t_verify_start) * 1000, 1)

        # ---------------------------------------------------------- SAVE
        logger.info("State: SAVE", extra={"run_id": run_id})
        _t_save_start = time.perf_counter()
        total_latency_ms = round((time.perf_counter() - t_run_start) * 1000, 1)

        result = AgentRunResult(
            run_id=run_id,
            query=query,
            answer=answer,
            claims=verified_claims,
            evidence={
                "vector_hits": vector_hits,
                "sql_rows": sql_rows,
            },
            graph_path={
                "nodes": graph_nodes[:40],
                "edges": graph_edges[:80],
            },
            run_summary={
                "intent": intent,
                "plan_text": plan_text,
                "steps": [
                    {
                        "step_number": s.step_number,
                        "tool_name": s.tool_name,
                        "output_summary": s.output_summary,
                        "latency_ms": s.latency_ms,
                        "error": s.error,
                    }
                    for s in steps
                ],
                "tools_used": list({s.tool_name for s in steps}),
                "total_latency_ms": total_latency_ms,
                "halted_at_step_limit": halted_at_step_limit,
                "state_timings_ms": _state_timings,  # T3-02
            },
            assumptions=assumptions,
            next_steps=next_steps_list,
        )

        # Persist to agent_runs table (async session)
        # W3-005: store session_id for conversational memory / history sidebar
        # W4-006: store user_id (Supabase UUID from JWT sub claim) for per-user filtering
        try:
            import uuid as _uuid
            _session_uuid = None
            if session_id:
                try:
                    _session_uuid = _uuid.UUID(session_id)
                except (ValueError, AttributeError):
                    _session_uuid = None

            _user_uuid = None
            if user_id:
                try:
                    _user_uuid = _uuid.UUID(user_id)
                except (ValueError, AttributeError):
                    _user_uuid = None

            async with get_session() as session:
                await session.execute(
                    text(
                        "INSERT INTO agent_runs (run_id, query, result, session_id, user_id) "
                        "VALUES (:run_id, :query, :result, :session_id, :user_id)"
                    ),
                    {
                        "run_id": run_id,
                        "query": query,
                        "result": json.dumps(result.to_dict()),
                        "session_id": _session_uuid,
                        "user_id": _user_uuid,
                    },
                )
            _state_timings["save_ms"] = round((time.perf_counter() - _t_save_start) * 1000, 1)
        except Exception as exc:
            logger.warning("Failed to persist agent run", extra={"error": str(exc)})

        logger.info(
            "Agent async run complete",
            extra={
                "run_id": run_id,
                "total_latency_ms": total_latency_ms,
                "claims": len(verified_claims),
                "state_timings_ms": _state_timings,  # T3-02
            },
        )
        return result

    # ------------------------------------------------------------------
    # Private async helpers
    # ------------------------------------------------------------------

    async def _run_vector_step_async(
        self,
        step: dict[str, Any],
        query: str,
        domain: str,
        intent: str = "vector_only",
    ) -> dict[str, Any]:
        """
        Execute a VectorSearchTool step asynchronously.

        T3-03: passes search_mode="hybrid" for hybrid/compute intents,
        "vector" for vector_only/sql_only — BM25+vector RRF for keyword-heavy queries.
        """
        tool_inputs = step.get("tool_inputs", {})
        query_text = tool_inputs.get("query_text", query)
        filters = tool_inputs.get("filters", {})
        top_k = tool_inputs.get("top_k", 8)
        search_mode = "hybrid" if intent in ("hybrid", "compute") else "vector"
        return await self._vector_tool.run_async(
            query_text,
            filters=filters,
            top_k=top_k,
            domain=domain,
            similarity_threshold=0.20,
            search_mode=search_mode,
        )

    async def _run_sql_step_async(
        self,
        step: dict[str, Any],
        domain: str,
    ) -> dict[str, Any]:
        """
        Execute a SQLQueryTool step asynchronously.

        Applies the same raw-SQL safety substitution as the sync path:
        if the LLM generated a raw sql field instead of named_query, replace
        it with a safe named query to prevent hallucinated schema names reaching
        the database.
        """
        tool_inputs = step.get("tool_inputs", {})
        named = tool_inputs.get("named_query")

        if not named and tool_inputs.get("sql"):
            named = (
                "disease_counts_by_specialty"
                if domain == "medical"
                else "defect_counts_by_product"
            )
            logger.warning(
                "Raw SQL from LLM replaced with named query (async path)",
                extra={"original_sql": tool_inputs["sql"][:200], "named": named},
            )
            tool_inputs = {"named_query": named, "params": {"days": 90}}

        if named:
            params = tool_inputs.get("params", {})
            return await self._sql_tool.run_named_async(named, params)
        else:
            sql = tool_inputs.get("sql", "SELECT 1")
            return await self._sql_tool.run_async(sql)

    # ------------------------------------------------------------------
    # Sync fallback (backwards-compatibility)
    # ------------------------------------------------------------------

    def run_sync(self, query: str, domain: str = "aircraft") -> AgentRunResult:
        """
        Synchronous execution path. Preserved for backwards-compatibility.

        IMPORTANT: This method blocks the calling thread for the full agent
        duration (3-8 s). Do not call from an async context — use run() instead.
        If you must call from async code, wrap with run_in_threadpool:
            await run_in_threadpool(orchestrator.run_sync, query, domain=domain)

        Delegates to the original sequential implementation below.
        """
        return _run_sync_impl(
            query=query,
            domain=domain,
            llm=self.llm,
            fast_llm=self._fast_llm,
            vector_tool=self._vector_tool,
            sql_tool=self._sql_tool,
            compute_tool=self._compute_tool,
            max_steps=self.max_steps,
        )


# ---------------------------------------------------------------------------
# Sync implementation — used by run_sync() only
# ---------------------------------------------------------------------------

def _run_sync_impl(
    query: str,
    domain: str,
    llm: LLMClient,
    fast_llm: LLMClient,
    vector_tool: VectorSearchTool,
    sql_tool: SQLQueryTool,
    compute_tool: PythonComputeTool,
    max_steps: int,
) -> AgentRunResult:
    """
    Original sequential synchronous implementation.
    Kept intact so run_sync() can be used as a fallback without modifying callers.
    """
    from backend.app.agent.intent import classify_and_plan
    from backend.app.agent.verifier import verify_claims

    run_id = str(uuid.uuid4())
    t_run_start = time.perf_counter()

    logger.info(
        "Agent sync run started",
        extra={"run_id": run_id, "query": query[:200], "domain": domain},
    )

    steps: list[StepLog] = []
    vector_hits: list[dict[str, Any]] = []
    sql_rows: list[dict[str, Any]] = []
    graph_nodes: list[dict[str, Any]] = []
    graph_edges: list[dict[str, Any]] = []
    halted_at_step_limit = False

    # CLASSIFY + PLAN
    logger.info("State: CLASSIFY+PLAN", extra={"run_id": run_id})
    combined = classify_and_plan(query, fast_llm, domain=domain)
    intent = combined["intent"]
    plan_text = combined.get("plan_text", "")
    plan_steps = combined.get("steps", [])

    # EXECUTE_TOOLS
    for step in plan_steps:
        if len(steps) >= max_steps:
            halted_at_step_limit = True
            break

        tool_name = step.get("tool", "VectorSearchTool")
        tool_inputs = step.get("tool_inputs", {})
        step_num = step.get("step_number", len(steps) + 1)
        t_tool_start = time.perf_counter()
        tool_output_summary = ""
        tool_error = None

        try:
            if tool_name == "VectorSearchTool":
                query_text = tool_inputs.get("query_text", query)
                filters = tool_inputs.get("filters", {})
                top_k = tool_inputs.get("top_k", 8)
                output = vector_tool.run(
                    query_text,
                    filters=filters,
                    top_k=top_k,
                    domain=domain,
                    similarity_threshold=0.20,
                )
                hits = output.get("results", [])
                vector_hits.extend(hits)
                tool_output_summary = f"Found {len(hits)} similar chunks"

            elif tool_name == "SQLQueryTool":
                named = tool_inputs.get("named_query")
                if not named and tool_inputs.get("sql"):
                    named = (
                        "disease_counts_by_specialty"
                        if domain == "medical"
                        else "defect_counts_by_product"
                    )
                    tool_inputs = {"named_query": named, "params": {"days": 90}}
                if named:
                    params = tool_inputs.get("params", {})
                    output = sql_tool.run_named(named, params)
                else:
                    output = sql_tool.run(tool_inputs.get("sql", "SELECT 1"))

                if not output.get("error"):
                    row_count = output.get("row_count", 0)
                    sql_rows.append({
                        "query": named or tool_inputs.get("sql", ""),
                        "columns": output.get("columns", []),
                        "rows": output.get("rows", [])[:50],
                        "row_count": row_count,
                    })
                    tool_output_summary = f"Returned {row_count} rows"
                else:
                    tool_error = output.get("error")
                    tool_output_summary = f"SQL error: {tool_error}"

            elif tool_name == "PythonComputeTool":
                code = tool_inputs.get("code", "result = None")
                ctx = tool_inputs.get("context", {})
                if sql_rows and "rows" not in ctx:
                    ctx["rows"] = sql_rows[-1].get("rows", [])
                    ctx["columns"] = sql_rows[-1].get("columns", [])
                output = compute_tool.run(code, ctx)
                tool_output_summary = f"Computed: {str(output.get('result'))[:100]}"
                if output.get("error"):
                    tool_error = output["error"]
            else:
                tool_output_summary = f"Unknown tool: {tool_name}"

        except Exception as exc:
            tool_error = str(exc)
            tool_output_summary = f"Error: {tool_error[:100]}"

        tool_latency = (time.perf_counter() - t_tool_start) * 1000
        steps.append(StepLog(
            step_number=step_num,
            tool_name=tool_name,
            inputs=tool_inputs,
            output_summary=tool_output_summary,
            latency_ms=round(tool_latency, 1),
            error=tool_error,
        ))

    # EXPAND_GRAPH
    if vector_hits:
        seed_ids = [f"chunk:{h['chunk_id']}" for h in vector_hits]
        try:
            with get_sync_session() as session:
                graph_result = expand_graph(session, seed_ids, k=1)
            graph_nodes = graph_result.get("nodes", [])
            graph_edges = graph_result.get("edges", [])
        except Exception as exc:
            logger.warning("Graph expansion failed", extra={"error": str(exc)})

    # RE_RANK
    all_evidence = vector_hits.copy()
    if graph_nodes or graph_edges:
        ranked = rank_evidence(
            vector_hits=vector_hits,
            graph_nodes=graph_nodes,
            graph_edges=graph_edges,
            top_k=8,
        )
        for item in ranked:
            if item not in all_evidence:
                all_evidence.append(item)

    # SYNTHESISE
    evidence_for_synthesis = _build_evidence_context(vector_hits, sql_rows)
    synthesis_prompt = (
        f"User query: {query}\n\n"
        f"Intent: {intent}\n\n"
        f"Execution plan: {plan_text}\n\n"
        f"Evidence from search:\n{evidence_for_synthesis}\n\n"
        f"Synthesise a comprehensive answer."
    )
    system_prompt = (
        _SYNTHESIS_SYSTEM_MEDICAL if domain == "medical" else _SYNTHESIS_SYSTEM_AIRCRAFT
    )
    synthesis_llm = llm if intent in ("hybrid", "compute") else fast_llm

    try:
        synthesis_response = synthesis_llm.complete(
            prompt=synthesis_prompt,
            system=system_prompt,
            json_mode=True,
            max_tokens=1024,
        )
        synthesis = json.loads(synthesis_response)
        answer = synthesis.get("answer", "")
        raw_claims = synthesis.get("claims", [])
        assumptions = synthesis.get("assumptions", [])
        next_steps_list = synthesis.get("next_steps", [])
    except Exception as exc:
        logger.warning("Synthesis failed (sync)", extra={"error": str(exc)})
        answer = _fallback_answer(query, vector_hits, sql_rows)
        raw_claims = []
        assumptions = []
        next_steps_list = [
            "Try rephrasing your query with more specific terms.",
            "Ensure data has been ingested with: POST /ingest",
        ]

    if not all_evidence:
        if not answer:
            answer = (
                f"No evidence was found for the query: '{query}'. "
                f"The following was searched: vector similarity over incident narratives"
                + (", structured defect data" if intent in ("sql_only", "hybrid") else "")
                + ". Consider running the ingest pipeline first."
            )
        next_steps_list = next_steps_list or [
            "Run POST /ingest to load data before querying.",
            "Try a broader query with fewer specific filters.",
        ]

    # VERIFY
    if raw_claims:
        verified_claims = verify_claims(raw_claims, all_evidence, fast_llm)
    else:
        verified_claims = []

    # SAVE
    total_latency_ms = round((time.perf_counter() - t_run_start) * 1000, 1)

    result = AgentRunResult(
        run_id=run_id,
        query=query,
        answer=answer,
        claims=verified_claims,
        evidence={
            "vector_hits": vector_hits,
            "sql_rows": sql_rows,
        },
        graph_path={
            "nodes": graph_nodes[:40],
            "edges": graph_edges[:80],
        },
        run_summary={
            "intent": intent,
            "plan_text": plan_text,
            "steps": [
                {
                    "step_number": s.step_number,
                    "tool_name": s.tool_name,
                    "output_summary": s.output_summary,
                    "latency_ms": s.latency_ms,
                    "error": s.error,
                }
                for s in steps
            ],
            "tools_used": list({s.tool_name for s in steps}),
            "total_latency_ms": total_latency_ms,
            "halted_at_step_limit": halted_at_step_limit,
        },
        assumptions=assumptions,
        next_steps=next_steps_list,
    )

    try:
        with get_sync_session() as session:
            session.execute(
                text(
                    "INSERT INTO agent_runs (run_id, query, result) "
                    "VALUES (:run_id, :query, :result)"
                ),
                {
                    "run_id": run_id,
                    "query": query,
                    "result": json.dumps(result.to_dict()),
                },
            )
    except Exception as exc:
        logger.warning("Failed to persist agent run (sync)", extra={"error": str(exc)})

    logger.info(
        "Agent sync run complete",
        extra={
            "run_id": run_id,
            "total_latency_ms": total_latency_ms,
            "claims": len(verified_claims),
        },
    )
    return result


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

async def _check_query_cache(query: str, ttl_seconds: int = 300) -> dict[str, Any] | None:
    """
    T3-04: Check agent_runs for an exact-match query within the last ttl_seconds.

    Returns the stored result dict on a cache hit, or None on a miss.
    Case-insensitive match. The domain is not stored as a separate column so
    the query is used as the cache key (domain variations are naturally different
    query strings in practice).
    """
    try:
        async with get_session() as session:
            result = await session.execute(
                text(
                    "SELECT result FROM agent_runs "
                    "WHERE LOWER(query) = LOWER(:query) "
                    "AND created_at > NOW() - INTERVAL '5 minutes' "
                    "ORDER BY created_at DESC LIMIT 1"
                ),
                {"query": query},
            )
            row = result.fetchone()
        if row is None:
            return None
        result_data = row.result
        if isinstance(result_data, str):
            result_data = json.loads(result_data)
        # BUG-PROD-006: skip degraded cached responses (empty claims list means
        # the entry was stored during a DB outage / fallback path).  Treat as a
        # cache miss so the next request runs a fresh pipeline.
        if result_data.get("claims") == []:
            logger.info("Query cache skip — cached entry has empty claims (degraded response)")
            return None
        return result_data
    except Exception as exc:
        # Cache miss on any DB error — don't block the request
        logger.warning("Query cache check failed", extra={"error": str(exc)})
        return None


def _build_evidence_context(
    vector_hits: list[dict[str, Any]],
    sql_rows: list[dict[str, Any]],
) -> str:
    """Build a concise evidence summary string for the synthesis prompt."""
    parts = []

    if vector_hits:
        parts.append("=== Similar Incident Chunks ===")
        for i, hit in enumerate(vector_hits[:5]):
            parts.append(
                f"[{i+1}] Score: {hit.get('score', 0):.3f} | "
                f"Incident: {hit.get('incident_id', 'N/A')}\n"
                f"{hit.get('excerpt', '')[:180]}"
            )

    if sql_rows:
        parts.append("\n=== SQL Query Results ===")
        for result in sql_rows:
            parts.append(f"Query: {result.get('query', 'N/A')}")
            cols = result.get("columns", [])
            rows = result.get("rows", [])[:10]
            if cols and rows:
                parts.append(" | ".join(cols))
                for row in rows:
                    parts.append(" | ".join(str(v) for v in row))

    return "\n".join(parts) if parts else "No evidence retrieved."


def _fallback_answer(
    query: str,
    vector_hits: list[dict[str, Any]],
    sql_rows: list[dict[str, Any]],
) -> str:
    """Generate a minimal answer when LLM synthesis fails."""
    if vector_hits:
        top = vector_hits[0]
        return (
            f"Found {len(vector_hits)} similar incident(s). "
            f"Top match (similarity: {top.get('score', 0):.2f}): {top.get('excerpt', '')[:200]}"
        )
    if sql_rows:
        return f"SQL query returned {sql_rows[0].get('row_count', 0)} rows."
    return f"Unable to answer query: '{query}'. Please ensure data has been ingested."
