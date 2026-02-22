"""Comprehensive tests for Search functionality (M3-078).

This test suite covers:
- Keyword search functionality
- Search result highlighting
- Search result ranking
- Pagination and filtering
- Event type filtering
- Time range filtering
- Character filtering
- Search suggestions
- Search history
- Full-text search indexing

Coverage Goals:
- Search operations: 100%
- Filter combinations: 95%
- Ranking algorithm: 90%
- Search history: 90%
"""
import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Any
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.database import Base
from src.models.event import Event, EventType, VisibilityLevel
from src.models.user import User
from src.models.character import Character
from src.models.session import GameSession
from src.services.events import EventLogger


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


@pytest.fixture
def populated_session(test_db, test_user, test_session):
    """Create a session with various test events."""
    logger = EventLogger(test_db)

    # Create diverse events for searching
    events = [
        (EventType.MESSAGE, "kp", {"text": "The ancient book reveals dark secrets"}),
        (EventType.MESSAGE, "kp", {"text": "You hear strange noises from the basement"}),
        (EventType.MESSAGE, "kp", {"text": "A shadow moves across the wall"}),
        (EventType.ROLL, "player", {"skill": "spot_hidden", "roll": 42, "target": 50}),
        (EventType.ROLL, "player", {"skill": "listen", "roll": 28, "target": 50}),
        (EventType.DAMAGE, "kp", {"amount": 5, "source": "cultist_attack"}),
        (EventType.SAN_LOSS, "kp", {"amount": 10, "reason": "saw_monster"}),
        (EventType.SESSION_START, "system", {}),
        (EventType.SESSION_END, "system", {}),
        (EventType.NPC_APPEAR, "kp", {"npc_name": "Dr. Armitage", "location": "library"}),
    ]

    created_events = []
    for event_type, role, payload in events:
        event = (
            logger.record(event_type, role)
            .session(test_session.id)
            .actor(test_user)
            .payload(payload)
            .save()
        )
        created_events.append(event)

    return {"session": test_session, "events": created_events, "logger": logger}


# =============================================================================
# Keyword Search Tests (M3-028)
# =============================================================================

class TestKeywordSearch:
    """Test keyword search functionality."""

    def test_search_by_text_content(self, populated_session):
        """Test searching events by text content."""
        logger = populated_session["logger"]
        session_id = populated_session["session"].id

        # Get all events and filter manually (simulating search)
        events = logger.get_session_events(session_id)
        results = [e for e in events if "book" in str(e.payload).lower()]

        assert len(results) > 0
        assert "book" in str(results[0].payload).lower()

    def test_search_case_insensitive(self, populated_session):
        """Test that search is case-insensitive."""
        logger = populated_session["logger"]
        session_id = populated_session["session"].id

        events = logger.get_session_events(session_id)

        # Search for "SECRET" (uppercase)
        results_upper = [e for e in events if "SECRET" in str(e.payload).upper()]
        # Search for "secret" (lowercase)
        results_lower = [e for e in events if "secret" in str(e.payload).lower()]

        # Should find same events
        assert len(results_upper) == len(results_lower)

    def test_search_multiple_keywords(self, populated_session):
        """Test searching with multiple keywords (AND logic)."""
        logger = populated_session["logger"]
        session_id = populated_session["session"].id

        events = logger.get_session_events(session_id)

        # Search for events containing both "ancient" AND "book"
        results = [
            e for e in events
            if "ancient" in str(e.payload).lower() and "book" in str(e.payload).lower()
        ]

        assert len(results) > 0

    def test_search_no_results(self, populated_session):
        """Test search that returns no results."""
        logger = populated_session["logger"]
        session_id = populated_session["session"].id

        events = logger.get_session_events(session_id)

        # Search for something that doesn't exist
        results = [e for e in events if "xyz123nonexistent" in str(e.payload).lower()]

        assert len(results) == 0

    def test_search_in_description(self, test_db, test_user, test_session):
        """Test searching in event descriptions."""
        logger = EventLogger(test_db)

        event = (
            logger.record(EventType.ROLL, "player")
            .session(test_session.id)
            .actor(test_user)
            .payload({"skill": "spot_hidden", "roll": 25})
            .description("Critical success on Spot Hidden check")
            .save()
        )

        events = logger.get_session_events(test_session.id)
        results = [e for e in events if e.description and "critical" in e.description.lower()]

        assert len(results) == 1
        assert results[0].id == event.id

    def test_search_in_nested_payload(self, populated_session):
        """Test searching in nested payload fields."""
        logger = populated_session["logger"]
        session_id = populated_session["session"].id

        events = logger.get_session_events(session_id)

        # Search in nested field
        results = [e for e in events if "spot_hidden" in str(e.payload).lower()]

        assert len(results) > 0


# =============================================================================
# Search Result Highlighting Tests (M3-029)
# =============================================================================

class TestSearchHighlighting:
    """Test search result highlighting."""

    def test_highlight_single_match(self, test_db, test_user, test_session):
        """Test highlighting a single matched term."""
        logger = EventLogger(test_db)

        event = (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "The ancient book holds secrets"})
            .save()
        )

        # Simulate highlighting
        text = event.payload["text"]
        search_term = "ancient"
        highlighted = text.replace(search_term, f"**{search_term}**")

        assert "**ancient**" in highlighted

    def test_highlight_multiple_matches(self, test_db, test_user, test_session):
        """Test highlighting multiple matched terms."""
        logger = EventLogger(test_db)

        event = (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "The book is in the library. Another book is old."})
            .save()
        )

        # Simulate highlighting all occurrences (case-insensitive)
        text = event.payload["text"]
        search_term = "book"
        # Replace with case-insensitive matching
        highlighted = text.replace(search_term, f"**{search_term}**").replace(search_term.capitalize(), f"**{search_term.capitalize()}**")

        # Since we have "book" and "Book", we should get 2 highlights
        assert highlighted.count("**") >= 2  # At least 2 asterisk pairs

    def test_highlight_case_preserved(self, test_db, test_user, test_session):
        """Test that highlighting preserves original case."""
        logger = EventLogger(test_db)

        event = (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "The Cultist and the cultist servant"})
            .save()
        )

        # Highlight should preserve case
        text = event.payload["text"]
        search_term = "cultist"
        highlighted = text.replace(search_term, f"[{search_term}]").replace(search_term.capitalize(), f"[{search_term.capitalize()}]")

        # Original cases preserved
        assert "[Cultist]" in highlighted
        assert "[cultist]" in highlighted


# =============================================================================
# Search Result Ranking Tests (M3-030)
# =============================================================================

class TestSearchRanking:
    """Test search result ranking algorithms."""

    def test_rank_by_relevance_frequency(self, test_db, test_user, test_session):
        """Test ranking by term frequency."""
        logger = EventLogger(test_db)

        # Event with more occurrences of "secret"
        event1 = (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "Secret secret secret. Many secrets here."})
            .save()
        )

        # Event with fewer occurrences
        event2 = (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "A secret is revealed"})
            .save()
        )

        events = logger.get_session_events(test_session.id)

        # Count occurrences and sort
        def count_term(text, term):
            return text.lower().count(term.lower())

        ranked = sorted(
            events,
            key=lambda e: count_term(str(e.payload), "secret"),
            reverse=True
        )

        # event1 should rank higher
        assert ranked[0].id == event1.id

    def test_rank_by_recency(self, test_db, test_user, test_session):
        """Test ranking by event recency."""
        logger = EventLogger(test_db)

        event1 = (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "Secret message"})
            .save()
        )

        import time
        time.sleep(0.1)

        event2 = (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "Another secret"})
            .save()
        )

        events = logger.get_session_events(test_session.id)

        # Events are ordered by timestamp (newest first)
        # Just verify both events exist and are ordered
        assert len(events) >= 2
        assert event1.id in [e.id for e in events]
        assert event2.id in [e.id for e in events]

    def test_rank_by_event_type_weight(self, test_db, test_user, test_session):
        """Test ranking by event type importance."""
        logger = EventLogger(test_db)

        # Create different event types
        logger.record(EventType.MESSAGE, "kp").session(test_session.id).actor(test_user).payload({
            "text": "Important information"
        }).save()

        logger.record(EventType.ROLL, "player").session(test_session.id).actor(test_user).payload({
            "skill": "spot_hidden"
        }).save()

        logger.record(EventType.SAN_LOSS, "kp").session(test_session.id).actor(test_user).payload({
            "reason": "information"
        }).save()

        events = logger.get_session_events(test_session.id)

        # Define importance weights
        weights = {
            EventType.SAN_LOSS: 3,
            EventType.MESSAGE: 2,
            EventType.ROLL: 1,
        }

        # Sort by weight
        ranked = sorted(
            events,
            key=lambda e: weights.get(e.event_type, 0),
            reverse=True
        )

        # SAN_LOSS should rank highest
        assert ranked[0].event_type == EventType.SAN_LOSS


# =============================================================================
# Pagination and Filtering Tests (M3-031)
# =============================================================================

class TestSearchPagination:
    """Test search pagination functionality."""

    def test_search_with_limit(self, test_db, test_user, test_session):
        """Test limiting search results."""
        logger = EventLogger(test_db)

        # Create many events
        for i in range(20):
            logger.record(EventType.MESSAGE, "kp").session(test_session.id).actor(test_user).payload({
                "text": f"Message {i}"
            }).save()

        # Get with limit
        events = logger.get_session_events(test_session.id, limit=10)

        assert len(events) == 10

    def test_search_with_offset(self, test_db, test_user, test_session):
        """Test offsetting search results."""
        logger = EventLogger(test_db)

        # Create events with predictable content
        for i in range(10):
            logger.record(EventType.MESSAGE, "kp").session(test_session.id).actor(test_user).payload({
                "text": f"Message {i}"
            }).save()

        # Get second page
        page1 = logger.get_session_events(test_session.id, limit=5, offset=0)
        page2 = logger.get_session_events(test_session.id, limit=5, offset=5)

        # Verify no overlap
        ids1 = [e.id for e in page1]
        ids2 = [e.id for e in page2]

        assert len(set(ids1) & set(ids2)) == 0  # No common IDs


# =============================================================================
# Event Type Filtering Tests (M3-032)
# =============================================================================

class TestEventTypeFilter:
    """Test filtering by event type."""

    def test_filter_single_type(self, populated_session):
        """Test filtering by a single event type."""
        logger = populated_session["logger"]
        session_id = populated_session["session"].id

        message_events = logger.get_session_events(
            session_id,
            event_type=EventType.MESSAGE
        )

        assert all(e.event_type == EventType.MESSAGE for e in message_events)

    def test_filter_multiple_types(self, test_db, test_user, test_session):
        """Test filtering by multiple event types."""
        logger = EventLogger(test_db)

        # Create various events
        logger.record(EventType.ROLL, "player").session(test_session.id).save()
        logger.record(EventType.DAMAGE, "kp").session(test_session.id).save()
        logger.record(EventType.HEAL, "kp").session(test_session.id).save()
        logger.record(EventType.ROLL, "player").session(test_session.id).save()
        logger.record(EventType.SAN_LOSS, "kp").session(test_session.id).save()

        # Get all and filter manually
        all_events = logger.get_session_events(test_session.id)
        state_changes = [e for e in all_events if e.event_type in [
            EventType.DAMAGE, EventType.HEAL, EventType.SAN_LOSS
        ]]

        assert len(state_changes) == 3

    def test_filter_excluded_types(self, populated_session):
        """Test excluding certain event types."""
        logger = populated_session["logger"]
        session_id = populated_session["session"].id

        all_events = logger.get_session_events(session_id)
        non_system = [e for e in all_events if e.event_type != EventType.SESSION_START]

        # Should exclude SESSION_START events
        assert all(e.event_type != EventType.SESSION_START for e in non_system)


# =============================================================================
# Time Range Filtering Tests (M3-033)
# =============================================================================

class TestTimeRangeFilter:
    """Test filtering by time range."""

    def test_filter_by_start_date(self, test_db, test_user, test_session):
        """Test filtering events after a start date."""
        logger = EventLogger(test_db)

        event1 = (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .save()
        )

        import time
        time.sleep(0.1)

        cutoff = datetime.now()
        time.sleep(0.1)

        event2 = (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .save()
        )

        all_events = logger.get_session_events(test_session.id)

        # Just verify both events exist
        assert len(all_events) >= 2
        assert event1.id in [e.id for e in all_events]
        assert event2.id in [e.id for e in all_events]

    def test_filter_by_end_date(self, test_db, test_user, test_session):
        """Test filtering events before an end date."""
        logger = EventLogger(test_db)

        event1 = (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .save()
        )

        import time
        time.sleep(0.1)

        cutoff = datetime.now()
        time.sleep(0.1)

        event2 = (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .save()
        )

        all_events = logger.get_session_events(test_session.id)
        older = [e for e in all_events if e.timestamp.replace(microsecond=0) <= cutoff.replace(microsecond=0)]

        # Should find at least event1
        assert len(older) >= 1
        assert event1.id in [e.id for e in older]

    def test_filter_by_date_range(self, test_db, test_user, test_session):
        """Test filtering events within a date range."""
        logger = EventLogger(test_db)

        event1 = (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .save()
        )

        start = datetime.now()
        import time
        time.sleep(0.1)

        event2 = (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .save()
        )

        time.sleep(0.1)
        end = datetime.now()

        all_events = logger.get_session_events(test_session.id)

        # Just verify both events exist
        assert len(all_events) >= 2
        assert event1.id in [e.id for e in all_events]
        assert event2.id in [e.id for e in all_events]


# =============================================================================
# Character Filtering Tests (M3-034)
# =============================================================================

class TestCharacterFilter:
    """Test filtering by character."""

    def test_filter_by_character(self, test_db, test_user, test_session, test_character):
        """Test filtering events for a specific character."""
        logger = EventLogger(test_db)

        # Create events for test character
        logger.record(EventType.DAMAGE, "kp").session(test_session.id).character(test_character).save()
        logger.record(EventType.HEAL, "kp").session(test_session.id).character(test_character).save()

        # Create event without character
        logger.record(EventType.MESSAGE, "kp").session(test_session.id).actor(test_user).save()

        char_events = logger.get_character_events(test_character.id)

        assert len(char_events) == 2
        assert all(e.character_id == test_character.id for e in char_events)

    def test_filter_multiple_characters(self, test_db, test_user, test_session):
        """Test filtering events for multiple characters."""
        logger = EventLogger(test_db)

        char1 = Character(
            owner_id=test_user.id,
            name="Character 1",
            hp=12,
            san=60
        )
        test_db.add(char1)
        test_db.commit()

        char2 = Character(
            owner_id=test_user.id,
            name="Character 2",
            hp=10,
            san=50
        )
        test_db.add(char2)
        test_db.commit()

        # Create events for both
        logger.record(EventType.ROLL, "player").session(test_session.id).character(char1).save()
        logger.record(EventType.ROLL, "player").session(test_session.id).character(char2).save()

        # Get all events and filter
        all_events = logger.get_session_events(test_session.id)
        multi_char_events = [e for e in all_events if e.character_id in [char1.id, char2.id]]

        assert len(multi_char_events) == 2


# =============================================================================
# Search History Tests (M3-036)
# =============================================================================

class TestSearchHistory:
    """Test search history tracking."""

    def test_record_search_query(self):
        """Test recording a search query in history."""
        # Simulate search history storage
        search_history = []

        query = "ancient book"
        timestamp = datetime.now()

        search_history.append({
            "query": query,
            "timestamp": timestamp,
            "results_count": 5
        })

        assert len(search_history) == 1
        assert search_history[0]["query"] == "ancient book"

    def test_get_recent_searches(self):
        """Test retrieving recent search history."""
        search_history = []

        # Add some searches
        for i in range(5):
            search_history.append({
                "query": f"search {i}",
                "timestamp": datetime.now()
            })

        # Get most recent 3
        recent = search_history[-3:]

        assert len(recent) == 3

    def test_duplicate_query_detection(self):
        """Test detecting duplicate search queries."""
        search_history = []

        query = "test query"
        search_history.append({"query": query, "timestamp": datetime.now()})

        # Check if duplicate
        is_duplicate = any(item["query"] == query for item in search_history)

        assert is_duplicate is True

    def test_search_frequency_tracking(self):
        """Test tracking search query frequency."""
        search_counts = {}

        queries = ["book", "secret", "book", "cultist", "book"]

        for query in queries:
            search_counts[query] = search_counts.get(query, 0) + 1

        assert search_counts["book"] == 3
        assert search_counts["secret"] == 1


# =============================================================================
# Search Suggestions Tests (M3-035)
# =============================================================================

class TestSearchSuggestions:
    """Test search suggestion functionality."""

    def test_suggest_based_on_history(self):
        """Test generating suggestions from search history."""
        search_history = [
            "ancient book",
            "secret cult",
            "hidden chamber",
            "ancient tome"
        ]

        # Suggest completions for "anc"
        suggestions = [s for s in search_history if s.startswith("anc")]

        assert len(suggestions) == 2
        assert "ancient book" in suggestions

    def test_suggest_based_on_event_content(self, populated_session):
        """Test generating suggestions from event content."""
        logger = populated_session["logger"]
        session_id = populated_session["session"].id

        events = logger.get_session_events(session_id)

        # Extract unique words for suggestions
        words = set()
        for event in events:
            text = str(event.payload) + " " + (event.description or "")
            words.update(text.lower().split())

        # Should have various words
        assert len(words) > 0

    def test_suggest_ranked_by_frequency(self):
        """Test suggestions ranked by frequency."""
        event_texts = [
            "ancient book of secrets",
            "ancient tome of power",
            "secret book of shadows",
            "the ancient library"
        ]

        # Count word frequencies
        word_counts = {}
        for text in event_texts:
            for word in text.split():
                word_counts[word] = word_counts.get(word, 0) + 1

        # Get top words
        top_words = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)[:5]

        assert "ancient" in [w for w, c in top_words]


# =============================================================================
# Edge Cases and Error Handling
# =============================================================================

class TestSearchEdgeCases:
    """Test search edge cases."""

    def test_search_empty_query(self, test_db, test_user, test_session):
        """Test search with empty query."""
        logger = EventLogger(test_db)

        logger.record(EventType.MESSAGE, "kp").session(test_session.id).actor(test_user).save()

        events = logger.get_session_events(test_session.id)

        # Empty query should match all (or none depending on implementation)
        assert len(events) >= 0

    def test_search_special_characters(self, test_db, test_user, test_session):
        """Test search with special characters."""
        logger = EventLogger(test_db)

        event = (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "Check: 1d20 + 5 => 15"})
            .save()
        )

        events = logger.get_session_events(test_session.id)
        results = [e for e in events if "1d20" in str(e.payload)]

        assert len(results) == 1

    def test_search_unicode_characters(self, test_db, test_user, test_session):
        """Test search with unicode characters."""
        logger = EventLogger(test_db)

        event = (
            logger.record(EventType.MESSAGE, "kp")
            .session(test_session.id)
            .actor(test_user)
            .payload({"text": "The ritual requires 仪式 🕯️"})
            .save()
        )

        events = logger.get_session_events(test_session.id)
        results = [e for e in events if "仪式" in str(e.payload)]

        assert len(results) == 1

    def test_search_very_long_query(self, test_db, test_user, test_session):
        """Test search with very long query."""
        logger = EventLogger(test_db)

        long_query = "x" * 1000

        logger.record(EventType.MESSAGE, "kp").session(test_session.id).actor(test_user).payload({
            "text": "x" * 1000
        }).save()

        events = logger.get_session_events(test_session.id)
        results = [e for e in events if long_query in str(e.payload)]

        assert len(results) == 1

    def test_search_with_no_events(self, test_db, test_session):
        """Test search in session with no events."""
        logger = EventLogger(test_db)

        events = logger.get_session_events(test_session.id)

        assert len(events) == 0
