"""
AgentOrchestrator — the top-level agentic state machine.

State transitions:
  CLASSIFY → PLAN → EXECUTE_TOOLS → EXPAND_GRAPH → RE_RANK →
  SYNTHESISE → VERIFY → SAVE → DONE

Max 10 tool steps enforced. Each step logged with tool name, inputs, latency.
Final output conforms to the full AgentRunResult schema from PRD F4.
"""
from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import text

from backend.app.agent.intent import classify_intent
from backend.app.agent.planner import generate_plan
from backend.app.agent.verifier import verify_claims
from backend.app.db.session import get_sync_session
from backend.app.graph.expander import expand_graph
from backend.app.graph.scorer import rank_evidence
from backend.app.llm.client import LLMClient, get_llm_client
from backend.app.observability.logging import get_logger
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
Synthesise a clear, concise answer from the provided evidence.
Every factual claim must be directly grounded in the evidence.
Do not speculate beyond what the evidence shows.
Frame recommendations as engineering hypotheses requiring qualified review — not definitive instructions.

If the evidence is insufficient, state clearly what was searched and what could not be found.

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
Synthesise a clear, concise answer from the provided clinical evidence.
Every factual claim must be directly grounded in the case data.
Do not speculate beyond what the evidence shows.

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

    Usage:
        orchestrator = AgentOrchestrator()
        result = orchestrator.run("Find incidents similar to hydraulic actuator crack")
    """

    def __init__(
        self,
        llm: LLMClient | None = None,
        max_steps: int = MAX_STEPS,
        tool_timeout_seconds: int = TOOL_TIMEOUT_SECONDS,
    ) -> None:
        self.llm = llm or get_llm_client()
        self.max_steps = max_steps
        self.tool_timeout_seconds = tool_timeout_seconds

        self._vector_tool = VectorSearchTool(timeout_seconds=tool_timeout_seconds)
        self._sql_tool = SQLQueryTool()
        self._compute_tool = PythonComputeTool()

    def run(self, query: str, domain: str = "aircraft") -> AgentRunResult:
        """
        Execute the full agentic loop for a user query.

        Args:
            query: Natural language question from the user.

        Returns:
            AgentRunResult with full structured output.
        """
        run_id = str(uuid.uuid4())
        t_run_start = time.perf_counter()

        logger.info("Agent run started", extra={"run_id": run_id, "query": query[:200], "domain": domain})

        steps: list[StepLog] = []
        vector_hits: list[dict[str, Any]] = []
        sql_rows: list[dict[str, Any]] = []
        graph_nodes: list[dict[str, Any]] = []
        graph_edges: list[dict[str, Any]] = []
        halted_at_step_limit = False

        # ------------------------------------------------------------------ CLASSIFY
        logger.info("State: CLASSIFY", extra={"run_id": run_id})
        intent = classify_intent(query, self.llm)

        # ------------------------------------------------------------------ PLAN
        logger.info("State: PLAN", extra={"run_id": run_id, "intent": intent})
        plan = generate_plan(query, intent, self.llm)
        plan_steps = plan.get("steps", [])
        plan_text = plan.get("plan_text", "")

        # ------------------------------------------------------------------ EXECUTE_TOOLS
        logger.info("State: EXECUTE_TOOLS", extra={"run_id": run_id, "steps": len(plan_steps)})

        for step in plan_steps:
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
                    query_text = tool_inputs.get("query_text", query)
                    filters = tool_inputs.get("filters", {})
                    top_k = tool_inputs.get("top_k", 8)
                    output = self._vector_tool.run(query_text, filters=filters, top_k=top_k, domain=domain)
                    hits = output.get("results", [])
                    vector_hits.extend(hits)
                    tool_output_summary = f"Found {len(hits)} similar chunks"

                elif tool_name == "SQLQueryTool":
                    named = tool_inputs.get("named_query")
                    if named:
                        params = tool_inputs.get("params", {})
                        output = self._sql_tool.run_named(named, params)
                    else:
                        sql = tool_inputs.get("sql", "SELECT 1")
                        output = self._sql_tool.run(sql)

                    if not output.get("error"):
                        row_count = output.get("row_count", 0)
                        sql_rows.append({
                            "query": named or tool_inputs.get("sql", ""),
                            "columns": output.get("columns", []),
                            "rows": output.get("rows", [])[:50],  # Limit for JSON size
                            "row_count": row_count,
                        })
                        tool_output_summary = f"Returned {row_count} rows"
                    else:
                        tool_error = output.get("error")
                        tool_output_summary = f"SQL error: {tool_error}"

                elif tool_name == "PythonComputeTool":
                    code = tool_inputs.get("code", "result = None")
                    ctx = tool_inputs.get("context", {})
                    # Inject latest SQL rows as context
                    if sql_rows and "rows" not in ctx:
                        ctx["rows"] = sql_rows[-1].get("rows", [])
                        ctx["columns"] = sql_rows[-1].get("columns", [])
                    output = self._compute_tool.run(code, ctx)
                    tool_output_summary = f"Computed: {str(output.get('result'))[:100]}"
                    if output.get("error"):
                        tool_error = output["error"]

                else:
                    tool_output_summary = f"Unknown tool: {tool_name}"

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

        # ------------------------------------------------------------------ EXPAND_GRAPH
        logger.info("State: EXPAND_GRAPH", extra={"run_id": run_id})
        if vector_hits:
            seed_ids = [f"chunk:{h['chunk_id']}" for h in vector_hits]
            try:
                with get_sync_session() as session:
                    graph_result = expand_graph(session, seed_ids, k=2)
                graph_nodes = graph_result.get("nodes", [])
                graph_edges = graph_result.get("edges", [])
            except Exception as exc:
                logger.warning("Graph expansion failed", extra={"error": str(exc)})

        # ------------------------------------------------------------------ RE_RANK
        logger.info("State: RE_RANK", extra={"run_id": run_id})
        all_evidence = vector_hits.copy()
        if graph_nodes or graph_edges:
            ranked = rank_evidence(
                vector_hits=vector_hits,
                graph_nodes=graph_nodes,
                graph_edges=graph_edges,
                top_k=8,
            )
            # Merge ranked graph evidence into evidence list
            for item in ranked:
                if item not in all_evidence:
                    all_evidence.append(item)

        # ------------------------------------------------------------------ SYNTHESISE
        logger.info("State: SYNTHESISE", extra={"run_id": run_id})
        evidence_for_synthesis = _build_evidence_context(vector_hits, sql_rows)

        synthesis_prompt = (
            f"User query: {query}\n\n"
            f"Intent: {intent}\n\n"
            f"Execution plan: {plan_text}\n\n"
            f"Evidence from search:\n{evidence_for_synthesis}\n\n"
            f"Synthesise a comprehensive answer."
        )

        system_prompt = _SYNTHESIS_SYSTEM_MEDICAL if domain == "medical" else _SYNTHESIS_SYSTEM_AIRCRAFT

        try:
            synthesis_response = self.llm.complete(
                prompt=synthesis_prompt,
                system=system_prompt,
                json_mode=True,
                max_tokens=2048,
            )
            synthesis = json.loads(synthesis_response)
            answer = synthesis.get("answer", "")
            raw_claims = synthesis.get("claims", [])
            assumptions = synthesis.get("assumptions", [])
            next_steps_list = synthesis.get("next_steps", [])
        except Exception as exc:
            logger.warning("Synthesis failed", extra={"error": str(exc)})
            answer = _fallback_answer(query, vector_hits, sql_rows)
            raw_claims = []
            assumptions = []
            next_steps_list = [
                "Try rephrasing your query with more specific terms.",
                "Ensure data has been ingested with: POST /ingest",
            ]

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

        # ------------------------------------------------------------------ VERIFY
        logger.info("State: VERIFY", extra={"run_id": run_id})
        verified_claims = verify_claims(raw_claims, all_evidence, self.llm)

        # ------------------------------------------------------------------ SAVE
        logger.info("State: SAVE", extra={"run_id": run_id})
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
                "nodes": graph_nodes[:100],  # Limit for response size
                "edges": graph_edges[:200],
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

        # Persist to agent_runs table
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
            logger.warning("Failed to persist agent run", extra={"error": str(exc)})

        logger.info(
            "Agent run complete",
            extra={
                "run_id": run_id,
                "total_latency_ms": total_latency_ms,
                "claims": len(verified_claims),
            },
        )
        return result


def _build_evidence_context(
    vector_hits: list[dict[str, Any]],
    sql_rows: list[dict[str, Any]],
) -> str:
    """Build a concise evidence summary string for the synthesis prompt."""
    parts = []

    if vector_hits:
        parts.append("=== Similar Incident Chunks ===")
        for i, hit in enumerate(vector_hits[:8]):
            parts.append(
                f"[{i+1}] Score: {hit.get('score', 0):.3f} | "
                f"Incident: {hit.get('incident_id', 'N/A')}\n"
                f"{hit.get('excerpt', '')[:300]}"
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
