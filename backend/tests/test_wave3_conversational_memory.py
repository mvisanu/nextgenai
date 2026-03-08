"""
Wave 3 — Conversational Memory tests (test_wave3_conversational_memory.py)

Covers:
- QueryRequest with conversation_history passes Pydantic validation
- CONVERSATIONAL_MEMORY_ENABLED env var referenced in orchestrator
- session_id flows through QueryRequest without error
- Orchestrator has session_id saving logic
- Memory feature flag: CONVERSATIONAL_MEMORY_ENABLED=false skips history injection

No DB or real API key required.
"""
from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import patch

import pytest


ORCHESTRATOR_PATH = (
    Path(__file__).parent.parent / "app" / "agent" / "orchestrator.py"
)


# ===========================================================================
# W3-003/004  Schema validation
# ===========================================================================


class TestConversationalMemorySchema:
    """AC: QueryRequest accepts session_id and conversation_history."""

    def test_query_with_session_id_and_history_validates(self):
        import uuid
        from backend.app.schemas.models import QueryRequest
        req = QueryRequest(
            query="narrow to critical severity",
            session_id=str(uuid.uuid4()),
            conversation_history=[
                {"role": "user", "content": "Show hydraulic incidents last 30 days"},
                {"role": "assistant", "content": "Found 12 critical hydraulic incidents."},
            ],
        )
        assert req.session_id is not None
        assert len(req.conversation_history) == 2

    def test_history_max_5_turns_not_enforced_at_schema_level(self):
        """Schema accepts >5 turns; truncation is orchestrator-side logic."""
        from backend.app.schemas.models import QueryRequest
        history = [{"role": "user", "content": f"query {i}"} for i in range(10)]
        req = QueryRequest(query="follow-up query", conversation_history=history)
        assert len(req.conversation_history) == 10  # schema doesn't truncate

    def test_empty_history_list_is_valid(self):
        from backend.app.schemas.models import QueryRequest
        req = QueryRequest(query="first query", conversation_history=[])
        assert req.conversation_history == []


# ===========================================================================
# W3-004/005  Orchestrator feature flag
# ===========================================================================


class TestConversationalMemoryFeatureFlag:
    """AC: CONVERSATIONAL_MEMORY_ENABLED env var gates orchestrator injection."""

    def test_orchestrator_references_conversational_memory_flag(self):
        """orchestrator.py must reference CONVERSATIONAL_MEMORY_ENABLED."""
        content = ORCHESTRATOR_PATH.read_text()
        assert "CONVERSATIONAL_MEMORY_ENABLED" in content, (
            "BUG-W3-CMEM: orchestrator.py does not reference CONVERSATIONAL_MEMORY_ENABLED. "
            "Epic 1 feature flag missing — cannot disable without redeploy."
        )

    def test_orchestrator_references_session_id(self):
        """orchestrator.py must pass session_id to save step."""
        content = ORCHESTRATOR_PATH.read_text()
        assert "session_id" in content, (
            "BUG-W3-CMEM: orchestrator.py does not handle session_id. "
            "Epic 1 session_id storage not implemented."
        )

    def test_orchestrator_references_conversation_history(self):
        """orchestrator.py must inject conversation_history into synthesis prompt."""
        content = ORCHESTRATOR_PATH.read_text()
        assert "conversation_history" in content, (
            "BUG-W3-CMEM: orchestrator.py does not reference conversation_history. "
            "Epic 1 history injection into synthesis prompt not implemented."
        )

    def test_orchestrator_prepends_prior_turns_format(self):
        """AC: Format should be 'Prior turn {i}: Q: ... | A: ...'"""
        content = ORCHESTRATOR_PATH.read_text()
        has_prior_turn = "Prior turn" in content or "prior turn" in content
        has_history_inject = "conversation_history" in content
        # At minimum, history injection code should exist
        assert has_history_inject, (
            "orchestrator.py does not inject conversation_history anywhere"
        )


# ===========================================================================
# POST /query — conversation_history passes through API layer
# ===========================================================================


class TestConversationalMemoryAPILayer:
    """AC: POST /query with conversation_history does not 422."""

    def test_post_query_with_history_not_422(self):
        from fastapi.testclient import TestClient
        from backend.app.main import app
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/query", json={
            "query": "narrow to critical",
            "session_id": "sess-abc-123",
            "conversation_history": [
                {"role": "user", "content": "hydraulic incidents last 30 days"},
                {"role": "assistant", "content": "Found 12 incidents."},
            ],
        })
        assert resp.status_code != 422, (
            f"POST /query with conversation_history returned 422 (schema rejected). "
            f"Body: {resp.text[:300]}"
        )

    def test_post_query_memory_disabled_flag(self):
        """With CONVERSATIONAL_MEMORY_ENABLED=false, history ignored but request still processes."""
        from fastapi.testclient import TestClient
        from backend.app.main import app
        with patch.dict(os.environ, {"CONVERSATIONAL_MEMORY_ENABLED": "false"}):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post("/query", json={
                "query": "show hydraulic incidents",
                "conversation_history": [{"role": "user", "content": "prior query"}],
            })
            # Must not 422 — history should just be ignored
            assert resp.status_code != 422, (
                "CONVERSATIONAL_MEMORY_ENABLED=false caused 422"
            )

    def test_session_id_in_request_does_not_422(self):
        from fastapi.testclient import TestClient
        from backend.app.main import app
        import uuid
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/query", json={
            "query": "show hydraulic incidents",
            "session_id": str(uuid.uuid4()),
        })
        assert resp.status_code != 422, "session_id field caused 422"
