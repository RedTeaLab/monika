"""Tests for Message Queue API endpoints (TDD - Test First)."""
import pytest
from uuid import uuid4
from unittest.mock import Mock
from fastapi.testclient import TestClient

from src.main import app
from src.services.message_queue import MessageQueue
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


class TestMessageQueueAPI:
    """Test message queue API endpoints with strict TDD approach."""

    @pytest.fixture
    def client(self):
        """Create test client."""
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

    class TestEnqueueMessage:
        """Test POST /game/queue endpoint."""

        def test_enqueue_message_success(self, client, session_id, user_id, auth_headers):
            """Should successfully enqueue a message."""
            response = client.post(
                "/api/game/queue",
                json={
                    "session_id": session_id,
                    "user_id": user_id,
                    "content": "Test message",
                    "visibility": "public",
                },
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["queue_position"] >= 1
            assert "message_id" in data

        def test_enqueue_multiple_messages(self, client, session_id, user_id, auth_headers):
            """Should enqueue multiple messages in order."""
            for i in range(3):
                response = client.post(
                    "/api/game/queue",
                    json={
                        "session_id": session_id,
                        "user_id": user_id,
                        "content": f"Message {i}",
                        "visibility": "public",
                    },
                    headers=auth_headers,
                )

                assert response.status_code == 200
                data = response.json()
                assert data["queue_position"] == i + 1

    class TestGetQueueStatus:
        """Test GET /game/queue endpoint."""

        def test_get_queue_status_empty(self, client, session_id, auth_headers):
            """Should return empty queue status."""
            response = client.get(
                f"/api/game/queue/status?session_id={session_id}",
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["queue_size"] == 0
            assert data["processing"] is False

        def test_get_queue_status_with_messages(self, client, session_id, user_id, auth_headers):
            """Should return queue status with messages."""
            # Enqueue a message
            client.post(
                "/api/game/queue",
                json={
                    "session_id": session_id,
                    "user_id": user_id,
                    "content": "Test message",
                    "visibility": "public",
                },
                headers=auth_headers,
            )

            # Get status
            response = client.get(
                f"/api/game/queue/status?session_id={session_id}",
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["queue_size"] == 1

    class TestProcessQueue:
        """Test POST /game/queue/process endpoint."""

        def test_process_queue_success(self, client, session_id, user_id, auth_headers):
            """Should successfully process queued messages."""
            # Enqueue messages
            for i in range(3):
                client.post(
                    "/api/game/queue",
                    json={
                        "session_id": session_id,
                        "user_id": user_id,
                        "content": f"Message {i}",
                        "visibility": "public",
                    },
                    headers=auth_headers,
                )

            # Process queue
            response = client.post(
                f"/api/game/queue/process?session_id={session_id}",
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["processed_count"] == 3
            assert data["failed_count"] == 0

        def test_process_empty_queue(self, client, session_id, auth_headers):
            """Should handle processing empty queue gracefully."""
            response = client.post(
                f"/api/game/queue/process?session_id={session_id}",
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["processed_count"] == 0

    class TestClearQueue:
        """Test DELETE /game/queue endpoint."""

        def test_clear_queue_success(self, client, session_id, user_id, auth_headers):
            """Should successfully clear queue."""
            # Enqueue messages
            for i in range(3):
                client.post(
                    "/api/game/queue",
                    json={
                        "session_id": session_id,
                        "user_id": user_id,
                        "content": f"Message {i}",
                        "visibility": "public",
                    },
                    headers=auth_headers,
                )

            # Clear queue
            response = client.delete(
                f"/api/game/queue?session_id={session_id}",
                headers=auth_headers,
            )

            assert response.status_code == 200

            # Verify queue is cleared
            status_response = client.get(
                f"/api/game/queue/status?session_id={session_id}",
                headers=auth_headers,
            )
            assert status_response.json()["queue_size"] == 0


class TestSessionSnapshotAPI:
    """Test session snapshot API endpoints."""

    @pytest.fixture
    def client(self):
        """Create test client."""
        return TestClient(app)

    @pytest.fixture
    def auth_headers(self):
        """Mock authentication headers."""
        return {"Authorization": "Bearer mock_token"}

    @pytest.fixture
    def session_id(self):
        """Test session ID."""
        return str(uuid4())

    class TestCreateSnapshot:
        """Test POST /game/snapshots endpoint."""

        def test_create_snapshot_success(self, client, session_id, auth_headers):
            """Should successfully create a session snapshot."""
            response = client.post(
                "/api/game/queue/snapshots",
                json={
                    "session_id": session_id,
                    "state": {
                        "current_scene": "investigation",
                        "world_state": {"clues_found": 2}
                    }
                },
                headers=auth_headers,
            )

            assert response.status_code == 201
            data = response.json()
            assert data["session_id"] == session_id
            assert data["state"]["current_scene"] == "investigation"
            assert "snapshot_id" in data

        def test_create_snapshot_with_messages(self, client, session_id, auth_headers):
            """Should create snapshot with message history."""
            response = client.post(
                "/api/game/queue/snapshots",
                json={
                    "session_id": session_id,
                    "state": {
                        "current_scene": "investigation"
                    },
                    "message_count": 10
                },
                headers=auth_headers,
            )

            assert response.status_code == 201
            data = response.json()
            assert "snapshot_id" in data

    class TestGetSnapshot:
        """Test GET /game/snapshots endpoint."""

        def test_get_latest_snapshot(self, client, session_id, auth_headers):
            """Should get the latest snapshot for a session."""
            # First create a snapshot
            client.post(
                "/api/game/queue/snapshots",
                json={
                    "session_id": session_id,
                    "state": {"current_scene": "investigation"}
                },
                headers=auth_headers,
            )

            # Get latest snapshot
            response = client.get(
                f"/api/game/queue/snapshots?session_id={session_id}",
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["session_id"] == session_id
            assert data["state"]["current_scene"] == "investigation"

        def test_get_nonexistent_snapshot(self, client, auth_headers):
            """Should return 404 for nonexistent snapshot."""
            response = client.get(
                f"/api/game/snapshots?session_id={str(uuid4())}",
                headers=auth_headers,
            )

            assert response.status_code == 404

    class TestRecoverSession:
        """Test POST /game/recover endpoint."""

        def test_recover_session_success(self, client, session_id, auth_headers):
            """Should successfully recover a session from snapshot."""
            # First create a snapshot
            client.post(
                "/api/game/queue/snapshots",
                json={
                    "session_id": session_id,
                    "state": {
                        "current_scene": "investigation",
                        "world_state": {"clues_found": 2}
                    }
                },
                headers=auth_headers,
            )

            # Recover session
            response = client.post(
                "/api/game/queue/recover",
                json={
                    "session_id": session_id,
                    "last_message_id": None
                },
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert "state" in data
            assert "missed_messages" in data
            assert data["state"]["current_scene"] == "investigation"

        def test_recover_session_with_missed_messages(self, client, session_id, auth_headers):
            """Should recover session with missed messages."""
            # Create snapshot
            snapshot_response = client.post(
                "/api/game/queue/snapshots",
                json={
                    "session_id": session_id,
                    "state": {"current_scene": "investigation"}
                },
                headers=auth_headers,
            )
            snapshot_id = snapshot_response.json()["snapshot_id"]

            # Recover with last_message_id
            response = client.post(
                "/api/game/queue/recover",
                json={
                    "session_id": session_id,
                    "last_message_id": "old_message_id"
                },
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert "missed_messages" in data
            assert isinstance(data["missed_messages"], list)
