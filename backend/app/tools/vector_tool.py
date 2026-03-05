"""
VectorSearchTool — agent-callable tool that embeds a query and
retrieves the top-k most similar incident chunks from pgvector.
"""
from __future__ import annotations

import signal
import time
from contextlib import contextmanager
from typing import Any

from backend.app.db.session import get_sync_session
from backend.app.observability.logging import get_logger
from backend.app.rag.embeddings import EmbeddingModel
from backend.app.rag.retrieval import vector_search

logger = get_logger(__name__)

TOOL_NAME = "VectorSearchTool"


class ToolTimeoutError(Exception):
    """Raised when a tool execution exceeds its timeout budget."""
    pass


@contextmanager
def _timeout(seconds: int):
    """Context manager that raises ToolTimeoutError after `seconds`."""
    def _handler(signum, frame):
        raise ToolTimeoutError(f"Tool exceeded {seconds}s timeout")

    # Note: signal-based timeout only works on Unix.
    # On Windows, this is a no-op (timeout not enforced at OS level).
    import platform
    if platform.system() != "Windows":
        old = signal.signal(signal.SIGALRM, _handler)
        signal.alarm(seconds)
        try:
            yield
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old)
    else:
        yield  # Windows: no-op, rely on caller-level timeout


class VectorSearchTool:
    """
    Agent tool wrapper for vector similarity search.

    Usage:
        tool = VectorSearchTool()
        result = tool.run("hydraulic actuator crack", top_k=8)
    """

    name = TOOL_NAME

    def __init__(self, timeout_seconds: int = 30) -> None:
        self.timeout_seconds = timeout_seconds

    def run(
        self,
        query_text: str,
        filters: dict[str, Any] | None = None,
        top_k: int = 8,
        similarity_threshold: float = 0.0,
    ) -> dict[str, Any]:
        """
        Embed query_text and retrieve top-k similar incident chunks.

        Args:
            query_text:          Natural language query to embed and search.
            filters:             Optional metadata filters:
                                   system (str), severity (str),
                                   date_range (tuple[str, str])
            top_k:               Maximum results. Default 8.
            similarity_threshold: Minimum cosine similarity (0.0–1.0).

        Returns:
            {
              "tool_name": "VectorSearchTool",
              "results": [...],   # list of hit dicts from retrieval module
              "latency_ms": 123.4,
              "error": None
            }
        """
        t_start = time.perf_counter()
        filters = filters or {}

        try:
            with _timeout(self.timeout_seconds):
                model = EmbeddingModel.get()
                query_vec = model.encode_single(query_text)

                with get_sync_session() as session:
                    results = vector_search(
                        session,
                        query_embedding=query_vec,
                        top_k=top_k,
                        filters=filters,
                        similarity_threshold=similarity_threshold,
                    )

        except ToolTimeoutError:
            raise
        except Exception as exc:
            elapsed = (time.perf_counter() - t_start) * 1000
            logger.error(
                "VectorSearchTool error",
                extra={"error": str(exc), "query": query_text[:100]},
            )
            return {
                "tool_name": TOOL_NAME,
                "results": [],
                "latency_ms": round(elapsed, 1),
                "error": str(exc),
            }

        elapsed = (time.perf_counter() - t_start) * 1000
        logger.info(
            "VectorSearchTool complete",
            extra={"hits": len(results), "latency_ms": round(elapsed, 1)},
        )
        return {
            "tool_name": TOOL_NAME,
            "results": results,
            "latency_ms": round(elapsed, 1),
            "error": None,
        }
