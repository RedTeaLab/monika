"""Spotlight Manager Service for Multiplayer Sessions."""
import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict
from uuid import UUID


class SpotlightState(Enum):
    """Spotlight state machine states."""
    IDLE = "idle"
    ACTIVE = "active"
    QUEUED = "queued"


@dataclass
class SpotlightRequest:
    """Request for spotlight."""
    session_id: str
    user_id: str
    character_id: Optional[str] = None


@dataclass
class SpotlightRequestResult:
    """Result of a spotlight request."""
    granted: bool
    queue_position: int
    message: str


@dataclass
class SpotlightReleaseResult:
    """Result of a spotlight release."""
    success: bool
    next_holder: Optional[str]
    message: str


@dataclass
class SpotlightStatus:
    """Current status of spotlight for a session."""
    state: SpotlightState
    current_holder: Optional[str]
    queue: List[Dict] = field(default_factory=list)
    timestamp: datetime = field(default_factory=datetime.now)


class SpotlightManager:
    """
    Manages spotlight allocation for multiplayer sessions.

    State machine:
        IDLE (no one speaking)
          ↓ request
        ACTIVE (someone speaking)
          ↓ request (others)
        QUEUED (people waiting)
          ↓ release
        ACTIVE (transfer to next)
          ↓ release (queue empty)
        IDLE

    Thread-safe with asyncio.Lock.
    """

    def __init__(self):
        """Initialize spotlight manager."""
        # Session state: {session_id: {"state": SpotlightState, "holder": Optional[str], "queue": List[Dict], "lock": asyncio.Lock}}
        self._sessions: Dict[str, Dict] = {}

    def _get_session(self, session_id: str) -> Dict:
        """Get or create session state."""
        if session_id not in self._sessions:
            self._sessions[session_id] = {
                "state": SpotlightState.IDLE,
                "holder": None,
                "queue": [],
                "lock": asyncio.Lock(),
            }
        return self._sessions[session_id]

    async def request_spotlight(self, request: SpotlightRequest) -> SpotlightRequestResult:
        """
        Request spotlight for a session.

        Args:
            request: Spotlight request with session_id, user_id, character_id

        Returns:
            SpotlightRequestResult with granted status, queue position, and message
        """
        session = self._get_session(request.session_id)

        async with session["lock"]:
            # Check if user already has spotlight or is in queue
            if session["holder"] == request.user_id:
                return SpotlightRequestResult(
                    granted=True,
                    queue_position=0,
                    message="You already have the spotlight"
                )

            # Check if user is already in queue
            for queued in session["queue"]:
                if queued["user_id"] == request.user_id:
                    position = session["queue"].index(queued) + 1
                    return SpotlightRequestResult(
                        granted=False,
                        queue_position=position,
                        message=f"You are already in queue at position {position}"
                    )

            # First request gets spotlight immediately
            if session["state"] == SpotlightState.IDLE:
                session["state"] = SpotlightState.ACTIVE
                session["holder"] = request.user_id
                return SpotlightRequestResult(
                    granted=True,
                    queue_position=0,
                    message="Spotlight granted"
                )

            # Subsequent requests go to queue
            queue_entry = {
                "user_id": request.user_id,
                "character_id": request.character_id,
                "requested_at": datetime.now().isoformat(),
            }
            session["queue"].append(queue_entry)
            session["state"] = SpotlightState.QUEUED

            queue_position = len(session["queue"])
            return SpotlightRequestResult(
                granted=False,
                queue_position=queue_position,
                message=f"You are queued at position {queue_position}"
            )

    async def release_spotlight(self, session_id: str, user_id: str) -> SpotlightReleaseResult:
        """
        Release spotlight by current holder.

        Args:
            session_id: Session identifier
            user_id: User requesting release

        Returns:
            SpotlightReleaseResult with success status and next holder
        """
        session = self._get_session(session_id)

        async with session["lock"]:
            # Check if user is the current holder
            if session["holder"] != user_id:
                return SpotlightReleaseResult(
                    success=False,
                    next_holder=None,
                    message="You are not the spotlight holder"
                )

            # If there's someone in queue, transfer spotlight
            if session["queue"]:
                next_entry = session["queue"].pop(0)
                next_holder = next_entry["user_id"]
                session["holder"] = next_holder

                # If queue is now empty, return to ACTIVE (no longer QUEUED)
                if not session["queue"]:
                    session["state"] = SpotlightState.ACTIVE

                return SpotlightReleaseResult(
                    success=True,
                    next_holder=next_holder,
                    message=f"Spotlight transferred to user {next_holder}"
                )

            # No one in queue, return to IDLE
            session["state"] = SpotlightState.IDLE
            session["holder"] = None

            return SpotlightReleaseResult(
                success=True,
                next_holder=None,
                message="Spotlight released, returning to idle"
            )

    def get_status(self, session_id: str) -> SpotlightStatus:
        """
        Get current spotlight status for a session.

        Args:
            session_id: Session identifier

        Returns:
            SpotlightStatus with current state, holder, and queue
        """
        session = self._get_session(session_id)

        return SpotlightStatus(
            state=session["state"],
            current_holder=session["holder"],
            queue=session["queue"].copy(),
            timestamp=datetime.now()
        )
