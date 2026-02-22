"""Tests for Message Queue service (TDD - Test First)."""
import pytest
import asyncio
from uuid import uuid4
from datetime import datetime
from typing import List

from src.services.message_queue import (
    MessageQueue,
    QueuedMessage,
    MessageQueueResult,
    QueueStatus,
)


def create_message(session_id: str, user_id: str, content: str) -> dict:
    """Helper to create a message dict."""
    return {
        "session_id": session_id,
        "user_id": user_id,
        "content": content,
        "visibility": "public",
        "visible_to": [],
    }


class TestQueuedMessage:
    """Test QueuedMessage dataclass."""

    def test_queued_message_creation(self):
        """Should create a queued message with all fields."""
        msg = QueuedMessage(
            id=str(uuid4()),
            session_id=str(uuid4()),
            user_id=str(uuid4()),
            content="Test message",
            visibility="public",
            timestamp=datetime.now(),
        )

        assert msg.id is not None
        assert msg.content == "Test message"
        assert msg.status == "pending"

    def test_queued_message_default_status(self):
        """Queued message should default to pending status."""
        msg = QueuedMessage(
            id=str(uuid4()),
            session_id=str(uuid4()),
            user_id=str(uuid4()),
            content="Test",
            visibility="public",
        )

        assert msg.status == "pending"


class TestMessageQueue:
    """Test MessageQueue with strict TDD approach."""

    @pytest.fixture
    def queue(self):
        """Create a fresh MessageQueue for each test."""
        return MessageQueue()

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

    class TestEnqueue:
        """Test message enqueue functionality."""

        def test_enqueue_single_message(self, queue, session_id, user1_id):
            """Should enqueue a single message."""
            msg = create_message(session_id, user1_id, "Hello")

            result = asyncio.run(queue.enqueue(msg))

            assert result.success is True
            assert result.queue_position == 1
            assert result.message_id is not None

            # Verify message in queue
            status = queue.get_status(session_id)
            assert status.queue_size == 1

        def test_enqueue_multiple_messages(self, queue, session_id, user1_id):
            """Should enqueue multiple messages in order."""
            msg1 = create_message(session_id, user1_id, "First")
            msg2 = create_message(session_id, user1_id, "Second")
            msg3 = create_message(session_id, user1_id, "Third")

            result1 = asyncio.run(queue.enqueue(msg1))
            result2 = asyncio.run(queue.enqueue(msg2))
            result3 = asyncio.run(queue.enqueue(msg3))

            assert result1.queue_position == 1
            assert result2.queue_position == 2
            assert result3.queue_position == 3

            # Verify all messages in queue
            status = queue.get_status(session_id)
            assert status.queue_size == 3

        def test_enqueue_different_sessions_independent(self, queue):
            """Different sessions should have independent queues."""
            session1 = str(uuid4())
            session2 = str(uuid4())

            msg1 = create_message(session1, str(uuid4()), "Session 1 message")
            msg2 = create_message(session2, str(uuid4()), "Session 2 message")

            asyncio.run(queue.enqueue(msg1))
            asyncio.run(queue.enqueue(msg2))

            # Verify queues are independent
            status1 = queue.get_status(session1)
            status2 = queue.get_status(session2)

            assert status1.queue_size == 1
            assert status2.queue_size == 1

    class TestProcessing:
        """Test message processing functionality."""

        def test_process_messages_in_order(self, queue, session_id, user1_id):
            """Should process messages in FIFO order."""
            messages = [
                create_message(session_id, user1_id, "First"),
                create_message(session_id, user1_id, "Second"),
                create_message(session_id, user1_id, "Third"),
            ]

            # Enqueue all messages
            for msg in messages:
                asyncio.run(queue.enqueue(msg))

            # Process messages
            processed = []
            async def mock_handler(msg):
                processed.append(msg)
                return True

            asyncio.run(queue.process(session_id, mock_handler))

            # Verify processed in order
            assert len(processed) == 3
            assert processed[0]["content"] == "First"
            assert processed[1]["content"] == "Second"
            assert processed[2]["content"] == "Third"

        def test_processing_handler_failure(self, queue, session_id, user1_id):
            """Should handle handler failure gracefully."""
            msg = create_message(session_id, user1_id, "Test")
            asyncio.run(queue.enqueue(msg))

            async def failing_handler(msg):
                raise Exception("Handler failed")

            # Should not raise exception
            result = asyncio.run(queue.process(session_id, failing_handler))

            assert result.processed_count == 0
            assert result.failed_count == 1

        def test_partial_processing(self, queue, session_id, user1_id):
            """Should continue processing even if one message fails."""
            messages = [
                create_message(session_id, user1_id, "OK 1"),
                create_message(session_id, user1_id, "FAIL"),
                create_message(session_id, user1_id, "OK 2"),
            ]

            for msg in messages:
                asyncio.run(queue.enqueue(msg))

            call_count = {"count": 0}
            async def selective_handler(msg):
                call_count["count"] += 1
                if msg["content"] == "FAIL":
                    raise Exception("Intentional failure")
                return True

            result = asyncio.run(queue.process(session_id, selective_handler))

            # Should process all 3 messages
            assert call_count["count"] == 3
            assert result.processed_count == 2
            assert result.failed_count == 1

    class TestConflictDetection:
        """Test optimistic locking conflict detection."""

        def test_detect_version_conflict(self, queue, session_id, user1_id):
            """Should detect conflicts when version mismatches."""
            msg = create_message(session_id, user1_id, "Test")
            result = asyncio.run(queue.enqueue(msg))

            # Start processing to get the current version
            original_version = queue._sessions[session_id]["version"]

            # Simulate concurrent processing by modifying version AFTER process starts
            # but BEFORE it completes
            async def handler_that_changes_version(m):
                # Simulate another process modifying the version while we're processing
                queue._sessions[session_id]["version"] = original_version + 1
                return True

            # Start processing (it will capture original_version)
            # Then the handler will increment the version
            # Then at the end, it will check and detect the conflict
            with pytest.raises(Exception) as exc_info:
                asyncio.run(queue.process(session_id, handler_that_changes_version))

            assert "conflict" in str(exc_info.value).lower() or "version" in str(exc_info.value).lower()

        def test_no_conflict_with_correct_version(self, queue, session_id, user1_id):
            """Should not detect conflict when version is correct."""
            msg = create_message(session_id, user1_id, "Test")
            asyncio.run(queue.enqueue(msg))

            async def handler(msg):
                return True

            # Should not raise exception
            result = asyncio.run(queue.process(session_id, handler))
            assert result.processed_count == 1

    class TestGetStatus:
        """Test get_status functionality."""

        def test_get_status_returns_queue_info(self, queue, session_id, user1_id):
            """Should return current queue status."""
            msg1 = create_message(session_id, user1_id, "First")
            msg2 = create_message(session_id, user1_id, "Second")

            asyncio.run(queue.enqueue(msg1))
            asyncio.run(queue.enqueue(msg2))

            status = queue.get_status(session_id)

            assert status.session_id == session_id
            assert status.queue_size == 2
            assert status.processing is False
            assert status.version >= 0

        def test_get_status_for_empty_queue(self, queue, session_id):
            """Should return status for empty queue."""
            status = queue.get_status(session_id)

            assert status.session_id == session_id
            assert status.queue_size == 0
            assert status.processing is False

    class TestClearQueue:
        """Test queue clearing functionality."""

        def test_clear_queue(self, queue, session_id, user1_id):
            """Should clear all messages from queue."""
            messages = [
                create_message(session_id, user1_id, "First"),
                create_message(session_id, user1_id, "Second"),
            ]

            for msg in messages:
                asyncio.run(queue.enqueue(msg))

            # Verify messages enqueued
            assert queue.get_status(session_id).queue_size == 2

            # Clear queue
            queue.clear(session_id)

            # Verify queue cleared
            assert queue.get_status(session_id).queue_size == 0

        def test_clear_nonexistent_queue(self, queue):
            """Should handle clearing nonexistent queue gracefully."""
            # Should not raise exception
            queue.clear(str(uuid4()))
