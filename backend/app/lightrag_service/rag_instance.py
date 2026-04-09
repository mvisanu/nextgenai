"""
LightRAG singleton instances for aircraft and medical domains.
Uses existing EmbeddingModel (all-MiniLM-L6-v2, 384 dims) and
Anthropic Haiku client (cheap, fast enough for NER/entity extraction).
"""
from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any

import anthropic
import numpy as np

from lightrag import LightRAG, QueryParam
from lightrag.utils import EmbeddingFunc

from backend.app.rag.embeddings import EmbeddingModel
from backend.app.llm.client import get_async_fast_llm_client

logger = logging.getLogger(__name__)

# ── Working directories ────────────────────────────────────────────────────────
# Default: derive repo root from this file's location so the path resolves
# correctly whether uvicorn is launched from the repo root, from backend/, or
# inside the Docker container (where ./data is volume-mounted to
# /workspace/backend/data via docker-compose).
_repo_root = Path(__file__).resolve().parents[3]  # backend/app/lightrag_service/rag_instance.py → repo root
_default_base = str(_repo_root / "data" / "lightrag")
BASE_DIR = Path(os.getenv("LIGHTRAG_BASE_DIR", _default_base))
DOMAIN_DIRS = {
    "aircraft": str(BASE_DIR / "aircraft"),
    "medical":  str(BASE_DIR / "medical"),
}

# ── Singleton registry ─────────────────────────────────────────────────────────
_instances: dict[str, LightRAG] = {}
_init_locks: dict[str, asyncio.Lock] = {
    "aircraft": asyncio.Lock(),
    "medical":  asyncio.Lock(),
}

# ── Embedding adapter (wraps existing SentenceTransformer) ─────────────────────
_embed_model: EmbeddingModel | None = None

def _get_embed_model() -> EmbeddingModel:
    global _embed_model
    if _embed_model is None:
        _embed_model = EmbeddingModel()
    return _embed_model

def _make_embedding_func() -> EmbeddingFunc:
    """Wraps existing EmbeddingModel in LightRAG's EmbeddingFunc interface.

    Note: EmbeddingFunc is a dataclass (not a decorator) in lightrag-hku 1.4.x.
    It is constructed with explicit keyword args: embedding_dim, func, max_token_size,
    model_name.
    """
    embed_model = _get_embed_model()

    async def lightrag_embed(texts: list[str]) -> np.ndarray:
        loop = asyncio.get_running_loop()
        # Run CPU-bound encode in executor to avoid blocking event loop
        result = await loop.run_in_executor(None, embed_model.encode, texts)
        return result

    return EmbeddingFunc(
        embedding_dim=384,
        func=lightrag_embed,
        max_token_size=512,
        model_name="sentence-transformers/all-MiniLM-L6-v2",
    )

# ── LLM adapter (wraps Anthropic Haiku async client) ──────────────────────────
async def _lightrag_llm_func(
    prompt: str,
    system_prompt: str | None = None,
    history_messages: list[dict] | None = None,
    **kwargs: Any,
) -> str:
    """
    Adapter: LightRAG calls this for entity/relation extraction.
    Uses Haiku (fast, cheap) — NOT Sonnet (reserved for agent synthesis).
    """
    client = get_async_fast_llm_client()
    history_messages = history_messages or []

    messages: list[dict] = []
    if history_messages:
        messages.extend(history_messages)

    # LightRAG sends the extraction prompt as the final user turn.
    # system_prompt must be passed as the Anthropic `system` parameter —
    # NOT as a user message — to avoid consecutive user messages (API error).
    messages.append({"role": "user", "content": prompt})

    max_tokens = kwargs.get("max_tokens", 1024)

    create_kwargs: dict[str, Any] = dict(
        model=client.model,
        max_tokens=max_tokens,
        messages=messages,
    )
    if system_prompt:
        create_kwargs["system"] = system_prompt

    try:
        response = await client._async_client.messages.create(**create_kwargs)
        return response.content[0].text
    except anthropic.AuthenticationError as exc:
        logger.error(
            "LightRAG LLM call failed: invalid Anthropic API key. "
            "Check that ANTHROPIC_API_KEY is set correctly on Render. Error: %s",
            exc,
        )
        raise RuntimeError(
            "LightRAG entity extraction failed: invalid ANTHROPIC_API_KEY. "
            "Update the key in the Render dashboard and redeploy."
        ) from exc
    except Exception as exc:
        logger.error("LightRAG LLM call failed: %s", exc)
        raise

# ── Factory ────────────────────────────────────────────────────────────────────
async def get_lightrag(domain: str) -> LightRAG:
    """
    Returns the initialized LightRAG instance for the given domain.
    Initializes on first call; subsequent calls return the cached instance.
    Thread-safe via per-domain asyncio.Lock.
    """
    if domain not in DOMAIN_DIRS:
        raise ValueError(f"Unknown domain '{domain}'. Must be: {list(DOMAIN_DIRS)}")

    if domain in _instances:
        return _instances[domain]

    async with _init_locks[domain]:
        # Double-check after acquiring lock
        if domain in _instances:
            return _instances[domain]

        working_dir = DOMAIN_DIRS[domain]
        Path(working_dir).mkdir(parents=True, exist_ok=True)

        logger.info("Initializing LightRAG for domain '%s' at %s", domain, working_dir)

        rag = LightRAG(
            working_dir=working_dir,
            llm_model_func=_lightrag_llm_func,
            embedding_func=_make_embedding_func(),
            # File-based storage — does NOT touch PostgreSQL tables
            kv_storage="JsonKVStorage",
            vector_storage="NanoVectorDBStorage",
            graph_storage="NetworkXStorage",
            doc_status_storage="JsonDocStatusStorage",
            # Chunking tuned for NCR/maintenance log length
            chunk_token_size=600,
            chunk_overlap_token_size=80,
            # Entity extraction: 1 gleaning pass (balance quality vs cost)
            entity_extract_max_gleaning=1,
            # Disable LLM cache for entity extraction in prod
            enable_llm_cache=False,
            enable_llm_cache_for_entity_extract=False,
        )

        await rag.initialize_storages()
        _instances[domain] = rag
        logger.info("LightRAG '%s' initialized successfully.", domain)
        return rag

async def reset_instance(domain: str) -> None:
    """Tear down and remove a cached instance (used in tests and re-indexing)."""
    if domain in _instances:
        rag = _instances.pop(domain)
        try:
            await rag.finalize_storages()
        except Exception:
            pass
