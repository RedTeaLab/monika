"""Tests for Checkpoint model with M3 Memory Web extensions."""
import uuid
from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.database import Base
from src.models.checkpoint import Checkpoint, CheckpointType
from src.models.user import User
from src.models.session import GameSession


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


@pytest.fixture
def test_user(test_db):
    """Create a test user."""
    user = User(username="testuser", email="test@example.com", hashed_password="hash")
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture
def test_session(test_db, test_user):
    """Create a test game session."""
    session = GameSession(
        owner_id=test_user.id,
        name="Test Session",
        current_scene_id="scene_library",
        current_scene_name="The Library",
        location="Miskatonic University",
    )
    test_db.add(session)
    test_db.commit()
    test_db.refresh(session)
    return session


class TestCheckpointModel:
    """Test Checkpoint model with M3 extensions."""

    def test_create_checkpoint_with_m3_fields(self, test_db, test_session):
        """Test creating a checkpoint with M3 Memory Web fields."""
        checkpoint = Checkpoint(
            session_id=test_session.id,
            checkpoint_type=CheckpointType.MANUAL.value,
            session_state={"current_scene": "The Library", "location": "Miskatonic University"},
            character_states={"1": {"hp": 10, "san": 55}},
            world_state={"timer": 10},
            narrative_state={"clues": []},
            last_event_id=uuid.uuid4(),
            last_event_sequence=42,
            scene_id="scene_library",
            scene_name="The Library",
            round_number=5,
            notes="Mid-combat checkpoint",
            created_by_player_id=test_session.owner_id,
        )
        test_db.add(checkpoint)
        test_db.commit()
        test_db.refresh(checkpoint)

        assert checkpoint.id is not None
        assert checkpoint.session_id == test_session.id
        assert checkpoint.checkpoint_type == CheckpointType.MANUAL.value
        assert checkpoint.last_event_sequence == 42
        assert checkpoint.scene_id == "scene_library"
        assert checkpoint.scene_name == "The Library"
        assert checkpoint.round_number == 5
        assert checkpoint.notes == "Mid-combat checkpoint"

    def test_checkpoint_to_dict_includes_m3_fields(self, test_db, test_session):
        """Test that to_dict includes M3 Memory Web fields."""
        checkpoint = Checkpoint(
            session_id=test_session.id,
            checkpoint_type=CheckpointType.AUTO.value,
            session_state={},
            character_states={},
            last_event_sequence=100,
            scene_id="scene_corridor",
            scene_name="Dark Corridor",
            round_number=3,
        )
        test_db.add(checkpoint)
        test_db.commit()
        test_db.refresh(checkpoint)

        checkpoint_dict = checkpoint.to_dict()

        assert checkpoint_dict["last_event_sequence"] == 100
        assert checkpoint_dict["scene_id"] == "scene_corridor"
        assert checkpoint_dict["scene_name"] == "Dark Corridor"
        assert checkpoint_dict["round_number"] == 3

    def test_checkpoint_repr_includes_scene_info(self, test_db, test_session):
        """Test that __repr__ includes scene information."""
        checkpoint = Checkpoint(
            session_id=test_session.id,
            checkpoint_type=CheckpointType.PAUSE.value,
            session_state={},
            character_states={},
            last_event_sequence=15,
            scene_name="The Study",
        )
        test_db.add(checkpoint)
        test_db.commit()
        test_db.refresh(checkpoint)

        repr_str = repr(checkpoint)
        assert "scene=The Study" in repr_str
        assert "seq=15" in repr_str

    def test_checkpoint_create_from_session_with_m3_fields(self, test_db, test_session):
        """Test create_from_session classmethod with M3 fields."""
        session_state = {"current_scene": "The Library"}
        character_states = {"1": {"hp": 10, "san": 55}}
        world_state = {"timer": 10}
        narrative_state = {"clues": []}

        checkpoint = Checkpoint.create_from_session(
            session_id=test_session.id,
            session_state=session_state,
            character_states=character_states,
            world_state=world_state,
            narrative_state=narrative_state,
            checkpoint_type=CheckpointType.AUTO,
            last_event_id=uuid.uuid4(),
            last_event_sequence=25,
            scene_id="scene_library",
            scene_name="The Library",
            round_number=2,
            trigger_event_type="combat_end",
            trigger_reason="Combat ended automatically",
            auto_created=True,
        )

        test_db.add(checkpoint)
        test_db.commit()
        test_db.refresh(checkpoint)

        assert checkpoint.session_id == test_session.id
        assert checkpoint.checkpoint_type == CheckpointType.AUTO.value
        assert checkpoint.last_event_sequence == 25
        assert checkpoint.scene_id == "scene_library"
        assert checkpoint.scene_name == "The Library"
        assert checkpoint.round_number == 2
        assert checkpoint.trigger_event_type == "combat_end"
        assert checkpoint.trigger_reason == "Combat ended automatically"
        assert checkpoint.auto_created == "true"

    def test_checkpoint_soft_delete(self, test_db, test_session, test_user):
        """Test checkpoint soft delete functionality."""
        checkpoint = Checkpoint(
            session_id=test_session.id,
            checkpoint_type=CheckpointType.MANUAL.value,
            session_state={},
            character_states={},
            created_by_player_id=test_user.id,
        )
        test_db.add(checkpoint)
        test_db.commit()
        test_db.refresh(checkpoint)

        assert checkpoint.is_active() is True

        checkpoint.mark_deleted(test_user.id)
        test_db.commit()
        test_db.refresh(checkpoint)

        assert checkpoint.is_active() is False
        assert checkpoint.is_deleted == "true"
        assert checkpoint.deleted_at is not None
        assert checkpoint.deleted_by_player_id == test_user.id

    def test_checkpoint_restore(self, test_db, test_session, test_user):
        """Test restoring a soft-deleted checkpoint."""
        checkpoint = Checkpoint(
            session_id=test_session.id,
            checkpoint_type=CheckpointType.MANUAL.value,
            session_state={},
            character_states={},
            created_by_player_id=test_user.id,
        )
        test_db.add(checkpoint)
        test_db.commit()

        # Mark as deleted
        checkpoint.mark_deleted(test_user.id)
        test_db.commit()
        test_db.refresh(checkpoint)
        assert checkpoint.is_active() is False

        # Restore
        checkpoint.restore()
        test_db.commit()
        test_db.refresh(checkpoint)

        assert checkpoint.is_active() is True
        assert checkpoint.is_deleted == "false"
        assert checkpoint.deleted_at is None
        assert checkpoint.deleted_by_player_id is None

    def test_checkpoint_query_by_last_event_sequence(self, test_db, test_session):
        """Test querying checkpoints by last_event_sequence."""
        # Create multiple checkpoints
        test_db.add(
            Checkpoint(
                session_id=test_session.id,
                checkpoint_type=CheckpointType.AUTO.value,
                session_state={},
                character_states={},
                last_event_sequence=10,
            )
        )
        test_db.add(
            Checkpoint(
                session_id=test_session.id,
                checkpoint_type=CheckpointType.AUTO.value,
                session_state={},
                character_states={},
                last_event_sequence=20,
            )
        )
        test_db.add(
            Checkpoint(
                session_id=test_session.id,
                checkpoint_type=CheckpointType.AUTO.value,
                session_state={},
                character_states={},
                last_event_sequence=30,
            )
        )
        test_db.commit()

        # Query checkpoints after sequence 15
        checkpoints = (
            test_db.query(Checkpoint)
            .filter(Checkpoint.session_id == test_session.id)
            .filter(Checkpoint.last_event_sequence > 15)
            .order_by(Checkpoint.last_event_sequence.asc())
            .all()
        )

        assert len(checkpoints) == 2
        assert checkpoints[0].last_event_sequence == 20
        assert checkpoints[1].last_event_sequence == 30

    def test_checkpoint_query_by_scene(self, test_db, test_session):
        """Test querying checkpoints by scene_id."""
        # Create checkpoints in different scenes
        test_db.add(
            Checkpoint(
                session_id=test_session.id,
                checkpoint_type=CheckpointType.AUTO.value,
                session_state={},
                character_states={},
                scene_id="scene_library",
                scene_name="The Library",
            )
        )
        test_db.add(
            Checkpoint(
                session_id=test_session.id,
                checkpoint_type=CheckpointType.AUTO.value,
                session_state={},
                character_states={},
                scene_id="scene_corridor",
                scene_name="Dark Corridor",
            )
        )
        test_db.add(
            Checkpoint(
                session_id=test_session.id,
                checkpoint_type=CheckpointType.AUTO.value,
                session_state={},
                character_states={},
                scene_id="scene_library",
                scene_name="The Library",
            )
        )
        test_db.commit()

        # Query checkpoints in library scene
        library_checkpoints = (
            test_db.query(Checkpoint)
            .filter(Checkpoint.session_id == test_session.id)
            .filter(Checkpoint.scene_id == "scene_library")
            .all()
        )

        assert len(library_checkpoints) == 2
        assert all(cp.scene_id == "scene_library" for cp in library_checkpoints)

    def test_checkpoint_get_latest_by_session_and_sequence(self, test_db, test_session):
        """Test getting the latest checkpoint for a session based on event sequence."""
        # Create checkpoints
        cp1 = Checkpoint(
            session_id=test_session.id,
            checkpoint_type=CheckpointType.AUTO.value,
            session_state={},
            character_states={},
            last_event_sequence=10,
            scene_name="Scene 1",
        )
        test_db.add(cp1)

        cp2 = Checkpoint(
            session_id=test_session.id,
            checkpoint_type=CheckpointType.AUTO.value,
            session_state={},
            character_states={},
            last_event_sequence=20,
            scene_name="Scene 2",
        )
        test_db.add(cp2)

        cp3 = Checkpoint(
            session_id=test_session.id,
            checkpoint_type=CheckpointType.MANUAL.value,
            session_state={},
            character_states={},
            last_event_sequence=15,
            scene_name="Scene 1.5",
        )
        test_db.add(cp3)
        test_db.commit()

        # Get latest checkpoint by sequence
        latest = (
            test_db.query(Checkpoint)
            .filter(Checkpoint.session_id == test_session.id)
            .filter(Checkpoint.last_event_sequence.isnot(None))
            .order_by(Checkpoint.last_event_sequence.desc())
            .first()
        )

        assert latest is not None
        assert latest.last_event_sequence == 20
        assert latest.scene_name == "Scene 2"

    def test_checkpoint_auto_created_boolean_conversion(self, test_db, test_session):
        """Test auto_created field converts correctly to/from boolean."""
        checkpoint = Checkpoint(
            session_id=test_session.id,
            checkpoint_type=CheckpointType.AUTO.value,
            session_state={},
            character_states={},
            auto_created="true",
        )
        test_db.add(checkpoint)
        test_db.commit()
        test_db.refresh(checkpoint)

        checkpoint_dict = checkpoint.to_dict()
        assert checkpoint_dict["auto_created"] is True

        # Test with false
        checkpoint.auto_created = "false"
        test_db.commit()
        test_db.refresh(checkpoint)

        checkpoint_dict = checkpoint.to_dict()
        assert checkpoint_dict["auto_created"] is False
