"""Tests for Spotlight API endpoints (TDD - Test First)."""
import pytest
from uuid import uuid4
from unittest.mock import Mock, patch
from fastapi.testclient import TestClient

from src.main import app
from src.services.spotlight import SpotlightManager, SpotlightRequest
from src.models.user import User


# Mock user for authentication
MOCK_USER = Mock(spec=User)
MOCK_USER.id = 1
MOCK_USER.username = "test_user"


def override_get_current_user():
    """Override get_current_user dependency for testing."""
    return MOCK_USER


# Apply override to app
from src.core.auth import get_current_user
app.dependency_overrides[get_current_user] = override_get_current_user


class TestSpotlightAPI:
    """Test Spotlight API endpoints with strict TDD approach."""

    @pytest.fixture
    def client(self):
        """Create test client."""
        from fastapi.testclient import TestClient
        return TestClient(app)

    @pytest.fixture
    def manager(self):
        """Create spotlight manager instance."""
        # In production, this would be injected via dependency
        from src.api.spotlight import get_spotlight_manager
        return SpotlightManager()

    @pytest.fixture
    def auth_headers(self):
        """Mock authentication headers."""
        # In production, this would be a valid JWT token
        return {"Authorization": "Bearer mock_token"}

    @pytest.fixture
    def session_id(self):
        """Test session ID."""
        return str(uuid4())

    @pytest.fixture
    def user_id(self):
        """Test user ID."""
        return str(uuid4())

    class TestRequestSpotlight:
        """Test POST /game/spotlight/request endpoint."""

        def test_request_spotlight_success(self, client, manager, session_id, user_id, auth_headers):
            """Should successfully request spotlight."""
            response = client.post(
                    f"/api/game/spotlight/request",
                    json={
                        "session_id": session_id,
                        "user_id": user_id,
                        "character_id": str(uuid4()),
                    },
                    headers=auth_headers,
                )

            assert response.status_code == 200
            data = response.json()
            assert data["granted"] is True
            assert data["queue_position"] == 0
            assert "message" in data

        def test_request_spotlight_queued(self, client, manager, session_id, user_id, auth_headers):
            """Should queue subsequent requests."""
            # First request
            user1_id = str(uuid4())
            client.post(
                "/api/game/spotlight/request",
                json={
                    "session_id": session_id,
                    "user_id": user1_id,
                    "character_id": str(uuid4()),
                },
                headers=auth_headers,
            )

            # Second request should be queued
            user2_id = str(uuid4())
            response = client.post(
                "/api/game/spotlight/request",
                json={
                    "session_id": session_id,
                    "user_id": user2_id,
                    "character_id": str(uuid4()),
                },
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["granted"] is False
            assert data["queue_position"] == 1

        def test_request_spotlight_missing_fields(self, client, auth_headers):
            """Should return 400 for missing required fields."""
            response = client.post(
                "/api/game/spotlight/request",
                json={"session_id": str(uuid4())},  # Missing user_id
                headers=auth_headers,
            )

            assert response.status_code == 422  # Validation error

    class TestReleaseSpotlight:
        """Test POST /game/spotlight/release endpoint."""

        def test_release_spotlight_success(self, client, manager, session_id, user_id, auth_headers):
            """Should successfully release spotlight."""
            # First, request spotlight
            client.post(
                "/api/game/spotlight/request",
                json={
                    "session_id": session_id,
                    "user_id": user_id,
                    "character_id": str(uuid4()),
                },
                headers=auth_headers,
            )

            # Release spotlight
            response = client.post(
                "/api/game/spotlight/release",
                json={
                    "session_id": session_id,
                    "user_id": user_id,
                },
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True

        def test_release_spotlight_by_non_holder_fails(self, client, manager, session_id, user_id, auth_headers):
            """Should fail when non-holder tries to release."""
            # First user gets spotlight
            user1_id = str(uuid4())
            client.post(
                "/api/game/spotlight/request",
                json={
                    "session_id": session_id,
                    "user_id": user1_id,
                    "character_id": str(uuid4()),
                },
                headers=auth_headers,
            )

            # Different user tries to release
            user2_id = str(uuid4())
            response = client.post(
                "/api/game/spotlight/release",
                json={
                    "session_id": session_id,
                    "user_id": user2_id,
                },
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is False

    class TestGetSpotlightStatus:
        """Test GET /game/spotlight endpoint."""

        def test_get_spotlight_status(self, client, manager, session_id, user_id, auth_headers):
            """Should return current spotlight status."""
            # Request spotlight first
            client.post(
                "/api/game/spotlight/request",
                json={
                    "session_id": session_id,
                    "user_id": user_id,
                    "character_id": str(uuid4()),
                },
                headers=auth_headers,
            )

            # Get status
            response = client.get(
                f"/api/game/spotlight?session_id={session_id}",
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["state"] == "active"
            assert data["current_holder"] == user_id
            assert "queue" in data
            assert isinstance(data["queue"], list)

        def test_get_spotlight_status_idle(self, client, manager, session_id, auth_headers):
            """Should return idle status for new session."""
            response = client.get(
                f"/api/game/spotlight?session_id={session_id}",
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["state"] == "idle"
            assert data["current_holder"] is None
            assert len(data["queue"]) == 0

        def test_get_spotlight_status_missing_session_id(self, client, auth_headers):
            """Should return 400 when session_id is missing."""
            response = client.get(
                "/api/game/spotlight",  # No session_id parameter
                headers=auth_headers,
            )

            assert response.status_code == 422  # Validation error


class TestQueueAPI:
    """Test Queue API endpoints."""

    @pytest.fixture
    def client(self):
        """Create test client."""
        from fastapi.testclient import TestClient
        return TestClient(app)

    @pytest.fixture
    def auth_headers(self):
        """Mock authentication headers."""
        return {"Authorization": "Bearer mock_token"}

    @pytest.fixture
    def session_id(self):
        """Test session ID."""
        return str(uuid4())

    @pytest.fixture
    def user_id(self):
        """Test user ID."""
        return str(uuid4())

    class TestLeaveQueue:
        """Test DELETE /game/queue endpoint."""

        def test_leave_queue_success(self, client, session_id, user_id, auth_headers):
            """Should successfully leave queue."""
            # First join queue (by requesting spotlight when someone else has it)
            user1_id = str(uuid4())
            client.post(
                "/api/game/spotlight/request",
                json={
                    "session_id": session_id,
                    "user_id": user1_id,
                    "character_id": str(uuid4()),
                },
                headers=auth_headers,
            )

            # Second user joins queue
            client.post(
                "/api/game/spotlight/request",
                json={
                    "session_id": session_id,
                    "user_id": user_id,
                    "character_id": str(uuid4()),
                },
                headers=auth_headers,
            )

            # Leave queue
            response = client.delete(
                f"/api/game/spotlight/queue?session_id={session_id}&user_id={user_id}",
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True

        def test_leave_queue_not_in_queue(self, client, session_id, user_id, auth_headers):
            """Should handle leaving when not in queue gracefully."""
            response = client.delete(
                f"/api/game/spotlight/queue?session_id={session_id}&user_id={user_id}",
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True

    class TestGetQueue:
        """Test GET /game/queue endpoint."""

        def test_get_queue_status(self, client, session_id, auth_headers):
            """Should return current queue status."""
            response = client.get(
                f"/api/game/spotlight/queue?session_id={session_id}",
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert "queue" in data
            assert isinstance(data["queue"], list)
            assert "queue_size" in data

    class TestCutIn:
        """Test POST /game/queue/cut-in endpoint."""

        def test_cut_in_with_reason(self, client, session_id, user_id, auth_headers):
            """Should allow cutting in line with a reason."""
            response = client.post(
                "/api/game/spotlight/queue/cut-in",
                json={
                    "session_id": session_id,
                    "user_id": user_id,
                    "reason": "Urgent plot development",
                },
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True

        def test_cut_in_missing_reason(self, client, session_id, user_id, auth_headers):
            """Should require a reason for cutting in."""
            response = client.post(
                "/api/game/spotlight/queue/cut-in",
                json={
                    "session_id": session_id,
                    "user_id": user_id,
                },
                headers=auth_headers,
            )

            assert response.status_code == 422  # Validation error
