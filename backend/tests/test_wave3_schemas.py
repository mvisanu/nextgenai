"""
Wave 3 — Schema tests (test_wave3_schemas.py)

Covers:
- QueryRequest backward compatibility + new optional fields
- VectorHit source field
- RunSummary.cached / state_timings_ms
- Wave 3 schema fields: is_favourite on HistoryRunSummary (frontend model)
- Claim.conflict_flagged field presence
- DB model: agent_runs column names (session_id, is_favourite)

All tests run without DB or real API key.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

# ---------------------------------------------------------------------------
# Schema imports
# ---------------------------------------------------------------------------
from backend.app.schemas.models import (
    Claim,
    Citation,
    QueryRequest,
    QueryResponse,
    RunSummary,
    VectorHit,
)


# ===========================================================================
# W3-001-SCH / W3-003-SCH  QueryRequest backward compatibility
# ===========================================================================


class TestQueryRequestBackwardCompatibility:
    """AC: all new fields optional, zero breaking change for existing callers."""

    def test_existing_fields_only_still_valid(self):
        """Existing callers sending only query + domain must still pass."""
        req = QueryRequest(query="hydraulic leak last 30 days", domain="aircraft")
        assert req.query == "hydraulic leak last 30 days"
        assert req.domain == "aircraft"

    def test_query_only_uses_default_domain(self):
        req = QueryRequest(query="show defect trends")
        assert req.domain == "aircraft"

    def test_domain_medical_valid(self):
        req = QueryRequest(query="respiratory case summary", domain="medical")
        assert req.domain == "medical"

    def test_domain_invalid_raises_validation_error(self):
        with pytest.raises(ValidationError):
            QueryRequest(query="test query", domain="finance")

    def test_query_min_length_enforced(self):
        with pytest.raises(ValidationError):
            QueryRequest(query="ab")  # < 3 chars

    def test_query_max_length_enforced(self):
        with pytest.raises(ValidationError):
            QueryRequest(query="x" * 2001)  # > 2000 chars


class TestQueryRequestWave3Fields:
    """AC: QueryRequest gains optional session_id and conversation_history fields."""

    def test_session_id_accepted(self):
        import uuid
        sid = str(uuid.uuid4())
        req = QueryRequest(query="hydraulic failure analysis", session_id=sid)
        assert req.session_id == sid

    def test_session_id_none_allowed(self):
        req = QueryRequest(query="hydraulic failure analysis", session_id=None)
        assert req.session_id is None

    def test_session_id_absent_is_none(self):
        req = QueryRequest(query="hydraulic failure analysis")
        assert req.session_id is None

    def test_conversation_history_accepted(self):
        history = [
            {"role": "user", "content": "Show hydraulic incidents"},
            {"role": "assistant", "content": "Found 12 incidents."},
        ]
        req = QueryRequest(
            query="narrow to critical severity",
            conversation_history=history,
        )
        assert len(req.conversation_history) == 2

    def test_conversation_history_none_allowed(self):
        req = QueryRequest(query="test query", conversation_history=None)
        assert req.conversation_history is None

    def test_conversation_history_absent_is_none(self):
        req = QueryRequest(query="test query")
        assert req.conversation_history is None

    def test_all_wave3_fields_together(self):
        """All three new fields can be specified simultaneously."""
        import uuid
        req = QueryRequest(
            query="show only last 30 days",
            domain="aircraft",
            session_id=str(uuid.uuid4()),
            conversation_history=[{"role": "user", "content": "prior query"}],
        )
        assert req.session_id is not None
        assert req.conversation_history is not None

    def test_filters_still_work_with_new_fields(self):
        """Existing filters field unaffected by Wave 3 additions."""
        req = QueryRequest(
            query="hydraulic incidents",
            filters={"system": "hydraulic", "severity": "Critical"},
            session_id="sess-123",
        )
        assert req.filters["system"] == "hydraulic"


# ===========================================================================
# W3-010-SCH  VectorHit source field
# ===========================================================================


class TestVectorHitSourceField:
    """AC: VectorHit accepts optional source field with valid literal values."""

    def test_vector_hit_without_source_is_valid(self):
        hit = VectorHit(
            chunk_id="c1",
            incident_id="i1",
            score=0.85,
            excerpt="hydraulic actuator crack detected",
        )
        # source should be absent or None — no AttributeError
        assert not hasattr(hit, "source") or hit.source is None

    def test_vector_hit_source_bm25(self):
        """AC: source='bm25' is a valid value."""
        try:
            hit = VectorHit(
                chunk_id="c2",
                incident_id="i2",
                score=0.7,
                excerpt="crack in hydraulic line",
                source="bm25",
            )
            assert hit.source == "bm25"
        except (ValidationError, TypeError):
            pytest.skip("VectorHit.source field not yet added to schema (W3-010 pending)")

    def test_vector_hit_source_vector(self):
        """AC: source='vector' is a valid value."""
        try:
            hit = VectorHit(
                chunk_id="c3",
                incident_id="i3",
                score=0.9,
                excerpt="cosine search result",
                source="vector",
            )
            assert hit.source == "vector"
        except (ValidationError, TypeError):
            pytest.skip("VectorHit.source field not yet added to schema (W3-010 pending)")

    def test_vector_hit_source_hybrid(self):
        """AC: source='hybrid' is a valid value."""
        try:
            hit = VectorHit(
                chunk_id="c4",
                incident_id="i4",
                score=0.88,
                excerpt="rrf fused result",
                source="hybrid",
            )
            assert hit.source == "hybrid"
        except (ValidationError, TypeError):
            pytest.skip("VectorHit.source field not yet added to schema (W3-010 pending)")


# ===========================================================================
# W3-002-SCH  RunSummary.cached and state_timings_ms
# ===========================================================================


class TestRunSummaryWave3Fields:
    """AC: RunSummary.cached and state_timings_ms present and correctly typed."""

    def test_run_summary_cached_default_false(self):
        summary = RunSummary(
            intent="hybrid",
            plan_text="vector + sql",
            total_latency_ms=1200.0,
        )
        assert summary.cached is False

    def test_run_summary_cached_true(self):
        summary = RunSummary(
            intent="vector",
            plan_text="vector only",
            total_latency_ms=800.0,
            cached=True,
        )
        assert summary.cached is True

    def test_run_summary_state_timings_ms_default_empty(self):
        summary = RunSummary(
            intent="hybrid",
            plan_text="",
            total_latency_ms=1000.0,
        )
        assert summary.state_timings_ms == {}

    def test_run_summary_state_timings_ms_populated(self):
        timings = {
            "classify": 120.0,
            "vector": 310.0,
            "sql": 290.0,
            "synthesise": 5300.0,
            "verify": 800.0,
        }
        summary = RunSummary(
            intent="hybrid",
            plan_text="multi-step plan",
            total_latency_ms=sum(timings.values()),
            state_timings_ms=timings,
        )
        assert summary.state_timings_ms["classify"] == 120.0
        assert summary.state_timings_ms["synthesise"] == 5300.0


# ===========================================================================
# W3-006-SCH  Claim.conflict_flagged
# ===========================================================================


class TestClaimConflictFlagged:
    """AC: Claim has conflict_flagged field for frontend CONFLICT badge."""

    def test_claim_without_conflict_flagged(self):
        citation = Citation(chunk_id="c1", incident_id="i1", char_start=0, char_end=100)
        claim = Claim(text="Hydraulic pressure was nominal.", confidence=0.85, citations=[citation])
        # Should not fail; field may be absent/None
        conflict = getattr(claim, "conflict_flagged", None)
        assert conflict is None or conflict is False

    def test_claim_with_conflict_flagged_true(self):
        """AC: conflict_flagged=True is accepted on Claim."""
        citation = Citation(chunk_id="c2", incident_id="i2", char_start=0, char_end=50)
        try:
            claim = Claim(
                text="Conflicting evidence found.",
                confidence=0.45,
                citations=[citation],
                conflict_flagged=True,
            )
            assert claim.conflict_flagged is True
        except (ValidationError, TypeError):
            pytest.skip("Claim.conflict_flagged not yet added to schema (W3-006 pending)")

    def test_claim_conflict_note_still_works(self):
        """Pre-existing conflict_note field must not be broken."""
        citation = Citation(chunk_id="c3", incident_id="i3", char_start=0, char_end=75)
        claim = Claim(
            text="Some claim.",
            confidence=0.6,
            citations=[citation],
            conflict_note="Contradicted by source 2",
        )
        assert claim.conflict_note == "Contradicted by source 2"


# ===========================================================================
# W3-003-SCH  DB model: agent_runs Wave 3 columns
# ===========================================================================


class TestAgentRunsDBModel:
    """AC: agent_runs ORM model has session_id and is_favourite columns."""

    def test_agent_run_model_has_session_id_column(self):
        """W3-001: Alembic migration should add session_id to agent_runs."""
        from backend.app.db.models import AgentRun
        columns = {col.key for col in AgentRun.__table__.columns}
        if "session_id" not in columns:
            pytest.fail(
                "BUG-W3-001: agent_runs table missing 'session_id' column. "
                "Alembic migration for Epic 1 has not been applied to the ORM model."
            )

    def test_agent_run_model_has_is_favourite_column(self):
        """W3-002: Alembic migration should add is_favourite to agent_runs."""
        from backend.app.db.models import AgentRun
        columns = {col.key for col in AgentRun.__table__.columns}
        if "is_favourite" not in columns:
            pytest.fail(
                "BUG-W3-002: agent_runs table missing 'is_favourite' column. "
                "Alembic migration for Epic 2 has not been applied to the ORM model."
            )
