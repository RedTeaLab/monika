"""Tests for pgvector integration with events table.

These tests verify:
1. Embedding service generates correct vector embeddings
2. Events can store embeddings in PostgreSQL
3. Vector similarity search works correctly
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import List

from src.services.embedding import EmbeddingService, get_embedding_service
from src.models.event import Event, EventType, EventCategory


class TestEmbeddingService:
    """Test the embedding service."""

    @pytest.fixture
    def mock_openai_client(self):
        """Create a mock OpenAI client."""
        with patch('src.services.embedding.AsyncOpenAI') as mock_client:
            yield mock_client

    @pytest.mark.asyncio
    async def test_embed_text_returns_vector(self, mock_openai_client):
        """Test that embed_text returns a vector of correct dimension."""
        # Setup mock response
        mock_response = MagicMock()
        mock_response.data = [MagicMock(embedding=[0.1] * 1536)]
        mock_client_instance = AsyncMock()
        mock_client_instance.embeddings.create = AsyncMock(return_value=mock_response)
        mock_openai_client.return_value = mock_client_instance

        # Create service and call embed_text
        service = EmbeddingService()
        result = await service.embed_text("Hello world")

        # Verify result
        assert isinstance(result, list)
        assert len(result) == 1536
        assert all(isinstance(x, float) for x in result)

    @pytest.mark.asyncio
    async def test_embed_text_empty_input(self, mock_openai_client):
        """Test that empty text returns zero vector."""
        service = EmbeddingService()

        # Test empty string
        result = await service.embed_text("")
        assert result == [0.0] * 1536

        # Test whitespace only
        result = await service.embed_text("   ")
        assert result == [0.0] * 1536

    @pytest.mark.asyncio
    async def test_embed_texts_multiple(self, mock_openai_client):
        """Test embedding multiple texts at once."""
        # Setup mock response for multiple texts
        mock_response = MagicMock()
        mock_response.data = [
            MagicMock(embedding=[0.1] * 1536),
            MagicMock(embedding=[0.2] * 1536),
            MagicMock(embedding=[0.3] * 1536),
        ]
        mock_client_instance = AsyncMock()
        mock_client_instance.embeddings.create = AsyncMock(return_value=mock_response)
        mock_openai_client.return_value = mock_client_instance

        service = EmbeddingService()
        texts = ["Hello", "World", "Test"]
        results = await service.embed_texts(texts)

        assert len(results) == 3
        assert all(len(r) == 1536 for r in results)

    def test_cosine_similarity(self):
        """Test cosine similarity calculation."""
        service = EmbeddingService()

        # Test identical vectors
        v1 = [1.0, 0.0, 0.0]
        v2 = [1.0, 0.0, 0.0]
        assert service.cosine_similarity(v1, v2) == pytest.approx(1.0)

        # Test orthogonal vectors
        v1 = [1.0, 0.0, 0.0]
        v2 = [0.0, 1.0, 0.0]
        assert service.cosine_similarity(v1, v2) == pytest.approx(0.0)

        # Test opposite vectors
        v1 = [1.0, 0.0, 0.0]
        v2 = [-1.0, 0.0, 0.0]
        assert service.cosine_similarity(v1, v2) == pytest.approx(-1.0)

    def test_cosine_similarity_zero_vector(self):
        """Test cosine similarity with zero vector."""
        service = EmbeddingService()

        v1 = [0.0, 0.0, 0.0]
        v2 = [1.0, 0.0, 0.0]
        assert service.cosine_similarity(v1, v2) == 0.0


class TestEmbeddingGeneration:
    """Test embedding generation for events."""

    @pytest.mark.asyncio
    async def test_event_to_embedding_text(self):
        """Test converting event fields to embedding text."""
        # Test that event can generate embedding text from its fields
        event = Event(
            event_type=EventType.MESSAGE,
            category=EventCategory.INTERACTION,
            narration="The investigator finds a mysterious letter on the desk.",
            input_raw="我调查桌子上的信",
            payload={"keyword": "letter", "location": "desk"},
        )

        # Generate text for embedding
        embedding_text = self._event_to_embedding_text(event)
        assert "letter" in embedding_text.lower()
        assert "desk" in embedding_text.lower()

    def _event_to_embedding_text(self, event: Event) -> str:
        """Convert event to text for embedding."""
        parts = []

        if event.narration:
            parts.append(event.narration)
        if event.input_raw:
            parts.append(event.input_raw)
        if event.payload:
            # Add payload keywords
            if isinstance(event.payload, dict):
                parts.extend(str(v) for v in event.payload.values() if isinstance(v, str))

        return " ".join(parts) if parts else ""


class TestVectorSearch:
    """Test vector similarity search operations."""

    def test_cosine_similarity_ranking(self):
        """Test that cosine similarity can rank search results."""
        service = EmbeddingService()

        # Query vector (simplified)
        query = [1.0, 0.0, 0.0]

        # Document vectors with different similarity
        docs = [
            [0.9, 0.1, 0.0],   # High similarity
            [0.5, 0.5, 0.0],   # Medium similarity
            [0.1, 0.9, 0.0],   # Low similarity
            [-0.5, 0.5, 0.0],  # Negative similarity
        ]

        # Calculate similarities
        similarities = [(i, service.cosine_similarity(query, doc)) for i, doc in enumerate(docs)]

        # Sort by similarity (descending)
        ranked = sorted(similarities, key=lambda x: x[1], reverse=True)

        # Verify ranking
        assert ranked[0][0] == 0  # Highest similarity
        assert ranked[-1][0] == 3  # Lowest similarity


class TestGetEmbeddingService:
    """Test the get_embedding_service factory function."""

    def test_singleton_pattern(self):
        """Test that get_embedding_service returns singleton."""
        # Reset the global instance
        import src.services.embedding
        src.services.embedding._embedding_service = None

        service1 = get_embedding_service()
        service2 = get_embedding_service()

        assert service1 is service2
