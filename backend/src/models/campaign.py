"""Campaign database model."""
import uuid
import string
import random
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, JSON, UUID as SQLUUID, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from src.core.database import Base


def generate_invite_code() -> str:
    """Generate a random 8-character invite code."""
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=8))


class CampaignStatus(str, Enum):
    """Campaign status options."""
    ACTIVE = "active"
    PAUSED = "paused"
    ENDED = "ended"
    ARCHIVED = "archived"


class CampaignRole(str, Enum):
    """Campaign member roles."""
    KEEPER = "keeper"
    CO_KEEPER = "co-keeper"
    PLAYER = "player"
    OBSERVER = "observer"


class MemberStatus(str, Enum):
    """Campaign member status."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    KICKED = "kicked"
    LEFT = "left"


class Campaign(Base):
    """Campaign model for multiplayer TRPG sessions.

    A campaign represents a long-running multiplayer game with one or more
    keepers and multiple players. It manages invitations, membership, and
    game state.
    """

    __tablename__ = "campaigns"

    # Primary key
    id = Column(SQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # Basic info
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)

    # Ownership
    keeper_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Scenario/module association
    scenario_id = Column(SQLUUID(as_uuid=True), nullable=True)

    # Invite system
    invite_code = Column(String(20), unique=True, nullable=False, default=generate_invite_code)

    # Settings
    max_players = Column(Integer, default=4, nullable=False)
    status = Column(String(20), default=CampaignStatus.ACTIVE.value, nullable=False)
    settings = Column(JSON, nullable=True, default=dict)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    members = relationship("CampaignMember", back_populates="campaign", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Campaign {self.id} {self.name} keeper={self.keeper_id}>"

    def to_dict(self) -> dict:
        """Convert campaign to dictionary for API responses."""
        return {
            "id": str(self.id),
            "name": self.name,
            "description": self.description,
            "keeper_id": self.keeper_id,
            "scenario_id": str(self.scenario_id) if self.scenario_id else None,
            "invite_code": self.invite_code,
            "max_players": self.max_players,
            "status": self.status,
            "settings": self.settings or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def regenerate_invite_code(self) -> str:
        """Generate a new invite code."""
        self.invite_code = generate_invite_code()
        return self.invite_code

    def is_keeper(self, user_id: int) -> bool:
        """Check if user is the campaign keeper."""
        return self.keeper_id == user_id

    def can_join(self) -> bool:
        """Check if campaign can accept new players."""
        if self.status != CampaignStatus.ACTIVE.value:
            return False
        active_players = [
            m for m in self.members
            if m.role == CampaignRole.PLAYER.value and m.status == MemberStatus.ACTIVE.value
        ]
        return len(active_players) < self.max_players


class CampaignMember(Base):
    """Campaign member model.

    Represents a user's membership in a campaign with their role and status.
    """

    __tablename__ = "campaign_members"

    # Primary key
    id = Column(SQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign keys
    campaign_id = Column(SQLUUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=True)

    # Member info
    role = Column(String(20), default=CampaignRole.PLAYER.value, nullable=False)
    status = Column(String(20), default=MemberStatus.ACTIVE.value, nullable=False)

    # Timestamps
    joined_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    campaign = relationship("Campaign", back_populates="members")

    # Unique constraint: one member per user per campaign
    __table_args__ = (
        # UniqueConstraint('campaign_id', 'user_id', name='uq_campaign_user'),
    )

    def __repr__(self) -> str:
        return f"<CampaignMember {self.id} campaign={self.campaign_id} user={self.user_id} role={self.role}>"

    def to_dict(self) -> dict:
        """Convert member to dictionary for API responses."""
        return {
            "id": str(self.id),
            "campaign_id": str(self.campaign_id),
            "user_id": self.user_id,
            "character_id": self.character_id,
            "role": self.role,
            "status": self.status,
            "joined_at": self.joined_at.isoformat() if self.joined_at else None,
            "last_seen_at": self.last_seen_at.isoformat() if self.last_seen_at else None,
        }

    def is_active(self) -> bool:
        """Check if member is active."""
        return self.status == MemberStatus.ACTIVE.value

    def update_last_seen(self) -> None:
        """Update last seen timestamp."""
        self.last_seen_at = datetime.utcnow()
