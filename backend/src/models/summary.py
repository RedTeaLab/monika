"""Summary database model for structured session summaries."""

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, JSON, UUID, Text, Float
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from src.core.database import Base


class SummaryType(str, Enum):
    """Types of summaries."""

    CHECKPOINT = "checkpoint"  # Summary at a checkpoint
    SCENE = "scene"  # Summary of a scene
    SESSION = "session"  # Full session summary


class Summary(Base):
    """Summary model for structured session summaries.

    A summary captures the key events, narrative, and state changes
    over a period of gameplay. Summaries are generated at checkpoints,
    scene changes, and session end to provide players with recaps
    and enable memory retrieval.
    """

    __tablename__ = "summaries"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # Foreign keys
    session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("game_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    checkpoint_id = Column(
        UUID(as_uuid=True),
        ForeignKey("checkpoints.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Classification
    summary_type = Column(
        String(20), default=SummaryType.CHECKPOINT.value, nullable=False, index=True
    )

    # Time range covered by this summary
    time_range_start = Column(DateTime(timezone=True), nullable=True, index=True)
    time_range_end = Column(DateTime(timezone=True), nullable=True, index=True)

    # Event range
    first_event_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    last_event_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    first_event_sequence = Column(Integer, nullable=True, index=True)
    last_event_sequence = Column(Integer, nullable=True, index=True)

    # Narrative summary (AI-generated or manual)
    narrative_summary = Column(Text, nullable=False)

    # Key events - array of {event_type, description, event_id, timestamp}
    key_events = Column(JSON, nullable=False, default=list)

    # State changes - array of {character_id, hp_change, san_change, luck_change, mp_change}
    state_changes = Column(JSON, nullable=False, default=list)

    # Discovered clues - array of clue descriptions or IDs
    discovered_clues = Column(JSON, nullable=False, default=list)

    # Pending promises - array of {description, source_event_id}
    pending_promises = Column(JSON, nullable=False, default=list)

    # Scene context
    scene_id = Column(String(100), nullable=True, index=True)
    scene_name = Column(String(200), nullable=True)

    # Participant characters
    participant_character_ids = Column(JSON, nullable=False, default=list)

    # Statistics for this period
    total_events = Column(Integer, default=0)
    event_counts = Column(JSON, nullable=True, default=dict)  # {event_type: count}

    # Quality metrics
    summary_quality_score = Column(Float, nullable=True)  # 0.0 to 1.0
    completeness_ratio = Column(Float, nullable=True)  # Events summarized / total events

    # Metadata
    generated_by = Column(String(50), nullable=False, default="ai")  # "ai" or "manual"
    model_used = Column(String(100), nullable=True)  # LLM model for AI summaries
    generation_method = Column(String(50), nullable=True)  # "template", "llm", "hybrid"

    # User feedback
    user_rating = Column(Integer, nullable=True)  # 1-5 stars
    user_feedback = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Soft delete
    is_deleted = Column(String(10), default="false", nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    session = relationship("GameSession", backref="summaries")
    checkpoint = relationship("Checkpoint", backref="summaries")

    def __repr__(self) -> str:
        return f"<Summary {self.id} type={self.summary_type} session={self.session_id}>"

    def to_dict(self) -> dict:
        """Convert summary to dictionary for API responses."""
        return {
            "id": str(self.id),
            "session_id": str(self.session_id),
            "checkpoint_id": str(self.checkpoint_id) if self.checkpoint_id else None,
            "summary_type": self.summary_type,
            "time_range_start": self.time_range_start.isoformat()
            if self.time_range_start
            else None,
            "time_range_end": self.time_range_end.isoformat() if self.time_range_end else None,
            "first_event_id": str(self.first_event_id) if self.first_event_id else None,
            "last_event_id": str(self.last_event_id) if self.last_event_id else None,
            "first_event_sequence": self.first_event_sequence,
            "last_event_sequence": self.last_event_sequence,
            "narrative_summary": self.narrative_summary,
            "key_events": self.key_events or [],
            "state_changes": self.state_changes or [],
            "discovered_clues": self.discovered_clues or [],
            "pending_promises": self.pending_promises or [],
            "scene_id": self.scene_id,
            "scene_name": self.scene_name,
            "participant_character_ids": self.participant_character_ids or [],
            "total_events": self.total_events,
            "event_counts": self.event_counts or {},
            "summary_quality_score": self.summary_quality_score,
            "completeness_ratio": self.completeness_ratio,
            "generated_by": self.generated_by,
            "model_used": self.model_used,
            "generation_method": self.generation_method,
            "user_rating": self.user_rating,
            "user_feedback": self.user_feedback,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "is_deleted": self.is_deleted == "true",
        }

    def is_active(self) -> bool:
        """Check if summary is active (not deleted)."""
        return self.is_deleted != "true"

    def mark_deleted(self) -> None:
        """Mark summary as deleted (soft delete)."""
        self.is_deleted = "true"
        self.deleted_at = datetime.utcnow()

    @classmethod
    def create_from_events(
        cls,
        session_id: uuid.UUID,
        summary_type: SummaryType,
        narrative_summary: str,
        events: list,
        time_range_start: Optional[datetime] = None,
        time_range_end: Optional[datetime] = None,
        checkpoint_id: Optional[uuid.UUID] = None,
        scene_id: Optional[str] = None,
        scene_name: Optional[str] = None,
        generated_by: str = "ai",
        model_used: Optional[str] = None,
        generation_method: Optional[str] = None,
    ) -> "Summary":
        """Create a summary from a list of events.

        Args:
            session_id: Session UUID
            summary_type: Type of summary
            narrative_summary: Generated narrative summary
            events: List of events to summarize
            time_range_start: Start time of covered period
            time_range_end: End time of covered period
            checkpoint_id: Associated checkpoint ID
            scene_id: Scene ID
            scene_name: Scene name
            generated_by: "ai" or "manual"
            model_used: LLM model used
            generation_method: "template", "llm", or "hybrid"

        Returns:
            Summary instance
        """
        # Extract key events
        key_events = []
        state_changes = []
        discovered_clues = []
        pending_promises = []
        participant_characters = set()
        event_counts = {}

        for event in events:
            # Count events by type
            event_type = (
                event.event_type.value
                if hasattr(event, "event_type")
                else str(event.get("event_type", "unknown"))
            )
            event_counts[event_type] = event_counts.get(event_type, 0) + 1

            # Extract key events (significant game moments)
            if hasattr(event, "event_type"):
                # Significiant events to highlight
                if event.event_type.value in [
                    "combat_start",
                    "combat_end",
                    "chase_start",
                    "chase_end",
                    "san_check",
                    "insanity_gain",
                    "scene_change",
                ]:
                    key_events.append(
                        {
                            "event_type": event.event_type.value,
                            "description": event.description
                            or event.payload.get("description", ""),
                            "event_id": str(event.id),
                            "timestamp": event.timestamp.isoformat() if event.timestamp else None,
                        }
                    )

                # Extract state changes
                if event.event_type.value in ["hp_change", "damage", "heal"]:
                    char_id = event.character_id
                    if char_id:
                        participant_characters.add(char_id)
                        amount = event.payload.get("amount", 0) or event.payload.get("change", 0)
                        state_changes.append(
                            {
                                "character_id": str(char_id),
                                "hp_change": amount,
                                "san_change": 0,
                                "luck_change": 0,
                                "mp_change": 0,
                            }
                        )

                elif event.event_type.value in ["san_change", "san_loss"]:
                    char_id = event.character_id
                    if char_id:
                        participant_characters.add(char_id)
                        amount = event.payload.get("amount", 0) or event.payload.get("loss", 0)
                        state_changes.append(
                            {
                                "character_id": str(char_id),
                                "hp_change": 0,
                                "san_change": -abs(amount),
                                "luck_change": 0,
                                "mp_change": 0,
                            }
                        )

                # Extract clues and promises from payload
                payload = event.payload or {}
                if "clues" in payload:
                    discovered_clues.extend(payload["clues"])
                if "promises" in payload:
                    pending_promises.extend(
                        [
                            {
                                "description": p.get("description", ""),
                                "source_event_id": str(event.id),
                            }
                            for p in payload["promises"]
                        ]
                    )
            else:
                # Handle dict-style events
                event_type = event.get("event_type", "unknown")
                if event_type in ["combat_start", "combat_end", "scene_change"]:
                    key_events.append(
                        {
                            "event_type": event_type,
                            "description": event.get("description", ""),
                            "event_id": str(event.get("id", "")),
                            "timestamp": event.get("timestamp", ""),
                        }
                    )

        # Get event range
        if events:
            first_event = events[0]
            last_event = events[-1]

            # Handle both SQLAlchemy Event objects and dict events
            if hasattr(first_event, "id"):
                # SQLAlchemy Event object
                first_event_id = first_event.id
                last_event_id = last_event.id
                first_event_seq = getattr(first_event, "sequence", None)
                last_event_seq = getattr(last_event, "sequence", None)

                if not time_range_start:
                    time_range_start = first_event.timestamp
                if not time_range_end:
                    time_range_end = last_event.timestamp
            else:
                # Dict event
                first_event_id = first_event.get("id")
                last_event_id = last_event.get("id")
                first_event_seq = first_event.get("sequence")
                last_event_seq = last_event.get("sequence")

                if not time_range_start:
                    time_range_start = first_event.get("timestamp")
                if not time_range_end:
                    time_range_end = last_event.get("timestamp")
        else:
            first_event_id = None
            last_event_id = None
            first_event_seq = None
            last_event_seq = None

        return cls(
            session_id=session_id,
            checkpoint_id=checkpoint_id,
            summary_type=summary_type.value,
            time_range_start=time_range_start,
            time_range_end=time_range_end,
            first_event_id=first_event_id,
            last_event_id=last_event_id,
            first_event_sequence=first_event_seq,
            last_event_sequence=last_event_seq,
            narrative_summary=narrative_summary,
            key_events=key_events,
            state_changes=state_changes,
            discovered_clues=discovered_clues,
            pending_promises=pending_promises,
            scene_id=scene_id,
            scene_name=scene_name,
            participant_character_ids=list(participant_characters),
            total_events=len(events),
            event_counts=event_counts,
            generated_by=generated_by,
            model_used=model_used,
            generation_method=generation_method,
        )
