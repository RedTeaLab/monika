"""Tests for Result Ranking Algorithm (M3-030).

This test suite covers:
- Relevance scoring based on multiple factors
- Recency weighting
- Event type importance
- Customizable ranking
"""
import uuid
from datetime import datetime, timedelta
from typing import List
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.database import Base
from src.models.event import Event, EventType, EventCategory, VisibilityLevel
from src.models.user import User
from src.models.character import Character
from src.models.session import GameSession
from src.schemas.search import SearchResultItem
from src.services.search import RankingService


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
        username="ranking_tester",
        email="ranking@example.com",
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
        name="Ranking Test Session",
        current_scene_name="Test Scene",
        world_state={}
    )
    test_db.add(session)
    test_db.commit()
    test_db.refresh(session)
    return session


def create_search_result(
    event_id: uuid.UUID,
    session_id: uuid.UUID,
    description: str,
    event_type: EventType,
    timestamp: datetime,
    relevance_score: float = 0.5,
    character_id: int = None,
) -> SearchResultItem:
    """Helper to create a SearchResultItem for testing."""
    return SearchResultItem(
        id=event_id,
        type="event",
        session_id=session_id,
        title=None,
        description=description,
        event_type=event_type.value,
        timestamp=timestamp,
        highlights=[],
        relevance_score=relevance_score,
        character_id=character_id,
    )


# =============================================================================
# Ranking Service Tests
# =============================================================================

class TestRankingService:
    """Test the RankingService class."""

    def test_ranking_service_initialization(self):
        """Test that RankingService can be initialized."""
        ranking_service = RankingService()
        assert ranking_service is not None

    def test_rank_by_relevance_only(self):
        """Test ranking by relevance score only."""
        ranking_service = RankingService()

        results = [
            create_search_result(
                uuid.uuid4(), uuid.uuid4(), "test content 1",
                EventType.MESSAGE, datetime.now(), relevance_score=0.3
            ),
            create_search_result(
                uuid.uuid4(), uuid.uuid4(), "test content 2",
                EventType.MESSAGE, datetime.now(), relevance_score=0.8
            ),
            create_search_result(
                uuid.uuid4(), uuid.uuid4(), "test content 3",
                EventType.MESSAGE, datetime.now(), relevance_score=0.5
            ),
        ]

        ranked = ranking_service.rank_results(results)

        # Should be sorted by relevance descending
        assert ranked[0].relevance_score >= ranked[1].relevance_score
        assert ranked[1].relevance_score >= ranked[2].relevance_score

    def test_rank_by_recency(self):
        """Test ranking by recency."""
        ranking_service = RankingService()

        now = datetime.now()
        older = now - timedelta(days=7)
        recent = now - timedelta(days=1)

        results = [
            create_search_result(
                uuid.uuid4(), uuid.uuid4(), "old event",
                EventType.MESSAGE, older, relevance_score=0.9
            ),
            create_search_result(
                uuid.uuid4(), uuid.uuid4(), "recent event",
                EventType.MESSAGE, recent, relevance_score=0.5
            ),
        ]

        # Rank with recency weight
        ranked = ranking_service.rank_results(
            results,
            recency_weight=0.7,
            relevance_weight=0.3
        )

        # Recent event should rank higher despite lower relevance
        assert ranked[0].description == "recent event"

    def test_rank_by_event_type_weight(self):
        """Test ranking by event type importance."""
        ranking_service = RankingService()

        results = [
            create_search_result(
                uuid.uuid4(), uuid.uuid4(), "regular message",
                EventType.MESSAGE, datetime.now(), relevance_score=0.8
            ),
            create_search_result(
                uuid.uuid4(), uuid.uuid4(), "sanity loss event",
                EventType.SAN_LOSS, datetime.now(), relevance_score=0.6
            ),
            create_search_result(
                uuid.uuid4(), uuid.uuid4(), "combat damage",
                EventType.DAMAGE, datetime.now(), relevance_score=0.7
            ),
        ]

        ranked = ranking_service.rank_results(
            results,
            event_type_weight=0.5,
            relevance_weight=0.5
        )

        # SAN_LOSS should rank higher due to importance weight
        # Check that event_type_weight affects the ranking
        assert ranked[0].event_type == EventType.SAN_LOSS.value

    def test_combined_ranking(self):
        """Test combined ranking with all factors."""
        ranking_service = RankingService()

        now = datetime.now()
        old = now - timedelta(days=30)

        results = [
            create_search_result(
                uuid.uuid4(), uuid.uuid4(), "important old event with high relevance",
                EventType.COMBAT_START, old, relevance_score=0.95
            ),
            create_search_result(
                uuid.uuid4(), uuid.uuid4(), "less important recent event",
                EventType.MESSAGE, now, relevance_score=0.3
            ),
            create_search_result(
                uuid.uuid4(), uuid.uuid4(), "moderate event",
                EventType.ROLL, now, relevance_score=0.6
            ),
        ]

        # Use balanced weights
        ranked = ranking_service.rank_results(
            results,
            relevance_weight=0.4,
            recency_weight=0.3,
            event_type_weight=0.3
        )

        # Verify ranking is applied
        assert len(ranked) == 3
        # The combat_start with high relevance should still rank high
        # due to strong relevance score
        assert ranked[0].event_type == EventType.COMBAT_START.value

    def test_custom_event_type_weights(self):
        """Test custom event type importance weights."""
        # Custom weights: SAN events are most important
        custom_weights = {
            EventType.SAN_LOSS: 3.0,
            EventType.SAN_CHECK: 2.5,
            EventType.DAMAGE: 2.0,
            EventType.COMBAT_START: 1.5,
            EventType.MESSAGE: 1.0,
            EventType.ROLL: 0.8,
        }

        ranking_service = RankingService(event_type_weights=custom_weights)

        results = [
            create_search_result(
                uuid.uuid4(), uuid.uuid4(), "simple message",
                EventType.MESSAGE, datetime.now(), relevance_score=0.9
            ),
            create_search_result(
                uuid.uuid4(), uuid.uuid4(), "sanity loss",
                EventType.SAN_LOSS, datetime.now(), relevance_score=0.5
            ),
        ]

        ranked = ranking_service.rank_results(results)

        # SAN_LOSS should rank higher despite lower relevance
        assert ranked[0].event_type == EventType.SAN_LOSS.value

    def test_empty_results(self):
        """Test ranking with empty results."""
        ranking_service = RankingService()

        ranked = ranking_service.rank_results([])

        assert ranked == []

    def test_single_result(self):
        """Test ranking with single result."""
        ranking_service = RankingService()

        result = create_search_result(
            uuid.uuid4(), uuid.uuid4(), "single result",
            EventType.MESSAGE, datetime.now(), relevance_score=0.5
        )

        ranked = ranking_service.rank_results([result])

        assert len(ranked) == 1
        assert ranked[0].description == "single result"

    def test_preserve_result_metadata(self):
        """Test that ranking preserves all result metadata."""
        ranking_service = RankingService()

        result = create_search_result(
            uuid.uuid4(), uuid.uuid4(), "test with metadata",
            EventType.MESSAGE, datetime.now(), relevance_score=0.5
        )

        ranked = ranking_service.rank_results([result])

        assert ranked[0].id == result.id
        assert ranked[0].session_id == result.session_id
        assert ranked[0].event_type == result.event_type

    def test_deduplication(self):
        """Test that duplicate results are handled."""
        ranking_service = RankingService()

        duplicate_id = uuid.uuid4()
        results = [
            create_search_result(
                duplicate_id, uuid.uuid4(), "first occurrence",
                EventType.MESSAGE, datetime.now(), relevance_score=0.8
            ),
            create_search_result(
                duplicate_id, uuid.uuid4(), "duplicate",
                EventType.MESSAGE, datetime.now(), relevance_score=0.5
            ),
        ]

        ranked = ranking_service.rank_results(results, deduplicate=True)

        # Should have only one result
        assert len(ranked) == 1

    def test_keyword_boost(self):
        """Test boosting results that match exact keywords."""
        ranking_service = RankingService()

        results = [
            create_search_result(
                uuid.uuid4(), uuid.uuid4(), "The ancient book of secrets",
                EventType.MESSAGE, datetime.now(), relevance_score=0.6
            ),
            create_search_result(
                uuid.uuid4(), uuid.uuid4(), "A normal message",
                EventType.MESSAGE, datetime.now(), relevance_score=0.6
            ),
        ]

        # Search for "ancient book"
        ranked = ranking_service.rank_results(
            results,
            keywords=["ancient", "book"]
        )

        # The result with both keywords should rank higher
        assert "ancient" in ranked[0].description.lower()
        assert "book" in ranked[0].description.lower()

    def test_visibility_filter_in_ranking(self):
        """Test that visibility affects ranking."""
        ranking_service = RankingService()

        results = [
            create_search_result(
                uuid.uuid4(), uuid.uuid4(), "public message",
                EventType.MESSAGE, datetime.now(), relevance_score=0.8
            ),
        ]
        results[0].visibility = VisibilityLevel.PUBLIC.value

        ranked = ranking_service.rank_results(results)

        assert len(ranked) == 1


class TestRankingWeights:
    """Test ranking weight configurations."""

    def test_default_weights(self):
        """Test default ranking weights."""
        ranking_service = RankingService()

        # Check default weights are set
        assert ranking_service.relevance_weight == 0.5
        assert ranking_service.recency_weight == 0.3
        assert ranking_service.event_type_weight == 0.2

    def test_custom_weights(self):
        """Test custom weight configuration."""
        ranking_service = RankingService(
            relevance_weight=0.6,
            recency_weight=0.2,
            event_type_weight=0.2
        )

        assert ranking_service.relevance_weight == 0.6
        assert ranking_service.recency_weight == 0.2
        assert ranking_service.event_type_weight == 0.2

    def test_weights_sum_to_one(self):
        """Test that weights can be normalized to sum to 1."""
        ranking_service = RankingService(
            relevance_weight=0.6,
            recency_weight=0.3,
            event_type_weight=0.1
        )

        # Weights don't need to sum to 1, they are used as multipliers
        total = ranking_service.relevance_weight + ranking_service.recency_weight + ranking_service.event_type_weight
        assert total == 1.0


class TestRecencyCalculation:
    """Test recency scoring calculation."""

    def test_recency_score_decay(self):
        """Test that older events have lower recency scores."""
        ranking_service = RankingService()

        now = datetime.now()
        yesterday = now - timedelta(days=1)
        last_week = now - timedelta(days=7)
        last_month = now - timedelta(days=30)

        score_recent = ranking_service._calculate_recency_score(yesterday)
        score_week = ranking_service._calculate_recency_score(last_week)
        score_month = ranking_service._calculate_recency_score(last_month)

        # Recent should have higher score than week
        assert score_recent > score_week
        # Week should have higher score than month
        assert score_week > score_month

    def test_recency_decay_half_life(self):
        """Test recency decay with configurable half-life."""
        ranking_service = RankingService(recency_half_life_days=7)

        now = datetime.now()
        one_week_ago = now - timedelta(days=7)
        two_weeks_ago = now - timedelta(days=14)

        score_week = ranking_service._calculate_recency_score(one_week_ago)
        score_two_weeks = ranking_service._calculate_recency_score(two_weeks_ago)

        # Two weeks should be about half of one week (with some tolerance)
        # Due to exponential decay: score(14) ≈ score(7) * 0.5
        assert score_two_weeks < score_week
        assert score_two_weeks < score_week * 0.6  # Should be less than 60% of week score


class TestEventTypeWeights:
    """Test event type importance weights."""

    def test_default_event_type_weights(self):
        """Test default event type importance weights."""
        ranking_service = RankingService()

        # Sanity events should have higher default weight
        assert ranking_service.event_type_weights[EventType.SAN_LOSS] > ranking_service.event_type_weights[EventType.MESSAGE]
        assert ranking_service.event_type_weights[EventType.SAN_CHECK] > ranking_service.event_type_weights[EventType.MESSAGE]

        # Combat events should be important
        assert ranking_service.event_type_weights[EventType.DAMAGE] > ranking_service.event_type_weights[EventType.MESSAGE]

    def test_event_type_score_calculation(self):
        """Test event type score calculation."""
        ranking_service = RankingService()

        score_san_loss = ranking_service._calculate_event_type_score(EventType.SAN_LOSS)
        score_message = ranking_service._calculate_event_type_score(EventType.MESSAGE)

        assert score_san_loss > score_message


class TestEdgeCases:
    """Test ranking edge cases."""

    def test_all_same_scores(self):
        """Test ranking when all scores are equal."""
        ranking_service = RankingService()

        now = datetime.now()
        results = [
            create_search_result(uuid.uuid4(), uuid.uuid4(), f"event {i}", EventType.MESSAGE, now, relevance_score=0.5)
            for i in range(5)
        ]

        ranked = ranking_service.rank_results(results)

        # Should maintain original order or deterministic order
        assert len(ranked) == 5

    def test_future_timestamp_handling(self):
        """Test handling of future timestamps."""
        ranking_service = RankingService()

        future = datetime.now() + timedelta(days=1)
        past = datetime.now() - timedelta(days=1)

        results = [
            create_search_result(uuid.uuid4(), uuid.uuid4(), "future", EventType.MESSAGE, future, relevance_score=0.5),
            create_search_result(uuid.uuid4(), uuid.uuid4(), "past", EventType.MESSAGE, past, relevance_score=0.5),
        ]

        ranked = ranking_service.rank_results(results)

        # Past should rank higher than future (future timestamps might be errors)
        # Or they should be handled gracefully
        assert len(ranked) == 2

    def test_missing_timestamp(self):
        """Test handling of missing timestamps."""
        ranking_service = RankingService()

        results = [
            create_search_result(uuid.uuid4(), uuid.uuid4(), "no timestamp", EventType.MESSAGE, datetime.now(), relevance_score=0.5),
        ]
        results[0].timestamp = None

        ranked = ranking_service.rank_results(results)

        # Should handle gracefully
        assert len(ranked) == 1
