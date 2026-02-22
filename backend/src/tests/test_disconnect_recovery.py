"""Tests for disconnect recovery mechanism.

This test suite follows TDD principles:
1. Tests are written FIRST
2. Tests document expected behavior
3. Implementation follows to make tests pass

Coverage Goals:
- Disconnect detection: 100%
- State persistence: 100%
- Reconnection handling: 100%
- Message recovery: 95%
- Spotlight recovery: 90%
"""
import pytest
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any
from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy.ext.asyncio import AsyncSession


# =============================================================================
# Test Data Fixtures
# =============================================================================

@pytest.fixture
def session_id():
    """Test session ID."""
    return str(uuid.uuid4())


@pytest.fixture
def user_id():
    """Test user ID."""
    return str(uuid.uuid4())


@pytest.fixture
def campaign_id():
    """Test campaign ID."""
    return str(uuid.uuid4())


@pytest.fixture
def character_id():
    """Test character ID."""
    return str(uuid.uuid4())


# =============================================================================
# Disconnect Detection Tests (M2-090)
# =============================================================================

class TestDisconnectDetection:
    """Tests for detecting client disconnections."""

    @pytest.mark.asyncio
    async def test_detect_socket_disconnect(self, session_id, user_id):
        """Test detection of socket disconnection.

        Expected: Disconnect is detected and recorded.
        """
        from src.services.disconnect_recovery import DisconnectDetector

        detector = DisconnectDetector()

        # Simulate disconnect event
        await detector.on_disconnect(session_id, user_id)

        # Check disconnect was recorded
        status = await detector.get_disconnect_status(session_id)

        assert status is not None
        assert status["disconnected"] is True
        assert status["user_id"] == user_id

    @pytest.mark.asyncio
    async def test_detect_heartbeat_timeout(self, session_id, user_id):
        """Test detection of heartbeat timeout.

        Expected: Disconnect is detected after timeout.
        """
        from src.services.disconnect_recovery import DisconnectDetector

        detector = DisconnectDetector(timeout_seconds=5)

        # Simulate last activity
        await detector.update_activity(session_id, user_id)

        # Simulate time passing (beyond timeout)
        with patch('src.services.disconnect_recovery.datetime') as mock_datetime:
            mock_datetime.now.return_value = datetime.now() + timedelta(seconds=6)

            # Check if timeout detected
            is_timeout = await detector.check_timeout(session_id)

        assert is_timeout is True

    @pytest.mark.asyncio
    async def test_no_false_positive_timeout(self, session_id, user_id):
        """Test that active connections don't trigger timeout.

        Expected: No timeout if recent activity.
        """
        from src.services.disconnect_recovery import DisconnectDetector

        detector = DisconnectDetector(timeout_seconds=5)

        # Update activity
        await detector.update_activity(session_id, user_id)

        # Check timeout (should be false)
        is_timeout = await detector.check_timeout(session_id)

        assert is_timeout is False

    @pytest.mark.asyncio
    async def test_multiple_session_disconnects(self, user_id):
        """Test tracking disconnects for multiple sessions.

        Expected: Each session tracked independently.
        """
        from src.services.disconnect_recovery import DisconnectDetector

        detector = DisconnectDetector()

        session1 = str(uuid.uuid4())
        session2 = str(uuid.uuid4())

        await detector.on_disconnect(session1, user_id)
        await detector.on_disconnect(session2, user_id)

        status1 = await detector.get_disconnect_status(session1)
        status2 = await detector.get_disconnect_status(session2)

        assert status1["disconnected"] is True
        assert status2["disconnected"] is True


# =============================================================================
# State Persistence Tests (M2-091)
# =============================================================================

class TestStatePersistence:
    """Tests for persisting game state on disconnect."""

    @pytest.mark.asyncio
    async def test_save_session_state(self, session_id):
        """Test saving session state on disconnect.

        Expected: Session state is persisted to database.
        """
        from src.services.disconnect_recovery import StatePersistence
        from unittest.mock import AsyncMock

        persistence = StatePersistence()
        mock_db = AsyncMock()

        state = {
            "session_id": session_id,
            "current_scene": "Library",
            "world_state": {"clue_found": True},
            "timestamp": datetime.now().isoformat()
        }

        await persistence.save_state(mock_db, state)

        mock_db.execute.assert_called_once()
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_load_session_state(self, session_id):
        """Test loading session state on reconnect.

        Expected: Saved state is loaded from database.
        """
        from src.services.disconnect_recovery import StatePersistence
        from unittest.mock import AsyncMock

        persistence = StatePersistence()
        mock_db = AsyncMock()

        # Mock database response
        mock_result = AsyncMock()
        mock_result.scalar_one_or_none.return_value = {
            "current_scene": "Library",
            "world_state": {"clue_found": True}
        }
        mock_db.execute.return_value = mock_result

        state = await persistence.load_state(mock_db, session_id)

        assert state["current_scene"] == "Library"
        assert state["world_state"]["clue_found"] is True

    @pytest.mark.asyncio
    async def test_save_player_state(self, session_id, user_id, character_id):
        """Test saving player-specific state.

        Expected: Player state is persisted.
        """
        from src.services.disconnect_recovery import StatePersistence

        persistence = StatePersistence()
        mock_db = AsyncMock()

        player_state = {
            "user_id": user_id,
            "character_id": character_id,
            "hp": 8,
            "sanity": 60,
            "last_action": "searched room"
        }

        await persistence.save_player_state(mock_db, session_id, player_state)

        # Should save without error
        mock_db.execute.assert_called()

    @pytest.mark.asyncio
    async def test_state_versioning(self, session_id):
        """Test that state changes are versioned.

        Expected: Each state update increments version.
        """
        from src.services.disconnect_recovery import StatePersistence

        persistence = StatePersistence()
        mock_db = AsyncMock()

        # Save version 1
        state_v1 = {"version": 1, "scene": "Room A"}
        await persistence.save_state(mock_db, session_id, state_v1)

        # Save version 2
        state_v2 = {"version": 2, "scene": "Room B"}
        await persistence.save_state(mock_db, session_id, state_v2)

        # Verify both saves happened
        assert mock_db.execute.call_count == 2


# =============================================================================
# Message Recovery Tests (M2-092)
# =============================================================================

class TestMessageRecovery:
    """Tests for recovering missed messages."""

    @pytest.mark.asyncio
    async def test_get_missed_messages(self, session_id, user_id):
        """Test retrieving messages sent while disconnected.

        Expected: Returns messages sent during disconnect period.
        """
        from src.services.disconnect_recovery import MessageRecovery

        recovery = MessageRecovery()

        disconnect_time = datetime.now() - timedelta(minutes=5)
        reconnect_time = datetime.now()

        # Mock messages sent during disconnect
        missed_messages = [
            {
                "id": str(uuid.uuid4()),
                "content": "Something happened while you were away",
                "timestamp": (datetime.now() - timedelta(minutes=2)).isoformat()
            }
        ]

        with patch.object(recovery, 'get_messages_in_range', return_value=missed_messages):
            messages = await recovery.get_missed_messages(
                session_id,
                user_id,
                disconnect_time,
                reconnect_time
            )

        assert len(messages) == 1
        assert "happened while you were away" in messages[0]["content"]

    @pytest.mark.asyncio
    async def test_filter_missed_messages_by_visibility(self, session_id, user_id):
        """Test that missed messages are filtered by visibility.

        Expected: User only sees messages they're allowed to see.
        """
        from src.services.disconnect_recovery import MessageRecovery

        recovery = MessageRecovery()

        disconnect_time = datetime.now() - timedelta(minutes=5)
        reconnect_time = datetime.now()

        # Mix of public and private messages
        all_messages = [
            {
                "id": "msg-1",
                "content": "Public event",
                "visibility": "public",
                "timestamp": datetime.now().isoformat()
            },
            {
                "id": "msg-2",
                "content": "Secret KP info",
                "visibility": "kp",
                "timestamp": datetime.now().isoformat()
            }
        ]

        with patch.object(recovery, 'get_messages_in_range', return_value=all_messages):
            messages = await recovery.get_missed_messages(
                session_id,
                user_id,
                disconnect_time,
                reconnect_time,
                user_role="player"
            )

        # Player should only see public messages
        assert len(messages) == 1
        assert messages[0]["visibility"] == "public"

    @pytest.mark.asyncio
    async def test_empty_missed_messages(self, session_id, user_id):
        """Test getting missed messages when none exist.

        Expected: Returns empty list.
        """
        from src.services.disconnect_recovery import MessageRecovery

        recovery = MessageRecovery()

        disconnect_time = datetime.now() - timedelta(seconds=10)
        reconnect_time = datetime.now()

        with patch.object(recovery, 'get_messages_in_range', return_value=[]):
            messages = await recovery.get_missed_messages(
                session_id,
                user_id,
                disconnect_time,
                reconnect_time
            )

        assert messages == []


# =============================================================================
# Reconnection Handling Tests (M2-093)
# =============================================================================

class TestReconnectionHandling:
    """Tests for handling client reconnection."""

    @pytest.mark.asyncio
    async def test_restore_session_on_reconnect(self, session_id, user_id, campaign_id):
        """Test restoring session state on reconnection.

        Expected: Session state is restored and sent to client.
        """
        from src.services.disconnect_recovery import ReconnectionHandler

        handler = ReconnectionHandler()
        mock_db = AsyncMock()
        mock_socket = AsyncMock()

        # Mock saved state
        saved_state = {
            "current_scene": "Library",
            "world_state": {"clues": ["old book"]}
        }

        with patch.object(handler, 'load_session_state', return_value=saved_state):
            await handler.handle_reconnect(
                mock_db,
                session_id,
                user_id,
                campaign_id,
                mock_socket
            )

        # Should send state to client
        mock_socket.emit.assert_called_with("state:restored", saved_state)

    @pytest.mark.asyncio
    async def test_send_missed_messages_on_reconnect(self, session_id, user_id):
        """Test sending missed messages on reconnection.

        Expected: Missed messages are sent to client.
        """
        from src.services.disconnect_recovery import ReconnectionHandler

        handler = ReconnectionHandler()
        mock_db = AsyncMock()
        mock_socket = AsyncMock()

        missed_messages = [
            {"id": "msg-1", "content": "Missed message 1"},
            {"id": "msg-2", "content": "Missed message 2"}
        ]

        with patch.object(handler, 'get_missed_messages', return_value=missed_messages):
            await handler.send_missed_messages(
                mock_db,
                session_id,
                user_id,
                mock_socket
            )

        # Should send messages to client
        mock_socket.emit.assert_called_once()
        call_args = mock_socket.emit.call_args
        assert call_args[0][0] == "messages:missed"
        assert len(call_args[0][1]) == 2

    @pytest.mark.asyncio
    async def test_update_presence_on_reconnect(self, session_id, user_id, campaign_id):
        """Test updating presence when user reconnects.

        Expected: Other users are notified of reconnection.
        """
        from src.services.disconnect_recovery import ReconnectionHandler

        handler = ReconnectionHandler()
        mock_socket = AsyncMock()

        await handler.notify_reconnected(
            session_id,
            user_id,
            campaign_id,
            "Returning Player",
            mock_socket
        )

        # Should broadcast to room
        mock_socket.emit.assert_called_once()
        call_args = mock_socket.emit.call_args
        assert call_args[0][0] == "member:reconnected"


# =============================================================================
# Spotlight Recovery Tests (M2-094)
# =============================================================================

class TestSpotlightRecovery:
    """Tests for recovering spotlight state."""

    @pytest.mark.asyncio
    async def test_restore_spotlight_state(self, session_id):
        """Test restoring spotlight queue state.

        Expected: Spotlight queue is restored to previous state.
        """
        from src.services.disconnect_recovery import SpotlightRecovery

        recovery = SpotlightRecovery()
        mock_db = AsyncMock()

        # Mock saved spotlight state
        saved_state = {
            "current_holder": "user-123",
            "queue": [
                {"user_id": "user-456", "position": 1},
                {"user_id": "user-789", "position": 2}
            ]
        }

        with patch.object(recovery, 'load_spotlight_state', return_value=saved_state):
            state = await recovery.restore_spotlight(mock_db, session_id)

        assert state["current_holder"] == "user-123"
        assert len(state["queue"]) == 2

    @pytest.mark.asyncio
    async def test_user_keeps_spotlight_after_reconnect(self, session_id, user_id):
        """Test that user keeps spotlight if they had it.

        Expected: User's spotlight position is maintained.
        """
        from src.services.disconnect_recovery import SpotlightRecovery

        recovery = SpotlightRecovery()

        # User had spotlight before disconnect
        user_had_spotlight = True

        with patch.object(recovery, 'load_spotlight_state', return_value={
            "current_holder": user_id,
            "queue": []
        }):
            has_spotlight = await recovery.user_has_spotlight(session_id, user_id)

        assert has_spotlight is True

    @pytest.mark.asyncio
    async def test_user_queue_position_preserved(self, session_id, user_id):
        """Test that user's queue position is preserved.

        Expected: User returns to their position in queue.
        """
        from src.services.disconnect_recovery import SpotlightRecovery

        recovery = SpotlightRecovery()

        with patch.object(recovery, 'load_spotlight_state', return_value={
            "current_holder": "other-user",
            "queue": [
                {"user_id": user_id, "position": 1},
                {"user_id": "user-3", "position": 2}
            ]
        }):
            position = await recovery.get_queue_position(session_id, user_id)

        assert position == 1

    @pytest.mark.asyncio
    async def test_no_spotloss_state_for_new_session(self, session_id):
        """Test handling when no spotlight state exists.

        Expected: Returns empty/default state.
        """
        from src.services.disconnect_recovery import SpotlightRecovery

        recovery = SpotlightRecovery()
        mock_db = AsyncMock()

        with patch.object(recovery, 'load_spotlight_state', return_value=None):
            state = await recovery.restore_spotlight(mock_db, session_id)

        assert state["current_holder"] is None
        assert state["queue"] == []


# =============================================================================
# Campaign State Sync Tests (M2-095)
# =============================================================================

class TestCampaignStateSync:
    """Tests for synchronizing campaign state after reconnection."""

    @pytest.mark.asyncio
    async def test_sync_campaign_members(self, campaign_id):
        """Test syncing campaign member list.

        Expected: Returns current campaign members.
        """
        from src.services.disconnect_recovery import CampaignStateSync

        sync = CampaignStateSync()
        mock_db = AsyncMock()

        members = [
            {"user_id": "user-1", "character_name": "Hero", "status": "online"},
            {"user_id": "user-2", "character_name": "Sidekick", "status": "online"}
        ]

        with patch.object(sync, 'get_campaign_members', return_value=members):
            result = await sync.sync_members(mock_db, campaign_id)

        assert len(result) == 2
        assert result[0]["character_name"] == "Hero"

    @pytest.mark.asyncio
    async def test_sync_campaign_events(self, campaign_id):
        """Test syncing recent campaign events.

        Expected: Returns recent events for context.
        """
        from src.services.disconnect_recovery import CampaignStateSync

        sync = CampaignStateSync()
        mock_db = AsyncMock()

        events = [
            {"description": "Entered the library", "timestamp": datetime.now().isoformat()},
            {"description": "Found a clue", "timestamp": datetime.now().isoformat()}
        ]

        with patch.object(sync, 'get_recent_events', return_value=events):
            result = await sync.sync_events(mock_db, campaign_id)

        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_full_campaign_sync(self, campaign_id):
        """Test full campaign state synchronization.

        Expected: Returns complete campaign state.
        """
        from src.services.disconnect_recovery import CampaignStateSync

        sync = CampaignStateSync()
        mock_db = AsyncMock()

        full_state = {
            "members": [{"user_id": "user-1", "status": "online"}],
            "events": [{"description": "Event 1"}],
            "world_state": {"key": "value"}
        }

        with patch.object(sync, 'get_full_state', return_value=full_state):
            result = await sync.full_sync(mock_db, campaign_id)

        assert "members" in result
        assert "events" in result
        assert "world_state" in result


# =============================================================================
# Recovery Acknowledgment Tests (M2-096)
# =============================================================================

class TestRecoveryAcknowledgment:
    """Tests for recovery acknowledgment and confirmation."""

    @pytest.mark.asyncio
    async def test_send_recovery_complete_ack(self, session_id):
        """Test sending recovery complete acknowledgment.

        Expected: Client receives confirmation of successful recovery.
        """
        from src.services.disconnect_recovery import RecoveryAcknowledgment

        ack = RecoveryAcknowledgment()
        mock_socket = AsyncMock()

        await ack.send_complete(mock_socket, session_id, {
            "messages_recovered": 5,
            "state_restored": True
        })

        mock_socket.emit.assert_called_once_with(
            "recovery:complete",
            {"messages_recovered": 5, "state_restored": True}
        )

    @pytest.mark.asyncio
    async def test_send_recovery_failed_ack(self, session_id):
        """Test sending recovery failed acknowledgment.

        Expected: Client receives error details.
        """
        from src.services.disconnect_recovery import RecoveryAcknowledgment

        ack = RecoveryAcknowledgment()
        mock_socket = AsyncMock()

        await ack.send_failed(mock_socket, session_id, {
            "error": "State corrupted",
            "code": "STATE_ERROR"
        })

        mock_socket.emit.assert_called_once()

    @pytest.mark.asyncio
    async def test_client_confirms_recovery(self, session_id):
        """Test processing client's recovery confirmation.

        Expected: Server marks recovery as complete.
        """
        from src.services.disconnect_recovery import RecoveryAcknowledgment

        ack = RecoveryAcknowledgment()

        await ack.client_confirmed(session_id)

        # Should mark recovery complete
        is_complete = await ack.is_recovery_complete(session_id)
        assert is_complete is True


# =============================================================================
# Partial Recovery Tests (M2-097)
# =============================================================================

class TestPartialRecovery:
    """Tests for handling partial/failed recovery."""

    @pytest.mark.asyncio
    async def test_state_not_available(self, session_id):
        """Test handling when saved state is not available.

        Expected: Falls back to current live state.
        """
        from src.services.disconnect_recovery import PartialRecovery

        recovery = PartialRecovery()
        mock_db = AsyncMock()

        with patch.object(recovery, 'load_saved_state', return_value=None):
            state = await recovery.handle_missing_state(mock_db, session_id)

        # Should get current state instead
        assert state is not None

    @pytest.mark.asyncio
    async def test_messages_partially_available(self, session_id, user_id):
        """Test when only some messages can be recovered.

        Expected: Returns available messages with warning.
        """
        from src.services.disconnect_recovery import PartialRecovery

        recovery = PartialRecovery()

        # Simulate partial message history
        available_messages = [
            {"id": "msg-1", "content": "Available message"}
        ]

        with patch.object(recovery, 'get_available_messages', return_value=available_messages):
            result = await_recovery.handle_partial_messages(session_id, user_id)

        assert "messages" in result
        assert "warning" in result
        assert result["warning"] is not None

    @pytest.mark.asyncio
    async def test_graceful_degradation(self, session_id):
        """Test graceful degradation when recovery fails.

        Expected: User can continue with limited functionality.
        """
        from src.services.disconnect_recovery import PartialRecovery

        recovery = PartialRecovery()
        mock_db = AsyncMock()
        mock_socket = AsyncMock()

        await_recovery.attempt_graceful_degradation(mock_db, session_id, mock_socket)

        # Should send minimal state
        mock_socket.emit.assert_called()


# =============================================================================
# Recovery Timeout Tests (M2-098)
# =============================================================================

class TestRecoveryTimeout:
    """Tests for recovery operation timeouts."""

    @pytest.mark.asyncio
    async def test_recovery_timeout(self, session_id):
        """Test that recovery operation times out after threshold.

        Expected: Recovery is aborted and error returned.
        """
        from src.services.disconnect_recovery import RecoveryTimeout

        timeout = RecoveryTimeout(timeout_seconds=1)

        # Simulate slow recovery
        async def slow_recovery():
            await asyncio.sleep(2)
            return {"success": True}

        with pytest.raises(TimeoutError):
            await timeout.execute_with_timeout(slow_recovery())

    @pytest.mark.asyncio
    async def test_recovery_completes_before_timeout(self, session_id):
        """Test that fast recovery completes successfully.

        Expected: Recovery completes before timeout.
        """
        from src.services.disconnect_recovery import RecoveryTimeout

        timeout = RecoveryTimeout(timeout_seconds=2)

        async def fast_recovery():
            await asyncio.sleep(0.5)
            return {"success": True}

        result = await timeout.execute_with_timeout(fast_recovery())

        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_partial_recovery_on_timeout(self, session_id):
        """Test returning partial results on timeout.

        Expected: Returns what was recovered before timeout.
        """
        from src.services.disconnect_recovery import RecoveryTimeout

        timeout = RecoveryTimeout(timeout_seconds=1, partial_on_timeout=True)

        async def slow_recovery():
            await asyncio.sleep(0.5)
            return {"messages": ["msg-1"]}  # Partial result
            await asyncio.sleep(1)  # Would timeout
            return {"messages": ["msg-1", "msg-2"]}

        result = await timeout.execute_with_timeout(slow_recovery())

        # Should have partial result
        assert "messages" in result
