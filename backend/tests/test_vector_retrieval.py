"""
T-043: Vector retrieval tests.
Tests the chunker, embedding model, and retrieval module.
DB-dependent tests are marked with @pytest.mark.integration and require
a running Postgres with ingested data.
"""
from __future__ import annotations

import numpy as np
import pytest

from backend.app.rag.chunker import chunk_text


# ---------------------------------------------------------------------------
# Chunker tests (no external dependencies)
# ---------------------------------------------------------------------------


class TestChunker:

    def test_empty_text_returns_empty(self):
        result = chunk_text("", chunk_size=400, overlap=75)
        assert result == []

    def test_whitespace_only_returns_empty(self):
        result = chunk_text("   \n\t  ", chunk_size=400, overlap=75)
        assert result == []

    def test_short_text_single_chunk(self):
        """Text shorter than chunk_size produces exactly 1 chunk."""
        text = "This is a short sentence about a hydraulic actuator crack."
        result = chunk_text(text, chunk_size=400, overlap=75)
        assert len(result) == 1
        assert result[0]["chunk_index"] == 0
        assert result[0]["chunk_text"] == text.strip()

    def test_chunk_structure(self):
        """Every chunk must have all required keys."""
        text = "Hydraulic actuator crack found on Line 1. " * 20
        result = chunk_text(text, chunk_size=50, overlap=10)
        assert len(result) > 0
        for chunk in result:
            assert "chunk_index" in chunk
            assert "chunk_text" in chunk
            assert "char_start" in chunk
            assert "char_end" in chunk
            assert isinstance(chunk["chunk_index"], int)
            assert isinstance(chunk["chunk_text"], str)
            assert chunk["chunk_text"].strip() != ""

    def test_chunk_indices_sequential(self):
        """Chunk indices must be 0, 1, 2, ..."""
        text = "Word " * 500
        result = chunk_text(text, chunk_size=100, overlap=20)
        for i, chunk in enumerate(result):
            assert chunk["chunk_index"] == i

    def test_overlap_non_zero_produces_multiple_chunks(self):
        """A long text with overlap should produce more chunks than without."""
        text = "Manufacturing defect analysis report. " * 100
        chunks_with_overlap = chunk_text(text, chunk_size=100, overlap=25)
        chunks_no_overlap = chunk_text(text, chunk_size=100, overlap=0)
        # With overlap, we get more chunks because step is smaller
        assert len(chunks_with_overlap) >= len(chunks_no_overlap)

    def test_invalid_overlap_raises(self):
        """overlap >= chunk_size is a configuration error."""
        with pytest.raises(ValueError, match="overlap"):
            chunk_text("test text", chunk_size=50, overlap=50)

    def test_char_offsets_in_range(self):
        """char_start and char_end must be valid positions in the source text."""
        text = "Corrosion found on avionics connector SN-482910. " * 30
        result = chunk_text(text, chunk_size=100, overlap=20)
        for chunk in result:
            assert 0 <= chunk["char_start"] < len(text)
            assert chunk["char_end"] <= len(text)
            assert chunk["char_start"] < chunk["char_end"]


# ---------------------------------------------------------------------------
# Embedding model tests (requires sentence-transformers installed)
# ---------------------------------------------------------------------------


class TestEmbeddingModel:

    def test_encode_returns_correct_shape(self):
        from backend.app.rag.embeddings import EMBEDDING_DIM, EmbeddingModel
        model = EmbeddingModel.get()
        vectors = model.encode(["test text"])
        assert vectors.shape == (1, EMBEDDING_DIM)

    def test_encode_single_returns_384_floats(self):
        from backend.app.rag.embeddings import EMBEDDING_DIM, EmbeddingModel
        model = EmbeddingModel.get()
        vec = model.encode_single("hydraulic actuator")
        assert vec.shape == (EMBEDDING_DIM,)
        assert vec.dtype == np.float32

    def test_singleton_returns_same_instance(self):
        from backend.app.rag.embeddings import EmbeddingModel
        a = EmbeddingModel.get()
        b = EmbeddingModel.get()
        assert a is b

    def test_empty_list_returns_empty_array(self):
        from backend.app.rag.embeddings import EMBEDDING_DIM, EmbeddingModel
        model = EmbeddingModel.get()
        result = model.encode([])
        assert result.shape == (0, EMBEDDING_DIM)

    def test_vectors_are_unit_normalized(self):
        """Vectors should be unit-normalized (for cosine similarity)."""
        from backend.app.rag.embeddings import EmbeddingModel
        model = EmbeddingModel.get()
        texts = ["hydraulic actuator crack", "corrosion on avionics connector"]
        vecs = model.encode(texts)
        norms = np.linalg.norm(vecs, axis=1)
        np.testing.assert_allclose(norms, np.ones(len(texts)), atol=1e-5)

    def test_different_texts_produce_different_vectors(self):
        from backend.app.rag.embeddings import EmbeddingModel
        model = EmbeddingModel.get()
        v1 = model.encode_single("hydraulic actuator crack")
        v2 = model.encode_single("annual financial report 2023")
        # Cosine similarity of very different texts should be low
        similarity = float(np.dot(v1, v2))
        assert similarity < 0.9

    def test_similar_texts_produce_similar_vectors(self):
        from backend.app.rag.embeddings import EmbeddingModel
        model = EmbeddingModel.get()
        v1 = model.encode_single("hydraulic actuator crack on line 1")
        v2 = model.encode_single("crack detected in hydraulic actuator")
        similarity = float(np.dot(v1, v2))
        # These should be semantically similar
        assert similarity > 0.7


# ---------------------------------------------------------------------------
# Integration tests (require DB + ingested data)
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestVectorSearchIntegration:
    """
    Run with: pytest -m integration backend/tests/test_vector_retrieval.py
    Requires: running Postgres with PG_DSN env var set and ingested data.
    """

    def test_vector_search_returns_results(self):
        from backend.app.db.session import get_sync_session
        from backend.app.rag.embeddings import EmbeddingModel
        from backend.app.rag.retrieval import vector_search

        model = EmbeddingModel.get()
        query_vec = model.encode_single("hydraulic actuator crack")

        with get_sync_session() as session:
            results = vector_search(session, query_vec, top_k=5)

        assert len(results) > 0, "Expected at least 1 result — ensure ingest has been run"
        assert all("chunk_id" in r for r in results)
        assert all("score" in r for r in results)
        assert all(0.0 <= r["score"] <= 1.0 for r in results)

    def test_vector_search_results_ordered_by_score(self):
        from backend.app.db.session import get_sync_session
        from backend.app.rag.embeddings import EmbeddingModel
        from backend.app.rag.retrieval import vector_search

        model = EmbeddingModel.get()
        query_vec = model.encode_single("corrosion on connector")

        with get_sync_session() as session:
            results = vector_search(session, query_vec, top_k=8)

        scores = [r["score"] for r in results]
        assert scores == sorted(scores, reverse=True), "Results must be in descending score order"
