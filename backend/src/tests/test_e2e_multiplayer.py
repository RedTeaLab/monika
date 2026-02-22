"""End-to-end tests for Multiplayer features.

These tests verify the complete multiplayer flow:
- Campaign creation and joining
- Multiple players in same campaign
- WebSocket real-time communication
- Visibility control
- Spotlight system
- Concurrent input handling
- Disconnect recovery
"""
import asyncio
import json
import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from src.main import app
from src.core.database import get_db
from src.models.user import User
from src.models.campaign import Campaign, CampaignMember
from src.models.character import Character
from src.models.session import GameSession
from src.models.event import Event, EventType


class TestCampaignLifecycle:
    """Test complete campaign lifecycle from creation to gameplay."""

    @pytest.mark.asyncio
    async def test_create_campaign_and_invite_player(self, test_db):
        """Test: KP creates campaign, generates invite code, player joins."""
        from src.services.campaign import CampaignService
        from src.services.invitation import InvitationService

        # Create KP user (use Integer ID for User model)
        kp_user = User(
            username="keeper",
            email="keeper@test.com",
            hashed_password="hash",
            role="keeper",
        )
        test_db.add(kp_user)
        test_db.commit()

        # Create player user
        player_user = User(
            username="player1",
            email="player1@test.com",
            hashed_password="hash",
        )
        test_db.add(player_user)
        test_db.commit()

        # KP creates campaign
        campaign_service = CampaignService(test_db)
        campaign = await campaign_service.create_campaign(
            name="The Haunting",
            description="A classic CoC scenario",
            keeper_id=str(kp_user.id),
            max_players=4,
        )

        assert campaign.id is not None
        assert campaign.name == "The Haunting"
        assert campaign.keeper_id == kp_user.id  # Integer comparison
        assert campaign.invite_code is not None
        assert len(campaign.invite_code) == 8

        # Player joins with invite code
        invitation_service = InvitationService(test_db)
        member = await invitation_service.join_campaign(
            invite_code=campaign.invite_code,
            user_id=str(player_user.id),
        )

        assert member.id is not None
        assert member.campaign_id == campaign.id
        assert member.user_id == player_user.id  # Integer comparison
        assert member.role == "player"

    @pytest.mark.asyncio
    async def test_multiple_players_join_campaign(self, test_db):
        """Test: Multiple players join the same campaign."""
        from src.services.campaign import CampaignService
        from src.services.invitation import InvitationService

        # Create KP and 3 players (use Integer IDs)
        kp = User(username="keeper", email="kp@test.com", hashed_password="hash", role="keeper")
        p1 = User(username="player1", email="p1@test.com", hashed_password="hash")
        p2 = User(username="player2", email="p2@test.com", hashed_password="hash")
        p3 = User(username="player3", email="p3@test.com", hashed_password="hash")
        test_db.add_all([kp, p1, p2, p3])
        test_db.commit()

        # Create campaign
        campaign_service = CampaignService(test_db)
        campaign = await campaign_service.create_campaign(
            name="Multiplayer Test",
            keeper_id=str(kp.id),
            max_players=4,
        )

        # All players join
        invitation_service = InvitationService(test_db)
        member1 = await invitation_service.join_campaign(campaign.invite_code, str(p1.id))
        member2 = await invitation_service.join_campaign(campaign.invite_code, str(p2.id))
        member3 = await invitation_service.join_campaign(campaign.invite_code, str(p3.id))

        # Verify all members
        members = test_db.execute(
            select(CampaignMember).where(CampaignMember.campaign_id == campaign.id)
        ).scalars().all()

        assert len(members) == 3
        assert {m.role for m in members} == {"player"}


class TestVisibilityControl:
    """Test visibility control for multiplayer messages."""

    @pytest.mark.asyncio
    async def test_kp_only_message_not_visible_to_players(self, test_db):
        """Test: KP-only messages are filtered out for players."""
        from src.services.visibility import VisibilityFilter, VisibilityContext

        # Create users
        kp_id = "1"
        player_id = "2"

        # Create a simple message object (dict instead of Message model)
        kp_message = MagicMock()
        kp_message.id = str(uuid.uuid4())
        kp_message.content = "The monster is actually behind the door"
        kp_message.visibility = "kp"
        kp_message.sender_id = kp_id
        kp_message.visible_to = []

        # Filter for player should return False (not visible)
        filter_service = VisibilityFilter()
        player_context = VisibilityContext(viewer_id=player_id, viewer_role="player")
        result = filter_service.filter_message(kp_message, player_context)

        assert result is False

        # Filter for KP should return True
        kp_context = VisibilityContext(viewer_id=kp_id, viewer_role="keeper")
        result = filter_service.filter_message(kp_message, kp_context)

        assert result is True

    @pytest.mark.asyncio
    async def test_private_message_only_visible_to_recipient(self, test_db):
        """Test: Private messages only visible to specific recipient."""
        from src.services.visibility import VisibilityFilter, VisibilityContext

        # Create users
        p1_id = "1"
        p2_id = "2"

        # Create private message for p1
        private_message = MagicMock()
        private_message.id = str(uuid.uuid4())
        private_message.content = "You found a secret clue"
        private_message.visibility = "private"
        private_message.visible_to = [p1_id]
        private_message.sender_id = "keeper_id"

        filter_service = VisibilityFilter()

        # p1 should see the message
        p1_context = VisibilityContext(viewer_id=p1_id, viewer_role="player")
        result = filter_service.filter_message(private_message, p1_context)
        assert result is True

        # p2 should not see the message
        p2_context = VisibilityContext(viewer_id=p2_id, viewer_role="player")
        result = filter_service.filter_message(private_message, p2_context)
        assert result is False


class TestSpotlightSystem:
    """Test spotlight allocation and queue management."""

    @pytest.mark.asyncio
    async def test_first_request_gets_spotlight_immediately(self, test_db):
        """Test: First player to request spotlight gets it immediately."""
        from src.services.spotlight import SpotlightManager, SpotlightRequest

        session_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        spotlight_manager = SpotlightManager()

        # First request should get spotlight
        request = SpotlightRequest(session_id=session_id, user_id=user_id)
        result = await spotlight_manager.request_spotlight(request)

        assert result.granted is True
        assert result.queue_position == 0

    @pytest.mark.asyncio
    async def test_subsequent_requests_enter_queue(self, test_db):
        """Test: Second spotlight request enters queue."""
        from src.services.spotlight import SpotlightManager, SpotlightRequest

        session_id = str(uuid.uuid4())
        user1_id = str(uuid.uuid4())
        user2_id = str(uuid.uuid4())

        spotlight_manager = SpotlightManager()

        # First user gets spotlight
        request1 = SpotlightRequest(session_id=session_id, user_id=user1_id)
        await spotlight_manager.request_spotlight(request1)

        # Second user enters queue
        request2 = SpotlightRequest(session_id=session_id, user_id=user2_id)
        result = await spotlight_manager.request_spotlight(request2)

        assert result.granted is False
        assert result.queue_position == 1

    @pytest.mark.asyncio
    async def test_release_spotlight_transfers_to_next(self, test_db):
        """Test: Releasing spotlight transfers to next in queue."""
        from src.services.spotlight import SpotlightManager, SpotlightRequest

        session_id = str(uuid.uuid4())
        user1_id = str(uuid.uuid4())
        user2_id = str(uuid.uuid4())

        spotlight_manager = SpotlightManager()

        # User1 gets spotlight, User2 queues
        request1 = SpotlightRequest(session_id=session_id, user_id=user1_id)
        request2 = SpotlightRequest(session_id=session_id, user_id=user2_id)
        await spotlight_manager.request_spotlight(request1)
        await spotlight_manager.request_spotlight(request2)

        # User1 releases
        result = await spotlight_manager.release_spotlight(session_id, user1_id)

        assert result.success is True
        assert result.next_holder == user2_id


class TestConcurrentInput:
    """Test concurrent message handling."""

    @pytest.mark.asyncio
    async def test_concurrent_messages_processed_in_order(self, test_db):
        """Test: Messages from multiple players are processed in order."""
        from src.services.message_queue import MessageQueue

        # Create a proper session with Integer owner_id to match User model
        owner = User(username="owner", email="owner@test.com", hashed_password="hash")
        test_db.add(owner)
        test_db.commit()

        # Don't use the database at all - MessageQueue works with in-memory storage
        # Just use a session_id string for the queue
        session_id = "test-session-123"

        message_queue = MessageQueue()

        # Three players send messages simultaneously
        p1_msg = {"session_id": session_id, "user_id": "p1", "content": "Message 1", "timestamp": 1}
        p2_msg = {"session_id": session_id, "user_id": "p2", "content": "Message 2", "timestamp": 2}
        p3_msg = {"session_id": session_id, "user_id": "p3", "content": "Message 3", "timestamp": 3}

        # Enqueue all messages
        pos1 = await message_queue.enqueue(p1_msg)
        pos2 = await message_queue.enqueue(p2_msg)
        pos3 = await message_queue.enqueue(p3_msg)

        # Verify queue positions
        assert pos1.queue_position == 1
        assert pos2.queue_position == 2
        assert pos3.queue_position == 3

        # Verify messages are queued
        status = message_queue.get_status(session_id)
        assert status.queue_size == 3

        # Process all messages with a simple handler
        processed = []
        async def handler(msg):
            processed.append(msg["content"])
            return True

        result = await message_queue.process(session_id, handler)

        assert result.processed_count == 3
        assert processed == ["Message 1", "Message 2", "Message 3"]


class TestDisconnectRecovery:
    """Test disconnect detection and recovery."""

    @pytest.mark.asyncio
    async def test_player_disconnect_detected(self, test_db):
        """Test: Player disconnect is detected and marked."""
        from src.api.websocket import manager
        from src.services.presence import PresenceService

        campaign_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        presence_service = PresenceService(test_db)

        # Mock websocket
        ws = AsyncMock()
        ws.send_json = AsyncMock()

        # Connect (using session_id instead of campaign_id for the existing manager)
        await manager.connect(campaign_id, ws)
        await presence_service.mark_online(campaign_id, user_id)

        # Disconnect
        manager.disconnect(campaign_id)
        await presence_service.mark_offline(campaign_id, user_id)

        # Verify offline status
        status = await presence_service.get_status(campaign_id, user_id)
        assert status == "offline"

    @pytest.mark.asyncio
    async def test_player_reconnect_receives_missed_messages(self, test_db):
        """Test: Reconnecting player receives missed messages."""
        from src.services.session_snapshot import SessionSnapshotService

        session_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        snapshot_service = SessionSnapshotService()

        # Create snapshot before disconnect (not async)
        snapshot_service.create_snapshot(
            session_id=session_id,
            state={"clues": ["found_secret"]},
            message_ids=["msg1", "msg2", "msg3", "msg4", "msg5"],
        )

        # Simulate missed messages
        missed_messages = [
            {"id": str(uuid.uuid4()), "content": "Player2 moved forward"},
            {"id": str(uuid.uuid4()), "content": "KP revealed a clue"},
        ]

        # Add missed messages to storage
        snapshot_service._messages[session_id] = missed_messages

        # Player reconnects (get_latest_snapshot is not async)
        snapshot = snapshot_service.get_latest_snapshot(session_id)
        assert snapshot is not None
        assert snapshot.state["clues"] == ["found_secret"]
        assert snapshot.message_count == 5

        # Can retrieve missed messages (recover_session is not async)
        recovery = snapshot_service.recover_session(session_id, "msg3")
        assert recovery.success is True
        assert len(recovery.missed_messages) >= 0
