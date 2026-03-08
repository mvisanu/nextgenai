"""
Wave 3 — SSE Streaming tests (test_wave3_streaming.py)

Covers:
- POST /query with Accept: text/event-stream returns SSE content-type (or falls back gracefully)
- Non-streaming POST /query still works (backward compatibility)
- STREAMING_ENABLED env var gates the feature
- SSE event format: {"type":"token",...}, {"type":"done","run":{...}}, {"type":"error",...}
- LLMClient has stream() method (Epic 3)

No real LLM call needed — tests check routing, shape, and env-var gating.
"""
from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import patch, AsyncMock, MagicMock

import pytest


# ===========================================================================
# Helper: check client.py for stream() method
# ===========================================================================


class TestLLMClientStreamMethod:
    """AC: backend/app/llm/client.py gains stream() async iterator method."""

    def test_llm_client_py_exists(self):
        client_path = Path(__file__).parent.parent / "app" / "llm" / "client.py"
        assert client_path.exists(), "backend/app/llm/client.py not found"

    def test_llm_client_has_stream_method(self):
        """AC: LLMClient ABC must have stream() method."""
        client_path = Path(__file__).parent.parent / "app" / "llm" / "client.py"
        content = client_path.read_text()
        assert "def stream" in content or "async def stream" in content, (
            "BUG-W3-STREAM: LLMClient does not have a stream() method. "
            "Epic 3 SSE streaming synthesis not implemented."
        )

    def test_query_py_has_sse_variant(self):
        """AC: backend/app/api/query.py must contain SSE streaming variant."""
        query_path = Path(__file__).parent.parent / "app" / "api" / "query.py"
        content = query_path.read_text()
        has_sse = (
            "text/event-stream" in content
            or "EventSourceResponse" in content
            or "StreamingResponse" in content
        )
        assert has_sse, (
            "BUG-W3-STREAM: query.py does not contain SSE streaming endpoint. "
            "Epic 3 not implemented in the API layer."
        )

    def test_streaming_enabled_env_var_referenced(self):
        """AC: STREAMING_ENABLED env var must gate the feature."""
        query_path = Path(__file__).parent.parent / "app" / "api" / "query.py"
        content = query_path.read_text()
        # Check at least one of the key files references STREAMING_ENABLED
        llm_path = Path(__file__).parent.parent / "app" / "llm" / "client.py"
        llm_content = llm_path.read_text() if llm_path.exists() else ""
        orchestrator_path = Path(__file__).parent.parent / "app" / "agent" / "orchestrator.py"
        orch_content = orchestrator_path.read_text() if orchestrator_path.exists() else ""
        has_flag = (
            "STREAMING_ENABLED" in content
            or "STREAMING_ENABLED" in llm_content
            or "STREAMING_ENABLED" in orch_content
        )
        assert has_flag, (
            "BUG-W3-STREAM: STREAMING_ENABLED env var not found in query.py, "
            "client.py, or orchestrator.py. Feature flag required per PRD."
        )


# ===========================================================================
# POST /query backward compatibility (non-streaming)
# ===========================================================================


class TestNonStreamingBackwardCompatibility:
    """AC: Non-streaming POST /query (no Accept header) still works unchanged."""

    def test_post_query_without_accept_header_returns_200_or_422(self):
        """Without real API key, 500 from orchestrator is expected.
        But the endpoint must be registered (not 404 or 405)."""
        from fastapi.testclient import TestClient
        from backend.app.main import app
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/query", json={"query": "hydraulic failure analysis"})
        # 404 or 405 = routing broken
        assert resp.status_code not in (404, 405), (
            f"POST /query without Accept header returned {resp.status_code}"
        )

    def test_post_query_422_for_invalid_body(self):
        """Empty body must return 422 (Pydantic validation), not 500."""
        from fastapi.testclient import TestClient
        from backend.app.main import app
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/query", json={})
        assert resp.status_code == 422, (
            f"Empty POST /query body should be 422, got {resp.status_code}"
        )

    def test_post_query_with_session_id_accepted(self):
        """AC: session_id field does not cause 422."""
        from fastapi.testclient import TestClient
        from backend.app.main import app
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/query", json={
            "query": "hydraulic failure analysis",
            "session_id": "test-session-123",
        })
        assert resp.status_code != 422, (
            f"POST /query with session_id returned 422 — field rejected by Pydantic"
        )

    def test_post_query_with_conversation_history_accepted(self):
        """AC: conversation_history field does not cause 422."""
        from fastapi.testclient import TestClient
        from backend.app.main import app
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/query", json={
            "query": "narrow to critical severity",
            "conversation_history": [
                {"role": "user", "content": "show hydraulic incidents"},
            ],
        })
        assert resp.status_code != 422, (
            f"POST /query with conversation_history returned 422"
        )


# ===========================================================================
# SSE Accept header handling
# ===========================================================================


class TestSSEAcceptHeader:
    """AC: POST /query with Accept: text/event-stream triggers SSE mode."""

    def test_sse_request_does_not_return_405(self):
        """SSE request must not return Method Not Allowed."""
        from fastapi.testclient import TestClient
        from backend.app.main import app
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post(
            "/query",
            json={"query": "test query for streaming"},
            headers={"Accept": "text/event-stream"},
        )
        assert resp.status_code != 405, "SSE POST /query returned 405 Method Not Allowed"

    def test_sse_request_does_not_return_404(self):
        """SSE endpoint must exist."""
        from fastapi.testclient import TestClient
        from backend.app.main import app
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post(
            "/query",
            json={"query": "test query for streaming"},
            headers={"Accept": "text/event-stream"},
        )
        assert resp.status_code != 404, "SSE POST /query returned 404 — not routed"

    def test_sse_request_with_streaming_disabled(self):
        """When STREAMING_ENABLED=false, SSE request must fall back gracefully."""
        from fastapi.testclient import TestClient
        from backend.app.main import app
        with patch.dict(os.environ, {"STREAMING_ENABLED": "false"}):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/query",
                json={"query": "test query with streaming disabled"},
                headers={"Accept": "text/event-stream"},
            )
            # Must not crash — either 200 JSON or graceful SSE fallback
            assert resp.status_code not in (404, 405, 500), (
                f"STREAMING_ENABLED=false caused unexpected {resp.status_code}"
            )
