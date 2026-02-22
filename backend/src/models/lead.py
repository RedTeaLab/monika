"""Lead database model for managing game leads/clues."""
import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, JSON, UUID, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from src.core.database import Base


class LeadPriority(str, Enum):
    """Priority levels for leads."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class LeadType(str, Enum):
    """Types of leads."""

    INVESTIGATE = "investigate"
    INTERACT = "interact"
    TRAVEL = "travel"
    COMBAT = "combat"
    REST = "rest"
    CUSTOM = "custom"


class LeadStatus(str, Enum):
    """Status of a lead."""

    AVAILABLE = "available"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    EXPIRED = "expired"
    ARCHIVED = "archived"


class LeadVisibility(str, Enum):
    """Visibility settings for leads."""

    ALL = "all"
    KP_ONLY = "kp"
    SPECIFIC_PLAYER = "specific_player"


class LeadExecutionMethod(str, Enum):
    """Execution methods for leads."""

    COMMAND = "command"
    CHOICE = "choice"
    AUTOMATIC = "automatic"


class Lead(Base):
    """Lead model for managing game leads and clues.

    A lead represents a potential action or investigation path available
    to players. Leads can be suggested by the AI Keeper or manually created
    by the keeper. They track the status of investigations, interactions,
    and other game actions.
    """

    __tablename__ = "leads"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # Foreign keys
    session_id = Column(UUID(as_uuid=True), ForeignKey("game_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=True, index=True)

    # Source tracking - which event/scene created this lead
    source_event_id = Column(UUID(as_uuid=True), ForeignKey("events.id"), nullable=True, index=True)
    source_scene_id = Column(String(100), nullable=True)

    # Basic info
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)

    # Classification
    priority = Column(String(20), default=LeadPriority.MEDIUM.value, nullable=False, index=True)
    type = Column(String(20), default=LeadType.INVESTIGATE.value, nullable=False, index=True)

    # Execution
    execution_method = Column(String(20), default=LeadExecutionMethod.COMMAND.value, nullable=False)
    execution_data = Column(JSON, nullable=True, default=dict)

    # Visibility
    visibility = Column(String(20), default=LeadVisibility.ALL.value, nullable=False, index=True)
    visible_to_player_ids = Column(JSON, nullable=True, default=list)

    # Status
    status = Column(String(20), default=LeadStatus.AVAILABLE.value, nullable=False, index=True)

    # Expiration
    expires_on_event_id = Column(UUID(as_uuid=True), nullable=True)
    expires_on_condition = Column(String(500), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    # Completion data
    completed_at = Column(DateTime(timezone=True), nullable=True)
    completed_by_player_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Rewards and consequences
    rewards = Column(JSON, nullable=True, default=list)
    consequences = Column(JSON, nullable=True, default=list)
    narrative_on_complete = Column(Text, nullable=True)
    narrative_on_fail = Column(Text, nullable=True)

    # Association tracking
    related_lead_ids = Column(JSON, nullable=True, default=list)
    parent_lead_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    # Metadata
    created_by_player_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    auto_generated = Column(String(10), default="false", nullable=False)

    # AI metadata - for tracking AI-suggested leads
    ai_generated = Column(String(10), default="false", nullable=False)
    ai_confidence = Column(Integer, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    session = relationship("GameSession", backref="leads")
    campaign = relationship("Campaign", backref="leads")
    source_event = relationship("Event", foreign_keys=[source_event_id], backref="generated_leads")
    completed_by = relationship("User", foreign_keys=[completed_by_player_id], backref="completed_leads")
    created_by = relationship("User", foreign_keys=[created_by_player_id], backref="created_leads")

    def __repr__(self) -> str:
        return f"<Lead {self.id} {self.title} type={self.type} status={self.status}>"

    def to_dict(self) -> dict:
        """Convert lead to dictionary for API responses."""
        return {
            "id": str(self.id),
            "session_id": str(self.session_id),
            "campaign_id": str(self.campaign_id) if self.campaign_id else None,
            "source_event_id": str(self.source_event_id) if self.source_event_id else None,
            "source_scene_id": self.source_scene_id,
            "title": self.title,
            "description": self.description,
            "priority": self.priority,
            "type": self.type,
            "execution_method": self.execution_method,
            "execution_data": self.execution_data or {},
            "visibility": self.visibility,
            "visible_to_player_ids": self.visible_to_player_ids or [],
            "status": self.status,
            "expires_on_event_id": str(self.expires_on_event_id) if self.expires_on_event_id else None,
            "expires_on_condition": self.expires_on_condition,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "completed_by_player_id": self.completed_by_player_id,
            "rewards": self.rewards or [],
            "consequences": self.consequences or [],
            "narrative_on_complete": self.narrative_on_complete,
            "narrative_on_fail": self.narrative_on_fail,
            "related_lead_ids": self.related_lead_ids or [],
            "parent_lead_id": str(self.parent_lead_id) if self.parent_lead_id else None,
            "created_by_player_id": self.created_by_player_id,
            "auto_generated": self.auto_generated == "true",
            "ai_generated": self.ai_generated == "true",
            "ai_confidence": self.ai_confidence,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def is_visible_to(self, user_id: int, is_keeper: bool) -> bool:
        """Check if lead is visible to the given user.

        Args:
            user_id: User ID to check visibility for
            is_keeper: Whether the user is a keeper

        Returns:
            True if the lead should be visible to the user
        """
        # Keepers see everything
        if is_keeper:
            return True

        # Check visibility settings
        if self.visibility == LeadVisibility.ALL.value:
            return True

        if self.visibility == LeadVisibility.KP_ONLY.value:
            return False

        if self.visibility == LeadVisibility.SPECIFIC_PLAYER.value:
            player_ids = self.visible_to_player_ids or []
            return user_id in player_ids

        return False

    def is_expired(self) -> bool:
        """Check if lead has expired.

        Returns:
            True if the lead has expired
        """
        if self.expires_at and self.expires_at < datetime.utcnow():
            return True
        return self.status == LeadStatus.EXPIRED.value

    def can_complete(self) -> bool:
        """Check if lead can be completed.

        Returns:
            True if the lead is in a completable state
        """
        return self.status in [LeadStatus.AVAILABLE.value, LeadStatus.IN_PROGRESS.value]

    def mark_completed(self, player_id: int) -> None:
        """Mark lead as completed.

        Args:
            player_id: ID of the player who completed the lead
        """
        self.status = LeadStatus.COMPLETED.value
        self.completed_at = datetime.utcnow()
        self.completed_by_player_id = player_id

    def mark_failed(self) -> None:
        """Mark lead as failed."""
        self.status = LeadStatus.FAILED.value

    def mark_expired(self) -> None:
        """Mark lead as expired."""
        self.status = LeadStatus.EXPIRED.value

    def add_related_lead(self, lead_id: uuid.UUID) -> None:
        """Add a related lead ID.

        Args:
            lead_id: UUID of the related lead
        """
        if self.related_lead_ids is None:
            self.related_lead_ids = []
        lead_id_str = str(lead_id)
        if lead_id_str not in self.related_lead_ids:
            self.related_lead_ids.append(lead_id_str)
            # Mark the field as changed for SQLAlchemy
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(self, 'related_lead_ids')


class LeadChoice(Base):
    """Lead choice model for leads with multiple options.

    When a lead has execution_method='choice', this stores the available
    choices that players can select from.
    """

    __tablename__ = "lead_choices"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign key
    lead_id = Column(UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)

    # Choice info
    choice_id = Column(String(100), nullable=False)  # Internal ID for the choice
    label = Column(String(200), nullable=False)  # Display label
    description = Column(Text, nullable=True)  # Optional description

    # Target
    target_scene_id = Column(String(100), nullable=True)
    target_lead_id = Column(UUID(as_uuid=True), nullable=True)

    # Conditions
    condition = Column(String(500), nullable=True)
    requires_check = Column(JSON, nullable=True, default=dict)
    # Example: {"skill": "spot_hidden", "difficulty": "regular"}

    # Consequences
    consequences = Column(JSON, nullable=True, default=list)
    narrative = Column(Text, nullable=True)

    # Display order
    display_order = Column(Integer, default=0, nullable=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    lead = relationship("Lead", backref="choices")

    def __repr__(self) -> str:
        return f"<LeadChoice {self.choice_id} {self.label}>"

    def to_dict(self) -> dict:
        """Convert lead choice to dictionary for API responses."""
        return {
            "id": str(self.id),
            "lead_id": str(self.lead_id),
            "choice_id": self.choice_id,
            "label": self.label,
            "description": self.description,
            "target_scene_id": self.target_scene_id,
            "target_lead_id": str(self.target_lead_id) if self.target_lead_id else None,
            "condition": self.condition,
            "requires_check": self.requires_check or {},
            "consequences": self.consequences or [],
            "narrative": self.narrative,
            "display_order": self.display_order,
        }
