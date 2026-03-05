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

_SYSTEM_PROMPT = """\
You are a planning agent for a manufacturing intelligence system.
Given a user query and a routing intent, generate a numbered step-by-step plan.

Available tools:
- VectorSearchTool: semantic similarity search over incident narratives
  inputs: {"query_text": "...", "filters": {}, "top_k": 8}
- SQLQueryTool: read-only SQL queries for structured data
  inputs: {"sql": "SELECT ...", "named_query": "defect_counts_by_product|severity_distribution|maintenance_trends|incidents_defects_join", "params": {}}
- PythonComputeTool: sandboxed Python for arithmetic/statistics
  inputs: {"code": "result = ...", "context": {}}

Intent routing rules:
- vector_only → one VectorSearchTool step
- sql_only → one or two SQLQueryTool steps
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
) -> dict[str, Any]:
    """
    Generate a numbered tool execution plan.

    Args:
        query:  User's natural language question.
        intent: Classified intent (vector_only, sql_only, hybrid, compute).
        llm:    LLMClient instance.

    Returns:
        {
          "plan_text":  str — user-visible description,
          "steps":      list of step dicts (step_number, description, tool, tool_inputs)
        }
    """
    logger.info("Generating plan", extra={"intent": intent})

    prompt = f"Query: {query}\nIntent: {intent}\n\nGenerate the execution plan."

    try:
        response = llm.complete(
            prompt=prompt,
            system=_SYSTEM_PROMPT,
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
        return _fallback_plan(query, intent)


def _fallback_plan(query: str, intent: str) -> dict[str, Any]:
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
        steps.append({
            "step_number": n,
            "description": "Query structured defect data for trends and counts",
            "tool": "SQLQueryTool",
            "tool_inputs": {"named_query": "defect_counts_by_product", "params": {"days": 90}},
        })

    if intent == "compute":
        steps.append({
            "step_number": 1,
            "description": "Retrieve data for computation",
            "tool": "SQLQueryTool",
            "tool_inputs": {"named_query": "severity_distribution"},
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
