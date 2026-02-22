"""Game Session database model."""

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import Column, String, DateTime, Integer, JSON, ForeignKey, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from src.core.database import Base, GUID


class SessionState(str, Enum):
    """Game session states."""

    ACTIVE = "active"
    PAUSED = "paused"
    ENDED = "ended"
    ARCHIVED = "archived"


class GameSession(Base):
    """Game session for tracking TRPG sessions.

    A session represents a single play session that can span multiple
    connections and resume points. It maintains the game state including
    current scene, participant characters, and world state.
    """

    __tablename__ = "game_sessions"

    id = Column(GUID(), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Ownership
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=True)

    # Session info
    name = Column(String(200), nullable=False)
    state = Column(String(20), default=SessionState.ACTIVE.value, nullable=False, index=True)

    # Campaign/module this session belongs to
    campaign_id = Column(GUID(), nullable=True, index=True)
    module_id = Column(String(100), nullable=True)  # ID of the scenario/module being played

    # Current scene state
    current_scene_id = Column(String(100), nullable=True)
    current_scene_name = Column(String(200), nullable=True)
    location = Column(String(200), nullable=True)

    # World state (JSON for flexible storage)
    # Stores: timer, threats, environment conditions, etc.
    world_state = Column(JSON, nullable=True, default=dict)

    # Character states snapshot (for quick resume)
    # Maps character_id -> {hp, san, luck, mp, etc.}
    character_states = Column(JSON, nullable=True, default=dict)

    # Narrative state
    # Leads, clues discovered, promises made, etc.
    narrative_state = Column(JSON, nullable=True, default=dict)

    # Session metadata
    started_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    paused_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)

    # Session notes/summary
    notes = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    # events = relationship("Event", backref="session", cascade="all, delete-orphan")
    # combats = relationship("Combat", backref="session", cascade="all, delete-orphan")
    # chases = relationship("Chase", backref="session", cascade="all, delete-orphan")

    @property
    def current_scene(self) -> str | None:
        """Alias for current_scene_name for API compatibility."""
        return self.current_scene_name

    def __repr__(self) -> str:
        return f"<GameSession {self.id} {self.name} state={self.state}>"

    def to_dict(self) -> dict:
        """Convert session to dictionary for API responses."""
        return {
            "id": str(self.id),
            "name": self.name,
            "state": self.state,
            "campaign_id": str(self.campaign_id) if self.campaign_id else None,
            "module_id": self.module_id,
            "current_scene_id": self.current_scene_id,
            "current_scene_name": self.current_scene_name,
            "location": self.location,
            "world_state": self.world_state or {},
            "character_states": self.character_states or {},
            "narrative_state": self.narrative_state or {},
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "paused_at": self.paused_at.isoformat() if self.paused_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def update_character_state(self, character_id: int, state: dict) -> None:
        """Update the state snapshot for a character.

        Args:
            character_id: Character ID
            state: Character state dict {hp, san, luck, mp, etc.}
        """
        if self.character_states is None:
            self.character_states = {}
        self.character_states[str(character_id)] = state

    def get_character_state(self, character_id: int) -> dict | None:
        """Get the state snapshot for a character.

        Args:
            character_id: Character ID

        Returns:
            Character state dict or None if not found
        """
        if self.character_states is None:
            return None
        return self.character_states.get(str(character_id))
