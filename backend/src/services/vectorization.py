"""Event vectorization service for semantic search of game events.

Generates embeddings for events to enable semantic similarity search.
"""
from typing import List, Optional
import numpy as np

from src.models.event import Event


class EventVectorizationService:
    """Service for generating and managing event embeddings."""

    # Embedding dimension matches the embedding service
    EMBEDDING_DIM = 1536

    def __init__(self, embedding_service=None):
        """Initialize vectorization service.

        Args:
            embedding_service: Service for generating text embeddings.
                               If None, uses the default EmbeddingService.
        """
        self._embedding_service = embedding_service

    @property
    def embedding_service(self):
        """Lazy load embedding service."""
        if self._embedding_service is None:
            from src.services.embedding import get_embedding_service
            self._embedding_service = get_embedding_service()
        return self._embedding_service

    def _get_text_for_event(self, event: Event) -> str:
        """Extract and combine text fields from an event for embedding.

        Args:
            event: Event to extract text from

        Returns:
            Combined text from all available text fields
        """
        parts = []

        # Add text fields in order of importance
        if event.input_raw:
            parts.append(event.input_raw)
        if event.narration:
            parts.append(event.narration)
        if event.description:
            parts.append(event.description)

        return " | ".join(parts) if parts else ""

    async def embed_event(self, event: Event) -> List[float]:
        """Generate embedding for a single event.

        Args:
            event: Event to embed

        Returns:
            Vector embedding as list of floats
        """
        text = self._get_text_for_event(event)

        if not text or not text.strip():
            return [0.0] * self.EMBEDDING_DIM

        return await self.embedding_service.embed_text(text)

    async def embed_events(self, events: List[Event]) -> List[List[float]]:
        """Generate embeddings for multiple events.

        Args:
            events: List of events to embed

        Returns:
            List of vector embeddings
        """
        if not events:
            return []

        # Extract texts for all events
        texts = [self._get_text_for_event(e) for e in events]

        # Check if all texts are empty
        if all(not t or not t.strip() for t in texts):
            return [[0.0] * self.EMBEDDING_DIM for _ in events]

        return await self.embedding_service.embed_texts(texts)

    def cosine_similarity(self, a: List[float], b: List[float]) -> float:
        """Calculate cosine similarity between two vectors.

        Args:
            a: First vector
            b: Second vector

        Returns:
            Cosine similarity score (-1 to 1)
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


# Global vectorization service instance
_vectorization_service: Optional[EventVectorizationService] = None


def get_vectorization_service() -> EventVectorizationService:
    """Get or create global vectorization service instance.

    Returns:
        EventVectorizationService instance
    """
    global _vectorization_service
    if _vectorization_service is None:
        _vectorization_service = EventVectorizationService()
    return _vectorization_service
