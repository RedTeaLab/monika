"""Madness system database models."""

from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text, JSON
from sqlalchemy.sql import func
from src.core.database import Base


class MadnessEpisodeRecord(Base):
    """Record of a madness episode."""

    __tablename__ = "madness_episodes"

    id = Column(Integer, primary_key=True, index=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=False, index=True)
    session_id = Column(String(36), ForeignKey("game_sessions.id"), nullable=True)

    madness_type = Column(String(50), nullable=False)
    category = Column(String(20), nullable=False)

    symptoms = Column(JSON, nullable=True, default="[]")

    started_at = Column(DateTime(timezone=True), server_default=func.now())
    ends_at = Column(DateTime(timezone=True), nullable=True)

    duration_minutes = Column(Integer, nullable=True)
    duration_hours = Column(Integer, nullable=True)

    trigger_reason = Column(String(500), nullable=True)
    trigger_san_loss = Column(Integer, nullable=False)
    trigger_san_before = Column(Integer, nullable=False)
    trigger_san_after = Column(Integer, nullable=False)

    is_active = Column(Boolean, default=True, index=True)
    is_real_life = Column(Boolean, default=False)

    recovery_conditions = Column(JSON, nullable=True, default="[]")
    recovery_roll_required = Column(Boolean, default=False)
    recovery_roll_made = Column(Boolean, default=False)
    recovery_roll_result = Column(String(20), nullable=True)

    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolution_notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MadnessSymptomRecord(Base):
    """Predefined madness symptoms."""

    __tablename__ = "madness_symptoms"

    id = Column(Integer, primary_key=True, index=True)
    madness_type = Column(String(50), nullable=False, index=True)

    symptom_id = Column(String(50), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)

    effect_type = Column(String(50), default="behavior")
    modifier = Column(Integer, nullable=True)
    prohibited_actions = Column(JSON, nullable=True, default="[]")
    required_actions = Column(JSON, nullable=True, default="[]")
    duration_modifier = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
