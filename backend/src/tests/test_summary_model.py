"""Tests for Summary model."""
import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.database import Base
from src.models.user import User
from src.models.character import Character
from src.models.session import GameSession, SessionState
from src.models.event import Event, EventType, VisibilityLevel
from src.models.checkpoint import Checkpoint, CheckpointType
from src.models.summary import Summary, SummaryType


@pytest.fixture
def test_db():
    """Create a test database."""
    engine = create_engine("sqlite:///:memory:")
    TestingSessionLocal = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def test_user(test_db):
    """Create a test user."""
    user = User(username="testuser", email="test@example.com", hashed_password="hash")
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture
def test_character(test_db, test_user):
    """Create a test character."""
    character = Character(
        owner_id=test_user.id,
        name="Test Investigator",
        hp=12,
        san=60,
        max_san=60,
        luck=50,
        mp=15,
    )
    test_db.add(character)
    test_db.commit()
    test_db.refresh(character)
    return character


@pytest.fixture
def test_session(test_db, test_user, test_character):
    """Create a test game session."""
    session = GameSession(
        owner_id=test_user.id,
        character_id=test_character.id,
        name="Test Session",
        state=SessionState.ACTIVE.value,
        current_scene_id="scene_1",
        current_scene_name="The Library",
        location="Miskatonic University",
    )
    test_db.add(session)
    test_db.commit()
    test_db.refresh(session)
    return session


@pytest.fixture
def test_checkpoint(test_db, test_session):
    """Create a test checkpoint."""
    checkpoint = Checkpoint(
        session_id=test_session.id,
        checkpoint_type=CheckpointType.MANUAL.value,
        session_state={},
        character_states={},
    )
    test_db.add(checkpoint)
    test_db.commit()
    test_db.refresh(checkpoint)
    return checkpoint


@pytest.fixture
def sample_events(test_db, test_session, test_character):
    """Create sample events for testing."""
    events = [
        Event(
            session_id=test_session.id,
            event_type=EventType.SCENE_CHANGE,
            actor_role="kp",
            payload={"old_scene": "intro", "new_scene": "library"},
            visibility=VisibilityLevel.PUBLIC,
            description="Moved to the library",
            timestamp=datetime.utcnow() - timedelta(hours=2),
        ),
        Event(
            session_id=test_session.id,
            event_type=EventType.ROLL,
            actor_role="player",
            character_id=test_character.id,
            payload={"skill": "spot_hidden", "roll": 25, "target": 50},
            visibility=VisibilityLevel.PUBLIC,
            description="Rolled Spot Hidden: 25",
            timestamp=datetime.utcnow() - timedelta(hours=1),
        ),
        Event(
            session_id=test_session.id,
            event_type=EventType.SAN_CHECK,
            character_id=test_character.id,
            actor_role="kp",
            payload={"reason": "saw creature", "difficulty": "regular", "roll": 30},
            visibility=VisibilityLevel.PUBLIC,
            description="SAN check: saw creature",
            timestamp=datetime.utcnow() - timedelta(minutes=30),
        ),
    ]
    test_db.add_all(events)
    test_db.commit()

    # Refresh to get IDs
    for event in events:
        test_db.refresh(event)

    return events


class TestSummaryModel:
    """Test Summary model basics."""

    def test_create_summary(self, test_db, test_session):
        """Test creating a summary."""
        summary = Summary(
            session_id=test_session.id,
            summary_type=SummaryType.CHECKPOINT.value,
            narrative_summary="The investigators explored the library and found clues.",
            key_events=[
                {
                    "event_type": "scene_change",
                    "description": "Entered the library",
                    "event_id": str(uuid.uuid4()),
                }
            ],
            state_changes=[
                {
                    "character_id": "1",
                    "hp_change": 0,
                    "san_change": -5,
                    "luck_change": 0,
                }
            ],
            discovered_clues=["Ancient book", "Strange symbols"],
            pending_promises=[],
            total_events=10,
        )

        test_db.add(summary)
        test_db.commit()
        test_db.refresh(summary)

        assert summary.id is not None
        assert summary.session_id == test_session.id
        assert summary.summary_type == SummaryType.CHECKPOINT.value
        assert summary.narrative_summary == "The investigators explored the library and found clues."
        assert len(summary.discovered_clues) == 2

    def test_summary_to_dict(self, test_db, test_session):
        """Test converting summary to dictionary."""
        summary = Summary(
            session_id=test_session.id,
            summary_type=SummaryType.SCENE.value,
            narrative_summary="Scene summary",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
        )

        test_db.add(summary)
        test_db.commit()
        test_db.refresh(summary)

        data = summary.to_dict()

        assert data["id"] == str(summary.id)
        assert data["session_id"] == str(test_session.id)
        assert data["summary_type"] == SummaryType.SCENE.value
        assert data["is_deleted"] is False

    def test_summary_relationships(self, test_db, test_session, test_checkpoint):
        """Test summary relationships with session and checkpoint."""
        summary = Summary(
            session_id=test_session.id,
            checkpoint_id=test_checkpoint.id,
            summary_type=SummaryType.CHECKPOINT.value,
            narrative_summary="Test",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
        )

        test_db.add(summary)
        test_db.commit()

        assert summary.session == test_session
        assert summary.checkpoint == test_checkpoint


class TestSummaryFactoryMethod:
    """Test Summary.create_from_events factory method."""

    def test_create_from_events_basic(self, test_db, test_session, sample_events):
        """Test creating summary from events list."""
        summary = Summary.create_from_events(
            session_id=test_session.id,
            summary_type=SummaryType.SCENE,
            narrative_summary="Explored the library",
            events=sample_events,
            scene_id="library",
            scene_name="The Old Library",
        )

        test_db.add(summary)
        test_db.commit()

        assert summary.summary_type == SummaryType.SCENE.value
        assert summary.narrative_summary == "Explored the library"
        assert summary.total_events == len(sample_events)
        assert summary.scene_id == "library"
        assert summary.scene_name == "The Old Library"

    def test_extract_key_events(self, test_db, test_session, sample_events):
        """Test that key events are extracted."""
        summary = Summary.create_from_events(
            session_id=test_session.id,
            summary_type=SummaryType.SESSION,
            narrative_summary="Session summary",
            events=sample_events,
        )

        test_db.add(summary)
        test_db.commit()
        test_db.refresh(summary)

        # Should extract scene_change and san_check as key events
        assert len(summary.key_events) > 0
        event_types = [e["event_type"] for e in summary.key_events]
        assert "scene_change" in event_types

    def test_event_counts(self, test_db, test_session, sample_events):
        """Test that events are counted by type."""
        summary = Summary.create_from_events(
            session_id=test_session.id,
            summary_type=SummaryType.CHECKPOINT,
            narrative_summary="Test",
            events=sample_events,
        )

        test_db.add(summary)
        test_db.commit()
        test_db.refresh(summary)

        assert summary.event_counts is not None
        assert summary.total_events == len(sample_events)

    def test_time_range_from_events(self, test_db, test_session, sample_events):
        """Test that time range is extracted from events."""
        summary = Summary.create_from_events(
            session_id=test_session.id,
            summary_type=SummaryType.SESSION,
            narrative_summary="Test",
            events=sample_events,
        )

        test_db.add(summary)
        test_db.commit()
        test_db.refresh(summary)

        assert summary.time_range_start is not None
        assert summary.time_range_end is not None
        assert summary.time_range_start <= summary.time_range_end

    def test_event_ids_captured(self, test_db, test_session, sample_events):
        """Test that first and last event IDs are captured."""
        summary = Summary.create_from_events(
            session_id=test_session.id,
            summary_type=SummaryType.CHECKPOINT,
            narrative_summary="Test",
            events=sample_events,
        )

        test_db.add(summary)
        test_db.commit()
        test_db.refresh(summary)

        assert summary.first_event_id is not None
        assert summary.last_event_id is not None
        assert summary.first_event_id != summary.last_event_id


class TestSummaryTypes:
    """Test different summary types."""

    def test_checkpoint_summary(self, test_db, test_session, test_checkpoint):
        """Test checkpoint summary type."""
        summary = Summary(
            session_id=test_session.id,
            checkpoint_id=test_checkpoint.id,
            summary_type=SummaryType.CHECKPOINT.value,
            narrative_summary="Checkpoint",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
        )

        test_db.add(summary)
        test_db.commit()

        assert summary.summary_type == SummaryType.CHECKPOINT.value
        assert summary.checkpoint_id == test_checkpoint.id

    def test_scene_summary(self, test_db, test_session):
        """Test scene summary type."""
        summary = Summary(
            session_id=test_session.id,
            summary_type=SummaryType.SCENE.value,
            scene_id="library",
            scene_name="The Library",
            narrative_summary="Scene in the library",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
        )

        test_db.add(summary)
        test_db.commit()

        assert summary.summary_type == SummaryType.SCENE.value
        assert summary.scene_id == "library"

    def test_session_summary(self, test_db, test_session):
        """Test full session summary type."""
        summary = Summary(
            session_id=test_session.id,
            summary_type=SummaryType.SESSION.value,
            narrative_summary="Full session recap",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
            total_events=50,
        )

        test_db.add(summary)
        test_db.commit()

        assert summary.summary_type == SummaryType.SESSION.value


class TestSummaryLifecycle:
    """Test summary lifecycle operations."""

    def test_mark_deleted(self, test_db, test_session):
        """Test marking summary as deleted."""
        summary = Summary(
            session_id=test_session.id,
            summary_type=SummaryType.CHECKPOINT.value,
            narrative_summary="Test",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
        )

        test_db.add(summary)
        test_db.commit()

        summary.mark_deleted()
        test_db.commit()
        test_db.refresh(summary)

        assert summary.is_deleted == "true"
        assert summary.deleted_at is not None

    def test_is_active(self, test_db, test_session):
        """Test is_active method."""
        summary = Summary(
            session_id=test_session.id,
            summary_type=SummaryType.CHECKPOINT.value,
            narrative_summary="Test",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
        )

        test_db.add(summary)
        test_db.commit()

        assert summary.is_active() is True

        summary.is_deleted = "true"
        test_db.commit()
        test_db.refresh(summary)

        assert summary.is_active() is False


class TestSummaryQualityMetrics:
    """Test summary quality metrics."""

    def test_quality_score(self, test_db, test_session):
        """Test summary quality score."""
        summary = Summary(
            session_id=test_session.id,
            summary_type=SummaryType.CHECKPOINT.value,
            narrative_summary="High quality summary",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
            summary_quality_score=0.9,
            completeness_ratio=0.95,
        )

        test_db.add(summary)
        test_db.commit()

        assert summary.summary_quality_score == 0.9
        assert summary.completeness_ratio == 0.95

    def test_user_feedback(self, test_db, test_session):
        """Test user rating and feedback."""
        summary = Summary(
            session_id=test_session.id,
            summary_type=SummaryType.SESSION.value,
            narrative_summary="Session summary",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
            user_rating=5,
            user_feedback="Excellent summary!",
        )

        test_db.add(summary)
        test_db.commit()

        assert summary.user_rating == 5
        assert summary.user_feedback == "Excellent summary!"


class TestSummaryGenerationMetadata:
    """Test summary generation metadata."""

    def test_ai_generated_summary(self, test_db, test_session):
        """Test AI-generated summary metadata."""
        summary = Summary(
            session_id=test_session.id,
            summary_type=SummaryType.CHECKPOINT.value,
            narrative_summary="AI generated",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
            generated_by="ai",
            model_used="gpt-4o",
            generation_method="llm",
        )

        test_db.add(summary)
        test_db.commit()

        assert summary.generated_by == "ai"
        assert summary.model_used == "gpt-4o"
        assert summary.generation_method == "llm"

    def test_manual_summary(self, test_db, test_session):
        """Test manually created summary."""
        summary = Summary(
            session_id=test_session.id,
            summary_type=SummaryType.SCENE.value,
            narrative_summary="Manual summary",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
            generated_by="manual",
        )

        test_db.add(summary)
        test_db.commit()

        assert summary.generated_by == "manual"
        assert summary.model_used is None


class TestSummaryQuery:
    """Test querying summaries."""

    def test_query_by_summary_type(self, test_db, test_session):
        """Test querying summaries by type."""
        checkpoint_summary = Summary(
            session_id=test_session.id,
            summary_type=SummaryType.CHECKPOINT.value,
            narrative_summary="Checkpoint",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
        )
        scene_summary = Summary(
            session_id=test_session.id,
            summary_type=SummaryType.SCENE.value,
            narrative_summary="Scene",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
        )

        test_db.add_all([checkpoint_summary, scene_summary])
        test_db.commit()

        # Query for checkpoint summaries only
        checkpoints = test_db.query(Summary).filter(
            Summary.session_id == test_session.id,
            Summary.summary_type == SummaryType.CHECKPOINT.value
        ).all()

        assert len(checkpoints) == 1
        assert checkpoints[0].summary_type == SummaryType.CHECKPOINT.value

    def test_query_by_time_range(self, test_db, test_session):
        """Test querying summaries by time range."""
        base_time = datetime.utcnow()

        summary1 = Summary(
            session_id=test_session.id,
            summary_type=SummaryType.CHECKPOINT.value,
            narrative_summary="Summary 1",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
            time_range_start=base_time - timedelta(hours=2),
            time_range_end=base_time - timedelta(hours=1),
        )
        summary2 = Summary(
            session_id=test_session.id,
            summary_type=SummaryType.CHECKPOINT.value,
            narrative_summary="Summary 2",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
            time_range_start=base_time - timedelta(minutes=30),
            time_range_end=base_time,
        )

        test_db.add_all([summary1, summary2])
        test_db.commit()

        # Query for summaries in recent time range
        recent = test_db.query(Summary).filter(
            Summary.session_id == test_session.id,
            Summary.time_range_start >= base_time - timedelta(hours=1)
        ).all()

        assert len(recent) == 1
        assert recent[0].narrative_summary == "Summary 2"

    def test_order_summaries_by_created_at(self, test_db, test_session):
        """Test ordering summaries by creation time."""
        base_time = datetime.utcnow()

        summary1 = Summary(
            session_id=test_session.id,
            summary_type=SummaryType.CHECKPOINT.value,
            narrative_summary="Older",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
            created_at=base_time - timedelta(hours=1),
        )
        summary2 = Summary(
            session_id=test_session.id,
            summary_type=SummaryType.CHECKPOINT.value,
            narrative_summary="Newer",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
            created_at=base_time,
        )

        test_db.add_all([summary1, summary2])
        test_db.commit()

        # Query newest first
        summaries = test_db.query(Summary).filter(
            Summary.session_id == test_session.id
        ).order_by(Summary.created_at.desc()).all()

        assert summaries[0].narrative_summary == "Newer"
        assert summaries[1].narrative_summary == "Older"
