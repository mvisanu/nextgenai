"""
Local sentence-transformers embedding wrapper.
Singleton: model loaded once per process on first call.
Model: all-MiniLM-L6-v2, produces 384-dimensional vectors.
"""
from __future__ import annotations

import numpy as np
from sentence_transformers import SentenceTransformer

from backend.app.observability.logging import get_logger

logger = get_logger(__name__)

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_DIM = 384


class EmbeddingModel:
    """
    Lazy-loading singleton wrapper around sentence-transformers.

    Usage:
        model = EmbeddingModel.get()
        vectors = model.encode(["text 1", "text 2"])  # shape (2, 384)
    """

    _instance: "EmbeddingModel | None" = None
    _st_model: SentenceTransformer | None = None

    def __init__(self) -> None:
        pass

    @classmethod
    def get(cls) -> "EmbeddingModel":
        """Return the singleton EmbeddingModel, loading the model on first call."""
        if cls._instance is None:
            cls._instance = cls()
            cls._instance._load()
        return cls._instance

    def _load(self) -> None:
        logger.info("Loading embedding model", extra={"model": MODEL_NAME})
        self._st_model = SentenceTransformer(MODEL_NAME)
        # Verify dimension
        test_vec = self._st_model.encode(["test"], convert_to_numpy=True)
        if test_vec.shape[1] != EMBEDDING_DIM:
            raise RuntimeError(
                f"Expected embedding dim {EMBEDDING_DIM}, got {test_vec.shape[1]}. "
                f"Check model name: {MODEL_NAME}"
            )
        logger.info("Embedding model loaded", extra={"dim": EMBEDDING_DIM})

    def encode(self, texts: list[str], batch_size: int = 64) -> np.ndarray:
        """
        Encode a list of texts into 384-dimensional vectors.

        Args:
            texts:      List of strings to embed.
            batch_size: Inference batch size (default 64).

        Returns:
            numpy array of shape (len(texts), 384), dtype float32.
        """
        if not texts:
            return np.empty((0, EMBEDDING_DIM), dtype=np.float32)

        if self._st_model is None:
            self._load()

        vectors = self._st_model.encode(
            texts,
            batch_size=batch_size,
            convert_to_numpy=True,
            show_progress_bar=len(texts) > 500,
            normalize_embeddings=True,   # Unit-normalised for cosine similarity
        )
        return vectors.astype(np.float32)

    def encode_single(self, text: str) -> np.ndarray:
        """Convenience method for encoding a single query string."""
        return self.encode([text])[0]
