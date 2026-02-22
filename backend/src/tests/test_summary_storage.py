"""Tests for summary storage and API (M3-019, M3-020, M3-021)."""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.core.database import Base, get_db

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.models import User, GameSession, SessionState, Event, EventType, VisibilityLevel
from src.models.event import EventCategory
from src.models.summary import Summary, SummaryType


# Use SQLite for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

_engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


@pytest.fixture(scope="function")
def _db():
    """Create and manage a database session for testing."""
    Base.metadata.create_all(bind=_engine)
    db = TestingSessionLocal()
    yield db
    db.close()
    Base.metadata.drop_all(bind=_engine)


@pytest.fixture(scope="function")
def client(_db):
    """Create a test client with database session override."""
    db_session = _db

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(_db):
    """Create a test user."""
    user = User(username="testuser", email="test@example.com", hashed_password="hashed")
    _db.add(user)
    _db.commit()
    _db.refresh(user)
    return user


@pytest.fixture
def test_session(_db, test_user):
    """Create a test session."""
    session = GameSession(
        name="Test Session",
        owner_id=test_user.id,
        state=SessionState.ACTIVE,
    )
    _db.add(session)
    _db.commit()
    return session


@pytest.fixture
def test_events(_db, test_session, test_user):
    """Create test events."""
    events = [
        Event(
            session_id=test_session.id,
            sequence=1,
            actor_player_id=test_user.id,
            actor_role="player",
            character_id=1,
            event_type=EventType.MESSAGE,
            category=EventCategory.INTERACTION,
            payload={"text": "Hello world"},
            visibility=VisibilityLevel.PUBLIC,
            timestamp=datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
            description="First message",
        ),
        Event(
            session_id=test_session.id,
            sequence=2,
            actor_player_id=test_user.id,
            actor_role="kp",
            character_id=1,
            event_type=EventType.SAN_CHECK,
            category=EventCategory.SANITY,
            payload={"reason": "Seen a monster"},
            visibility=VisibilityLevel.PUBLIC,
            timestamp=datetime(2025, 1, 1, 10, 30, 0, tzinfo=timezone.utc),
            description="SAN check",
        ),
    ]
    for event in events:
        _db.add(event)
    _db.commit()
    return events


class TestSummaryStorageServiceClass:
    """Tests for SummaryStorageService class (M3-019)."""

    def test_service_exists(self):
        """Test that SummaryStorageService can be imported."""
        from src.services.summary_storage import SummaryStorageService
        assert SummaryStorageService is not None

    def test_service_initialization(self, _db):
        """Test that SummaryStorageService can be initialized."""
        from src.services.summary_storage import SummaryStorageService
        service = SummaryStorageService(_db)
        assert service is not None
        assert service.db is not None

    def test_write_checkpoint_summary(self, _db, test_session, test_events):
        """Test writing a checkpoint summary via service."""
        from src.services.summary_storage import SummaryStorageService
        from src.schemas.summary import CheckpointSummary, CheckpointType

        service = SummaryStorageService(_db)

        # Create checkpoint summary data
        summary = service.write_checkpoint_summary(
            session_id=test_session.id,
            checkpoint_type=CheckpointType.MANUAL,
            narrative="Test checkpoint summary",
            scene_name="Test Scene",
            character_states={},
            world_state={},
            event_ids=[str(e.id) for e in test_events],
        )

        assert summary is not None
        assert summary.id is not None
        assert summary.session_id == test_session.id
        assert summary.summary_type == SummaryType.CHECKPOINT.value

    def test_write_session_summary(self, _db, test_session, test_events):
        """Test writing a session summary via service."""
        from src.services.summary_storage import SummaryStorageService

        service = SummaryStorageService(_db)

        summary = service.write_session_summary(
            session_id=test_session.id,
            narrative_summary="Full session summary",
            event_ids=[str(e.id) for e in test_events],
            total_events=len(test_events),
        )

        assert summary is not None
        assert summary.id is not None
        assert summary.summary_type == SummaryType.SESSION.value

    def test_update_summary(self, _db, test_session):
        """Test updating an existing summary via service."""
        from src.services.summary_storage import SummaryStorageService

        service = SummaryStorageService(_db)

        # Create initial summary
        original = service.write_session_summary(
            session_id=test_session.id,
            narrative_summary="Original summary",
            event_ids=[],
            total_events=0,
        )

        # Update summary
        updated = service.update_summary(
            summary_id=original.id,
            narrative_summary="Updated summary",
            user_rating=5,
        )

        assert updated is not None
        assert updated.narrative_summary == "Updated summary"
        assert updated.user_rating == 5

    def test_get_latest_summary(self, _db, test_session):
        """Test getting the latest summary via service."""
        from src.services.summary_storage import SummaryStorageService

        service = SummaryStorageService(_db)

        # Write summaries
        service.write_session_summary(
            session_id=test_session.id,
            narrative_summary="First",
            event_ids=[],
            total_events=0,
        )

        latest = service.write_session_summary(
            session_id=test_session.id,
            narrative_summary="Second",
            event_ids=[],
            total_events=0,
        )

        # Get latest
        result = service.get_latest_summary(test_session.id)

        assert result is not None
        assert result.id == latest.id
        assert result.narrative_summary == "Second"

    def test_get_summary_by_id(self, _db, test_session):
        """Test getting a summary by ID via service."""
        from src.services.summary_storage import SummaryStorageService

        service = SummaryStorageService(_db)

        created = service.write_session_summary(
            session_id=test_session.id,
            narrative_summary="Test",
            event_ids=[],
            total_events=0,
        )

        retrieved = service.get_summary_by_id(created.id)

        assert retrieved is not None
        assert retrieved.id == created.id

    def test_delete_summary_soft_delete(self, _db, test_session):
        """Test soft deleting a summary via service."""
        from src.services.summary_storage import SummaryStorageService

        service = SummaryStorageService(_db)

        summary = service.write_session_summary(
            session_id=test_session.id,
            narrative_summary="To delete",
            event_ids=[],
            total_events=0,
        )

        result = service.delete_summary(summary.id)

        assert result is True

        # Verify soft delete
        _db.refresh(summary)
        assert summary.is_deleted == "true"
        assert summary.deleted_at is not None


class TestSummaryStorage:
    """Tests for summary storage (M3-019)."""

    def test_write_summary_to_database(self, _db, test_session, test_events):
        """Test writing a summary to the database."""
        from src.services.summary import SummaryGenerator

        generator = SummaryGenerator(_db)

        # Generate a session summary
        session_summary = generator.generate_session_summary(test_session.id)

        # Create database summary
        summary = Summary(
            session_id=test_session.id,
            summary_type=SummaryType.SESSION.value,
            narrative_summary=session_summary.narrative_summary.detailed,
            key_events=[
                {"event_type": "san_check", "description": "SAN check", "event_id": str(test_events[1].id)}
            ],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
            participant_character_ids=[1],
            total_events=len(test_events),
            generated_by="ai",
        )
        _db.add(summary)
        _db.commit()
        _db.refresh(summary)

        assert summary.id is not None
        assert summary.session_id == test_session.id
        assert summary.narrative_summary is not None
        assert summary.total_events == 2

    def test_update_existing_summary(self, _db, test_session):
        """Test updating an existing summary (M3-020)."""
        # Create initial summary
        summary = Summary(
            session_id=test_session.id,
            summary_type=SummaryType.SESSION.value,
            narrative_summary="Original summary",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
            total_events=0,
            generated_by="ai",
        )
        _db.add(summary)
        _db.commit()
        _db.refresh(summary)

        # Update the summary
        summary.narrative_summary = "Updated summary"
        summary.user_rating = 5
        _db.commit()
        _db.refresh(summary)

        assert summary.narrative_summary == "Updated summary"
        assert summary.user_rating == 5

    def test_query_summaries_by_session(self, _db, test_session):
        """Test querying summaries by session ID (M3-021)."""
        # Create multiple summaries
        for i in range(3):
            summary = Summary(
                session_id=test_session.id,
                summary_type=SummaryType.SESSION.value,
                narrative_summary=f"Summary {i}",
                key_events=[],
                state_changes=[],
                discovered_clues=[],
                pending_promises=[],
                total_events=i * 10,
                generated_by="ai",
            )
            _db.add(summary)
        _db.commit()

        # Query summaries
        summaries = _db.query(Summary).filter(
            Summary.session_id == test_session.id,
            Summary.is_deleted == "false"
        ).order_by(Summary.created_at.desc()).all()

        assert len(summaries) == 3


class TestSummaryAPIAuth:
    """Tests for summary API endpoints with auth."""

    def test_get_summaries_requires_auth(self, client, test_session):
        """Test that getting summaries requires authentication."""
        response = client.get(f"/api/summaries/{test_session.id}")
        assert response.status_code in [401, 403, 404]

    def test_create_summary_requires_auth(self, client, test_session):
        """Test that creating a summary requires authentication."""
        response = client.post(
            f"/api/summaries/{test_session.id}",
            json={"narrative_summary": "Test summary", "summary_type": "session"}
        )
        assert response.status_code in [401, 403, 404]

    def test_update_summary_requires_auth(self, client, test_session):
        """Test that updating a summary requires authentication."""
        summary_id = str(uuid.uuid4())
        response = client.put(
            f"/api/summaries/{test_session.id}/{summary_id}",
            json={"narrative_summary": "Updated"}
        )
        assert response.status_code in [401, 403, 404]
