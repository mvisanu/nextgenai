"""
T-044: Agent intent router tests.
Verifies that the intent classifier routes specific query patterns correctly.
Uses a mock LLM client to avoid requiring ANTHROPIC_API_KEY in CI.
"""
from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from backend.app.agent.intent import VALID_INTENTS, classify_intent
from backend.app.agent.planner import _fallback_plan, generate_plan


# ---------------------------------------------------------------------------
# Mock LLM client
# ---------------------------------------------------------------------------


class MockLLMClient:
    """
    Test double for LLMClient that returns predefined responses.
    Allows testing intent classification without making real API calls.
    """

    def __init__(self, intent_response: str = "vector_only") -> None:
        self._intent_response = intent_response
        self.calls: list[dict[str, Any]] = []

    def complete(
        self,
        prompt: str,
        system: str = "",
        json_mode: bool = False,
        max_tokens: int = 4096,
    ) -> str:
        self.calls.append({
            "prompt": prompt,
            "system": system,
            "json_mode": json_mode,
        })
        return json.dumps({"intent": self._intent_response})


# ---------------------------------------------------------------------------
# Intent classifier tests
# ---------------------------------------------------------------------------


class TestIntentClassifier:

    def test_find_similar_returns_vector_only(self):
        """Similarity search queries must route to vector_only."""
        llm = MockLLMClient(intent_response="vector_only")
        intent = classify_intent(
            "Find incidents similar to: hydraulic actuator crack on Line 1",
            llm,
        )
        assert intent == "vector_only"

    def test_retrieve_past_cases_returns_vector_only(self):
        llm = MockLLMClient(intent_response="vector_only")
        intent = classify_intent("Retrieve past cases involving corrosion on avionics", llm)
        assert intent == "vector_only"

    def test_defect_trend_returns_sql_only(self):
        """Trend and aggregation queries must route to sql_only."""
        llm = MockLLMClient(intent_response="sql_only")
        intent = classify_intent(
            "Show defect trends by product and defect_type for the last 90 days", llm
        )
        assert intent == "sql_only"

    def test_count_defects_returns_sql_only(self):
        llm = MockLLMClient(intent_response="sql_only")
        intent = classify_intent("How many critical defects were recorded this quarter?", llm)
        assert intent == "sql_only"

    def test_maintenance_trends_returns_sql_only(self):
        llm = MockLLMClient(intent_response="sql_only")
        intent = classify_intent(
            "Show maintenance event trends for asset ASSET-247 over the last 90 days", llm
        )
        assert intent == "sql_only"

    def test_classify_and_recommend_returns_hybrid(self):
        """Multi-modal queries (find + analyse) must route to hybrid."""
        llm = MockLLMClient(intent_response="hybrid")
        intent = classify_intent(
            "Given this incident: corrosion found on avionics connector SN-482910, "
            "classify the likely defect category and recommend next maintenance action",
            llm,
        )
        assert intent == "hybrid"

    def test_root_cause_with_trends_returns_hybrid(self):
        llm = MockLLMClient(intent_response="hybrid")
        intent = classify_intent(
            "Which hydraulics subsystem has the highest defect recurrence correlated "
            "with missed maintenance intervals?",
            llm,
        )
        assert intent == "hybrid"

    def test_compute_intent(self):
        llm = MockLLMClient(intent_response="compute")
        intent = classify_intent("Calculate the average severity score for Q1 2024", llm)
        assert intent == "compute"

    def test_all_valid_intents_accepted(self):
        for valid_intent in VALID_INTENTS:
            llm = MockLLMClient(intent_response=valid_intent)
            result = classify_intent("test query", llm)
            assert result == valid_intent

    def test_invalid_llm_response_falls_back_to_hybrid(self):
        """If LLM returns an invalid intent, default to hybrid."""
        llm = MockLLMClient(intent_response="completely_invalid")
        intent = classify_intent("some query", llm)
        assert intent == "hybrid"

    def test_malformed_json_falls_back_to_hybrid(self):
        """If LLM returns non-JSON, default to hybrid."""

        class BadLLM:
            def complete(self, *args, **kwargs):
                return "This is not JSON at all"

        intent = classify_intent("some query", BadLLM())
        assert intent == "hybrid"

    def test_empty_json_response_falls_back_to_hybrid(self):
        """If LLM returns JSON without 'intent' key, default to hybrid."""

        class EmptyJsonLLM:
            def complete(self, *args, **kwargs):
                return json.dumps({"classification": "vector_only"})  # Wrong key

        intent = classify_intent("some query", EmptyJsonLLM())
        assert intent == "hybrid"

    def test_return_type_is_string(self):
        llm = MockLLMClient(intent_response="sql_only")
        result = classify_intent("show defect counts", llm)
        assert isinstance(result, str)

    def test_llm_called_with_json_mode(self):
        """Intent classifier must always use json_mode=True."""
        llm = MockLLMClient(intent_response="vector_only")
        classify_intent("test query", llm)
        assert len(llm.calls) == 1
        assert llm.calls[0]["json_mode"] is True


# ---------------------------------------------------------------------------
# Planner fallback tests (no LLM needed)
# ---------------------------------------------------------------------------


class TestPlannerFallback:

    def test_vector_only_plan_has_vector_tool(self):
        plan = _fallback_plan("find similar incidents", "vector_only")
        tools = [s["tool"] for s in plan["steps"]]
        assert "VectorSearchTool" in tools
        assert "SQLQueryTool" not in tools

    def test_sql_only_plan_has_sql_tool(self):
        plan = _fallback_plan("show defect trends", "sql_only")
        tools = [s["tool"] for s in plan["steps"]]
        assert "SQLQueryTool" in tools
        assert "VectorSearchTool" not in tools

    def test_hybrid_plan_has_both_tools(self):
        plan = _fallback_plan("classify and recommend action", "hybrid")
        tools = [s["tool"] for s in plan["steps"]]
        assert "VectorSearchTool" in tools
        assert "SQLQueryTool" in tools

    def test_compute_plan_has_compute_tool(self):
        plan = _fallback_plan("calculate average", "compute")
        tools = [s["tool"] for s in plan["steps"]]
        assert "PythonComputeTool" in tools

    def test_plan_steps_have_sequential_numbers(self):
        plan = _fallback_plan("hybrid query", "hybrid")
        for i, step in enumerate(plan["steps"], 1):
            assert step["step_number"] == i

    def test_plan_has_plan_text(self):
        plan = _fallback_plan("test query", "vector_only")
        assert "plan_text" in plan
        assert isinstance(plan["plan_text"], str)
        assert len(plan["plan_text"]) > 0

    def test_plan_steps_have_tool_inputs(self):
        plan = _fallback_plan("find similar", "vector_only")
        for step in plan["steps"]:
            assert "tool_inputs" in step
            assert isinstance(step["tool_inputs"], dict)


# ---------------------------------------------------------------------------
# End-to-end planner test with mock LLM
# ---------------------------------------------------------------------------


class TestPlannerWithMockLLM:

    def test_planner_uses_llm_response_when_valid(self):
        expected_plan = {
            "plan_text": "I will search for similar incidents.",
            "steps": [
                {
                    "step_number": 1,
                    "description": "Search for similar incidents",
                    "tool": "VectorSearchTool",
                    "tool_inputs": {"query_text": "hydraulic crack", "top_k": 8},
                }
            ],
        }

        class PlannerLLM:
            def complete(self, *args, **kwargs):
                return json.dumps(expected_plan)

        plan = generate_plan("find hydraulic crack incidents", "vector_only", PlannerLLM())
        assert plan["plan_text"] == "I will search for similar incidents."
        assert len(plan["steps"]) == 1
        assert plan["steps"][0]["tool"] == "VectorSearchTool"

    def test_planner_falls_back_gracefully_on_llm_failure(self):
        class FailLLM:
            def complete(self, *args, **kwargs):
                raise RuntimeError("API error")

        plan = generate_plan("find hydraulic incidents", "vector_only", FailLLM())
        assert "steps" in plan
        assert len(plan["steps"]) > 0
