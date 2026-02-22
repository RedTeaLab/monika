"""Tests for Spotlight Manager service (TDD - Test First)."""
import pytest
import asyncio
from uuid import uuid4

from src.services.spotlight import (
    SpotlightManager,
    SpotlightState,
    SpotlightRequest,
    SpotlightStatus,
)


class TestSpotlightManager:
    """Test SpotlightManager with strict TDD approach."""

    @pytest.fixture
    def manager(self):
        """Create a fresh SpotlightManager for each test."""
        return SpotlightManager()

    @pytest.fixture
    def session_id(self):
        """Test session ID."""
        return str(uuid4())

    @pytest.fixture
    def user1_id(self):
        """Test user 1 ID."""
        return str(uuid4())

    @pytest.fixture
    def user2_id(self):
        """Test user 2 ID."""
        return str(uuid4())

    @pytest.fixture
    def user3_id(self):
        """Test user 3 ID."""
        return str(uuid4())

    class TestInitialState:
        """Test initial state of SpotlightManager."""

        def test_initial_state_is_idle(self, manager, session_id):
            """Manager should start in IDLE state."""
            status = manager.get_status(session_id)
            assert status.state == SpotlightState.IDLE
            assert status.current_holder is None
            assert len(status.queue) == 0

        def test_different_sessions_independent(self, manager):
            """Different sessions should have independent states."""
            session1 = str(uuid4())
            session2 = str(uuid4())

            status1 = manager.get_status(session1)
            status2 = manager.get_status(session2)

            assert status1.state == SpotlightState.IDLE
            assert status2.state == SpotlightState.IDLE

    class TestRequestSpotlight:
        """Test spotlight request functionality."""

        def test_first_request_immediately_granted(self, manager, session_id, user1_id):
            """First request should immediately be granted spotlight."""
            request = SpotlightRequest(
                session_id=session_id,
                user_id=user1_id,
                character_id=str(uuid4()),
            )

            result = asyncio.run(manager.request_spotlight(request))

            assert result.granted is True
            assert result.queue_position == 0
            assert result.message == "Spotlight granted"

            # Verify state updated
            status = manager.get_status(session_id)
            assert status.state == SpotlightState.ACTIVE
            assert status.current_holder == user1_id

        def test_second_request_queued(self, manager, session_id, user1_id, user2_id):
            """Second request should be queued."""
            # First user gets spotlight
            request1 = SpotlightRequest(
                session_id=session_id,
                user_id=user1_id,
                character_id=str(uuid4()),
            )
            asyncio.run(manager.request_spotlight(request1))

            # Second user should be queued
            request2 = SpotlightRequest(
                session_id=session_id,
                user_id=user2_id,
                character_id=str(uuid4()),
            )
            result = asyncio.run(manager.request_spotlight(request2))

            assert result.granted is False
            assert result.queue_position == 1
            assert "queued" in result.message.lower()

            # Verify state
            status = manager.get_status(session_id)
            assert status.state == SpotlightState.QUEUED
            assert status.current_holder == user1_id
            assert len(status.queue) == 1
            assert status.queue[0]["user_id"] == user2_id

        def test_multiple_requests_queued_in_order(self, manager, session_id, user1_id, user2_id, user3_id):
            """Multiple requests should be queued in order."""
            # First user gets spotlight
            request1 = SpotlightRequest(
                session_id=session_id,
                user_id=user1_id,
                character_id=str(uuid4()),
            )
            asyncio.run(manager.request_spotlight(request1))

            # Second and third users queued
            request2 = SpotlightRequest(
                session_id=session_id,
                user_id=user2_id,
                character_id=str(uuid4()),
            )
            asyncio.run(manager.request_spotlight(request2))

            request3 = SpotlightRequest(
                session_id=session_id,
                user_id=user3_id,
                character_id=str(uuid4()),
            )
            asyncio.run(manager.request_spotlight(request3))

            # Verify queue order
            status = manager.get_status(session_id)
            assert len(status.queue) == 2
            assert status.queue[0]["user_id"] == user2_id
            assert status.queue[1]["user_id"] == user3_id

        def test_duplicate_request_ignored(self, manager, session_id, user1_id):
            """User already in queue should not be added again."""
            request = SpotlightRequest(
                session_id=session_id,
                user_id=user1_id,
                character_id=str(uuid4()),
            )

            # First request - granted
            asyncio.run(manager.request_spotlight(request))

            # Duplicate request - should be ignored or return same state
            result = asyncio.run(manager.request_spotlight(request))

            assert result.granted is True
            status = manager.get_status(session_id)
            assert len(status.queue) == 0

    class TestReleaseSpotlight:
        """Test spotlight release functionality."""

        def test_release_by_holder_transfers_to_next(self, manager, session_id, user1_id, user2_id):
            """Release by holder should transfer to next in queue."""
            # Setup: user1 has spotlight, user2 is queued
            request1 = SpotlightRequest(
                session_id=session_id,
                user_id=user1_id,
                character_id=str(uuid4()),
            )
            asyncio.run(manager.request_spotlight(request1))

            request2 = SpotlightRequest(
                session_id=session_id,
                user_id=user2_id,
                character_id=str(uuid4()),
            )
            asyncio.run(manager.request_spotlight(request2))

            # Release spotlight
            result = asyncio.run(manager.release_spotlight(session_id, user1_id))

            assert result.success is True
            assert result.next_holder == user2_id
            assert "transferred" in result.message.lower()

            # Verify state transferred
            status = manager.get_status(session_id)
            assert status.state == SpotlightState.ACTIVE
            assert status.current_holder == user2_id
            assert len(status.queue) == 0

        def test_release_when_queue_empty_returns_to_idle(self, manager, session_id, user1_id):
            """Release when queue is empty should return to IDLE."""
            # Setup: user1 has spotlight, no queue
            request = SpotlightRequest(
                session_id=session_id,
                user_id=user1_id,
                character_id=str(uuid4()),
            )
            asyncio.run(manager.request_spotlight(request))

            # Release spotlight
            result = asyncio.run(manager.release_spotlight(session_id, user1_id))

            assert result.success is True
            assert result.next_holder is None

            # Verify state returned to IDLE
            status = manager.get_status(session_id)
            assert status.state == SpotlightState.IDLE
            assert status.current_holder is None
            assert len(status.queue) == 0

        def test_release_by_non_holder_fails(self, manager, session_id, user1_id, user2_id):
            """Release by non-holder should fail."""
            # Setup: user1 has spotlight
            request1 = SpotlightRequest(
                session_id=session_id,
                user_id=user1_id,
                character_id=str(uuid4()),
            )
            asyncio.run(manager.request_spotlight(request1))

            # user2 tries to release (but doesn't have spotlight)
            result = asyncio.run(manager.release_spotlight(session_id, user2_id))

            assert result.success is False
            assert "not" in result.message.lower() and "holder" in result.message.lower()

            # State unchanged
            status = manager.get_status(session_id)
            assert status.state == SpotlightState.ACTIVE
            assert status.current_holder == user1_id

        def test_release_from_idle_state_fails(self, manager, session_id, user1_id):
            """Release from IDLE state should fail gracefully."""
            result = asyncio.run(manager.release_spotlight(session_id, user1_id))

            assert result.success is False

    class TestConcurrentAccess:
        """Test concurrent access to spotlight system."""

        def test_concurrent_requests_serialized(self, manager, session_id):
            """Concurrent requests should be properly serialized."""
            import asyncio

            users = [str(uuid4()) for _ in range(5)]

            async def request_all():
                tasks = []
                for user_id in users:
                    request = SpotlightRequest(
                        session_id=session_id,
                        user_id=user_id,
                        character_id=str(uuid4()),
                    )
                    tasks.append(manager.request_spotlight(request))
                results = await asyncio.gather(*tasks)
                return results

            results = asyncio.run(request_all())

            # Only first should be granted
            granted_count = sum(1 for r in results if r.granted)
            assert granted_count == 1

            # All others should be queued
            queued_results = [r for r in results if not r.granted]
            assert len(queued_results) == 4

            # Verify queue positions
            positions = sorted([r.queue_position for r in queued_results])
            assert positions == [1, 2, 3, 4]

        def test_concurrent_release_and_request(self, manager, session_id):
            """Concurrent release and request should be handled correctly."""
            import asyncio

            user1 = str(uuid4())
            user2 = str(uuid4())
            user3 = str(uuid4())

            # Setup: user1 has spotlight, user2 and user3 in queue
            request1 = SpotlightRequest(
                session_id=session_id,
                user_id=user1,
                character_id=str(uuid4()),
            )
            asyncio.run(manager.request_spotlight(request1))

            request2 = SpotlightRequest(
                session_id=session_id,
                user_id=user2,
                character_id=str(uuid4()),
            )
            asyncio.run(manager.request_spotlight(request2))

            request3 = SpotlightRequest(
                session_id=session_id,
                user_id=user3,
                character_id=str(uuid4()),
            )
            asyncio.run(manager.request_spotlight(request3))

            # Concurrently release and request
            async def concurrent_operations():
                release_task = asyncio.create_task(manager.release_spotlight(session_id, user1))

                # New request while releasing
                new_request = SpotlightRequest(
                    session_id=session_id,
                    user_id=str(uuid4()),
                    character_id=str(uuid4()),
                )
                request_task = asyncio.create_task(manager.request_spotlight(new_request))

                await asyncio.gather(release_task, request_task)

            asyncio.run(concurrent_operations())

            # Verify consistent state
            status = manager.get_status(session_id)
            assert status.state in [SpotlightState.ACTIVE, SpotlightState.QUEUED]

    class TestGetStatus:
        """Test get_status functionality."""

        def test_get_status_returns_current_state(self, manager, session_id, user1_id):
            """get_status should return current state."""
            request = SpotlightRequest(
                session_id=session_id,
                user_id=user1_id,
                character_id=str(uuid4()),
            )
            asyncio.run(manager.request_spotlight(request))

            status = manager.get_status(session_id)

            assert status.state == SpotlightState.ACTIVE
            assert status.current_holder == user1_id
            assert len(status.queue) == 0
            assert status.timestamp is not None

        def test_get_status_with_queue(self, manager, session_id, user1_id, user2_id, user3_id):
            """get_status should include queue information."""
            # Setup: user1 has spotlight, user2 and user3 queued
            asyncio.run(manager.request_spotlight(SpotlightRequest(
                session_id=session_id,
                user_id=user1_id,
                character_id=str(uuid4()),
            )))
            asyncio.run(manager.request_spotlight(SpotlightRequest(
                session_id=session_id,
                user_id=user2_id,
                character_id=str(uuid4()),
            )))
            asyncio.run(manager.request_spotlight(SpotlightRequest(
                session_id=session_id,
                user_id=user3_id,
                character_id=str(uuid4()),
            )))

            status = manager.get_status(session_id)

            assert len(status.queue) == 2
            assert status.queue[0]["user_id"] == user2_id
            assert status.queue[1]["user_id"] == user3_id
