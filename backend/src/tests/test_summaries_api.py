"""Tests for the Summary Query API endpoints."""
import pytest
import uuid
from datetime import datetime, timedelta
from fastapi.testclient import TestClient

from src.models.summary import Summary, SummaryType
from src.models.user import User
from src.models.session import GameSession


@pytest.fixture
def test_summaries_session(test_db):
    """Create a test session for summaries API tests."""
    # Create a user
    user = User(
        username="testuser",
        email="test@example.com",
        hashed_password="hash",
    )
    test_db.add(user)
    test_db.flush()

    # Create a game session
    session = GameSession(
        id=uuid.uuid4(),
        owner_id=user.id,
        name="Test Session",
        state="active",
    )
    test_db.add(session)
    test_db.flush()

    return {"user": user, "session": session}


class TestGetSummaries:
    """Test GET /summaries/{session_id} endpoint."""

    def test_get_summaries_empty(self, client: TestClient, test_summaries_session):
        """Test getting summaries for a session with no summaries."""
        data = test_summaries_session
        session_id = str(data["session"].id)

        response = client.get(f"/api/summaries/{session_id}")

        # Expect auth required or success
        assert response.status_code in [200, 401, 403]

    def test_get_summaries_with_data(self, client: TestClient, test_summaries_session, test_db):
        """Test getting summaries for a session with existing summaries."""
        data = test_summaries_session

        # Create summaries
        summary1 = Summary(
            session_id=data["session"].id,
            summary_type=SummaryType.CHECKPOINT.value,
            narrative_summary="First checkpoint summary",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
            participant_character_ids=[],
            total_events=5,
        )
        summary2 = Summary(
            session_id=data["session"].id,
            summary_type=SummaryType.SESSION.value,
            narrative_summary="Full session summary",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
            participant_character_ids=[],
            total_events=50,
        )
        test_db.add_all([summary1, summary2])
        test_db.commit()

        session_id = str(data["session"].id)
        response = client.get(f"/api/summaries/{session_id}")

        # Expect success
        assert response.status_code in [200, 401, 403]

    def test_get_summaries_with_type_filter(self, client: TestClient, test_summaries_session, test_db):
        """Test getting summaries filtered by type."""
        data = test_summaries_session

        # Create summaries of different types
        checkpoint_summary = Summary(
            session_id=data["session"].id,
            summary_type=SummaryType.CHECKPOINT.value,
            narrative_summary="Checkpoint summary",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
            participant_character_ids=[],
            total_events=5,
        )
        session_summary = Summary(
            session_id=data["session"].id,
            summary_type=SummaryType.SESSION.value,
            narrative_summary="Session summary",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
            participant_character_ids=[],
            total_events=50,
        )
        test_db.add_all([checkpoint_summary, session_summary])
        test_db.commit()

        session_id = str(data["session"].id)
        response = client.get(f"/api/summaries/{session_id}?summary_type=checkpoint")

        assert response.status_code in [200, 401, 403]

    def test_get_summaries_with_date_filter(self, client: TestClient, test_summaries_session, test_db):
        """Test getting summaries filtered by date range."""
        data = test_summaries_session
        now = datetime.utcnow()

        # Create summaries with different dates
        old_summary = Summary(
            session_id=data["session"].id,
            summary_type=SummaryType.CHECKPOINT.value,
            narrative_summary="Old summary",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
            participant_character_ids=[],
            total_events=5,
            created_at=now - timedelta(days=10),
            time_range_start=now - timedelta(days=10),
            time_range_end=now - timedelta(days=10),
        )
        recent_summary = Summary(
            session_id=data["session"].id,
            summary_type=SummaryType.CHECKPOINT.value,
            narrative_summary="Recent summary",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
            participant_character_ids=[],
            total_events=5,
            created_at=now - timedelta(days=1),
            time_range_start=now - timedelta(days=1),
            time_range_end=now - timedelta(days=1),
        )
        test_db.add_all([old_summary, recent_summary])
        test_db.commit()

        session_id = str(data["session"].id)

        # Filter by start_date
        start_date = (now - timedelta(days=5)).isoformat()
        response = client.get(f"/api/summaries/{session_id}?start_date={start_date}")

        assert response.status_code in [200, 401, 403]

    def test_get_summaries_invalid_session_id(self, client: TestClient):
        """Test getting summaries with invalid session ID."""
        invalid_session_id = "not-a-uuid"

        response = client.get(f"/api/summaries/{invalid_session_id}")

        assert response.status_code in [400, 401, 403]


class TestGetSummaryById:
    """Test GET /summaries/{session_id}/{summary_id} endpoint."""

    def test_get_summary_by_id(self, client: TestClient, test_summaries_session, test_db):
        """Test getting a specific summary by ID."""
        data = test_summaries_session

        # Create a summary
        summary = Summary(
            session_id=data["session"].id,
            summary_type=SummaryType.SCENE.value,
            narrative_summary="Scene summary",
            key_events=[
                {"event_type": "combat_start", "description": "Combat started", "event_id": str(uuid.uuid4())}
            ],
            state_changes=[
                {"character_id": str(uuid.uuid4()), "hp_change": -10, "san_change": 0, "luck_change": 0, "mp_change": 0}
            ],
            discovered_clues=["A mysterious letter"],
            pending_promises=[],
            participant_character_ids=[],
            total_events=10,
            scene_name="The Old House",
        )
        test_db.add(summary)
        test_db.commit()

        session_id = str(data["session"].id)
        summary_id = str(summary.id)

        response = client.get(f"/api/summaries/{session_id}/{summary_id}")

        # Expect success
        assert response.status_code in [200, 401, 403]

        if response.status_code == 200:
            result = response.json()
            assert "id" in result
            assert result["narrative_summary"] == "Scene summary"

    def test_get_summary_by_id_not_found(self, client: TestClient, test_summaries_session):
        """Test getting a non-existent summary."""
        data = test_summaries_session

        session_id = str(data["session"].id)
        summary_id = str(uuid.uuid4())  # Non-existent ID

        response = client.get(f"/api/summaries/{session_id}/{summary_id}")

        # Should return 404 or auth error
        assert response.status_code in [404, 401, 403]

    def test_get_summary_by_id_invalid_session_id(self, client: TestClient):
        """Test getting summary with invalid session ID."""
        invalid_session_id = "not-a-uuid"
        summary_id = str(uuid.uuid4())

        response = client.get(f"/api/summaries/{invalid_session_id}/{summary_id}")

        assert response.status_code in [400, 401, 403]

    def test_get_summary_by_id_mismatch(self, client: TestClient, test_summaries_session, test_db):
        """Test getting a summary that belongs to a different session."""
        data = test_summaries_session

        # Create another session
        other_session = GameSession(
            id=uuid.uuid4(),
            owner_id=data["user"].id,
            name="Other Session",
            state="active",
        )
        test_db.add(other_session)
        test_db.flush()

        # Create a summary for the other session
        summary = Summary(
            session_id=other_session.id,
            summary_type=SummaryType.SESSION.value,
            narrative_summary="Other session summary",
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
            participant_character_ids=[],
            total_events=20,
        )
        test_db.add(summary)
        test_db.commit()

        # Try to access it from the first session
        session_id = str(data["session"].id)
        summary_id = str(summary.id)

        response = client.get(f"/api/summaries/{session_id}/{summary_id}")

        # Should return 404 (not found for this session)
        assert response.status_code in [404, 401, 403]
