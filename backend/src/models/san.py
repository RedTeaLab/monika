"""SAN Recovery and Real Life tracking database model."""

from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.sql import func
from src.core.database import Base


class SANRecoveryRecord(Base):
    """Track SAN recovery events."""

    __tablename__ = "san_recovery_records"

    id = Column(Integer, primary_key=True, index=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=False, index=True)
    session_id = Column(String(36), ForeignKey("game_sessions.id"), nullable=True)

    previous_san = Column(Integer, nullable=False)
    recovered_amount = Column(Integer, nullable=False)
    current_san = Column(Integer, nullable=False)
    max_san = Column(Integer, nullable=False)

    recovery_type = Column(String(50), nullable=False)
    reason = Column(String(500), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class RealLifeRecord(Base):
    """Track Real Life recovery periods."""

    __tablename__ = "real_life_records"

    id = Column(Integer, primary_key=True, index=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=False, index=True)

    start_date = Column(DateTime(timezone=True), nullable=False)
    end_date = Column(DateTime(timezone=True), nullable=True)

    initial_san = Column(Integer, nullable=False)
    expected_recovery = Column(Integer, nullable=False)
    actual_recovery = Column(Integer, nullable=True)

    is_active = Column(Boolean, default=True, index=True)

    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SANStateSnapshot(Base):
    """Snapshot of character SAN state for tracking changes."""

    __tablename__ = "san_state_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=False, index=True)
    session_id = Column(String(36), ForeignKey("game_sessions.id"), nullable=True)

    san = Column(Integer, nullable=False)
    max_san = Column(Integer, nullable=False)
    san_cap = Column(Integer, nullable=False)

    total_san_lost = Column(Integer, default=0)
    total_san_recovered = Column(Integer, default=0)

    madness_count = Column(Integer, default=0)
    temporary_madness_count = Column(Integer, default=0)
    indefinite_madness_count = Column(Integer, default=0)

    is_insane = Column(Boolean, default=False)
    current_madness_type = Column(String(50), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
