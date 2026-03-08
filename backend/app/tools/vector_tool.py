"""
VectorSearchTool — agent-callable tool that embeds a query and
retrieves the top-k most similar incident chunks from pgvector.

T-17: run_async() added. CPU-bound embedding is offloaded to a thread
via asyncio.get_running_loop().run_in_executor so the event loop is not
blocked. The pgvector query uses the async DB session.

CR-007: run_async() now uses asyncio.get_running_loop() (not the deprecated variant).
"""
from __future__ import annotations

import asyncio
import signal
import time
from contextlib import contextmanager
from typing import Any

import numpy as np

from backend.app.db.session import get_session, get_sync_session
from backend.app.observability.logging import get_logger
from backend.app.rag.embeddings import EmbeddingModel
from backend.app.rag.retrieval import bm25_search, hybrid_search, mmr_rerank, vector_search

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
        domain: str = "aircraft",
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
                query_vec = np.array(model.encode_single_cached(query_text), dtype=np.float32)

                with get_sync_session() as session:
                    results = vector_search(
                        session,
                        query_embedding=query_vec,
                        top_k=top_k,
                        filters=filters,
                        similarity_threshold=similarity_threshold,
                        domain=domain,
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

    async def run_async(
        self,
        query_text: str,
        filters: dict[str, Any] | None = None,
        top_k: int = 8,
        similarity_threshold: float = 0.0,
        domain: str = "aircraft",
        search_mode: str = "hybrid",
    ) -> dict[str, Any]:
        """
        Async variant of run().

        Embedding inference (CPU-bound) is executed in the default thread-pool
        executor so it does not block the event loop. The pgvector query uses
        the async SQLAlchemy session.

        T3-03: search_mode="hybrid" uses BM25+vector RRF fusion. "vector" uses
        pure cosine similarity. The vector tool fetches top_k*2 then applies MMR.

        T3-06: MMR re-ranking applied after retrieval to reduce near-duplicate chunks.

        Args and return value are identical to run(), with optional search_mode param.
        """
        t_start = time.perf_counter()
        filters = filters or {}

        try:
            # Offload CPU-bound embedding to thread pool
            loop = asyncio.get_running_loop()
            model = EmbeddingModel.get()
            cached = await loop.run_in_executor(
                None, model.encode_single_cached, query_text
            )
            query_vec = np.array(cached, dtype=np.float32)

            # Fetch extra results so MMR has room to de-duplicate
            fetch_k = top_k * 2

            async with get_session() as session:
                if search_mode == "hybrid":
                    results = await session.run_sync(
                        lambda sync_session: hybrid_search(
                            sync_session,
                            query_embedding=query_vec,
                            query_text=query_text,
                            top_k=fetch_k,
                            filters=filters,
                            similarity_threshold=similarity_threshold,
                            domain=domain,
                        )
                    )
                else:
                    results = await session.run_sync(
                        lambda sync_session: vector_search(
                            sync_session,
                            query_embedding=query_vec,
                            top_k=fetch_k,
                            filters=filters,
                            similarity_threshold=similarity_threshold,
                            domain=domain,
                        )
                    )

            # T3-06: MMR re-ranking to reduce near-duplicate chunks
            results = mmr_rerank(results, query_vec, lambda_=0.7, top_k=top_k)

        except Exception as exc:
            elapsed = (time.perf_counter() - t_start) * 1000
            logger.error(
                "VectorSearchTool async error",
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
            "VectorSearchTool async complete",
            extra={"hits": len(results), "latency_ms": round(elapsed, 1), "search_mode": search_mode},
        )
        return {
            "tool_name": TOOL_NAME,
            "results": results,
            "latency_ms": round(elapsed, 1),
            "error": None,
        }
