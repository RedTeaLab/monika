"""Tests for Visibility API endpoints (TDD - Test First)."""
import pytest
from uuid import uuid4
from unittest.mock import Mock
from fastapi.testclient import TestClient

from src.main import app
from src.services.visibility import VisibilityFilter, VisibilityContext
from src.models.user import User
from src.models.message import Message


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


class TestMessageVisibilityAPI:
    """Test message visibility API endpoints with strict TDD approach."""

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
    def kp_user_id(self):
        """KP user ID."""
        return str(uuid4())

    @pytest.fixture
    def player1_id(self):
        """Player 1 ID."""
        return str(uuid4())

    @pytest.fixture
    def player2_id(self):
        """Player 2 ID."""
        return str(uuid4())

    class TestPostMessageWithVisibility:
        """Test POST /game/messages with visibility parameter."""

        def test_send_public_message(self, client, session_id, player1_id, auth_headers):
            """Should successfully send a public message."""
            response = client.post(
                "/api/game/messages",
                json={
                    "session_id": session_id,
                    "sender_id": player1_id,
                    "content": "Hello everyone!",
                    "visibility": "public",
                    "visible_to": [],
                },
                headers=auth_headers,
            )

            assert response.status_code == 201
            data = response.json()
            assert data["content"] == "Hello everyone!"
            assert data["visibility"] == "public"

        def test_send_kp_only_message(self, client, session_id, kp_user_id, auth_headers):
            """Should successfully send a KP-only message."""
            response = client.post(
                "/api/game/messages",
                json={
                    "session_id": session_id,
                    "sender_id": kp_user_id,
                    "content": "Secret keeper notes",
                    "visibility": "kp",
                    "visible_to": [],
                },
                headers=auth_headers,
            )

            assert response.status_code == 201
            data = response.json()
            assert data["visibility"] == "kp"

        def test_send_private_message(self, client, session_id, kp_user_id, player1_id, auth_headers):
            """Should successfully send a private message to specific users."""
            response = client.post(
                "/api/game/messages",
                json={
                    "session_id": session_id,
                    "sender_id": kp_user_id,
                    "content": "Private info for player 1",
                    "visibility": "private",
                    "visible_to": [player1_id],
                },
                headers=auth_headers,
            )

            assert response.status_code == 201
            data = response.json()
            assert data["visibility"] == "private"
            assert player1_id in data["visible_to"]

        def test_send_message_invalid_visibility(self, client, session_id, player1_id, auth_headers):
            """Should reject invalid visibility level."""
            response = client.post(
                "/api/game/messages",
                json={
                    "session_id": session_id,
                    "sender_id": player1_id,
                    "content": "Test message",
                    "visibility": "invalid_level",
                    "visible_to": [],
                },
                headers=auth_headers,
            )

            assert response.status_code == 422  # Validation error

    class TestGetFilteredMessages:
        """Test GET /game/messages with visibility filtering."""

        def test_kp_sees_all_messages(self, client, session_id, kp_user_id, player1_id, auth_headers):
            """KP should see all messages regardless of visibility."""
            # Create messages with different visibility levels
            messages = [
                {
                    "session_id": session_id,
                    "sender_id": player1_id,
                    "content": "Public message",
                    "visibility": "public",
                    "visible_to": [],
                },
                {
                    "session_id": session_id,
                    "sender_id": kp_user_id,
                    "content": "KP-only message",
                    "visibility": "kp",
                    "visible_to": [],
                },
            ]

            for msg in messages:
                client.post("/api/game/messages", json=msg, headers=auth_headers)

            # Get messages as KP
            response = client.get(
                f"/api/game/messages?session_id={session_id}&viewer_id={kp_user_id}&viewer_role=keeper",
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            messages = data["messages"]
            assert len(messages) == 2
            assert any(m["visibility"] == "kp" for m in messages)

        def test_player_sees_public_and_private_only(self, client, session_id, kp_user_id, player1_id, player2_id, auth_headers):
            """Player should only see public, party, and private messages to themselves."""
            # Create messages
            messages = [
                {
                    "session_id": session_id,
                    "sender_id": kp_user_id,
                    "content": "Public message",
                    "visibility": "public",
                    "visible_to": [],
                },
                {
                    "session_id": session_id,
                    "sender_id": kp_user_id,
                    "content": "KP-only secret",
                    "visibility": "kp",
                    "visible_to": [],
                },
                {
                    "session_id": session_id,
                    "sender_id": kp_user_id,
                    "content": "Private to player 1",
                    "visibility": "private",
                    "visible_to": [player1_id],
                },
            ]

            for msg in messages:
                client.post("/api/game/messages", json=msg, headers=auth_headers)

            # Get messages as player1
            response = client.get(
                f"/api/game/messages?session_id={session_id}&viewer_id={player1_id}&viewer_role=player",
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            messages = data["messages"]
            # Should see public and private, but not KP-only
            assert len(messages) == 2
            assert not any(m["visibility"] == "kp" for m in messages)
            assert any(m["visibility"] == "private" and player1_id in m["visible_to"] for m in messages)

        def test_player_does_not_see_private_to_others(self, client, session_id, kp_user_id, player1_id, player2_id, auth_headers):
            """Player should not see private messages sent to other players."""
            # Send private message to player2
            client.post(
                "/api/game/messages",
                json={
                    "session_id": session_id,
                    "sender_id": kp_user_id,
                    "content": "Secret for player 2 only",
                    "visibility": "private",
                    "visible_to": [player2_id],
                },
                headers=auth_headers,
            )

            # Get messages as player1
            response = client.get(
                f"/api/game/messages?session_id={session_id}&viewer_id={player1_id}&viewer_role=player",
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            messages = data["messages"]
            # Player1 should not see the private message to player2
            assert len(messages) == 0

    class TestMessageFiltering:
        """Test message filtering by visibility level."""

        def test_filter_by_visibility_level(self, client, session_id, player1_id, auth_headers):
            """Should filter messages by visibility level."""
            # Create messages
            for i in range(3):
                client.post(
                    "/api/game/messages",
                    json={
                        "session_id": session_id,
                        "sender_id": player1_id,
                        "content": f"Message {i}",
                        "visibility": "public",
                        "visible_to": [],
                    },
                    headers=auth_headers,
                )

            # Filter by visibility
            response = client.get(
                f"/api/game/messages?session_id={session_id}&viewer_id={player1_id}&viewer_role=player&visibility=public",
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert len(data["messages"]) == 3
            assert all(m["visibility"] == "public" for m in data["messages"])

        def test_pagination(self, client, session_id, player1_id, auth_headers):
            """Should support pagination for large message sets."""
            # Create 25 messages
            for i in range(25):
                client.post(
                    "/api/game/messages",
                    json={
                        "session_id": session_id,
                        "sender_id": player1_id,
                        "content": f"Message {i}",
                        "visibility": "public",
                        "visible_to": [],
                    },
                    headers=auth_headers,
                )

            # Get first page
            response = client.get(
                f"/api/game/messages?session_id={session_id}&viewer_id={player1_id}&viewer_role=player&page=1&page_size=10",
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert len(data["messages"]) == 10
            assert data["total_count"] == 25
            assert data["page"] == 1
            assert data["page_size"] == 10
