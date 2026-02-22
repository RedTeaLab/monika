"""Tests for Snapshot Service."""

import uuid
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.database import Base
from src.models.session import GameSession
from src.models.character import Character
from src.models.user import User
from src.models.checkpoint import Checkpoint, CheckpointType
from src.schemas.state_snapshot import (
    SnapshotType,
    CharacterSnapshot,
    WorldStateSnapshot,
    NarrativeStateSnapshot,
    StateSnapshot,
)
from src.services.snapshot import SnapshotService


# Test fixtures
@pytest.fixture
def test_db():
    """Create an in-memory test database."""
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
def test_character(test_db, test_user):
    """Create a test character."""
    character = Character(
        owner_id=test_user.id,
        name="Test Investigator",
        str=50,
        con=50,
        dex=50,
        app=50,
        pow=50,
        int=50,
        siz=50,
        edu=50,
        hp=10,
        mp=10,
        san=50,
        max_san=50,
        luck=50,
        skills={"spot": 50, "listen": 40},
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
        state="active",
        current_scene_id="scene_1",
        current_scene_name="The Beginning",
        location="Arkham",
        world_state={"time": "evening", "weather": "rainy"},
        character_states={
            str(test_character.id): {
                "hp": 10,
                "max_hp": 10,
                "mp": 10,
                "max_mp": 10,
                "san": 50,
                "max_san": 50,
                "luck": 50,
            }
        },
        narrative_state={"leads": [], "clues": []},
    )
    test_db.add(session)
    test_db.commit()
    test_db.refresh(session)
    return session


class TestSnapshotService:
    """Test cases for SnapshotService."""

    def test_create_snapshot_manual_type(self, test_db, test_session, test_user):
        """Test creating a manual snapshot."""
        service = SnapshotService(test_db)

        snapshot = service.create_snapshot(
            session_id=test_session.id,
            snapshot_type=SnapshotType.MANUAL,
            name="Test Snapshot",
            description="A test snapshot",
            created_by=test_user.id,
        )

        assert snapshot is not None
        assert snapshot.session_id == str(test_session.id)
        assert snapshot.name == "Test Snapshot"
        assert snapshot.description == "A test snapshot"
        assert snapshot.snapshot_type == SnapshotType.MANUAL

    def test_create_snapshot_captures_session_state(self, test_db, test_session, test_user):
        """Test that snapshot captures session state correctly."""
        service = SnapshotService(test_db)

        snapshot = service.create_snapshot(
            session_id=test_session.id,
            snapshot_type=SnapshotType.MANUAL,
            created_by=test_user.id,
        )

        # Verify session state is captured
        assert snapshot.world_state.scene_id == "scene_1"
        assert snapshot.world_state.scene_name == "The Beginning"
        assert snapshot.world_state.location == "Arkham"

    def test_create_snapshot_captures_character_state(
        self, test_db, test_session, test_user, test_character
    ):
        """Test that snapshot captures character states correctly."""
        service = SnapshotService(test_db)

        snapshot = service.create_snapshot(
            session_id=test_session.id,
            snapshot_type=SnapshotType.MANUAL,
            created_by=test_user.id,
        )

        # Verify character state is captured
        assert test_character.id in snapshot.character_states
        char_state = snapshot.character_states[test_character.id]
        assert char_state.hp == 10
        assert char_state.san == 50
        assert char_state.luck == 50

    def test_create_snapshot_captures_world_state(self, test_db, test_session, test_user):
        """Test that snapshot captures world state correctly."""
        service = SnapshotService(test_db)

        snapshot = service.create_snapshot(
            session_id=test_session.id,
            snapshot_type=SnapshotType.MANUAL,
            created_by=test_user.id,
        )

        # Verify world state is captured
        assert snapshot.world_state.scene_id == "scene_1"
        assert snapshot.world_state.scene_name == "The Beginning"
        assert snapshot.world_state.location == "Arkham"

    def test_create_snapshot_with_tags(self, test_db, test_session, test_user):
        """Test creating snapshot with tags."""
        service = SnapshotService(test_db)

        snapshot = service.create_snapshot(
            session_id=test_session.id,
            snapshot_type=SnapshotType.CHECKPOINT,
            tags=["important", "before_combat"],
            created_by=test_user.id,
        )

        assert "important" in snapshot.tags
        assert "before_combat" in snapshot.tags

    def test_get_snapshot(self, test_db, test_session, test_user):
        """Test retrieving a snapshot by ID."""
        service = SnapshotService(test_db)

        # Create a snapshot first
        created = service.create_snapshot(
            session_id=test_session.id,
            snapshot_type=SnapshotType.MANUAL,
            name="Test Snapshot",
            created_by=test_user.id,
        )

        # Retrieve it
        retrieved = service.get_snapshot(created.snapshot_id)

        assert retrieved is not None
        assert retrieved.snapshot_id == created.snapshot_id
        assert retrieved.name == "Test Snapshot"

    def test_get_snapshot_not_found(self, test_db, test_session):
        """Test retrieving non-existent snapshot returns None."""
        service = SnapshotService(test_db)

        result = service.get_snapshot(str(uuid.uuid4()))

        assert result is None

    def test_list_snapshots(self, test_db, test_session, test_user):
        """Test listing snapshots for a session."""
        service = SnapshotService(test_db)

        # Create multiple snapshots
        service.create_snapshot(
            session_id=test_session.id,
            snapshot_type=SnapshotType.MANUAL,
            name="Snapshot 1",
            created_by=test_user.id,
        )
        service.create_snapshot(
            session_id=test_session.id,
            snapshot_type=SnapshotType.CHECKPOINT,
            name="Snapshot 2",
            created_by=test_user.id,
        )
        service.create_snapshot(
            session_id=test_session.id,
            snapshot_type=SnapshotType.AUTO,
            name="Snapshot 3",
            created_by=test_user.id,
        )

        # List all snapshots
        snapshots = service.list_snapshots(session_id=test_session.id)

        assert len(snapshots) == 3

    def test_list_snapshots_with_type_filter(self, test_db, test_session, test_user):
        """Test filtering snapshots by type."""
        service = SnapshotService(test_db)

        service.create_snapshot(
            session_id=test_session.id,
            snapshot_type=SnapshotType.MANUAL,
            created_by=test_user.id,
        )
        service.create_snapshot(
            session_id=test_session.id,
            snapshot_type=SnapshotType.CHECKPOINT,
            created_by=test_user.id,
        )
        service.create_snapshot(
            session_id=test_session.id,
            snapshot_type=SnapshotType.CHECKPOINT,
            created_by=test_user.id,
        )

        # Filter by type
        manual_snapshots = service.list_snapshots(
            session_id=test_session.id,
            snapshot_type=SnapshotType.MANUAL,
        )
        checkpoint_snapshots = service.list_snapshots(
            session_id=test_session.id,
            snapshot_type=SnapshotType.CHECKPOINT,
        )

        assert len(manual_snapshots) == 1
        assert len(checkpoint_snapshots) == 2

    def test_list_snapshots_with_limit(self, test_db, test_session, test_user):
        """Test limiting number of snapshots returned."""
        service = SnapshotService(test_db)

        # Create 5 snapshots
        for i in range(5):
            service.create_snapshot(
                session_id=test_session.id,
                snapshot_type=SnapshotType.MANUAL,
                name=f"Snapshot {i}",
                created_by=test_user.id,
            )

        # Get only 2
        snapshots = service.list_snapshots(session_id=test_session.id, limit=2)

        assert len(snapshots) == 2

    def test_list_snapshots_empty_session(self, test_db, test_session):
        """Test listing snapshots for session with none."""
        service = SnapshotService(test_db)

        snapshots = service.list_snapshots(session_id=test_session.id)

        assert len(snapshots) == 0

    def test_get_latest_snapshot(self, test_db, test_session, test_user):
        """Test getting the latest snapshot."""
        service = SnapshotService(test_db)

        # Create multiple snapshots
        snap1 = service.create_snapshot(
            session_id=test_session.id,
            snapshot_type=SnapshotType.MANUAL,
            name="First",
            created_by=test_user.id,
        )
        snap2 = service.create_snapshot(
            session_id=test_session.id,
            snapshot_type=SnapshotType.CHECKPOINT,
            name="Second",
            created_by=test_user.id,
        )
        snap3 = service.create_snapshot(
            session_id=test_session.id,
            snapshot_type=SnapshotType.AUTO,
            name="Third",
            created_by=test_user.id,
        )

        latest = service.get_latest_snapshot(test_session.id)

        assert latest is not None
        assert latest.snapshot_id == snap3.snapshot_id

    def test_snapshot_session_not_found(self, test_db):
        """Test creating snapshot for non-existent session raises error."""
        service = SnapshotService(test_db)

        with pytest.raises(ValueError, match="Session .* not found"):
            service.create_snapshot(
                session_id=uuid.uuid4(),
                snapshot_type=SnapshotType.MANUAL,
                created_by=1,
            )

    def test_create_auto_snapshot(self, test_db, test_session, test_user):
        """Test creating an automatic snapshot."""
        service = SnapshotService(test_db)

        snapshot = service.create_snapshot(
            session_id=test_session.id,
            snapshot_type=SnapshotType.AUTO,
            name="Auto Save",
            description="Automatic checkpoint",
            created_by=test_user.id,
        )

        assert snapshot is not None
        assert snapshot.snapshot_type == SnapshotType.AUTO

    def test_create_session_start_snapshot(self, test_db, test_session, test_user):
        """Test creating a session start snapshot."""
        service = SnapshotService(test_db)

        snapshot = service.create_snapshot(
            session_id=test_session.id,
            snapshot_type=SnapshotType.SESSION_START,
            created_by=test_user.id,
        )

        assert snapshot is not None
        assert snapshot.snapshot_type == SnapshotType.SESSION_START


class TestSnapshotServiceIntegration:
    """Integration tests for SnapshotService with real database."""

    def test_snapshot_persists_to_database(self, test_db, test_session, test_user):
        """Test that snapshot is saved to database."""
        service = SnapshotService(test_db)

        snapshot = service.create_snapshot(
            session_id=test_session.id,
            snapshot_type=SnapshotType.MANUAL,
            name="Persistent Snapshot",
            created_by=test_user.id,
        )

        # Query database directly
        checkpoints = test_db.query(Checkpoint).all()

        assert len(checkpoints) == 1
        assert str(checkpoints[0].id) == snapshot.snapshot_id

    def test_multiple_sessions_snapshots_isolated(
        self, test_db, test_user, test_character, test_session
    ):
        """Test that snapshots are isolated between sessions."""
        # Create another session
        session2 = GameSession(
            owner_id=test_user.id,
            name="Second Session",
            state="active",
        )
        test_db.add(session2)
        test_db.commit()

        service = SnapshotService(test_db)

        # Create snapshots for each session
        service.create_snapshot(
            session_id=test_session.id,
            snapshot_type=SnapshotType.MANUAL,
            name="Session 1 Snap",
            created_by=test_user.id,
        )
        service.create_snapshot(
            session_id=session2.id,
            snapshot_type=SnapshotType.MANUAL,
            name="Session 2 Snap",
            created_by=test_user.id,
        )

        # Verify isolation
        session1_snaps = service.list_snapshots(session_id=test_session.id)
        session2_snaps = service.list_snapshots(session_id=session2.id)

        assert len(session1_snaps) == 1
        assert len(session2_snaps) == 1
