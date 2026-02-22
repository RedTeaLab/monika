"""Text embedding service for semantic search.

Generates vector embeddings using OpenAI's text-embedding-3-small model.
"""
from typing import List, Optional
import numpy as np

from openai import AsyncOpenAI
from src.core.config import settings


class EmbeddingService:
    """Service for generating text embeddings."""

    # Embedding dimension for text-embedding-3-small
    EMBEDDING_DIM = 1536

    def __init__(self):
        """Initialize embedding service with OpenAI client."""
        self.client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
        )
        self.model = "text-embedding-3-small"

    async def embed_text(self, text: str) -> List[float]:
        """Generate embedding for a single text.

        Args:
            text: Text to embed

        Returns:
            Vector embedding as list of floats
        """
        if not text or not text.strip():
            return [0.0] * self.EMBEDDING_DIM

        try:
            response = await self.client.embeddings.create(
                model=self.model,
                input=text,
            )
            return response.data[0].embedding
        except Exception as e:
            # Fall back to zero vector on error
            print(f"Error generating embedding: {e}")
            return [0.0] * self.EMBEDDING_DIM

    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts.

        Args:
            texts: List of texts to embed

        Returns:
            List of vector embeddings
        """
        if not texts:
            return []

        # Filter out empty texts
        valid_texts = [(i, t) for i, t in enumerate(texts) if t and t.strip()]
        if not valid_texts:
            return [[0.0] * self.EMBEDDING_DIM for _ in texts]

        try:
            indices, valid_text_list = zip(*valid_texts)
            response = await self.client.embeddings.create(
                model=self.model,
                input=list(valid_text_list),
            )

            # Map back to original order
            embeddings = [None] * len(texts)
            for idx, item in zip(indices, response.data):
                embeddings[idx] = item.embedding

            # Fill empty texts with zero vectors
            for i, embedding in enumerate(embeddings):
                if embedding is None:
                    embeddings[i] = [0.0] * self.EMBEDDING_DIM

            return embeddings
        except Exception as e:
            print(f"Error generating embeddings: {e}")
            return [[0.0] * self.EMBEDDING_DIM for _ in texts]

    def cosine_similarity(self, a: List[float], b: List[float]) -> float:
        """Calculate cosine similarity between two vectors.

        Args:
            a: First vector
            b: Second vector

        Returns:
            Cosine similarity score (0-1)
        """
        try:
            a_array = np.array(a)
            b_array = np.array(b)

            dot_product = np.dot(a_array, b_array)
            norm_a = np.linalg.norm(a_array)
            norm_b = np.linalg.norm(b_array)

            if norm_a == 0 or norm_b == 0:
                return 0.0

            return float(dot_product / (norm_a * norm_b))
        except Exception:
            return 0.0


# Global embedding service instance
_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    """Get or create global embedding service instance.

    Returns:
        EmbeddingService instance
    """
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service
