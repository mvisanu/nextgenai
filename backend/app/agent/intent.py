"""
Intent classifier — routes natural language queries to the appropriate tool strategy.
Uses Claude in JSON mode to classify into one of four intents.

Also exposes classify_and_plan() which combines classification and plan generation
into a single Haiku API call, saving one full LLM round-trip (~400-600ms) per
non-vector_only query.

T-17: classify_and_plan_async() is the async variant used by the async orchestrator.
"""
from __future__ import annotations

import json
from typing import Any

from pydantic import ValidationError

from backend.app.llm.client import LLMClient
from backend.app.observability.logging import get_logger
from backend.app.schemas.llm_outputs import ClassifyPlanOutput

logger = get_logger(__name__)

VALID_INTENTS = frozenset(["vector_only", "sql_only", "hybrid", "compute"])

_SYSTEM_PROMPT_AIRCRAFT = """\
You are an intent classifier for a manufacturing intelligence system.
Classify the user's query into exactly one of these routing intents:

- vector_only   : Query asks to FIND, SEARCH, or RETRIEVE similar incidents/narratives by semantic content.
                  Examples: "find incidents similar to...", "what happened with hydraulic actuators", "retrieve past cases"
- sql_only      : Query asks for COUNTS, TRENDS, AGGREGATIONS, or STATISTICS on structured data.
                  Examples: "show defect counts by product", "trend of maintenance events", "how many defects", "rate by severity", "defect distribution", "maintenance statistics"
- hybrid        : Query requires BOTH semantic search AND SQL/statistical analysis.
                  Examples: "classify defect and recommend action", "find similar AND show statistics", "root cause with trend", "incidents and their defect counts"
- compute       : Query asks for CALCULATION or COMPUTATION on provided data.
                  Examples: "calculate the average", "compute the ratio", "given these numbers..."

Respond with JSON only: {"intent": "<one of the four intents>"}
"""

_SYSTEM_PROMPT_MEDICAL = """\
You are an intent classifier for a clinical intelligence system.
Classify the user's query into exactly one of these routing intents:

- vector_only   : Query asks to FIND, SEARCH, or RETRIEVE similar clinical cases/narratives by semantic content.
                  Examples: "find cases similar to...", "what cases involve chest pain", "retrieve past dermatology cases", "search for melanoma presentations"
- sql_only      : Query asks for COUNTS, TRENDS, AGGREGATIONS, or STATISTICS on structured clinical data.
                  Examples: "show disease counts by specialty", "how many cardiology cases", "disease distribution", "severity breakdown", "symptom prevalence", "outcome statistics", "case trends by system"
- hybrid        : Query requires BOTH semantic search AND SQL/statistical analysis.
                  Examples: "find similar cases and show statistics", "diagnose and show disease trends", "case narrative with outcome data", "search cases and count by specialty"
- compute       : Query asks for CALCULATION or COMPUTATION on provided data.
                  Examples: "calculate the average age", "compute the mortality rate", "given these numbers..."

Respond with JSON only: {"intent": "<one of the four intents>"}
"""


def classify_intent(query: str, llm: LLMClient, domain: str = "aircraft") -> str:
    """
    Classify a natural language query into one of four routing intents.

    Args:
        query:  User's natural language question.
        llm:    LLMClient instance (ClaudeClient or compatible).
        domain: "aircraft" or "medical" — selects domain-appropriate examples.

    Returns:
        One of: 'vector_only', 'sql_only', 'hybrid', 'compute'.
        Falls back to 'hybrid' if classification fails.
    """
    logger.info("Classifying intent", extra={"query_chars": len(query), "domain": domain})

    system_prompt = _SYSTEM_PROMPT_MEDICAL if domain == "medical" else _SYSTEM_PROMPT_AIRCRAFT
    prompt = f"Query: {query}\n\nClassify this query's intent."

    try:
        response = llm.complete(
            prompt=prompt,
            system=system_prompt,
            json_mode=True,
            max_tokens=64,
        )
        data = json.loads(response)
        intent = data.get("intent", "hybrid").strip().lower()

        if intent not in VALID_INTENTS:
            logger.warning(
                "LLM returned invalid intent — defaulting to hybrid",
                extra={"raw_intent": intent},
            )
            return "hybrid"

        logger.info("Intent classified", extra={"intent": intent})
        return intent

    except (json.JSONDecodeError, KeyError, Exception) as exc:
        logger.warning(
            "Intent classification failed — defaulting to hybrid",
            extra={"error": str(exc)},
        )
        return "hybrid"


# ── Combined classify + plan system prompts ─────────────────────────────────
# These prompts ask Haiku to return BOTH the intent classification AND the full
# execution plan in a single JSON response. This eliminates one Haiku API
# round-trip (~400-600ms) compared to calling classify_intent + generate_plan
# sequentially. Falls back to separate calls if the combined call fails.

_COMBINED_SYSTEM_AIRCRAFT = """\
You are a planning agent for a manufacturing intelligence system.
Given a user query, do TWO things in a single JSON response:
1. Classify the intent into one of: vector_only, sql_only, hybrid, compute
2. Generate a numbered tool execution plan appropriate for that intent

Intent definitions:
- vector_only : FIND, SEARCH, RETRIEVE incidents/narratives by semantic content
- sql_only    : COUNTS, TRENDS, AGGREGATIONS, STATISTICS on structured data
- hybrid      : BOTH semantic search AND SQL/statistical analysis
- compute     : CALCULATION or COMPUTATION on provided data

Available tools:
- VectorSearchTool: semantic similarity search over incident narratives
  inputs: {"query_text": "...", "filters": {}, "top_k": 8}
- SQLQueryTool: read-only SQL queries for structured data (use named_query ONLY)
  Named queries: defect_counts_by_product (params: {"days": 90}),
                 severity_distribution, maintenance_trends, incidents_defects_join
  inputs: {"named_query": "<name>", "params": {"days": 90}}
- PythonComputeTool: sandboxed Python for arithmetic/statistics
  inputs: {"code": "result = ...", "context": {}}

Routing rules:
- vector_only → one VectorSearchTool step
- sql_only    → one or two SQLQueryTool steps using named_query
- hybrid      → at least one VectorSearchTool + one SQLQueryTool
- compute     → SQLQueryTool to get data, then PythonComputeTool

Return JSON ONLY:
{
  "intent": "<vector_only|sql_only|hybrid|compute>",
  "plan_text": "Natural language description of the plan for the user...",
  "steps": [
    {
      "step_number": 1,
      "description": "What this step does",
      "tool": "VectorSearchTool|SQLQueryTool|PythonComputeTool",
      "tool_inputs": {}
    }
  ]
}
"""

_COMBINED_SYSTEM_MEDICAL = """\
You are a planning agent for a clinical intelligence system.
Given a user query, do TWO things in a single JSON response:
1. Classify the intent into one of: vector_only, sql_only, hybrid, compute
2. Generate a numbered tool execution plan appropriate for that intent

Intent definitions:
- vector_only : FIND, SEARCH, RETRIEVE clinical cases/narratives by semantic content
- sql_only    : COUNTS, TRENDS, AGGREGATIONS, STATISTICS on structured clinical data
- hybrid      : BOTH semantic search AND SQL/statistical analysis
- compute     : CALCULATION or COMPUTATION on provided data

Available tools:
- VectorSearchTool: semantic similarity search over clinical case narratives
  inputs: {"query_text": "...", "filters": {}, "top_k": 8}
  IMPORTANT: query_text must use standard clinical/medical terminology only.
- SQLQueryTool: read-only SQL queries for structured clinical data (use named_query ONLY)
  Named queries: disease_counts_by_specialty (params: {"days": 90}),
                 disease_severity_distribution, disease_symptom_profile, medical_system_summary
  inputs: {"named_query": "<name>", "params": {"days": 90}}
- PythonComputeTool: sandboxed Python for arithmetic/statistics
  inputs: {"code": "result = ...", "context": {}}

Routing rules:
- vector_only → one VectorSearchTool step
- sql_only    → one or two SQLQueryTool steps using named_query
- hybrid      → at least one VectorSearchTool + one SQLQueryTool
- compute     → SQLQueryTool to get data, then PythonComputeTool

Return JSON ONLY:
{
  "intent": "<vector_only|sql_only|hybrid|compute>",
  "plan_text": "Natural language description of the plan for the user...",
  "steps": [
    {
      "step_number": 1,
      "description": "What this step does",
      "tool": "VectorSearchTool|SQLQueryTool|PythonComputeTool",
      "tool_inputs": {}
    }
  ]
}
"""


def classify_and_plan(
    query: str,
    llm: LLMClient,
    domain: str = "aircraft",
) -> dict[str, Any]:
    """
    Classify intent AND generate a tool execution plan in a single Haiku API call.

    This eliminates one full LLM round-trip (~400-600ms) compared to calling
    classify_intent() + generate_plan() sequentially. The combined prompt asks
    Haiku to return {"intent": ..., "plan_text": ..., "steps": [...]} in one shot.

    Falls back to separate classify + plan calls if the combined call fails, so
    the orchestrator always gets a valid result.

    Args:
        query:  User's natural language question.
        llm:    LLMClient instance (ClaudeClient or compatible). Should be Haiku.
        domain: "aircraft" or "medical" — selects domain-appropriate prompts.

    Returns:
        {
          "intent":    str — one of the four valid intents,
          "plan_text": str — user-visible plan description,
          "steps":     list of step dicts
        }
    """
    logger.info(
        "classify_and_plan: single combined LLM call",
        extra={"query_chars": len(query), "domain": domain},
    )

    system_prompt = _COMBINED_SYSTEM_MEDICAL if domain == "medical" else _COMBINED_SYSTEM_AIRCRAFT
    prompt = f"Query: {query}\n\nClassify the intent and generate the execution plan."

    def _do_call(p: str) -> ClassifyPlanOutput:
        """Make one LLM call and validate the result with Pydantic."""
        raw = llm.complete(
            prompt=p,
            system=system_prompt,
            json_mode=True,
            max_tokens=1024,
        )
        data = json.loads(raw)
        return ClassifyPlanOutput.model_validate(data)

    try:
        try:
            validated = _do_call(prompt)
        except (json.JSONDecodeError, ValidationError) as first_err:
            # T3-01: one-shot retry with error-correction prefix
            logger.warning(
                "classify_and_plan: validation failed on first attempt — retrying",
                extra={"error": str(first_err)[:300]},
            )
            retry_prompt = (
                f"{prompt}\n\n"
                f"Your previous response failed validation: {first_err}. "
                "Please return valid JSON matching the schema exactly."
            )
            validated = _do_call(retry_prompt)

        # Ensure step_number is sequential
        steps = [s.model_dump() for s in validated.steps]
        for i, step in enumerate(steps):
            step["step_number"] = i + 1

        logger.info(
            "classify_and_plan: success",
            extra={"intent": validated.intent, "step_count": len(steps)},
        )
        return {"intent": validated.intent, "plan_text": validated.plan_text, "steps": steps}

    except Exception as exc:
        # Both attempts failed — fall back to separate calls to guarantee correctness.
        logger.warning(
            "classify_and_plan: combined call failed — falling back to separate calls",
            extra={"error": str(exc)},
        )
        from backend.app.agent.planner import generate_plan

        intent = classify_intent(query, llm, domain=domain)
        plan = generate_plan(query, intent, llm, domain=domain)
        return {
            "intent": intent,
            "plan_text": plan.get("plan_text", ""),
            "steps": plan.get("steps", []),
        }


async def classify_and_plan_async(
    query: str,
    llm: LLMClient,
    domain: str = "aircraft",
) -> dict[str, Any]:
    """
    Async variant of classify_and_plan().

    Calls complete_async() so the event loop is not blocked during the
    Haiku API round-trip. Semantics are identical to the sync version:
    a single combined Haiku call returning {"intent", "plan_text", "steps"}.

    Falls back to the sync classify_and_plan() on any failure so the
    orchestrator always gets a valid result.

    Args:
        query:  User's natural language question.
        llm:    LLMClient instance with complete_async() (ClaudeClient).
        domain: "aircraft" or "medical".

    Returns:
        {"intent": str, "plan_text": str, "steps": list}
    """
    logger.info(
        "classify_and_plan_async: single combined async LLM call",
        extra={"query_chars": len(query), "domain": domain},
    )

    system_prompt = _COMBINED_SYSTEM_MEDICAL if domain == "medical" else _COMBINED_SYSTEM_AIRCRAFT
    prompt = f"Query: {query}\n\nClassify the intent and generate the execution plan."

    async def _do_call_async(p: str) -> ClassifyPlanOutput:
        """Make one async LLM call and validate the result with Pydantic."""
        raw = await llm.complete_async(
            prompt=p,
            system=system_prompt,
            json_mode=True,
            max_tokens=1024,
        )
        data = json.loads(raw)
        return ClassifyPlanOutput.model_validate(data)

    try:
        try:
            validated = await _do_call_async(prompt)
        except (json.JSONDecodeError, ValidationError) as first_err:
            # T3-01: one-shot retry with error-correction prefix
            logger.warning(
                "classify_and_plan_async: validation failed — retrying",
                extra={"error": str(first_err)[:300]},
            )
            retry_prompt = (
                f"{prompt}\n\n"
                f"Your previous response failed validation: {first_err}. "
                "Please return valid JSON matching the schema exactly."
            )
            validated = await _do_call_async(retry_prompt)

        steps = [s.model_dump() for s in validated.steps]
        for i, step in enumerate(steps):
            step["step_number"] = i + 1

        logger.info(
            "classify_and_plan_async: success",
            extra={"intent": validated.intent, "step_count": len(steps)},
        )
        return {"intent": validated.intent, "plan_text": validated.plan_text, "steps": steps}

    except Exception as exc:
        logger.warning(
            "classify_and_plan_async: failed — falling back to sync classify_and_plan",
            extra={"error": str(exc)},
        )
        return classify_and_plan(query, llm, domain=domain)
