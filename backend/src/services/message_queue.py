"""Message Queue Service for Concurrent Input Handling."""
import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Dict, Callable, Optional
from uuid import uuid4


@dataclass
class QueuedMessage:
    """A message in the processing queue."""
    id: str
    session_id: str
    user_id: str
    content: str
    visibility: str
    timestamp: datetime = field(default_factory=datetime.now)
    status: str = "pending"  # pending, processing, completed, failed
    version: int = 0


@dataclass
class MessageQueueResult:
    """Result of enqueueing a message."""
    success: bool
    message_id: str
    queue_position: int
    message: str


@dataclass
class ProcessResult:
    """Result of processing messages."""
    processed_count: int
    failed_count: int
    message: str


@dataclass
class QueueStatus:
    """Status of a message queue."""
    session_id: str
    queue_size: int
    processing: bool
    version: int


class MessageQueue:
    """
    Per-session message queue with serial processing and optimistic locking.

    Features:
    - FIFO ordering
    - Serial processing (one message at a time)
    - Optimistic locking for conflict detection
    - Graceful failure handling
    """

    def __init__(self):
        """Initialize message queue manager."""
        # Session queues: {session_id: {"messages": [], "version": int, "processing": bool, "lock": asyncio.Lock}}
        self._sessions: Dict[str, Dict] = {}

    def _get_session(self, session_id: str) -> Dict:
        """Get or create session queue."""
        if session_id not in self._sessions:
            self._sessions[session_id] = {
                "messages": [],
                "version": 0,
                "processing": False,
                "lock": asyncio.Lock(),
            }
        return self._sessions[session_id]

    async def enqueue(self, message: Dict) -> MessageQueueResult:
        """
        Enqueue a message for processing.

        Args:
            message: Message dict with session_id, user_id, content, visibility, etc.

        Returns:
            MessageQueueResult with success status, message ID, and queue position
        """
        session_id = message.get("session_id")
        session = self._get_session(session_id)

        async with session["lock"]:
            queued_msg = QueuedMessage(
                id=str(uuid4()),
                session_id=session_id,
                user_id=message.get("user_id"),
                content=message.get("content"),
                visibility=message.get("visibility", "public"),
            )

            session["messages"].append(queued_msg)
            queue_position = len(session["messages"])

            return MessageQueueResult(
                success=True,
                message_id=queued_msg.id,
                queue_position=queue_position,
                message="Message enqueued successfully"
            )

    async def process(
        self,
        session_id: str,
        handler: Callable[[Dict], bool]
    ) -> ProcessResult:
        """
        Process all messages in the queue for a session.

        Args:
            session_id: Session identifier
            handler: Async handler function that takes message dict and returns bool

        Returns:
            ProcessResult with counts of processed and failed messages

        Raises:
            Exception: If version conflict is detected
        """
        session = self._get_session(session_id)

        async with session["lock"]:
            # Check if already processing
            if session["processing"]:
                return ProcessResult(
                    processed_count=0,
                    failed_count=0,
                    message="Queue is already being processed"
                )

            # Mark as processing
            session["processing"] = True
            current_version = session["version"]

        try:
            processed_count = 0
            failed_count = 0

            # Process messages in order
            while session["messages"]:
                # Check for version conflict before processing each message
                if session["version"] != current_version:
                    raise Exception(f"Version conflict: expected {current_version}, got {session['version']}")

                async with session["lock"]:
                    if not session["messages"]:
                        break
                    queued_msg = session["messages"][0]

                # Convert to dict for handler
                msg_dict = {
                    "id": queued_msg.id,
                    "session_id": queued_msg.session_id,
                    "user_id": queued_msg.user_id,
                    "content": queued_msg.content,
                    "visibility": queued_msg.visibility,
                }

                try:
                    # Call handler
                    await handler(msg_dict)
                    processed_count += 1

                    # Remove from queue on success
                    async with session["lock"]:
                        if session["messages"] and session["messages"][0].id == queued_msg.id:
                            session["messages"].pop(0)

                except Exception as e:
                    failed_count += 1

                    # Remove from queue even on failure
                    async with session["lock"]:
                        if session["messages"] and session["messages"][0].id == queued_msg.id:
                            session["messages"].pop(0)

            # Final version check and increment after processing all messages
            async with session["lock"]:
                # Check for conflicts
                if session["version"] != current_version:
                    raise Exception(f"Version conflict: expected {current_version}, got {session['version']}")
                session["version"] += 1

            return ProcessResult(
                processed_count=processed_count,
                failed_count=failed_count,
                message=f"Processed {processed_count} messages, {failed_count} failed"
            )

        finally:
            # Always mark as not processing
            async with session["lock"]:
                session["processing"] = False

    def get_status(self, session_id: str) -> QueueStatus:
        """
        Get current queue status for a session.

        Args:
            session_id: Session identifier

        Returns:
            QueueStatus with current state
        """
        session = self._get_session(session_id)

        return QueueStatus(
            session_id=session_id,
            queue_size=len(session["messages"]),
            processing=session["processing"],
            version=session["version"],
        )

    def clear(self, session_id: str) -> None:
        """
        Clear all messages from the queue for a session.

        Args:
            session_id: Session identifier
        """
        if session_id in self._sessions:
            self._sessions[session_id]["messages"].clear()
