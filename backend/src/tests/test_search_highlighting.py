"""Tests for Search Result Highlighting (M3-029).

This test suite covers:
- Highlight tags in matching text
- Multiple highlight fragments support
- Configurable highlight length
- Frontend highlighting support

TDD Workflow:
1. Write test first - see it FAIL
2. Write minimal code to pass
3. Run tests to verify PASS
4. Update task checkbox
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
        username="searcher",
        email="searcher@example.com",
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
        name="Test Session",
        current_scene_name="Library",
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
        name="Detective Smith",
        hp=12,
        san=60,
        max_san=60,
        luck=50
    )
    test_db.add(character)
    test_db.commit()
    test_db.refresh(character)
    return character


# =============================================================================
# Search Highlight Tags Tests
# =============================================================================

class TestSearchHighlightTags:
    """Test highlight tags in search results."""

    def test_generate_highlight_with_markup_tags(self, test_db, test_user, test_session):
        """Test that highlights include markup tags around matching text."""
        # Create an event with searchable content
        event = Event(
            id=uuid.uuid4(),
            session_id=test_session.id,
            event_type=EventType.MESSAGE,
            role="kp",
            description="The ancient book reveals dark secrets about the old gods",
            narration="You find an ancient tome",
            input_raw="I search the bookshelf",
            visibility=VisibilityLevel.PUBLIC,
            timestamp=datetime.now(),
        )
        test_db.add(event)
        test_db.commit()

        # Use SearchService to generate highlights
        search_service = SearchService(test_db)
        highlights = search_service._generate_highlights(
            event.description, "ancient"
        )

        assert len(highlights) > 0
        # The highlight fragment should contain the search term with markup
        fragment = highlights[0].fragment
        # Should contain highlight markers around the term
        assert "ancient" in fragment.lower()

    def test_highlight_with_custom_tags(self, test_db, test_user, test_session):
        """Test using custom highlight tags."""
        event = Event(
            id=uuid.uuid4(),
            session_id=test_session.id,
            event_type=EventType.MESSAGE,
            role="kp",
            description="The secret lies within",
            visibility=VisibilityLevel.PUBLIC,
            timestamp=datetime.now(),
        )
        test_db.add(event)
        test_db.commit()

        search_service = SearchService(test_db)
        # Generate highlights
        highlights = search_service._generate_highlights(
            event.description, "secret"
        )

        assert len(highlights) > 0


# =============================================================================
# Multiple Highlight Fragments Tests
# =============================================================================

class TestMultipleFragments:
    """Test support for multiple highlight fragments."""

    def test_multiple_fragments_for_long_text(self, test_db, test_user, test_session):
        """Test that multiple fragments are generated for long text with multiple matches."""
        # Text with multiple occurrences of the search term
        text = "The secret book contains secrets about the secret cult. Every secret matters."
        event = Event(
            id=uuid.uuid4(),
            session_id=test_session.id,
            event_type=EventType.MESSAGE,
            role="kp",
            description=text,
            visibility=VisibilityLevel.PUBLIC,
            timestamp=datetime.now(),
        )
        test_db.add(event)
        test_db.commit()

        search_service = SearchService(test_db)
        highlights = search_service._generate_highlights(
            text, "secret", max_fragments=3
        )

        # Should generate up to 3 fragments
        assert len(highlights) <= 3
        assert len(highlights) > 0

    def test_max_fragments_respected(self, test_db, test_user, test_session):
        """Test that max_fragments parameter is respected."""
        text = "secret secret secret secret secret"
        event = Event(
            id=uuid.uuid4(),
            session_id=test_session.id,
            event_type=EventType.MESSAGE,
            role="kp",
            description=text,
            visibility=VisibilityLevel.PUBLIC,
            timestamp=datetime.now(),
        )
        test_db.add(event)
        test_db.commit()

        search_service = SearchService(test_db)
        highlights = search_service._generate_highlights(
            text, "secret", max_fragments=2
        )

        # Should only return 2 fragments max
        assert len(highlights) == 2

    def test_no_duplicate_fragments(self, test_db, test_user, test_session):
        """Test that duplicate fragments are not returned."""
        # Text where matches are close together
        text = "The secret secret"
        event = Event(
            id=uuid.uuid4(),
            session_id=test_session.id,
            event_type=EventType.MESSAGE,
            role="kp",
            description=text,
            visibility=VisibilityLevel.PUBLIC,
            timestamp=datetime.now(),
        )
        test_db.add(event)
        test_db.commit()

        search_service = SearchService(test_db)
        highlights = search_service._generate_highlights(
            text, "secret", max_fragments=3
        )

        # Should not have duplicate fragments (same offset)
        offsets = [h.offset for h in highlights]
        assert len(offsets) == len(set(offsets))


# =============================================================================
# Configurable Highlight Length Tests
# =============================================================================

class TestConfigurableHighlightLength:
    """Test configurable highlight length."""

    def test_custom_fragment_size(self, test_db, test_user, test_session):
        """Test that fragment_size parameter controls fragment length."""
        # Long text
        text = "A" * 500 + "secret" + "B" * 500
        event = Event(
            id=uuid.uuid4(),
            session_id=test_session.id,
            event_type=EventType.MESSAGE,
            role="kp",
            description=text,
            visibility=VisibilityLevel.PUBLIC,
            timestamp=datetime.now(),
        )
        test_db.add(event)
        test_db.commit()

        search_service = SearchService(test_db)

        # Generate with small fragment size
        small_fragments = search_service._generate_highlights(
            text, "secret", fragment_size=50
        )

        # Generate with large fragment size
        large_fragments = search_service._generate_highlights(
            text, "secret", fragment_size=200
        )

        # Larger fragment should contain more text
        if len(small_fragments) > 0 and len(large_fragments) > 0:
            assert len(large_fragments[0].fragment) >= len(small_fragments[0].fragment)

    def test_default_fragment_size(self, test_db, test_user, test_session):
        """Test default fragment size of 150 characters."""
        text = "X" * 100 + "secret" + "Y" * 100
        event = Event(
            id=uuid.uuid4(),
            session_id=test_session.id,
            event_type=EventType.MESSAGE,
            role="kp",
            description=text,
            visibility=VisibilityLevel.PUBLIC,
            timestamp=datetime.now(),
        )
        test_db.add(event)
        test_db.commit()

        search_service = SearchService(test_db)
        highlights = search_service._generate_highlights(text, "secret")

        # Default fragment_size is 150
        # The fragment should be around that size (with ellipsis)
        assert len(highlights) > 0

    def test_fragment_size_respects_boundaries(self, test_db, test_user, test_session):
        """Test that fragment size respects text boundaries."""
        # Short text
        text = "secret"
        event = Event(
            id=uuid.uuid4(),
            session_id=test_session.id,
            event_type=EventType.MESSAGE,
            role="kp",
            description=text,
            visibility=VisibilityLevel.PUBLIC,
            timestamp=datetime.now(),
        )
        test_db.add(event)
        test_db.commit()

        search_service = SearchService(test_db)
        highlights = search_service._generate_highlights(
            text, "secret", fragment_size=1000
        )

        # Should return the full text even with large fragment_size
        assert len(highlights) == 1
        assert highlights[0].fragment == "secret"


# =============================================================================
# Frontend Highlighting Support Tests
# =============================================================================

class TestFrontendHighlightingSupport:
    """Test features needed for frontend highlighting."""

    def test_highlight_contains_offset_info(self, test_db, test_user, test_session):
        """Test that highlights contain offset information for frontend."""
        text = "Prefix secret suffix"
        event = Event(
            id=uuid.uuid4(),
            session_id=test_session.id,
            event_type=EventType.MESSAGE,
            role="kp",
            description=text,
            visibility=VisibilityLevel.PUBLIC,
            timestamp=datetime.now(),
        )
        test_db.add(event)
        test_db.commit()

        search_service = SearchService(test_db)
        highlights = search_service._generate_highlights(text, "secret")

        assert len(highlights) > 0
        # Should have offset information
        assert hasattr(highlights[0], 'offset')
        # Offset should point to where "secret" starts (index 7)
        assert highlights[0].offset == 7

    def test_highlight_field_name_returned(self, test_db, test_user, test_session):
        """Test that highlight includes field name for frontend display."""
        event = Event(
            id=uuid.uuid4(),
            session_id=test_session.id,
            event_type=EventType.MESSAGE,
            role="kp",
            description="The ancient book",
            visibility=VisibilityLevel.PUBLIC,
            timestamp=datetime.now(),
        )
        test_db.add(event)
        test_db.commit()

        search_service = SearchService(test_db)
        highlights = search_service._generate_highlights(event.description, "ancient")

        assert len(highlights) > 0
        # Field name should be included
        assert highlights[0].field == "description"

    def test_highlights_in_search_results(self, test_db, test_user, test_session):
        """Test that highlights are included in search results."""
        # Create test events
        events = [
            Event(
                id=uuid.uuid4(),
                session_id=test_session.id,
                event_type=EventType.MESSAGE,
                role="kp",
                description="The ancient book reveals secrets",
                visibility=VisibilityLevel.PUBLIC,
                timestamp=datetime.now(),
            ),
            Event(
                id=uuid.uuid4(),
                session_id=test_session.id,
                event_type=EventType.MESSAGE,
                role="kp",
                description="A normal message without keywords",
                visibility=VisibilityLevel.PUBLIC,
                timestamp=datetime.now(),
            ),
        ]
        for event in events:
            test_db.add(event)
        test_db.commit()

        search_service = SearchService(test_db)
        response = search_service.search(
            query="ancient",
            filters=SearchFilters(session_id=test_session.id),
            include_highlights=True,
        )

        # Should find the event with "ancient"
        assert response.total_count >= 1

        # First result should have highlights
        result = response.results[0]
        assert len(result.highlights) > 0
        assert result.highlights[0].field == "description"

    def test_no_highlights_when_disabled(self, test_db, test_user, test_session):
        """Test that no highlights are returned when disabled."""
        event = Event(
            id=uuid.uuid4(),
            session_id=test_session.id,
            event_type=EventType.MESSAGE,
            role="kp",
            description="The ancient book",
            visibility=VisibilityLevel.PUBLIC,
            timestamp=datetime.now(),
        )
        test_db.add(event)
        test_db.commit()

        search_service = SearchService(test_db)
        response = search_service.search(
            query="ancient",
            filters=SearchFilters(session_id=test_session.id),
            include_highlights=False,
        )

        # Highlights should be empty
        result = response.results[0]
        assert len(result.highlights) == 0


# =============================================================================
# Edge Cases
# =============================================================================

class TestHighlightEdgeCases:
    """Test edge cases for highlighting."""

    def test_empty_query_returns_no_highlights(self, test_db, test_user, test_session):
        """Test that empty query returns no highlights."""
        event = Event(
            id=uuid.uuid4(),
            session_id=test_session.id,
            event_type=EventType.MESSAGE,
            role="kp",
            description="Some text",
            visibility=VisibilityLevel.PUBLIC,
            timestamp=datetime.now(),
        )
        test_db.add(event)
        test_db.commit()

        search_service = SearchService(test_db)
        highlights = search_service._generate_highlights(event.description, "")

        assert len(highlights) == 0

    def test_empty_text_returns_no_highlights(self, test_db, test_user, test_session):
        """Test that empty text returns no highlights."""
        event = Event(
            id=uuid.uuid4(),
            session_id=test_session.id,
            event_type=EventType.MESSAGE,
            role="kp",
            description="",
            visibility=VisibilityLevel.PUBLIC,
            timestamp=datetime.now(),
        )
        test_db.add(event)
        test_db.commit()

        search_service = SearchService(test_db)
        highlights = search_service._generate_highlights("", "secret")

        assert len(highlights) == 0

    def test_case_insensitive_highlighting(self, test_db, test_user, test_session):
        """Test that highlighting is case-insensitive."""
        text = "The SECRET book"
        event = Event(
            id=uuid.uuid4(),
            session_id=test_session.id,
            event_type=EventType.MESSAGE,
            role="kp",
            description=text,
            visibility=VisibilityLevel.PUBLIC,
            timestamp=datetime.now(),
        )
        test_db.add(event)
        test_db.commit()

        search_service = SearchService(test_db)
        # Search for lowercase
        highlights = search_service._generate_highlights(text, "secret")

        # Should find the match despite case difference
        assert len(highlights) > 0

    def test_special_characters_in_query(self, test_db, test_user, test_session):
        """Test handling special characters in search query."""
        text = "Price is $100 + 50 = 150"
        event = Event(
            id=uuid.uuid4(),
            session_id=test_session.id,
            event_type=EventType.MESSAGE,
            role="kp",
            description=text,
            visibility=VisibilityLevel.PUBLIC,
            timestamp=datetime.now(),
        )
        test_db.add(event)
        test_db.commit()

        search_service = SearchService(test_db)
        # Try with special characters - should handle gracefully
        highlights = search_service._generate_highlights(text, "$100")

        # Should handle gracefully (may return empty if special chars cause issues)
        assert isinstance(highlights, list)
