"""Event database model for append-only audit logging."""

import uuid
from enum import Enum

from sqlalchemy import (
    Column,
    String,
    DateTime,
    Integer,
    Text,
    ForeignKey,
    JSON,
    Enum as SQLEnum,
)
from sqlalchemy.sql import func

from src.core.database import Base, GUID


class VisibilityLevel(str, Enum):
    """Visibility levels for events and data."""

    PUBLIC = "public"
    KP_ONLY = "kp"
    PLAYER_PREFIX = "player:"


class EventCategory(str, Enum):
    """High-level event categories for M3 Memory Web features."""

    INTERACTION = "interaction"
    CHECK = "check"
    COMBAT = "combat"
    CHASE = "chase"
    SANITY = "sanity"
    STATE = "state"
    SYSTEM = "system"


class EventType(str, Enum):
    """Types of game events for audit trail."""

    # Dice rolls
    ROLL = "roll"
    PUSH_ROLL = "push_roll"
    LUCK_SPEND = "luck_spend"

    # SAN and mental
    SAN_CHECK = "san_check"
    SAN_LOSS = "san_loss"
    INSANITY_GAIN = "insanity_gain"

    # Combat
    COMBAT_START = "combat_start"
    COMBAT_END = "combat_end"
    COMBAT_ROUND = "combat_round"
    DAMAGE = "damage"
    HEAL = "heal"

    # Chase
    CHASE_START = "chase_start"
    CHASE_END = "chase_end"
    CHASE_ROUND = "chase_round"
    CHASE_OBSTACLE = "chase_obstacle"

    # State changes
    HP_CHANGE = "hp_change"
    MP_CHANGE = "mp_change"
    SAN_CHANGE = "san_change"
    LUCK_CHANGE = "luck_change"

    # Narrative
    MESSAGE = "message"
    SCENE_CHANGE = "scene_change"
    NPC_APPEAR = "npc_appear"

    # System
    SESSION_START = "session_start"
    SESSION_END = "session_end"
    RETCON = "retcon"
    CHECKPOINT = "checkpoint"


class Event(Base):
    """Append-only event log for game audit trail.

    All game state changes must be recorded as events.
    Events are immutable - never updated, only appended.

    M3 Memory Web Extensions:
    - Added sequence number for event ordering and replay
    - Added category for high-level event grouping
    - Added input_raw, narration for narrative tracking
    - Added client_timestamp for sync
    - Added source, tags for search and filtering
    - Added checkpoint_id for checkpoint recovery
    - Added state_changes_json for detailed state tracking
    """

    __tablename__ = "events"

    # Primary key - UUID for distributed systems support
    id = Column(GUID(), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Session this event belongs to
    session_id = Column(GUID(), ForeignKey("game_sessions.id"), nullable=True, index=True)

    # M3: Event sequence number within a session (for ordering and replay)
    # Auto-incremented per session
    sequence = Column(Integer, nullable=True, index=True)

    # Who triggered the event
    actor_player_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    actor_role = Column(SQLEnum("kp", "player", "system", name="actor_role"), nullable=False)

    # Which character was affected (if applicable)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=True, index=True)

    # Event type
    event_type = Column(
        SQLEnum(EventType, name="event_type", create_constraint=False, native_enum=False),
        nullable=False,
        index=True,
    )

    # M3: Event category for high-level grouping (interaction, check, combat, etc.)
    category = Column(
        SQLEnum(EventCategory, name="event_category", create_constraint=False, native_enum=False),
        nullable=True,
        index=True,
    )

    # Event payload - structured data specific to event type
    # Examples:
    # - roll: {skill, target, roll_value, success_level, bonus_dice, penalty_dice}
    # - damage: {target_id, amount, source, damage_type}
    # - san_check: {reason, difficulty, roll, loss_amount}
    payload = Column(JSON, nullable=False, default=dict)

    # M3: Raw user input/message that triggered this event
    input_raw = Column(Text, nullable=True)

    # M3: Narrative text for this event (AI-generated or KP-written)
    narration = Column(Text, nullable=True)

    # Visibility: who can see this event
    visibility = Column(
        SQLEnum(
            VisibilityLevel, name="visibility_level", create_constraint=False, native_enum=False
        ),
        nullable=False,
        default=VisibilityLevel.PUBLIC,
    )

    # Timestamp - immutable, set at creation
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # M3: Client-side timestamp (for sync across devices)
    client_timestamp = Column(DateTime(timezone=True), nullable=True)

    # M3: Source of the event (web, api, system)
    source = Column(String(50), nullable=True, default="system")

    # M3: Tags for search and filtering (array of strings stored as JSON)
    tags = Column(JSON, nullable=True, default=list)

    # M3: Reference to checkpoint if this event is associated with one
    checkpoint_id = Column(GUID(), nullable=True, index=True)

    # M3: Detailed state changes tracking (structured JSON)
    # Format: [{path, type, old_value, new_value, delta, added, removed, metadata}]
    state_changes_json = Column(JSON, nullable=True, default=list)

    # Optional: reference to related event (e.g., a push_roll references the original roll)
    parent_event_id = Column(GUID(), nullable=True, index=True)

    # Optional: human-readable description for quick viewing
    description = Column(String(500), nullable=True)

    # M3: Vector embedding for semantic search (pgvector)
    # 1536 dimensions for text-embedding-3-small
    # Only available on PostgreSQL with pgvector extension
    # Use JSON for SQLite compatibility
    embedding = Column(JSON, nullable=True)

    # Composite index for efficient queries
    __table_args__ = (
        # Add composite indexes via migration
    )

    def __repr__(self) -> str:
        seq_str = f"#{self.sequence}" if self.sequence is not None else ""
        return f"<Event {self.event_type.value} {self.id}{seq_str} at {self.timestamp}>"

    def to_dict(self) -> dict:
        """Convert event to dictionary for API responses."""
        return {
            "id": str(self.id),
            "session_id": str(self.session_id) if self.session_id else None,
            "sequence": self.sequence,
            "actor_player_id": self.actor_player_id,
            "actor_role": self.actor_role,
            "character_id": self.character_id,
            "event_type": self.event_type.value,
            "category": self.category.value if self.category else None,
            "payload": self.payload,
            "input_raw": self.input_raw,
            "narration": self.narration,
            "visibility": self.visibility.value,
            "timestamp": self.timestamp.isoformat(),
            "client_timestamp": self.client_timestamp.isoformat()
            if self.client_timestamp
            else None,
            "source": self.source,
            "tags": self.tags or [],
            "checkpoint_id": str(self.checkpoint_id) if self.checkpoint_id else None,
            "state_changes_json": self.state_changes_json or [],
            "parent_event_id": str(self.parent_event_id) if self.parent_event_id else None,
            "description": self.description,
            "embedding": self.embedding,
        }
