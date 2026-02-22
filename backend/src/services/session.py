"""Session management service for pause/resume functionality."""
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Any
from enum import Enum

from sqlalchemy.orm import Session

from src.models.session import GameSession, SessionState
from src.models.event import Event, EventType
from src.models.character import Character
from src.services.events import EventLogger


class ConflictResolution(str, Enum):
    """Strategies for resolving resume conflicts."""

    KEEP_CHECKPOINT = "keep_checkpoint"  # Revert to checkpoint state
    KEEP_LATEST = "keep_latest"  # Apply all events on top of checkpoint
    MERGE = "merge"  # Attempt to merge changes


@dataclass
class Checkpoint:
    """A checkpoint containing session state at a point in time."""

    id: str
    session_id: str
    timestamp: datetime
    session_state: Dict[str, Any]
    character_states: Dict[int, Dict[str, Any]]
    event_id: Optional[str] = None  # Last event ID included in checkpoint
    notes: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert checkpoint to dictionary."""
        return {
            "id": self.id,
            "session_id": self.session_id,
            "timestamp": self.timestamp.isoformat(),
            "session_state": self.session_state,
            "character_states": self.character_states,
            "event_id": self.event_id,
            "notes": self.notes,
        }


@dataclass
class ResumeResult:
    """Result of a session resume operation."""

    success: bool
    session: GameSession
    checkpoint: Optional[Checkpoint]
    new_events: List[Event]
    conflicts: List[Dict[str, Any]]
    message: str

    def to_dict(self) -> Dict[str, Any]:
        """Convert resume result to dictionary."""
        return {
            "success": self.success,
            "session": self.session.to_dict() if self.session else None,
            "checkpoint": self.checkpoint.to_dict() if self.checkpoint else None,
            "new_events": [e.to_dict() for e in self.new_events],
            "conflicts": self.conflicts,
            "message": self.message,
        }


class SessionService:
    """
    Service for managing game sessions with pause/resume functionality.

    Features:
    - Pause active sessions with state capture
    - Resume paused sessions from checkpoints
    - Automatic checkpoint creation
    - Incremental event sync
    - Conflict detection and resolution
    """

    def __init__(self, db: Session):
        """Initialize session service.

        Args:
            db: Database session
        """
        self.db = db
        self.event_logger = EventLogger(db)
        # In-memory checkpoint storage (in production, use a dedicated table)
        self._checkpoints: Dict[str, List[Checkpoint]] = {}

    def pause_session(self, session_id: uuid.UUID, user_id: int) -> GameSession:
        """Pause an active session.

        Args:
            session_id: Session UUID
            user_id: User ID requesting the pause

        Returns:
            Updated paused session

        Raises:
            ValueError: If session not found or already paused
        """
        session = (
            self.db.query(GameSession)
            .filter(
                GameSession.id == session_id,
                GameSession.owner_id == user_id,
            )
            .first()
        )

        if not session:
            raise ValueError("Session not found")

        if session.state != SessionState.ACTIVE.value:
            raise ValueError(f"Cannot pause session in state: {session.state}")

        # Update session state
        session.state = SessionState.PAUSED.value
        session.paused_at = datetime.utcnow()

        # Log the pause event
        self.event_logger.record(EventType.SESSION_END, "system") \
            .session(session_id) \
            .description("Session paused") \
            .save()

        self.db.commit()
        self.db.refresh(session)

        return session

    def resume_session(
        self,
        session_id: uuid.UUID,
        user_id: int,
        resolution: ConflictResolution = ConflictResolution.KEEP_LATEST,
    ) -> ResumeResult:
        """Resume a paused session.

        Args:
            session_id: Session UUID
            user_id: User ID requesting the resume
            resolution: Strategy for resolving conflicts

        Returns:
            Resume result with session and any conflicts
        """
        session = (
            self.db.query(GameSession)
            .filter(
                GameSession.id == session_id,
                GameSession.owner_id == user_id,
            )
            .first()
        )

        if not session:
            return ResumeResult(
                success=False,
                session=None,
                checkpoint=None,
                new_events=[],
                conflicts=[],
                message="Session not found",
            )

        if session.state == SessionState.ENDED.value:
            return ResumeResult(
                success=False,
                session=session,
                checkpoint=None,
                new_events=[],
                conflicts=[],
                message="Cannot resume an ended session",
            )

        # Get latest checkpoint
        checkpoint = self.get_latest_checkpoint(session_id)

        # Get events since checkpoint
        new_events = []
        conflicts = []

        if checkpoint:
            # Check for events after checkpoint
            query = self.db.query(Event).filter(Event.session_id == session_id)
            if checkpoint.event_id:
                query = query.filter(Event.timestamp > checkpoint.timestamp)
            new_events = query.order_by(Event.timestamp.asc()).all()

            # Detect conflicts
            conflicts = self._detect_conflicts(session, checkpoint, new_events)

            # Apply resolution strategy
            if conflicts and resolution == ConflictResolution.KEEP_CHECKPOINT:
                self._apply_checkpoint(session, checkpoint)
            elif conflicts and resolution == ConflictResolution.MERGE:
                self._merge_state(session, checkpoint, new_events)
        else:
            # No checkpoint, just resume
            pass

        # Update session state
        session.state = SessionState.ACTIVE.value
        session.paused_at = None

        # Log the resume event
        self.event_logger.record(EventType.SESSION_START, "system") \
            .session(session_id) \
            .description("Session resumed") \
            .save()

        self.db.commit()
        self.db.refresh(session)

        return ResumeResult(
            success=True,
            session=session,
            checkpoint=checkpoint,
            new_events=new_events,
            conflicts=conflicts,
            message=f"Session resumed with {len(new_events)} new events",
        )

    def get_latest_checkpoint(self, session_id: uuid.UUID) -> Optional[Checkpoint]:
        """Get the latest checkpoint for a session.

        Args:
            session_id: Session UUID

        Returns:
            Latest checkpoint or None if not found
        """
        checkpoints = self._checkpoints.get(str(session_id), [])
        return checkpoints[-1] if checkpoints else None

    def create_checkpoint(
        self,
        session_id: uuid.UUID,
        user_id: int,
        notes: Optional[str] = None,
    ) -> Checkpoint:
        """Create a checkpoint for the current session state.

        Args:
            session_id: Session UUID
            user_id: User ID creating the checkpoint
            notes: Optional notes for the checkpoint

        Returns:
            Created checkpoint
        """
        session = (
            self.db.query(GameSession)
            .filter(
                GameSession.id == session_id,
                GameSession.owner_id == user_id,
            )
            .first()
        )

        if not session:
            raise ValueError("Session not found")

        # Get current character states
        character_states = {}
        if session.character_states:
            # Convert string keys back to int
            character_states = {
                int(k): v for k, v in session.character_states.items()
            }

        # Get last event ID for this session
        last_event = (
            self.db.query(Event)
            .filter(Event.session_id == session_id)
            .order_by(Event.timestamp.desc())
            .first()
        )

        checkpoint = Checkpoint(
            id=str(uuid.uuid4()),
            session_id=str(session_id),
            timestamp=datetime.utcnow(),
            session_state={
                "current_scene_id": session.current_scene_id,
                "current_scene_name": session.current_scene_name,
                "location": session.location,
                "world_state": session.world_state or {},
                "narrative_state": session.narrative_state or {},
            },
            character_states=character_states,
            event_id=str(last_event.id) if last_event else None,
            notes=notes,
        )

        # Store checkpoint
        session_key = str(session_id)
        if session_key not in self._checkpoints:
            self._checkpoints[session_key] = []

        self._checkpoints[session_key].append(checkpoint)

        # Keep only last 10 checkpoints
        if len(self._checkpoints[session_key]) > 10:
            self._checkpoints[session_key] = self._checkpoints[session_key][-10:]

        # Log checkpoint creation
        self.event_logger.record(EventType.SCENE_CHANGE, "system") \
            .session(session_id) \
            .description(f"Checkpoint created: {checkpoint.id}") \
            .save()

        return checkpoint

    def get_checkpoints(
        self,
        session_id: uuid.UUID,
        limit: int = 10,
    ) -> List[Checkpoint]:
        """Get checkpoints for a session.

        Args:
            session_id: Session UUID
            limit: Maximum number of checkpoints to return

        Returns:
            List of checkpoints, newest first
        """
        checkpoints = self._checkpoints.get(str(session_id), [])
        return list(reversed(checkpoints[-limit:]))

    def auto_checkpoint(
        self,
        session_id: uuid.UUID,
        event_type: EventType,
    ) -> Optional[Checkpoint]:
        """Create automatic checkpoint based on event type.

        Args:
            session_id: Session UUID
            event_type: Type of event that triggered checkpoint

        Returns:
            Created checkpoint or None if auto-checkpoint not triggered
        """
        # Auto-checkpoint on significant events
        checkpoint_events = {
            EventType.COMBAT_START,
            EventType.COMBAT_END,
            EventType.CHASE_START,
            EventType.CHASE_END,
            EventType.SCENE_CHANGE,
            EventType.SAN_CHECK,
            EventType.INSANITY_GAIN,
        }

        if event_type not in checkpoint_events:
            return None

        # Get session to find owner
        session = self.db.query(GameSession).filter(
            GameSession.id == session_id
        ).first()

        if not session:
            return None

        return self.create_checkpoint(
            session_id,
            session.owner_id,
            notes=f"Auto-checkpoint: {event_type.value}",
        )

    def get_paused_sessions(self, user_id: int) -> List[GameSession]:
        """Get all paused sessions for a user.

        Args:
            user_id: User ID

        Returns:
            List of paused sessions
        """
        return (
            self.db.query(GameSession)
            .filter(
                GameSession.owner_id == user_id,
                GameSession.state == SessionState.PAUSED.value,
            )
            .order_by(GameSession.paused_at.desc())
            .all()
        )

    def _detect_conflicts(
        self,
        session: GameSession,
        checkpoint: Checkpoint,
        new_events: List[Event],
    ) -> List[Dict[str, Any]]:
        """Detect conflicts between checkpoint and new events.

        Args:
            session: Current session state
            checkpoint: Checkpoint state
            new_events: Events since checkpoint

        Returns:
            List of conflict descriptions
        """
        conflicts = []

        # Check for state changes in events that differ from checkpoint
        for event in new_events:
            if event.event_type == EventType.SCENE_CHANGE:
                checkpoint_scene = checkpoint.session_state.get("current_scene_id")
                current_scene = session.current_scene_id
                if checkpoint_scene != current_scene:
                    conflicts.append({
                        "type": "scene_change",
                        "event_id": str(event.id),
                        "checkpoint_value": checkpoint_scene,
                        "current_value": current_scene,
                        "description": "Scene changed since checkpoint",
                    })

        return conflicts

    def _apply_checkpoint(self, session: GameSession, checkpoint: Checkpoint) -> None:
        """Apply checkpoint state to session.

        Args:
            session: Session to update
            checkpoint: Checkpoint to apply
        """
        session.current_scene_id = checkpoint.session_state.get("current_scene_id")
        session.current_scene_name = checkpoint.session_state.get("current_scene_name")
        session.location = checkpoint.session_state.get("location")
        session.world_state = checkpoint.session_state.get("world_state", {})
        session.narrative_state = checkpoint.session_state.get("narrative_state", {})

        # Restore character states
        if checkpoint.character_states:
            # Convert int keys back to string for JSON storage
            session.character_states = {
                str(k): v for k, v in checkpoint.character_states.items()
            }

    def _merge_state(
        self,
        session: GameSession,
        checkpoint: Checkpoint,
        new_events: List[Event],
    ) -> None:
        """Merge checkpoint state with new events.

        Args:
            session: Session to update
            checkpoint: Checkpoint state
            new_events: Events to merge
        """
        # Start with checkpoint state
        merged_world = checkpoint.session_state.get("world_state", {}).copy()
        merged_narrative = checkpoint.session_state.get("narrative_state", {}).copy()

        # Apply changes from new events
        for event in new_events:
            if event.payload:
                # Merge world state changes
                if "world_state" in event.payload:
                    merged_world.update(event.payload["world_state"])

                # Merge narrative state changes
                if "narrative_state" in event.payload:
                    merged_narrative.update(event.payload["narrative_state"])

        # Apply merged state
        session.world_state = merged_world
        session.narrative_state = merged_narrative
