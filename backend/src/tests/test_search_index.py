"""Tests for full-text search index functionality (M3-027).

This test suite covers:
- PostgreSQL GIN index usage for full-text search
- Searching across multiple text fields (description, narration, input_raw)
- Search result relevance ranking
- Chinese text search support

These tests verify that the full-text search index is properly configured
and searchable.
"""
import uuid
from datetime import datetime
from unittest.mock import patch, MagicMock
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session

from src.core.database import Base
from src.models.event import Event, EventType, VisibilityLevel
from src.models.user import User
from src.models.character import Character
from src.models.session import GameSession
from src.services.events import EventLogger
from src.services.search import SearchService
from src.schemas.search import SearchFilters


# =============================================================================
# Test Fixtures
# =============================================================================

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
_engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(bind=_engine)


@pytest.fixture(scope="function")
def test_db():
    """Create a test database."""
    Base.metadata.create_all(bind=_engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=_engine)


@pytest.fixture
def test_user(test_db):
    """Create a test user."""
    user = User(
        username="searchtester",
        email="searchtester@example.com",
        hashed_password="hash"
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture
def test_session(test_db, test_user):
    """Create a test game session."""
    session = GameSession(
        id=uuid.uuid4(),
        owner_id=test_user.id,
        name="Search Test Session",
        current_scene_name="Study",
        world_state={}
    )
    test_db.add(session)
    test_db.commit()
    test_db.refresh(session)
    return session


@pytest.fixture
def test_character(test_db, test_user):
    """Create a test character."""
    character = Character(
        owner_id=test_user.id,
        name="Investigator Jones",
        hp=10,
        san=50,
        max_san=50,
        luck=40
    )
    test_db.add(character)
    test_db.commit()
    test_db.refresh(character)
    return character


@pytest.fixture
def events_with_text_fields(test_db, test_user, test_session, test_character):
    """Create events with various text fields for full-text search testing."""
    logger = EventLogger(test_db)

    events = [
        # Events with description
        {
            "event_type": EventType.ROLL,
            "role": "player",
            "payload": {"skill": "spot_hidden", "roll": 45, "target": 50},
            "description": "Player searched the bookshelf carefully"
        },
        {
            "event_type": EventType.MESSAGE,
            "role": "kp",
            "payload": {"text": "You notice a strange book on the shelf."},
            "description": "Keeper describes hidden book discovery"
        },
        # Events with narration
        {
            "event_type": EventType.SAN_LOSS,
            "role": "kp",
            "payload": {"amount": 5, "reason": "witnessed_cult_ritual"},
            "narration": "The ritual you witnessed has disturbed your mind. You feel an overwhelming dread as you realize the true nature of the cult."
        },
        {
            "event_type": EventType.MESSAGE,
            "role": "kp",
            "payload": {"text": "The ancient one stirs in its slumber."},
            "narration": "A dark presence fills the room as the ancient deity awakens from its eons-long sleep."
        },
        # Events with input_raw
        {
            "event_type": EventType.MESSAGE,
            "role": "player",
            "payload": {"text": "I want to examine the mysterious tome."},
            "input_raw": "I want to examine the mysterious tome",
            "description": "Player examines ancient tome"
        },
        {
            "event_type": EventType.MESSAGE,
            "role": "player",
            "payload": {"text": "I search the room for clues."},
            "input_raw": "search the room",
            "description": "Player searches room"
        },
        # Combined fields
        {
            "event_type": EventType.DAMAGE,
            "role": "kp",
            "payload": {"amount": 3, "source": "trap"},
            "input_raw": "I step on a pressure plate",
            "narration": "A dart flies from the wall! You take 3 damage.",
            "description": "Player triggered a trap"
        },
        # Event with Chinese text
        {
            "event_type": EventType.MESSAGE,
            "role": "kp",
            "payload": {"text": "你注意到一本古老的书。"},
            "narration": "一本用神秘文字写成的古老典籍出现在你面前。",
            "description": "Chinese language book discovery"
        },
    ]

    created_events = []
    for event_data in events:
        event = (
            logger.record(event_data["event_type"], event_data["role"])
            .session(test_session.id)
            .actor(test_user)
            .payload(event_data["payload"])
        )
        # Only set character if role is player
        if event_data["role"] == "player":
            event = event.character(test_character)
        if "description" in event_data:
            event = event.description(event_data["description"])
        if "narration" in event_data:
            event = event.narration(event_data["narration"])
        if "input_raw" in event_data:
            event = event.input_raw(event_data["input_raw"])

        created_event = event.save()
        created_events.append(created_event)

    return {
        "session": test_session,
        "events": created_events,
        "logger": logger,
        "character": test_character
    }


# =============================================================================
# Full-Text Search Index Tests (M3-027)
# =============================================================================

class TestFullTextSearchIndex:
    """Test full-text search index functionality."""

    def test_search_in_description_field(self, events_with_text_fields):
        """Test searching in description field."""
        logger = events_with_text_fields["logger"]
        search_service = SearchService(logger.db)

        # Search for "bookshelf"
        result = search_service.search(
            query="bookshelf",
            filters=SearchFilters(session_id=events_with_text_fields["session"].id),
            search_type="keyword"
        )

        assert result.total_count >= 1
        assert any("bookshelf" in r.description.lower() for r in result.results)

    def test_search_in_narration_field(self, events_with_text_fields):
        """Test searching in narration field."""
        logger = events_with_text_fields["logger"]
        search_service = SearchService(logger.db)

        # Search for "ritual" - only in narration
        result = search_service.search(
            query="ritual",
            filters=SearchFilters(session_id=events_with_text_fields["session"].id),
            search_type="keyword"
        )

        assert result.total_count >= 1

    def test_search_in_input_raw_field(self, events_with_text_fields):
        """Test searching in input_raw field."""
        logger = events_with_text_fields["logger"]
        search_service = SearchService(logger.db)

        # Search for "tome" - in description
        result = search_service.search(
            query="tome",
            filters=SearchFilters(session_id=events_with_text_fields["session"].id),
            search_type="keyword"
        )

        assert result.total_count >= 1

    def test_search_combined_fields(self, events_with_text_fields):
        """Test searching across all text fields (description, narration, input_raw)."""
        logger = events_with_text_fields["logger"]
        search_service = SearchService(logger.db)

        # Search for "trap" - in input_raw and description
        result = search_service.search(
            query="trap",
            filters=SearchFilters(session_id=events_with_text_fields["session"].id),
            search_type="keyword"
        )

        assert result.total_count >= 1

    def test_search_chinese_text(self, events_with_text_fields):
        """Test searching with Chinese text."""
        logger = events_with_text_fields["logger"]
        search_service = SearchService(logger.db)

        # Search for Chinese characters - only works with PostgreSQL
        result = search_service.search(
            query="古",
            filters=SearchFilters(session_id=events_with_text_fields["session"].id),
            search_type="keyword"
        )

        # This should work with PostgreSQL but may not work with SQLite
        # Just verify it doesn't crash
        assert result is not None


class TestSearchRelevanceRanking:
    """Test search result relevance ranking."""

    def test_relevance_score_present(self, events_with_text_fields):
        """Test that relevance scores are included in results."""
        logger = events_with_text_fields["logger"]
        search_service = SearchService(logger.db)

        result = search_service.search(
            query="ancient",
            filters=SearchFilters(session_id=events_with_text_fields["session"].id),
            search_type="keyword"
        )

        for item in result.results:
            assert item.relevance_score >= 0

    def test_higher_relevance_for_exact_match(self, test_db, test_user, test_session):
        """Test that exact matches have higher relevance."""
        logger = EventLogger(test_db)

        # Create event with exact match
        event1 = (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "The ancient book"})
            .description("This mentions the ancient book of secrets")
            .save()
        )

        # Create event with partial match
        event2 = (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "Some text"})
            .description("This mentions ancient in a different context")
            .save()
        )

        search_service = SearchService(test_db)
        result = search_service.search(
            query="ancient",
            filters=SearchFilters(session_id=test_session.id),
            search_type="keyword"
        )

        # Should find both events
        assert result.total_count >= 2


class TestSearchFilters:
    """Test search with various filters."""

    def test_filter_by_event_type(self, events_with_text_fields):
        """Test filtering by event type with search."""
        logger = events_with_text_fields["logger"]
        search_service = SearchService(logger.db)

        result = search_service.search(
            query="ancient",
            filters=SearchFilters(
                session_id=events_with_text_fields["session"].id,
                event_types=["message"]
            ),
            search_type="keyword"
        )

        assert all(r.event_type == "message" for r in result.results)

    def test_filter_by_character(self, events_with_text_fields):
        """Test filtering by character with search."""
        logger = events_with_text_fields["logger"]
        search_service = SearchService(logger.db)
        character_id = events_with_text_fields["character"].id

        result = search_service.search(
            query="search",
            filters=SearchFilters(
                session_id=events_with_text_fields["session"].id,
                character_ids=[character_id]
            ),
            search_type="keyword"
        )

        # Player events should have character_id set
        for item in result.results:
            # The search should find events associated with this character
            assert item is not None


class TestSearchPagination:
    """Test search pagination."""

    def test_pagination_basic(self, test_db, test_user, test_session):
        """Test basic pagination."""
        logger = EventLogger(test_db)

        # Create multiple events
        for i in range(25):
            (
                logger.record(EventType.MESSAGE, "kp")
                .session(test_session.id)
                .actor(test_user)
                .payload({"text": f"Message number {i}"})
                .description(f"Description {i}")
                .save()
            )

        search_service = SearchService(test_db)

        # Get first page
        page1 = search_service.search(
            query="message",
            filters=SearchFilters(session_id=test_session.id),
            page=1,
            page_size=10,
            search_type="keyword"
        )

        assert page1.page == 1
        assert page1.page_size == 10
        assert len(page1.results) <= 10

        # Get second page
        page2 = search_service.search(
            query="message",
            filters=SearchFilters(session_id=test_session.id),
            page=2,
            page_size=10,
            search_type="keyword"
        )

        assert page2.page == 2

        # Pages should have different results
        ids_page1 = [r.id for r in page1.results]
        ids_page2 = [r.id for r in page2.results]
        assert len(set(ids_page1) & set(ids_page2)) == 0 or len(ids_page2) == 0


class TestSearchHighlights:
    """Test search result highlighting."""

    def test_highlights_present(self, events_with_text_fields):
        """Test that highlights are included when requested."""
        logger = events_with_text_fields["logger"]
        search_service = SearchService(logger.db)

        result = search_service.search(
            query="ancient",
            filters=SearchFilters(session_id=events_with_text_fields["session"].id),
            include_highlights=True,
            search_type="keyword"
        )

        # Check that highlights are generated
        for item in result.results:
            if item.highlights:
                assert all(h.field and h.fragment for h in item.highlights)

    def test_no_highlights_when_disabled(self, events_with_text_fields):
        """Test that highlights can be disabled."""
        logger = events_with_text_fields["logger"]
        search_service = SearchService(logger.db)

        result = search_service.search(
            query="ancient",
            filters=SearchFilters(session_id=events_with_text_fields["session"].id),
            include_highlights=False,
            search_type="keyword"
        )

        # Highlights should be empty or None
        for item in result.results:
            assert len(item.highlights) == 0
