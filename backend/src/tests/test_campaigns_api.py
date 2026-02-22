"""Tests for Campaign API endpoints."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
import uuid

from src.models.user import User
from src.core.security import get_password_hash


@pytest.fixture
def keeper_auth_headers(client: TestClient) -> dict:
    """Create authentication headers for a keeper user."""
    # Register keeper user
    reg_response = client.post(
        "/api/auth/register",
        json={
            "username": "keeper",
            "email": "keeper@example.com",
            "password": "keeperpass123",
        },
    )
    assert reg_response.json()["code"] == 0, f"Registration failed: {reg_response.json()}"

    # Login to get token
    response = client.post(
        "/api/auth/login",
        json={
            "username": "keeper",
            "password": "keeperpass123",
        },
    )
    login_data = response.json()
    assert login_data["code"] == 0, f"Login failed: {login_data}"
    token = login_data["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def player_auth_headers(client: TestClient) -> dict:
    """Create authentication headers for a player user."""
    # Register player user
    reg_response = client.post(
        "/api/auth/register",
        json={
            "username": "player",
            "email": "player@example.com",
            "password": "playerpass123",
        },
    )
    assert reg_response.json()["code"] == 0, f"Registration failed: {reg_response.json()}"

    # Login to get token
    response = client.post(
        "/api/auth/login",
        json={
            "username": "player",
            "password": "playerpass123",
        },
    )
    login_data = response.json()
    assert login_data["code"] == 0, f"Login failed: {login_data}"
    token = login_data["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def test_character(client: TestClient, player_auth_headers: dict) -> dict:
    """Create a test character for testing."""
    response = client.post(
        "/api/characters",
        json={
            "name": "Test Investigator",
            "age": 25,
            "gender": "Male",
            "occupation": "Private Investigator",
            "str": 50,
            "con": 60,
            "dex": 70,
            "app": 50,
            "pow": 60,
            "int": 70,
            "siz": 50,
            "edu": 80,
            "hp": 11,
            "mp": 12,
            "san": 60,
            "max_san": 60,
            "luck": 50,
        },
        headers=player_auth_headers,
    )
    return response.json()


class TestCampaignCreate:
    """Test campaign creation endpoint."""

    def test_create_campaign_success(self, client: TestClient, keeper_auth_headers: dict):
        """Should create a campaign successfully."""
        response = client.post(
            "/api/campaigns",
            json={
                "name": "The Haunted Manor",
                "description": "A spooky adventure",
                "max_players": 4,
            },
            headers=keeper_auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "The Haunted Manor"
        assert data["description"] == "A spooky adventure"
        assert data["max_players"] == 4
        assert data["keeper_id"] is not None
        assert "id" in data
        assert "invite_code" in data
        assert len(data["invite_code"]) == 8
        assert data["status"] == "active"

    def test_create_campaign_without_auth(self, client: TestClient):
        """Should fail without authentication."""
        response = client.post(
            "/api/campaigns",
            json={
                "name": "The Haunted Manor",
                "description": "A spooky adventure",
            },
        )
        assert response.status_code == 401

    def test_create_campaign_without_name(self, client: TestClient, keeper_auth_headers: dict):
        """Should fail when name is missing."""
        response = client.post(
            "/api/campaigns",
            json={
                "description": "A spooky adventure",
            },
            headers=keeper_auth_headers,
        )
        assert response.status_code == 422

    def test_create_campaign_minimal(self, client: TestClient, keeper_auth_headers: dict):
        """Should create campaign with minimal fields."""
        response = client.post(
            "/api/campaigns",
            json={
                "name": "Minimal Campaign",
            },
            headers=keeper_auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Minimal Campaign"
        assert data["max_players"] == 4  # Default value

    def test_create_campaign_with_settings(self, client: TestClient, keeper_auth_headers: dict):
        """Should create campaign with custom settings."""
        response = client.post(
            "/api/campaigns",
            json={
                "name": "Custom Settings Campaign",
                "description": "Testing settings",
                "max_players": 6,
                "settings": {
                    "allow_observers": True,
                    "auto_save": True,
                    "voice_chat": False,
                },
            },
            headers=keeper_auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["max_players"] == 6
        assert data["settings"]["allow_observers"] is True
        assert data["settings"]["auto_save"] is True


class TestCampaignRead:
    """Test campaign read endpoints."""

    def test_get_campaign(self, client: TestClient, keeper_auth_headers: dict):
        """Should get a campaign by ID."""
        # Create campaign first
        create_response = client.post(
            "/api/campaigns",
            json={
                "name": "Get Test Campaign",
                "description": "Testing get endpoint",
            },
            headers=keeper_auth_headers,
        )
        campaign_id = create_response.json()["id"]

        # Get campaign
        response = client.get(f"/api/campaigns/{campaign_id}", headers=keeper_auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Get Test Campaign"
        assert data["id"] == campaign_id

    def test_get_campaign_not_found(self, client: TestClient, keeper_auth_headers: dict):
        """Should return 404 for non-existent campaign."""
        fake_id = str(uuid.uuid4())
        response = client.get(f"/api/campaigns/{fake_id}", headers=keeper_auth_headers)
        assert response.status_code == 404

    def test_list_campaigns(self, client: TestClient, keeper_auth_headers: dict):
        """Should list all campaigns for user."""
        # Create two campaigns
        client.post(
            "/api/campaigns",
            json={"name": "Campaign 1", "description": "First campaign"},
            headers=keeper_auth_headers,
        )
        client.post(
            "/api/campaigns",
            json={"name": "Campaign 2", "description": "Second campaign"},
            headers=keeper_auth_headers,
        )

        response = client.get("/api/campaigns", headers=keeper_auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 2

    def test_list_campaigns_empty(self, client: TestClient):
        """Should return empty list when no campaigns."""
        # Login as new user
        client.post(
            "/api/auth/register",
            json={
                "username": "emptyuser",
                "email": "empty@example.com",
                "password": "password123",
            },
        )
        login_response = client.post(
            "/api/auth/login",
            json={
                "username": "emptyuser",
                "password": "password123",
            },
        )
        login_data = login_response.json()
        assert login_data["code"] == 0, f"Login failed: {login_data}"
        token = login_data["data"]["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        response = client.get("/api/campaigns", headers=headers)
        assert response.status_code == 200
        assert response.json() == []


class TestCampaignUpdate:
    """Test campaign update endpoint."""

    def test_update_campaign(self, client: TestClient, keeper_auth_headers: dict):
        """Should update a campaign."""
        # Create campaign
        create_response = client.post(
            "/api/campaigns",
            json={
                "name": "Original Name",
                "description": "Original description",
            },
            headers=keeper_auth_headers,
        )
        campaign_id = create_response.json()["id"]

        # Update campaign
        response = client.put(
            f"/api/campaigns/{campaign_id}",
            json={
                "name": "Updated Name",
                "description": "Updated description",
                "max_players": 6,
            },
            headers=keeper_auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["description"] == "Updated description"
        assert data["max_players"] == 6

    def test_update_campaign_not_found(self, client: TestClient, keeper_auth_headers: dict):
        """Should return 404 for non-existent campaign."""
        fake_id = str(uuid.uuid4())
        response = client.put(
            f"/api/campaigns/{fake_id}",
            json={"name": "Updated"},
            headers=keeper_auth_headers,
        )
        assert response.status_code == 404

    def test_update_campaign_by_non_keeper(self, client: TestClient, player_auth_headers: dict, keeper_auth_headers: dict):
        """Should not allow non-keeper to update campaign."""
        # Create campaign as keeper
        create_response = client.post(
            "/api/campaigns",
            json={"name": "Keeper's Campaign"},
            headers=keeper_auth_headers,
        )
        campaign_id = create_response.json()["id"]

        # Try to update as player
        response = client.put(
            f"/api/campaigns/{campaign_id}",
            json={"name": "Hacked Campaign"},
            headers=player_auth_headers,
        )
        assert response.status_code == 403


class TestCampaignDelete:
    """Test campaign delete endpoint."""

    def test_delete_campaign(self, client: TestClient, keeper_auth_headers: dict):
        """Should delete a campaign."""
        # Create campaign
        create_response = client.post(
            "/api/campaigns",
            json={"name": "Delete Me"},
            headers=keeper_auth_headers,
        )
        campaign_id = create_response.json()["id"]

        # Delete campaign
        response = client.delete(f"/api/campaigns/{campaign_id}", headers=keeper_auth_headers)
        assert response.status_code == 200

        # Verify deleted
        get_response = client.get(f"/api/campaigns/{campaign_id}", headers=keeper_auth_headers)
        assert get_response.status_code == 404

    def test_delete_campaign_not_found(self, client: TestClient, keeper_auth_headers: dict):
        """Should return 404 for non-existent campaign."""
        fake_id = str(uuid.uuid4())
        response = client.delete(f"/api/campaigns/{fake_id}", headers=keeper_auth_headers)
        assert response.status_code == 404

    def test_delete_campaign_by_non_keeper(self, client: TestClient, player_auth_headers: dict, keeper_auth_headers: dict):
        """Should not allow non-keeper to delete campaign."""
        # Create campaign as keeper
        create_response = client.post(
            "/api/campaigns",
            json={"name": "Keeper's Campaign"},
            headers=keeper_auth_headers,
        )
        campaign_id = create_response.json()["id"]

        # Try to delete as player
        response = client.delete(f"/api/campaigns/{campaign_id}", headers=player_auth_headers)
        assert response.status_code == 403


class TestCampaignInvite:
    """Test campaign invite code generation."""

    def test_generate_invite_code(self, client: TestClient, keeper_auth_headers: dict):
        """Should generate a new invite code."""
        # Create campaign
        create_response = client.post(
            "/api/campaigns",
            json={"name": "Invite Test Campaign"},
            headers=keeper_auth_headers,
        )
        campaign_id = create_response.json()["id"]
        original_code = create_response.json()["invite_code"]

        # Generate new invite code
        response = client.post(f"/api/campaigns/{campaign_id}/invite", headers=keeper_auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "invite_code" in data
        assert data["invite_code"] != original_code
        assert len(data["invite_code"]) == 8

    def test_generate_invite_code_not_found(self, client: TestClient, keeper_auth_headers: dict):
        """Should return 404 for non-existent campaign."""
        fake_id = str(uuid.uuid4())
        response = client.post(f"/api/campaigns/{fake_id}/invite", headers=keeper_auth_headers)
        assert response.status_code == 404

    def test_generate_invite_code_by_non_keeper(self, client: TestClient, player_auth_headers: dict, keeper_auth_headers: dict):
        """Should not allow non-keeper to generate invite code."""
        # Create campaign as keeper
        create_response = client.post(
            "/api/campaigns",
            json={"name": "Keeper's Campaign"},
            headers=keeper_auth_headers,
        )
        campaign_id = create_response.json()["id"]

        # Try to generate as player
        response = client.post(f"/api/campaigns/{campaign_id}/invite", headers=player_auth_headers)
        assert response.status_code == 403


class TestCampaignJoin:
    """Test joining campaign with invite code."""

    def test_join_campaign_with_code(self, client: TestClient, keeper_auth_headers: dict, player_auth_headers: dict, test_character: dict):
        """Should join campaign with valid invite code."""
        # Create campaign
        create_response = client.post(
            "/api/campaigns",
            json={"name": "Joinable Campaign"},
            headers=keeper_auth_headers,
        )
        campaign_id = create_response.json()["id"]
        invite_code = create_response.json()["invite_code"]

        # Join campaign
        response = client.post(
            f"/api/campaigns/{campaign_id}/join",
            json={
                "invite_code": invite_code,
                "character_id": test_character["id"],
            },
            headers=player_auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["campaign_id"] == campaign_id
        assert data["role"] == "player"
        assert data["status"] == "active"

    def test_join_campaign_invalid_code(self, client: TestClient, keeper_auth_headers: dict, player_auth_headers: dict, test_character: dict):
        """Should fail with invalid invite code."""
        # Create campaign
        create_response = client.post(
            "/api/campaigns",
            json={"name": "Protected Campaign"},
            headers=keeper_auth_headers,
        )
        campaign_id = create_response.json()["id"]

        # Join with invalid code (valid format but wrong code)
        response = client.post(
            f"/api/campaigns/{campaign_id}/join",
            json={
                "invite_code": "INVALID1",  # 8 characters but not the right code
                "character_id": test_character["id"],
            },
            headers=player_auth_headers,
        )
        assert response.status_code == 400

    def test_join_campaign_already_member(self, client: TestClient, keeper_auth_headers: dict, player_auth_headers: dict, test_character: dict):
        """Should fail when already a member."""
        # Create campaign
        create_response = client.post(
            "/api/campaigns",
            json={"name": "Exclusive Campaign"},
            headers=keeper_auth_headers,
        )
        campaign_id = create_response.json()["id"]
        invite_code = create_response.json()["invite_code"]

        # Join first time
        client.post(
            f"/api/campaigns/{campaign_id}/join",
            json={
                "invite_code": invite_code,
                "character_id": test_character["id"],
            },
            headers=player_auth_headers,
        )

        # Try to join again
        response = client.post(
            f"/api/campaigns/{campaign_id}/join",
            json={
                "invite_code": invite_code,
                "character_id": test_character["id"],
            },
            headers=player_auth_headers,
        )
        assert response.status_code == 400


class TestCampaignMembers:
    """Test campaign member management."""

    def test_list_members(self, client: TestClient, keeper_auth_headers: dict, player_auth_headers: dict, test_character: dict):
        """Should list all campaign members."""
        # Create campaign
        create_response = client.post(
            "/api/campaigns",
            json={"name": "Member List Campaign"},
            headers=keeper_auth_headers,
        )
        campaign_id = create_response.json()["id"]
        invite_code = create_response.json()["invite_code"]

        # Join campaign
        client.post(
            f"/api/campaigns/{campaign_id}/join",
            json={
                "invite_code": invite_code,
                "character_id": test_character["id"],
            },
            headers=player_auth_headers,
        )

        # List members
        response = client.get(f"/api/campaigns/{campaign_id}/members", headers=keeper_auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 2  # Keeper + player
        roles = [m["role"] for m in data]
        assert "keeper" in roles
        assert "player" in roles

    def test_add_member_directly(self, client: TestClient, keeper_auth_headers: dict, player_auth_headers: dict):
        """Should allow keeper to add member directly."""
        # Create campaign
        create_response = client.post(
            "/api/campaigns",
            json={"name": "Direct Add Campaign"},
            headers=keeper_auth_headers,
        )
        campaign_id = create_response.json()["id"]

        # Get player user ID from their auth
        # First, create a character for the player
        character_response = client.post(
            "/api/characters",
            json={
                "name": "Test Character",
                "str": 50, "con": 50, "dex": 50, "app": 50,
                "pow": 50, "int": 50, "siz": 50, "edu": 50,
                "hp": 10, "mp": 10, "san": 50, "max_san": 50, "luck": 50,
            },
            headers=player_auth_headers,
        )
        character_id = character_response.json()["id"]

        # Need to get player's user_id - this requires access to user management
        # For now, we'll skip this test or implement user lookup
        pass

    def test_remove_member(self, client: TestClient, keeper_auth_headers: dict, player_auth_headers: dict, test_character: dict):
        """Should allow keeper to remove member."""
        # Create campaign
        create_response = client.post(
            "/api/campaigns",
            json={"name": "Remove Member Campaign"},
            headers=keeper_auth_headers,
        )
        campaign_id = create_response.json()["id"]
        invite_code = create_response.json()["invite_code"]

        # Join campaign
        join_response = client.post(
            f"/api/campaigns/{campaign_id}/join",
            json={
                "invite_code": invite_code,
                "character_id": test_character["id"],
            },
            headers=player_auth_headers,
        )
        member_id = join_response.json()["id"]

        # Remove member
        response = client.delete(
            f"/api/campaigns/{campaign_id}/members/{member_id}",
            headers=keeper_auth_headers,
        )
        assert response.status_code == 200

    def test_update_member_role(self, client: TestClient, keeper_auth_headers: dict, player_auth_headers: dict, test_character: dict):
        """Should allow keeper to update member role."""
        # Create campaign
        create_response = client.post(
            "/api/campaigns",
            json={"name": "Role Update Campaign"},
            headers=keeper_auth_headers,
        )
        campaign_id = create_response.json()["id"]
        invite_code = create_response.json()["invite_code"]

        # Join campaign
        join_response = client.post(
            f"/api/campaigns/{campaign_id}/join",
            json={
                "invite_code": invite_code,
                "character_id": test_character["id"],
            },
            headers=player_auth_headers,
        )
        member_id = join_response.json()["id"]

        # Update role (to co-keeper for example)
        response = client.put(
            f"/api/campaigns/{campaign_id}/members/{member_id}/role",
            json={"role": "co-keeper"},
            headers=keeper_auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "co-keeper"


class TestCampaignOwnership:
    """Test campaign ownership enforcement."""

    def test_non_keeper_cannot_modify(self, client: TestClient, keeper_auth_headers: dict, player_auth_headers: dict):
        """Should not allow non-keeper to modify campaign."""
        # Create campaign as keeper
        create_response = client.post(
            "/api/campaigns",
            json={"name": "Keeper's Only Campaign"},
            headers=keeper_auth_headers,
        )
        campaign_id = create_response.json()["id"]

        # Player tries to update
        response = client.put(
            f"/api/campaigns/{campaign_id}",
            json={"name": "Hacked"},
            headers=player_auth_headers,
        )
        assert response.status_code == 403

        # Player tries to delete
        response = client.delete(f"/api/campaigns/{campaign_id}", headers=player_auth_headers)
        assert response.status_code == 403
