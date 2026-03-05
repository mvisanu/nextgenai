"""
Pydantic request/response schemas for the NextAgentAI FastAPI application.
These define the typed API contracts for all endpoints.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Shared sub-schemas
# ---------------------------------------------------------------------------


class Citation(BaseModel):
    chunk_id: str = Field(..., description="ID of the source embedding chunk")
    incident_id: str = Field(..., description="ID of the source incident report")
    char_start: int = Field(..., description="Start character offset in chunk_text")
    char_end: int = Field(..., description="End character offset in chunk_text")


class Claim(BaseModel):
    text: str = Field(..., description="The factual claim text")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score 0.0–1.0")
    citations: list[Citation] = Field(default_factory=list)
    conflict_note: str | None = Field(None, description="Note if conflicting evidence was detected")


class VectorHit(BaseModel):
    chunk_id: str
    incident_id: str
    score: float = Field(..., ge=0.0, le=1.0)
    excerpt: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class SqlResult(BaseModel):
    query: str
    columns: list[str]
    rows: list[list[Any]]
    row_count: int


class Evidence(BaseModel):
    vector_hits: list[VectorHit] = Field(default_factory=list)
    sql_rows: list[SqlResult] = Field(default_factory=list)


class GraphNode(BaseModel):
    id: str
    type: str = Field(..., description="'chunk' or 'entity'")
    label: str | None = None
    properties: dict[str, Any] | None = None


class GraphEdge(BaseModel):
    id: str
    from_node: str
    to_node: str
    type: str = Field(..., description="'mentions', 'similarity', or 'co_occurrence'")
    weight: float | None = None


class GraphPath(BaseModel):
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)


class StepSummary(BaseModel):
    step_number: int
    tool_name: str
    output_summary: str
    latency_ms: float
    error: str | None = None


class RunSummary(BaseModel):
    intent: str
    plan_text: str
    steps: list[StepSummary] = Field(default_factory=list)
    tools_used: list[str] = Field(default_factory=list)
    total_latency_ms: float
    halted_at_step_limit: bool = False


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class QueryRequest(BaseModel):
    query: str = Field(
        ...,
        min_length=3,
        max_length=2000,
        description="Natural language question to ask the agent",
        examples=["Find incidents similar to hydraulic actuator crack on Line 1"],
    )
    domain: str = Field(
        "aircraft",
        description="Data domain to query: 'aircraft' (manufacturing/maintenance) or 'medical' (clinical cases)",
        pattern="^(aircraft|medical)$",
    )
    filters: dict[str, Any] | None = Field(
        None,
        description="Optional metadata filters: {system, severity, date_range: [from, to]}",
    )


class IngestRequest(BaseModel):
    """Optional body for POST /ingest — all fields have defaults."""
    force: bool = Field(
        False,
        description="If true, re-ingest even if data already exists",
    )


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class QueryResponse(BaseModel):
    run_id: str = Field(..., description="UUID of this agent run — use GET /runs/{run_id} to re-fetch")
    query: str
    answer: str = Field(..., description="Synthesised natural language answer")
    claims: list[Claim] = Field(default_factory=list)
    evidence: Evidence
    graph_path: GraphPath
    run_summary: RunSummary
    assumptions: list[str] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)


class IngestResponse(BaseModel):
    status: str = Field(..., description="'started' | 'already_running' | 'complete' | 'failed'")
    message: str


class ChunkResponse(BaseModel):
    chunk_id: str
    incident_id: str
    chunk_text: str
    chunk_index: int
    char_start: int
    char_end: int
    metadata: dict[str, Any] = Field(default_factory=dict)


class DocListItem(BaseModel):
    incident_id: str
    asset_id: str | None
    system: str | None
    severity: str | None
    event_date: str | None
    source: str
    chunk_count: int


class HealthResponse(BaseModel):
    status: str = Field(..., description="'ok' | 'degraded'")
    db: bool
    version: str = "1.0.0"


class RunRecord(BaseModel):
    run_id: str
    query: str
    result: dict[str, Any]
    created_at: datetime | None = None
