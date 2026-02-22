"""Tests for Event Export API (M3-013).

This test suite covers:
- Export events as JSON
- Export events as CSV
- Export filtered events
- Include all event fields in export
- Authentication required for export

TDD Workflow:
1. Write test FIRST
2. Run test to see it FAIL
3. Write MINIMAL code to pass
4. Run tests to verify PASS
"""

import uuid
import json
import csv
import pytest
from datetime import datetime
from fastapi.testclient import TestClient

from src.main import app
from src.core.database import get_db
from src.core.security import get_password_hash
from src.models.event import Event, EventType, VisibilityLevel
from src.models.user import User
from src.models.session import GameSession
from src.services.events import EventLogger


# =============================================================================
# Test Fixtures
# =============================================================================


@pytest.fixture
def test_user(_db):
    """Create a test user with known password for testing."""
    hashed_password = get_password_hash("testpass123")
    user = User(username="testkeeper", email="keeper@example.com", hashed_password=hashed_password)
    _db.add(user)
    _db.commit()
    _db.refresh(user)
    return user


@pytest.fixture
def test_session(_db, test_user):
    """Create a test game session."""
    session = GameSession(
        id=uuid.uuid4(),
        owner_id=test_user.id,
        name="Test Session",
        current_scene_name="Test Scene",
        world_state={},
    )
    _db.add(session)
    _db.commit()
    _db.refresh(session)
    return session


@pytest.fixture
def auth_headers(client):
    """Get authentication headers for test user."""
    response = client.post(
        "/auth/login", json={"username": "testkeeper", "password": "testpass123"}
    )
    if response.status_code == 200:
        data = response.json()
        if data.get("code") == 0 and "data" in data and "access_token" in data["data"]:
            token = data["data"]["access_token"]
            return {"Authorization": f"Bearer {token}"}
    return {}


# =============================================================================
# Event Export API Tests (M3-013)
# =============================================================================


class TestEventExportAPI:
    """Test event export API endpoints."""

    def test_export_events_as_json(self, client, _db, test_user, test_session, auth_headers):
        """Test exporting events as JSON format."""
        # Create test events
        logger = EventLogger(_db)
        logger.record(EventType.SESSION_START, "system").session(test_session.id).save()
        logger.record(EventType.MESSAGE, "kp").session(test_session.id).actor(test_user).payload(
            {"text": "Welcome"}
        ).save()
        logger.record(EventType.ROLL, "player").session(test_session.id).payload(
            {"skill": "spot_hidden", "roll": 25, "target": 50}
        ).save()

        # Export as JSON
        response = client.get(f"/events/export/{test_session.id}?format=json", headers=auth_headers)

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/json"

        data = response.json()
        assert "events" in data
        assert len(data["events"]) == 3
        assert "session_id" in data
        assert "export_time" in data

    def test_export_events_as_csv(self, client, _db, test_user, test_session, auth_headers):
        """Test exporting events as CSV format."""
        # Create test events
        logger = EventLogger(_db)
        logger.record(EventType.SESSION_START, "system").session(test_session.id).save()
        logger.record(EventType.MESSAGE, "kp").session(test_session.id).actor(test_user).payload(
            {"text": "Welcome"}
        ).save()
        logger.record(EventType.ROLL, "player").session(test_session.id).payload(
            {"skill": "spot_hidden", "roll": 25, "target": 50}
        ).save()

        # Export as CSV
        response = client.get(f"/events/export/{test_session.id}?format=csv", headers=auth_headers)

        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]

        # Parse CSV content
        csv_content = response.text
        lines = csv_content.strip().split("\n")
        # Should have header + 3 events
        assert len(lines) >= 4
        # Check that header contains important fields
        header = lines[0]
        assert "id" in header
        assert "session_id" in header
        assert "event_type" in header

    def test_export_filtered_events(self, client, _db, test_user, test_session, auth_headers):
        """Test exporting filtered events."""
        # Create test events
        logger = EventLogger(_db)
        logger.record(EventType.SESSION_START, "system").session(test_session.id).save()
        logger.record(EventType.MESSAGE, "kp").session(test_session.id).actor(test_user).save()
        logger.record(EventType.ROLL, "player").session(test_session.id).save()
        logger.record(EventType.DAMAGE, "kp").session(test_session.id).save()

        # Export only ROLL events
        response = client.get(
            f"/events/export/{test_session.id}?format=json&event_type=roll", headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["events"]) == 1
        assert data["events"][0]["event_type"] == "roll"

    def test_export_requires_authentication(self, client, test_session):
        """Test that export requires authentication."""
        response = client.get(f"/events/export/{test_session.id}?format=json")

        # Should return 401 without auth
        assert response.status_code == 401

    def test_export_invalid_session(self, client, _db):
        """Test exporting from invalid session."""
        fake_session_id = uuid.uuid4()

        # Create a test user and login
        hashed_password = get_password_hash("testpass123")
        user = User(
            username="testkeeper2", email="keeper2@example.com", hashed_password=hashed_password
        )
        _db.add(user)
        _db.commit()

        # Login
        response = client.post(
            "/auth/login", json={"username": "testkeeper2", "password": "testpass123"}
        )
        assert response.status_code == 200
        token = response.json()["data"]["access_token"]

        # Try to export from invalid session
        response = client.get(
            f"/events/export/{fake_session_id}?format=json",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 404

    def test_export_invalid_format(self, client, test_session, auth_headers):
        """Test exporting with invalid format parameter."""
        response = client.get(f"/events/export/{test_session.id}?format=xml", headers=auth_headers)

        assert response.status_code == 400

    def test_export_includes_all_fields(self, client, _db, test_user, test_session, auth_headers):
        """Test that export includes all event fields."""
        # Create event with all fields
        logger = EventLogger(_db)
        event = (
            logger.record(EventType.ROLL, "player")
            .session(test_session.id)
            .actor(test_user)
            .payload({"skill": "spot_hidden", "roll": 25, "target": 50})
            .description("Test roll")
            .visibility(VisibilityLevel.PUBLIC)
            .save()
        )

        # Export as JSON
        response = client.get(f"/events/export/{test_session.id}?format=json", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        exported_event = data["events"][0]

        # Check all fields are present
        assert "id" in exported_event
        assert "session_id" in exported_event
        assert "actor_player_id" in exported_event
        assert "actor_role" in exported_event
        assert "event_type" in exported_event
        assert "payload" in exported_event
        assert "visibility" in exported_event
        assert "timestamp" in exported_event
        assert "description" in exported_event
        assert "category" in exported_event
        assert "sequence" in exported_event
        assert "input_raw" in exported_event
        assert "narration" in exported_event

    def test_export_with_time_filter(self, client, _db, test_user, test_session, auth_headers):
        """Test exporting events with time filter."""
        # Create test events
        logger = EventLogger(_db)

        # Create events at different times
        event1 = logger.record(EventType.SESSION_START, "system").session(test_session.id).save()
        event2 = (
            logger.record(EventType.MESSAGE, "kp").session(test_session.id).actor(test_user).save()
        )

        # Export with start_time filter (subtract a second to ensure we get both events)
        from datetime import timedelta

        start_time = (event1.timestamp - timedelta(seconds=1)).isoformat()

        response = client.get(
            f"/events/export/{test_session.id}?format=json&start_time={start_time}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        # Should include events from start_time onwards
        assert len(data["events"]) >= 1

    def test_export_csv_with_all_fields(self, client, _db, test_user, test_session, auth_headers):
        """Test CSV export includes all important fields."""
        # Create test event
        logger = EventLogger(_db)
        logger.record(EventType.ROLL, "player").session(test_session.id).actor(test_user).payload(
            {"skill": "spot_hidden", "roll": 25, "target": 50}
        ).description("Test roll").save()

        # Export as CSV
        response = client.get(f"/events/export/{test_session.id}?format=csv", headers=auth_headers)

        assert response.status_code == 200
        csv_content = response.text

        # Check header contains expected fields
        header = csv_content.split("\n")[0]
        assert "id" in header
        assert "event_type" in header
        assert "timestamp" in header
        assert "actor_role" in header

    def test_export_empty_session(self, client, test_session, auth_headers):
        """Test exporting from session with no events."""
        response = client.get(f"/events/export/{test_session.id}?format=json", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["events"] == []
        assert data["total_events"] == 0
