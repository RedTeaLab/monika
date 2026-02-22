"""Session Snapshot Service for disconnect recovery."""
import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional
from uuid import uuid4


@dataclass
class SessionSnapshot:
    """A snapshot of session state at a point in time."""
    id: str
    session_id: str
    state: dict
    message_count: int = 0
    timestamp: datetime = field(default_factory=datetime.now)
    message_ids: List[str] = field(default_factory=list)


@dataclass
class RecoveryResult:
    """Result of session recovery."""
    success: bool
    state: dict
    missed_messages: List[dict]
    snapshot_id: str
    message: str


class SessionSnapshotService:
    """
    Manages session state snapshots for disconnect recovery.

    Features:
    - Periodic snapshots of session state
    - Message history tracking
    - Recovery from last snapshot
    - Missed message retrieval
    """

    def __init__(self, snapshot_interval_seconds: int = 30):
        """Initialize snapshot service.

        Args:
            snapshot_interval_seconds: Seconds between automatic snapshots
        """
        self.snapshot_interval = snapshot_interval_seconds
        # Session snapshots: {session_id: [snapshots]}
        self._snapshots: Dict[str, List[SessionSnapshot]] = {}
        # Message storage: {session_id: [messages]}
        self._messages: Dict[str, List[dict]] = {}

    def create_snapshot(
        self,
        session_id: str,
        state: dict,
        message_ids: List[str] = None
    ) -> SessionSnapshot:
        """
        Create a snapshot of session state.

        Args:
            session_id: Session identifier
            state: Current session state
            message_ids: List of message IDs included in this snapshot

        Returns:
            Created snapshot
        """
        snapshot = SessionSnapshot(
            id=str(uuid4()),
            session_id=session_id,
            state=state.copy(),
            message_ids=message_ids or [],
            message_count=len(message_ids or []),
        )

        if session_id not in self._snapshots:
            self._snapshots[session_id] = []

        self._snapshots[session_id].append(snapshot)

        # Keep only last 10 snapshots per session
        if len(self._snapshots[session_id]) > 10:
            self._snapshots[session_id] = self._snapshots[session_id][-10:]

        return snapshot

    def get_latest_snapshot(self, session_id: str) -> Optional[SessionSnapshot]:
        """
        Get the latest snapshot for a session.

        Args:
            session_id: Session identifier

        Returns:
            Latest snapshot or None if not found
        """
        if session_id not in self._snapshots or not self._snapshots[session_id]:
            return None

        return self._snapshots[session_id][-1]

    def recover_session(
        self,
        session_id: str,
        last_message_id: Optional[str] = None
    ) -> RecoveryResult:
        """
        Recover a session from snapshot with missed messages.

        Args:
            session_id: Session identifier
            last_message_id: Last message ID the client received

        Returns:
            Recovery result with state and missed messages
        """
        snapshot = self.get_latest_snapshot(session_id)

        if snapshot is None:
            return RecoveryResult(
                success=False,
                state={},
                missed_messages=[],
                snapshot_id="",
                message="No snapshot found for session"
            )

        # Get missed messages
        missed_messages = []
        if last_message_id:
            session_messages = self._messages.get(session_id, [])
            found_last = False

            for msg in session_messages:
                if msg["id"] == last_message_id:
                    found_last = True
                elif found_last:
                    missed_messages.append(msg)
        else:
            # No last_message_id, return all messages since snapshot
            missed_messages = []

        return RecoveryResult(
            success=True,
            state=snapshot.state.copy(),
            missed_messages=missed_messages,
            snapshot_id=snapshot.id,
            message=f"Recovered from snapshot {snapshot.id}"
        )

    def add_message(self, session_id: str, message: dict) -> None:
        """
        Add a message to the session history.

        Args:
            session_id: Session identifier
            message: Message data
        """
        if session_id not in self._messages:
            self._messages[session_id] = []

        self._messages[session_id].append(message)

    def get_session_messages(
        self,
        session_id: str,
        since_snapshot_id: Optional[str] = None
    ) -> List[dict]:
        """
        Get messages for a session.

        Args:
            session_id: Session identifier
            since_snapshot_id: Optional snapshot ID to get messages since

        Returns:
            List of messages
        """
        messages = self._messages.get(session_id, [])

        if since_snapshot_id:
            # Filter messages since snapshot
            snapshot = self.get_latest_snapshot(session_id)
            if snapshot and snapshot.id == since_snapshot_id:
                # Return messages with IDs not in snapshot
                snapshot_message_ids = set(snapshot.message_ids)
                messages = [m for m in messages if m["id"] not in snapshot_message_ids]

        return messages

    def clear_session(self, session_id: str) -> None:
        """
        Clear all data for a session.

        Args:
            session_id: Session identifier
        """
        if session_id in self._snapshots:
            del self._snapshots[session_id]
        if session_id in self._messages:
            del self._messages[session_id]
