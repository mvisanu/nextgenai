"""
Intent classifier — routes natural language queries to the appropriate tool strategy.
Uses Claude in JSON mode to classify into one of four intents.
"""
from __future__ import annotations

import json

from backend.app.llm.client import LLMClient
from backend.app.observability.logging import get_logger

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
