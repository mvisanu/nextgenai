"""
Agent planner — generates a numbered step-by-step tool execution plan.
Plan is returned to the user before any tool is executed.
"""
from __future__ import annotations

import json
from typing import Any

from backend.app.llm.client import LLMClient
from backend.app.observability.logging import get_logger

logger = get_logger(__name__)

_SYSTEM_PROMPT_AIRCRAFT = """\
You are a planning agent for a manufacturing intelligence system.
Given a user query and a routing intent, generate a numbered step-by-step plan.

Available tools:
- VectorSearchTool: semantic similarity search over incident narratives
  inputs: {"query_text": "...", "filters": {}, "top_k": 8}
- SQLQueryTool: read-only SQL queries for structured data
  IMPORTANT: Always use named_query instead of raw sql to avoid schema errors.
  Available named queries (use EXACTLY these names):
    - defect_counts_by_product   — defect counts by product & type (params: {"days": 90})
    - severity_distribution      — severity level distribution across all defects
    - maintenance_trends         — maintenance event counts by month
    - incidents_defects_join     — join incident reports with manufacturing defects
  inputs: {"named_query": "<name>", "params": {"days": 90}}
- PythonComputeTool: sandboxed Python for arithmetic/statistics
  inputs: {"code": "result = ...", "context": {}}

Intent routing rules:
- vector_only → one VectorSearchTool step
- sql_only → one or two SQLQueryTool steps using named_query
- hybrid → at least one VectorSearchTool + one SQLQueryTool
- compute → SQLQueryTool to get data, then PythonComputeTool

Return JSON ONLY with this exact structure:
{
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

_SYSTEM_PROMPT_MEDICAL = """\
You are a planning agent for a clinical intelligence system.
Given a user query and a routing intent, generate a numbered step-by-step plan.

Available tools:
- VectorSearchTool: semantic similarity search over clinical case narratives
  inputs: {"query_text": "...", "filters": {}, "top_k": 8}
  IMPORTANT: The query_text MUST use standard clinical/medical terminology only.
  Strip any non-medical jargon, patient IDs, or manufacturing language.
  Rephrase into the key clinical findings: symptoms, signs, body system, and suspected diagnosis.
  Example: "corrosion-pattern skin lesion irregular border dermatology screening" → "pigmented skin lesion with irregular border referred for dermatology evaluation suspected melanoma"
- SQLQueryTool: read-only SQL queries for structured clinical data
  IMPORTANT: Always use named_query instead of raw sql to avoid schema errors.
  Available named queries (use EXACTLY these names):
    - disease_counts_by_specialty    — disease counts grouped by specialty & disease name (params: {"days": 90})
    - disease_severity_distribution  — severity/outcome distribution across disease records
    - disease_symptom_profile        — symptom prevalence (fever, cough, fatigue, dyspnea) per disease
    - medical_system_summary         — case counts by body system with severity breakdown
  inputs: {"named_query": "<name>", "params": {"days": 90}}
- PythonComputeTool: sandboxed Python for arithmetic/statistics
  inputs: {"code": "result = ...", "context": {}}

Intent routing rules:
- vector_only → one VectorSearchTool step
- sql_only → one or two SQLQueryTool steps using named_query
- hybrid → at least one VectorSearchTool + one SQLQueryTool
- compute → SQLQueryTool to get data, then PythonComputeTool

Return JSON ONLY with this exact structure:
{
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


def generate_plan(
    query: str,
    intent: str,
    llm: LLMClient,
    domain: str = "aircraft",
) -> dict[str, Any]:
    """
    Generate a numbered tool execution plan.

    Args:
        query:  User's natural language question.
        intent: Classified intent (vector_only, sql_only, hybrid, compute).
        llm:    LLMClient instance.
        domain: "aircraft" or "medical" — selects the correct named queries.

    Returns:
        {
          "plan_text":  str — user-visible description,
          "steps":      list of step dicts (step_number, description, tool, tool_inputs)
        }
    """
    logger.info("Generating plan", extra={"intent": intent, "domain": domain})

    system_prompt = _SYSTEM_PROMPT_MEDICAL if domain == "medical" else _SYSTEM_PROMPT_AIRCRAFT
    prompt = f"Query: {query}\nIntent: {intent}\n\nGenerate the execution plan."

    try:
        response = llm.complete(
            prompt=prompt,
            system=system_prompt,
            json_mode=True,
            max_tokens=1024,
        )
        plan = json.loads(response)

        # Validate structure
        if "steps" not in plan or not isinstance(plan["steps"], list):
            raise ValueError("LLM plan missing 'steps' list")

        # Ensure step_number is sequential
        for i, step in enumerate(plan["steps"]):
            step["step_number"] = i + 1

        logger.info("Plan generated", extra={"step_count": len(plan["steps"])})
        return plan

    except Exception as exc:
        logger.warning("Plan generation failed — using fallback plan", extra={"error": str(exc)})
        return _fallback_plan(query, intent, domain)


def _fallback_plan(query: str, intent: str, domain: str = "aircraft") -> dict[str, Any]:
    """Generate a safe fallback plan when the LLM fails."""
    steps: list[dict[str, Any]] = []

    if intent in ("vector_only", "hybrid"):
        steps.append({
            "step_number": 1,
            "description": "Search for similar incidents using vector similarity",
            "tool": "VectorSearchTool",
            "tool_inputs": {"query_text": query, "top_k": 8},
        })

    if intent in ("sql_only", "hybrid"):
        n = len(steps) + 1
        if domain == "medical":
            steps.append({
                "step_number": n,
                "description": "Query structured clinical data for disease counts by specialty",
                "tool": "SQLQueryTool",
                "tool_inputs": {"named_query": "disease_counts_by_specialty", "params": {"days": 90}},
            })
        else:
            steps.append({
                "step_number": n,
                "description": "Query structured defect data for trends and counts",
                "tool": "SQLQueryTool",
                "tool_inputs": {"named_query": "defect_counts_by_product", "params": {"days": 90}},
            })

    if intent == "compute":
        named = "disease_severity_distribution" if domain == "medical" else "severity_distribution"
        steps.append({
            "step_number": 1,
            "description": "Retrieve data for computation",
            "tool": "SQLQueryTool",
            "tool_inputs": {"named_query": named},
        })
        steps.append({
            "step_number": 2,
            "description": "Compute statistics on retrieved data",
            "tool": "PythonComputeTool",
            "tool_inputs": {"code": "result = rows", "context": {}},
        })

    if not steps:
        steps.append({
            "step_number": 1,
            "description": "Search for relevant information",
            "tool": "VectorSearchTool",
            "tool_inputs": {"query_text": query, "top_k": 8},
        })

    plan_descriptions = {
        "vector_only": "I will search for incidents similar to your query using semantic similarity.",
        "sql_only": "I will query the structured database to retrieve trends and statistics.",
        "hybrid": "I will search for similar incidents and also query structured data, then combine the results.",
        "compute": "I will retrieve relevant data and then compute the requested statistics.",
    }

    return {
        "plan_text": plan_descriptions.get(intent, "I will search for relevant information."),
        "steps": steps,
    }
