"""Checkpoint database model for session state persistence."""

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, JSON, UUID, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from src.core.database import Base


class CheckpointType(str, Enum):
    """Types of checkpoints."""

    MANUAL = "manual"  # User-created checkpoint
    AUTO = "auto"  # Automatic checkpoint on events
    PAUSE = "pause"  # Checkpoint created on session pause
    SESSION_START = "session_start"  # Snapshot at session start


class Checkpoint(Base):
    """Checkpoint model for session state persistence.

    A checkpoint captures the complete state of a game session at a point
    in time, enabling pause/resume functionality and recovery from errors.
    Checkpoints are used to save game progress and restore sessions later.
    """

    __tablename__ = "checkpoints"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # Foreign key to session
    session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("game_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Classification
    checkpoint_type = Column(
        String(20), default=CheckpointType.MANUAL.value, nullable=False, index=True
    )

    # State snapshots - JSON fields for flexible storage
    # Session state: current_scene_id, current_scene_name, location, etc.
    session_state = Column(JSON, nullable=False, default=dict)

    # Character states: maps character_id -> {hp, san, luck, mp, etc.}
    character_states = Column(JSON, nullable=False, default=dict)

    # World state: timer, threats, environment conditions, etc.
    world_state = Column(JSON, nullable=True, default=dict)

    # Narrative state: leads, clues, promises, etc.
    narrative_state = Column(JSON, nullable=True, default=dict)

    # Event tracking - last event included in this checkpoint
    last_event_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    # M3: Event sequence number for incremental event sync
    # This is the sequence number of the last event included in this checkpoint
    last_event_sequence = Column(Integer, nullable=True, index=True)

    # M3: Scene context for resume
    scene_id = Column(String(100), nullable=True, index=True)
    scene_name = Column(String(200), nullable=True)

    # M3: Round/tracking number (for combat, chase, etc.)
    round_number = Column(Integer, nullable=True)

    # Metadata
    notes = Column(Text, nullable=True)  # Optional notes from user
    name = Column(String(200), nullable=True)  # Snapshot name
    auto_created = Column(String(10), default="false", nullable=False)  # "true" or "false"

    # Capture context - what triggered this checkpoint
    trigger_event_type = Column(String(50), nullable=True)  # e.g., "combat_start", "scene_change"
    trigger_reason = Column(String(200), nullable=True)  # Human-readable reason

    # User who created this checkpoint
    created_by_player_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Timestamps
    created_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True
    )
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Soft delete - allow marking checkpoints as deleted without removing them
    is_deleted = Column(String(10), default="false", nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    deleted_by_player_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Relationships
    session = relationship("GameSession", backref="checkpoints")
    created_by = relationship(
        "User", foreign_keys=[created_by_player_id], backref="created_checkpoints"
    )
    deleted_by = relationship(
        "User", foreign_keys=[deleted_by_player_id], backref="deleted_checkpoints"
    )

    def __repr__(self) -> str:
        scene_str = f" scene={self.scene_name}" if self.scene_name else ""
        seq_str = f" seq={self.last_event_sequence}" if self.last_event_sequence is not None else ""
        return f"<Checkpoint {self.id} type={self.checkpoint_type} session={self.session_id}{scene_str}{seq_str}>"

    def to_dict(self) -> dict:
        """Convert checkpoint to dictionary for API responses."""
        return {
            "id": str(self.id),
            "session_id": str(self.session_id),
            "checkpoint_type": self.checkpoint_type,
            "session_state": self.session_state or {},
            "character_states": self.character_states or {},
            "world_state": self.world_state or {},
            "narrative_state": self.narrative_state or {},
            "last_event_id": str(self.last_event_id) if self.last_event_id else None,
            "last_event_sequence": self.last_event_sequence,
            "scene_id": self.scene_id,
            "scene_name": self.scene_name,
            "round_number": self.round_number,
            "notes": self.notes,
            "name": self.name,
            "auto_created": self.auto_created == "true",
            "trigger_event_type": self.trigger_event_type,
            "trigger_reason": self.trigger_reason,
            "created_by_player_id": self.created_by_player_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "is_deleted": self.is_deleted == "true",
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
            "deleted_by_player_id": self.deleted_by_player_id,
        }

    def is_active(self) -> bool:
        """Check if checkpoint is active (not deleted).

        Returns:
            True if checkpoint is active
        """
        return self.is_deleted != "true"

    def mark_deleted(self, player_id: int) -> None:
        """Mark checkpoint as deleted (soft delete).

        Args:
            player_id: ID of the player deleting this checkpoint
        """
        self.is_deleted = "true"
        self.deleted_at = datetime.utcnow()
        self.deleted_by_player_id = player_id

    def restore(self) -> None:
        """Restore a deleted checkpoint."""
        self.is_deleted = "false"
        self.deleted_at = None
        self.deleted_by_player_id = None

    @classmethod
    def create_from_session(
        cls,
        session_id: uuid.UUID,
        session_state: dict,
        character_states: dict,
        world_state: dict,
        narrative_state: dict,
        checkpoint_type: CheckpointType = CheckpointType.MANUAL,
        last_event_id: Optional[uuid.UUID] = None,
        last_event_sequence: Optional[int] = None,
        scene_id: Optional[str] = None,
        scene_name: Optional[str] = None,
        round_number: Optional[int] = None,
        notes: Optional[str] = None,
        trigger_event_type: Optional[str] = None,
        trigger_reason: Optional[str] = None,
        created_by_player_id: Optional[int] = None,
        auto_created: bool = False,
    ) -> "Checkpoint":
        """Create a checkpoint from session state.

        Args:
            session_id: Session UUID
            session_state: Session state dict (current_scene, location, etc.)
            character_states: Character state snapshots
            world_state: World state (timer, threats, etc.)
            narrative_state: Narrative state (leads, clues, etc.)
            checkpoint_type: Type of checkpoint (manual, auto, pause)
            last_event_id: Last event ID included in checkpoint
            last_event_sequence: Last event sequence number (M3)
            scene_id: Current scene ID (M3)
            scene_name: Current scene name (M3)
            round_number: Current round number (M3)
            notes: Optional notes
            trigger_event_type: Event type that triggered this checkpoint
            trigger_reason: Human-readable reason for checkpoint
            created_by_player_id: User who created this checkpoint
            auto_created: Whether this was auto-created

        Returns:
            Checkpoint instance
        """
        return cls(
            session_id=session_id,
            checkpoint_type=checkpoint_type.value,
            session_state=session_state,
            character_states=character_states,
            world_state=world_state,
            narrative_state=narrative_state,
            last_event_id=last_event_id,
            last_event_sequence=last_event_sequence,
            scene_id=scene_id,
            scene_name=scene_name,
            round_number=round_number,
            notes=notes,
            trigger_event_type=trigger_event_type,
            trigger_reason=trigger_reason,
            created_by_player_id=created_by_player_id,
            auto_created="true" if auto_created else "false",
        )
