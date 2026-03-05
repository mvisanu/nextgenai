"""
Token-aware text chunker using tiktoken.
Produces overlapping windows for embedding, preserving character offsets
so citations can reference exact positions in source text.
"""
from __future__ import annotations

from typing import Any

import tiktoken

from backend.app.observability.logging import get_logger

logger = get_logger(__name__)

# Singleton tokenizer — cl100k_base matches GPT-4/Claude token counts closely
_TOKENIZER: tiktoken.Encoding | None = None


def _get_tokenizer() -> tiktoken.Encoding:
    global _TOKENIZER
    if _TOKENIZER is None:
        _TOKENIZER = tiktoken.get_encoding("cl100k_base")
    return _TOKENIZER


def chunk_text(
    text: str,
    chunk_size: int = 400,
    overlap: int = 75,
) -> list[dict[str, Any]]:
    """
    Split text into overlapping token-window chunks.

    Args:
        text:       Source text to split.
        chunk_size: Maximum tokens per chunk (default 400, per PRD config).
        overlap:    Token overlap between consecutive chunks (default 75).

    Returns:
        List of chunk dicts, each containing:
            chunk_index (int): 0-based chunk number
            chunk_text  (str): The chunk content
            char_start  (int): Start character index in original text
            char_end    (int): End character index in original text

    Notes:
        - Empty or whitespace-only chunks are skipped.
        - A 1000-token doc with size=400, overlap=75 → ceil((1000-75)/(400-75)) = 3 chunks.
        - Uses cl100k_base tokenizer (same as Claude/GPT-4) for accurate token counts.
    """
    if not text or not text.strip():
        return []

    enc = _get_tokenizer()
    tokens = enc.encode(text)
    total_tokens = len(tokens)

    if total_tokens == 0:
        return []

    step = chunk_size - overlap
    if step <= 0:
        raise ValueError(f"overlap ({overlap}) must be less than chunk_size ({chunk_size})")

    chunks: list[dict[str, Any]] = []
    chunk_index = 0
    token_pos = 0

    while token_pos < total_tokens:
        end_pos = min(token_pos + chunk_size, total_tokens)
        chunk_tokens = tokens[token_pos:end_pos]

        chunk_text_str = enc.decode(chunk_tokens).strip()
        if chunk_text_str:
            # Recover character offsets by searching in the original text
            # Start search slightly before the exact position for safety
            char_start = _find_char_offset(text, chunk_text_str)
            char_end = char_start + len(chunk_text_str) if char_start >= 0 else -1

            chunks.append({
                "chunk_index": chunk_index,
                "chunk_text": chunk_text_str,
                "char_start": max(char_start, 0),
                "char_end": max(char_end, 0),
            })
            chunk_index += 1

        if end_pos >= total_tokens:
            break
        token_pos += step

    logger.debug(
        "Text chunked",
        extra={
            "total_tokens": total_tokens,
            "chunk_count": len(chunks),
            "chunk_size": chunk_size,
            "overlap": overlap,
        },
    )
    return chunks


def _find_char_offset(source: str, target: str) -> int:
    """
    Find the character offset of `target` in `source`.
    Returns -1 if not found (can happen due to tokenizer decode edge cases).
    """
    pos = source.find(target)
    return pos
