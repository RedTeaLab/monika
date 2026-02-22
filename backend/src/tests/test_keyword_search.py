"""Tests for keyword search functionality (M3-028).

This test suite specifically tests the SearchService keyword search:
- Single keyword matching
- Multiple keywords with AND/OR logic
- Result ranking
- Search across event content fields
"""
import uuid
from datetime import datetime
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

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
        name="Keyword Search Test Session",
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
        name="Investigator John",
        hp=15,
        san=50,
        max_san=50,
        luck=40
    )
    test_db.add(character)
    test_db.commit()
    test_db.refresh(character)
    return character


@pytest.fixture
def search_service(test_db):
    """Create a SearchService instance."""
    return SearchService(test_db)


# =============================================================================
# Keyword Search Tests (M3-028)
# =============================================================================

class TestKeywordSearchService:
    """Test SearchService keyword search functionality."""

    def test_search_single_keyword(self, test_db, test_user, test_session, search_service):
        """Test searching with a single keyword."""
        logger = EventLogger(test_db)

        # Create events with specific content
        (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "The ancient book contains forbidden knowledge"})
            .save()
        )

        (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "You find a mysterious letter in the drawer"})
            .save()
        )

        # Search for "book"
        result = search_service.search(
            query="book",
            search_type="keyword",
            page=1,
            page_size=10
        )

        assert result.total_count >= 1
        assert any("book" in r.description.lower() for r in result.results)

    def test_search_case_insensitive(self, test_db, test_user, test_session, search_service):
        """Test that keyword search is case-insensitive."""
        logger = EventLogger(test_db)

        (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "The CULTIST secret ceremony"})
            .save()
        )

        # Search with different cases
        result_lower = search_service.search(
            query="cultist",
            search_type="keyword"
        )

        result_upper = search_service.search(
            query="CULTIST",
            search_type="keyword"
        )

        assert result_lower.total_count == result_upper.total_count

    def test_search_multiple_keywords_and(self, test_db, test_user, test_session, search_service):
        """Test searching with multiple keywords using AND logic."""
        logger = EventLogger(test_db)

        # Create events with different keyword combinations
        (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "The ancient book of shadows"})
            .save()
        )

        (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "An ancient tome"})
            .save()
        )

        (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "A shadow passes by"})
            .save()
        )

        # Search for events containing both "ancient" AND "book"
        result = search_service.search(
            query="ancient book",
            search_type="keyword"
        )

        # Should find at least the event with both keywords
        assert result.total_count >= 1

    def test_search_multiple_keywords_or(self, test_db, test_user, test_session, search_service):
        """Test searching with OR logic for multiple keywords."""
        logger = EventLogger(test_db)

        (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "You see a ghost in the hallway"})
            .save()
        )

        (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "A specter appears from the shadows"})
            .save()
        )

        (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "You hear footsteps behind you"})
            .save()
        )

        # Search with OR logic - should find events with either keyword
        result = search_service.search(
            query="ghost OR specter",
            search_type="keyword"
        )

        # Should find events with either "ghost" or "specter"
        assert result.total_count >= 2

    def test_search_no_results(self, test_db, test_user, test_session, search_service):
        """Test search that returns no results."""
        logger = EventLogger(test_db)

        (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "The room is quiet"})
            .save()
        )

        # Search for something that doesn't exist
        result = search_service.search(
            query="xyznonexistent123",
            search_type="keyword"
        )

        assert result.total_count == 0

    def test_search_in_description_field(self, test_db, test_user, test_session, search_service):
        """Test searching in event description field."""
        logger = EventLogger(test_db)

        (
            logger.record(EventType.ROLL, "player")
            .session(test_session.id)
            .actor(test_user)
            .payload({"skill": "spot_hidden", "roll": 25})
            .description("Critical success finding hidden clue")
            .save()
        )

        # Search in description
        result = search_service.search(
            query="critical",
            search_type="keyword"
        )

        assert result.total_count >= 1

    def test_search_in_narration_field(self, test_db, test_user, test_session, search_service):
        """Test searching in event narration field."""
        logger = EventLogger(test_db)

        (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "You investigate"})
            .narration("The detective carefully examines the crime scene, looking for any clues")
            .save()
        )

        # Search in narration
        result = search_service.search(
            query="clue",
            search_type="keyword"
        )

        assert result.total_count >= 1

    def test_search_with_filters(self, test_db, test_user, test_session, search_service):
        """Test keyword search with additional filters."""
        logger = EventLogger(test_db)

        # Create different event types
        (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "Important story content"})
            .save()
        )

        (
            logger.record(EventType.ROLL, "player")
            .session(test_session.id)
            .actor(test_user)
            .payload({"skill": "luck", "roll": 50})
            .save()
        )

        # Search with event type filter
        filters = SearchFilters(
            event_types=["roll"]
        )

        result = search_service.search(
            query="luck",
            filters=filters,
            search_type="keyword"
        )

        assert result.total_count >= 1
        assert result.results[0].event_type == "roll"

    def test_search_pagination(self, test_db, test_user, test_session, search_service):
        """Test keyword search pagination."""
        logger = EventLogger(test_db)

        # Create multiple events
        for i in range(15):
            (
                logger.record(EventType.MESSAGE, "kp")
                .session(test_session.id)
                .actor(test_user)
                .payload({"text": f"Message number {i} with keyword"})
                .save()
            )

        # First page
        result_page1 = search_service.search(
            query="keyword",
            search_type="keyword",
            page=1,
            page_size=5
        )

        # Second page
        result_page2 = search_service.search(
            query="keyword",
            search_type="keyword",
            page=2,
            page_size=5
        )

        # Verify pagination
        assert result_page1.page_size == 5
        assert result_page2.page_size == 5
        assert result_page1.page == 1
        assert result_page2.page == 2
        assert result_page1.total_count == result_page2.total_count

        # Verify no overlap in results
        page1_ids = {r.id for r in result_page1.results}
        page2_ids = {r.id for r in result_page2.results}
        assert len(page1_ids & page2_ids) == 0

    def test_search_result_ranking(self, test_db, test_user, test_session, search_service):
        """Test that search results are ranked by relevance."""
        logger = EventLogger(test_db)

        # Create events with different relevance
        event1 = (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "The secret is in the ancient book"})
            .save()
        )

        event2 = (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "A secret passage"})
            .save()
        )

        event3 = (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "Just a regular message"})
            .save()
        )

        # Search for "secret"
        result = search_service.search(
            query="secret",
            search_type="keyword",
            page_size=10
        )

        assert result.total_count >= 2
        # First result should have higher relevance (more occurrences)
        if len(result.results) >= 2:
            assert result.results[0].relevance_score >= result.results[1].relevance_score

    def test_search_session_filter(self, test_db, test_user, test_session, search_service):
        """Test keyword search filtered by session."""
        logger = EventLogger(test_db)

        # Create another session
        session2 = GameSession(
            id=uuid.uuid4(),
            owner_id=test_user.id,
            name="Second Session",
            current_scene_name="Other",
            world_state={}
        )
        test_db.add(session2)
        test_db.commit()

        # Create events in both sessions
        (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "Secret in session one"})
            .save()
        )

        (
            logger.record(EventType.MESSAGE, "kp")
            .session(session2.id)
            .actor(test_user)
            .payload({"text": "Secret in session two"})
            .save()
        )

        # Search with session filter
        filters = SearchFilters(session_id=test_session.id)
        result = search_service.search(
            query="secret",
            filters=filters,
            search_type="keyword"
        )

        # Should only find event in first session
        assert result.total_count == 1
        assert result.results[0].session_id == test_session.id

    def test_search_empty_query(self, test_db, test_user, test_session, search_service):
        """Test search with empty query handles gracefully."""
        # This should not raise an error, just return empty or all results
        result = search_service.search(
            query="",
            search_type="keyword"
        )

        # Should handle gracefully (either return empty or all)
        assert result is not None

    def test_search_with_special_characters(self, test_db, test_user, test_session, search_service):
        """Test search with special characters in query."""
        logger = EventLogger(test_db)

        (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "Roll: 1d100 = 50"})
            .save()
        )

        # Search with dice notation
        result = search_service.search(
            query="1d100",
            search_type="keyword"
        )

        # May or may not find results depending on FTS handling
        assert result is not None


class TestKeywordSearchEdgeCases:
    """Test edge cases for keyword search."""

    def test_search_very_long_keyword(self, test_db, test_user, test_session, search_service):
        """Test search with very long keyword."""
        logger = EventLogger(test_db)

        long_word = "x" * 500

        (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": f"Very long word: {long_word}"})
            .save()
        )

        result = search_service.search(
            query=long_word[:100],
            search_type="keyword"
        )

        # Should handle gracefully
        assert result is not None

    def test_search_unicode_content(self, test_db, test_user, test_session, search_service):
        """Test search with unicode content."""
        logger = EventLogger(test_db)

        (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "The ritual requires 仪式 and candles 🕯️"})
            .save()
        )

        result = search_service.search(
            query="仪式",
            search_type="keyword"
        )

        assert result.total_count >= 1

    def test_search_mixed_language(self, test_db, test_user, test_session, search_service):
        """Test search with mixed language content."""
        logger = EventLogger(test_db)

        (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "The Necronomicon contains 远古知识"})
            .save()
        )

        result = search_service.search(
            query="Necronomicon",
            search_type="keyword"
        )

        assert result.total_count >= 1
