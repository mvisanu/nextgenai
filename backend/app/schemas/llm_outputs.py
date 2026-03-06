"""
Pydantic output models for structured LLM responses.

Used by intent.py, orchestrator.py, and verifier.py to validate JSON
returned from Claude before accessing fields. Enables one-shot retry on
ValidationError so callers never silently fall through to stale defaults.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Classify + Plan
# ---------------------------------------------------------------------------


class StepSpec(BaseModel):
    step_number: int
    description: str = ""
    tool: Literal["VectorSearchTool", "SQLQueryTool", "PythonComputeTool"]
    tool_inputs: dict[str, Any] = Field(default_factory=dict)


class ClassifyPlanOutput(BaseModel):
    intent: Literal["vector_only", "sql_only", "hybrid", "compute"]
    plan_text: str = ""
    steps: list[StepSpec] = Field(default_factory=list)

    @field_validator("steps")
    @classmethod
    def steps_not_empty(cls, v: list[StepSpec]) -> list[StepSpec]:
        if not v:
            raise ValueError("steps list must not be empty")
        return v


# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------


class ClaimText(BaseModel):
    text: str


class SynthesisOutput(BaseModel):
    answer: str
    claims: list[ClaimText] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------


class VerifiedClaimSpec(BaseModel):
    text: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    citations: list[dict[str, Any]] = Field(default_factory=list)
    conflict_note: str | None = None


class VerifyOutput(BaseModel):
    verified_claims: list[VerifiedClaimSpec] = Field(default_factory=list)
