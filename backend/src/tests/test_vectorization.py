"""Tests for event vectorization service."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from src.models.event import Event, EventType, VisibilityLevel, EventCategory


@pytest.fixture
def mock_embedding_service():
    """Fixture that provides a mocked embedding service."""
    mock_service = AsyncMock()
    mock_service.embed_text = AsyncMock(return_value=[0.1] * 1536)
    mock_service.embed_texts = AsyncMock(return_value=[[0.1] * 1536])
    return mock_service


@pytest.mark.asyncio
async def test_embed_event_combines_text_fields():
    """Test that event embedding combines input_raw, narration, and description."""
    # Create mock embedding service
    mock_service = AsyncMock()
    mock_service.embed_text = AsyncMock(return_value=[0.1] * 1536)

    # Create event with all text fields
    event = Event(
        event_type=EventType.MESSAGE,
        visibility=VisibilityLevel.PUBLIC,
        actor_role="system",
        input_raw="Player investigates the mysterious door",
        narration="The door creaks open, revealing a dark staircase leading down.",
        description="Player opened mysterious door"
    )

    # Import service
    from src.services.vectorization import EventVectorizationService

    service = EventVectorizationService(mock_service)

    # Generate embedding for event
    embedding = await service.embed_event(event)

    # Verify embedding dimensions
    assert len(embedding) == 1536

    # Verify the embedding service was called with combined text
    mock_service.embed_text.assert_called_once()
    call_args = mock_service.embed_text.call_args[0][0]

    # Check that all text fields are included
    assert "Player investigates the mysterious door" in call_args
    assert "The door creaks open" in call_args
    assert "Player opened mysterious door" in call_args


@pytest.mark.asyncio
async def test_embed_event_with_only_narration():
    """Test that event embedding works when only narration is present."""
    mock_service = AsyncMock()
    mock_service.embed_text = AsyncMock(return_value=[0.2] * 1536)

    event = Event(
        event_type=EventType.COMBAT_START,
        visibility=VisibilityLevel.PUBLIC,
        actor_role="kp",
        narration="Combat begins! The cultist draws a knife."
    )

    from src.services.vectorization import EventVectorizationService

    service = EventVectorizationService(mock_service)
    embedding = await service.embed_event(event)

    assert len(embedding) == 1536
    mock_service.embed_text.assert_called_once()


@pytest.mark.asyncio
async def test_embed_event_with_empty_text_fields():
    """Test that event embedding handles empty text fields."""
    mock_service = AsyncMock()
    mock_service.embed_text = AsyncMock(return_value=[0.0] * 1536)

    event = Event(
        event_type=EventType.SESSION_START,
        visibility=VisibilityLevel.PUBLIC,
        actor_role="system"
    )

    from src.services.vectorization import EventVectorizationService

    service = EventVectorizationService(mock_service)
    embedding = await service.embed_event(event)

    # Should still return a valid embedding (zero vector)
    assert len(embedding) == 1536


@pytest.mark.asyncio
async def test_embed_events_batch():
    """Test batch embedding for multiple events."""
    mock_service = AsyncMock()
    mock_service.embed_texts = AsyncMock(return_value=[[0.1] * 1536, [0.2] * 1536, [0.3] * 1536])

    events = [
        Event(
            event_type=EventType.MESSAGE,
            visibility=VisibilityLevel.PUBLIC,
            actor_role="player",
            narration="First event narration"
        ),
        Event(
            event_type=EventType.ROLL,
            visibility=VisibilityLevel.PUBLIC,
            actor_role="system",
            narration="Second event narration"
        ),
        Event(
            event_type=EventType.SAN_CHECK,
            visibility=VisibilityLevel.KP_ONLY,
            actor_role="kp",
            narration="Third event narration"
        ),
    ]

    from src.services.vectorization import EventVectorizationService

    service = EventVectorizationService(mock_service)
    embeddings = await service.embed_events(events)

    assert len(embeddings) == 3
    assert all(len(e) == 1536 for e in embeddings)
    mock_service.embed_texts.assert_called_once()


@pytest.mark.asyncio
async def test_get_text_for_event():
    """Test extracting and combining text from event fields."""
    mock_service = AsyncMock()

    event = Event(
        event_type=EventType.MESSAGE,
        visibility=VisibilityLevel.PUBLIC,
        actor_role="player",
        input_raw="I search the room",
        narration="You find a hidden diary under the floorboards.",
        description="Player searched room"
    )

    from src.services.vectorization import EventVectorizationService

    service = EventVectorizationService(mock_service)
    text = service._get_text_for_event(event)

    # Verify all fields are combined
    assert "I search the room" in text
    assert "You find a hidden diary" in text
    assert "Player searched room" in text


@pytest.mark.asyncio
async def test_get_text_for_event_without_input_raw():
    """Test text extraction when input_raw is None."""
    mock_service = AsyncMock()

    event = Event(
        event_type=EventType.COMBAT_START,
        visibility=VisibilityLevel.PUBLIC,
        actor_role="kp",
        narration="Combat begins!",
        description="Combat started"
    )

    from src.services.vectorization import EventVectorizationService

    service = EventVectorizationService(mock_service)
    text = service._get_text_for_event(event)

    # Should still have narration and description
    assert "Combat begins" in text
    assert "Combat started" in text
    assert "I search the room" not in text


@pytest.mark.asyncio
async def test_cosine_similarity():
    """Test cosine similarity calculation between embeddings."""
    from src.services.vectorization import EventVectorizationService

    # Create service with mocked embedding service
    mock_service = AsyncMock()
    service = EventVectorizationService(mock_service)

    # Test identical vectors
    vec1 = [1.0, 0.0, 0.0]
    vec2 = [1.0, 0.0, 0.0]
    similarity = service.cosine_similarity(vec1, vec2)
    assert similarity == pytest.approx(1.0)

    # Test orthogonal vectors
    vec3 = [0.0, 1.0, 0.0]
    similarity = service.cosine_similarity(vec1, vec3)
    assert similarity == pytest.approx(0.0)

    # Test opposite vectors
    vec4 = [-1.0, 0.0, 0.0]
    similarity = service.cosine_similarity(vec1, vec4)
    assert similarity == pytest.approx(-1.0)
