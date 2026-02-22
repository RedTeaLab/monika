"""Tests for checkpoint and resume functionality."""
import uuid
from datetime import datetime, timedelta
from unittest.mock import Mock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.database import Base
from src.models.user import User
from src.models.character import Character
from src.models.session import GameSession, SessionState
from src.models.event import Event, EventType, VisibilityLevel
from src.services.session import (
    SessionService,
    Checkpoint,
    ConflictResolution,
    ResumeResult,
)


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
        world_state={"timer": 10, "threat_level": "low"},
        narrative_state={"leads": [], "clues": []},
        character_states={str(test_character.id): {"hp": 10, "san": 55}},
    )
    test_db.add(session)
    test_db.commit()
    test_db.refresh(session)
    return session


class TestSessionServicePause:
    """Test session pause functionality."""

    def test_pause_active_session(self, test_db, test_session, test_user):
        """Test pausing an active session."""
        service = SessionService(test_db)

        paused_session = service.pause_session(test_session.id, test_user.id)

        assert paused_session.state == SessionState.PAUSED.value
        assert paused_session.paused_at is not None
        assert paused_session.id == test_session.id

        # Check database state
        test_db.refresh(test_session)
        assert test_session.state == SessionState.PAUSED.value

    def test_pause_already_paused_session(self, test_db, test_session, test_user):
        """Test that pausing an already paused session raises error."""
        service = SessionService(test_db)

        # First pause
        service.pause_session(test_session.id, test_user.id)

        # Second pause should fail
        with pytest.raises(ValueError, match="Cannot pause session in state"):
            service.pause_session(test_session.id, test_user.id)

    def test_pause_nonexistent_session(self, test_db, test_user):
        """Test pausing a non-existent session raises error."""
        service = SessionService(test_db)

        with pytest.raises(ValueError, match="Session not found"):
            service.pause_session(uuid.uuid4(), test_user.id)

    def test_pause_creates_event_log(self, test_db, test_session, test_user):
        """Test that pausing creates an event log entry."""
        service = SessionService(test_db)

        service.pause_session(test_session.id, test_user.id)

        # Check for pause event
        events = test_db.query(Event).filter(
            Event.session_id == test_session.id,
            Event.event_type == EventType.SESSION_END,
        ).all()

        assert len(events) == 1
        assert "paused" in events[0].description.lower()


class TestSessionServiceResume:
    """Test session resume functionality."""

    def test_resume_paused_session(self, test_db, test_session, test_user):
        """Test resuming a paused session."""
        service = SessionService(test_db)

        # First pause the session
        service.pause_session(test_session.id, test_user.id)

        # Then resume it
        result = service.resume_session(
            test_session.id,
            test_user.id,
            ConflictResolution.KEEP_LATEST,
        )

        assert result.success is True
        assert result.session.state == SessionState.ACTIVE.value
        assert result.session.paused_at is None
        assert "resumed" in result.message.lower()

    def test_resume_ended_session_fails(self, test_db, test_session, test_user):
        """Test that resuming an ended session fails."""
        service = SessionService(test_db)

        # End the session
        test_session.state = SessionState.ENDED.value
        test_db.commit()

        result = service.resume_session(
            test_session.id,
            test_user.id,
            ConflictResolution.KEEP_LATEST,
        )

        assert result.success is False
        assert "ended" in result.message.lower()

    def test_resume_nonexistent_session(self, test_db, test_user):
        """Test resuming a non-existent session."""
        service = SessionService(test_db)

        result = service.resume_session(
            uuid.uuid4(),
            test_user.id,
            ConflictResolution.KEEP_LATEST,
        )

        assert result.success is False
        assert "not found" in result.message.lower()


class TestCheckpointCreation:
    """Test checkpoint creation and management."""

    def test_create_checkpoint(self, test_db, test_session, test_user):
        """Test creating a checkpoint."""
        service = SessionService(test_db)

        checkpoint = service.create_checkpoint(
            test_session.id,
            test_user.id,
            notes="Test checkpoint",
        )

        assert checkpoint.session_id == str(test_session.id)
        assert checkpoint.notes == "Test checkpoint"
        assert checkpoint.session_state["current_scene_id"] == "scene_1"
        assert checkpoint.session_state["location"] == "Miskatonic University"
        assert isinstance(checkpoint.timestamp, datetime)

    def test_checkpoint_saves_character_states(self, test_db, test_session, test_user, test_character):
        """Test that checkpoint includes character states."""
        service = SessionService(test_db)

        checkpoint = service.create_checkpoint(test_session.id, test_user.id)

        assert test_character.id in checkpoint.character_states
        assert checkpoint.character_states[test_character.id]["hp"] == 10
        assert checkpoint.character_states[test_character.id]["san"] == 55

    def test_checkpoint_includes_last_event_id(self, test_db, test_session, test_user):
        """Test that checkpoint includes the last event ID."""
        service = SessionService(test_db)

        # Create some events
        event = Event(
            session_id=test_session.id,
            event_type=EventType.MESSAGE,
            actor_role="kp",
            payload={"text": "Test message"},
            visibility=VisibilityLevel.PUBLIC,
        )
        test_db.add(event)
        test_db.commit()

        checkpoint = service.create_checkpoint(test_session.id, test_user.id)

        assert checkpoint.event_id == str(event.id)

    def test_get_latest_checkpoint(self, test_db, test_session, test_user):
        """Test retrieving the latest checkpoint."""
        service = SessionService(test_db)

        # Create multiple checkpoints
        service.create_checkpoint(test_session.id, test_user.id, notes="First")
        service.create_checkpoint(test_session.id, test_user.id, notes="Second")

        latest = service.get_latest_checkpoint(test_session.id)

        assert latest is not None
        assert latest.notes == "Second"

    def test_get_checkpoints_with_limit(self, test_db, test_session, test_user):
        """Test listing checkpoints with limit."""
        service = SessionService(test_db)

        # Create multiple checkpoints
        for i in range(5):
            service.create_checkpoint(test_session.id, test_user.id, notes=f"Checkpoint {i}")

        checkpoints = service.get_checkpoints(test_session.id, limit=3)

        assert len(checkpoints) == 3
        # Should be newest first
        assert "Checkpoint 4" in checkpoints[0].notes
        assert "Checkpoint 2" in checkpoints[2].notes

    def test_checkpoint_max_retention(self, test_db, test_session, test_user):
        """Test that only last 10 checkpoints are kept."""
        service = SessionService(test_db)

        # Create 15 checkpoints
        for i in range(15):
            service.create_checkpoint(test_session.id, test_user.id, notes=f"Checkpoint {i}")

        checkpoints = service.get_checkpoints(test_session.id, limit=20)

        assert len(checkpoints) == 10
        # Should keep the latest 10
        assert "Checkpoint 14" in checkpoints[0].notes
        assert "Checkpoint 5" in checkpoints[9].notes

    def test_checkpoint_nonexistent_session(self, test_db, test_user):
        """Test creating checkpoint for non-existent session."""
        service = SessionService(test_db)

        with pytest.raises(ValueError, match="Session not found"):
            service.create_checkpoint(uuid.uuid4(), test_user.id)


class TestConflictResolution:
    """Test conflict detection and resolution."""

    def test_detect_scene_change_conflict(self, test_db, test_session, test_user, test_character):
        """Test detection of scene change conflicts."""
        service = SessionService(test_db)

        # Create a checkpoint
        checkpoint = service.create_checkpoint(test_session.id, test_user.id)

        # Change scene in session
        test_session.current_scene_id = "scene_2"
        test_db.commit()

        # Create scene change event
        event = Event(
            session_id=test_session.id,
            event_type=EventType.SCENE_CHANGE,
            actor_role="kp",
            payload={"old_scene": "scene_1", "new_scene": "scene_2"},
            visibility=VisibilityLevel.PUBLIC,
        )
        test_db.add(event)
        test_db.commit()

        # Resume with conflict detection
        result = service.resume_session(
            test_session.id,
            test_user.id,
            ConflictResolution.KEEP_LATEST,
        )

        # Should detect the conflict
        assert len(result.conflicts) > 0
        assert result.conflicts[0]["type"] == "scene_change"

    def test_keep_checkpoint_resolution(self, test_db, test_session, test_user):
        """Test that KEEP_CHECKPOINT reverts to checkpoint state."""
        service = SessionService(test_db)

        # Create checkpoint with original scene
        original_scene = test_session.current_scene_id
        checkpoint = service.create_checkpoint(test_session.id, test_user.id)

        # Change scene
        test_session.current_scene_id = "scene_2"
        test_db.commit()

        # Resume with KEEP_CHECKPOINT
        result = service.resume_session(
            test_session.id,
            test_user.id,
            ConflictResolution.KEEP_CHECKPOINT,
        )

        assert result.success is True
        # Session should be reverted to checkpoint state
        assert result.session.current_scene_id == original_scene

    def test_keep_latest_resolution(self, test_db, test_session, test_user):
        """Test that KEEP_LATEST preserves current state."""
        service = SessionService(test_db)

        # Create checkpoint
        service.create_checkpoint(test_session.id, test_user.id)

        # Change scene
        test_session.current_scene_id = "scene_2"
        test_db.commit()

        # Resume with KEEP_LATEST
        result = service.resume_session(
            test_session.id,
            test_user.id,
            ConflictResolution.KEEP_LATEST,
        )

        assert result.success is True
        # Session should keep current state
        assert result.session.current_scene_id == "scene_2"


class TestIncrementalEventSync:
    """Test incremental event synchronization on resume."""

    def test_events_since_checkpoint(self, test_db, test_session, test_user):
        """Test retrieving events that occurred after checkpoint."""
        service = SessionService(test_db)

        # Create checkpoint
        checkpoint = service.create_checkpoint(test_session.id, test_user.id)

        # Create new events after checkpoint
        base_time = datetime.utcnow()
        event1 = Event(
            session_id=test_session.id,
            event_type=EventType.ROLL,
            actor_role="player",
            payload={"skill": "spot_hidden", "roll": 25},
            visibility=VisibilityLevel.PUBLIC,
            timestamp=base_time + timedelta(seconds=1),
        )
        event2 = Event(
            session_id=test_session.id,
            event_type=EventType.MESSAGE,
            actor_role="kp",
            payload={"text": "Something stirs in the darkness"},
            visibility=VisibilityLevel.PUBLIC,
            timestamp=base_time + timedelta(seconds=2),
        )
        test_db.add_all([event1, event2])
        test_db.commit()

        # Resume should include new events (plus any auto-created events like checkpoint event)
        result = service.resume_session(
            test_session.id,
            test_user.id,
            ConflictResolution.KEEP_LATEST,
        )

        # At minimum, we should have our 2 events
        event_types = [e.event_type for e in result.new_events]
        assert EventType.ROLL in event_types
        assert EventType.MESSAGE in event_types
        assert len(result.new_events) >= 2

    def test_empty_event_list_on_first_resume(self, test_db, test_session, test_user):
        """Test that first resume has no new events."""
        service = SessionService(test_db)

        # Resume without creating checkpoint first
        result = service.resume_session(
            test_session.id,
            test_user.id,
            ConflictResolution.KEEP_LATEST,
        )

        assert len(result.new_events) == 0


class TestAutoCheckpointStrategy:
    """Test automatic checkpoint creation strategies."""

    def test_auto_checkpoint_on_combat_start(self, test_db, test_session, test_user):
        """Test auto-checkpoint on combat start."""
        service = SessionService(test_db)

        checkpoint = service.auto_checkpoint(test_session.id, EventType.COMBAT_START)

        assert checkpoint is not None
        assert checkpoint.session_id == str(test_session.id)
        assert "Auto-checkpoint" in checkpoint.notes

    def test_auto_checkpoint_on_scene_change(self, test_db, test_session, test_user):
        """Test auto-checkpoint on scene change."""
        service = SessionService(test_db)

        checkpoint = service.auto_checkpoint(test_session.id, EventType.SCENE_CHANGE)

        assert checkpoint is not None
        assert checkpoint.session_id == str(test_session.id)

    def test_no_auto_checkpoint_on_roll(self, test_db, test_session, test_user):
        """Test that regular rolls don't trigger auto-checkpoint."""
        service = SessionService(test_db)

        checkpoint = service.auto_checkpoint(test_session.id, EventType.ROLL)

        assert checkpoint is None

    def test_auto_checkpoint_on_san_check(self, test_db, test_session, test_user):
        """Test auto-checkpoint on SAN check."""
        service = SessionService(test_db)

        checkpoint = service.auto_checkpoint(test_session.id, EventType.SAN_CHECK)

        assert checkpoint is not None


class TestGetPausedSessions:
    """Test listing paused sessions."""

    def test_list_paused_sessions(self, test_db, test_user, test_session):
        """Test retrieving all paused sessions for a user."""
        service = SessionService(test_db)

        # Create and pause a session
        service.pause_session(test_session.id, test_user.id)

        # Create another active session
        session2 = GameSession(
            owner_id=test_user.id,
            name="Active Session",
            state=SessionState.ACTIVE.value,
            current_scene_id="scene_1",
        )
        test_db.add(session2)
        test_db.commit()

        paused = service.get_paused_sessions(test_user.id)

        assert len(paused) == 1
        assert paused[0].id == test_session.id
        assert paused[0].state == SessionState.PAUSED.value

    def test_empty_list_when_no_paused_sessions(self, test_db, test_user):
        """Test getting paused sessions when none exist."""
        service = SessionService(test_db)

        paused = service.get_paused_sessions(test_user.id)

        assert len(paused) == 0


class TestCheckpointToDict:
    """Test Checkpoint serialization."""

    def test_checkpoint_to_dict(self):
        """Test converting checkpoint to dictionary."""
        checkpoint = Checkpoint(
            id=str(uuid.uuid4()),
            session_id=str(uuid.uuid4()),
            timestamp=datetime.utcnow(),
            session_state={"scene": "scene_1"},
            character_states={},
            notes="Test checkpoint",
        )

        data = checkpoint.to_dict()

        assert data["id"] == checkpoint.id
        assert data["session_id"] == checkpoint.session_id
        assert data["notes"] == "Test checkpoint"
        assert data["session_state"]["scene"] == "scene_1"


class TestResumeResultToDict:
    """Test ResumeResult serialization."""

    def test_resume_result_to_dict(self, test_session):
        """Test converting resume result to dictionary."""
        result = ResumeResult(
            success=True,
            session=test_session,
            checkpoint=None,
            new_events=[],
            conflicts=[],
            message="Resumed successfully",
        )

        data = result.to_dict()

        assert data["success"] is True
        assert data["session"] is not None
        assert data["message"] == "Resumed successfully"
        assert data["conflicts"] == []
