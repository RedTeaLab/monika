"""
Skill database model and related schemas.

Skills are organized with:
- Base skill info (name, base value, description)
- Era availability (modern, 1920s, or both)
- Specializations (sub-skills)
- Usage examples for AI reference
"""

from datetime import datetime
from typing import Optional, List
from sqlalchemy import Column, Integer, String, Text, Boolean, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship, backref
from src.core.database import Base


class Skill(Base):
    """Skill model for CoC 7e skills."""

    __tablename__ = "skills"

    id = Column(Integer, primary_key=True, index=True)

    # Basic info
    name = Column(String(100), nullable=False, unique=True)
    name_en = Column(String(100), nullable=False)
    base_value = Column(Integer, nullable=False, default=0)
    category = Column(String(50), nullable=False)  # combat, social, knowledge, technical, etc.

    # Era availability
    available_modern = Column(Boolean, default=True)
    available_1920s = Column(Boolean, default=True)

    # Description for AI reference
    description = Column(Text, nullable=True)
    difficulty_levels = Column(Text, nullable=True)  # JSON string with difficulty info
    push_examples = Column(Text, nullable=True)  # 孤注一掷例子
    push_failure_examples = Column(Text, nullable=True)  # 孤注一掷失败例子
    opposing_skills = Column(String(200), nullable=True)  # 对抗技能

    # Specialization support
    has_specializations = Column(Boolean, default=False)
    parent_skill_id = Column(Integer, ForeignKey("skills.id"), nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    specializations = relationship(
        "Skill", backref=backref("parent_skill", remote_side=[id]), foreign_keys=[parent_skill_id]
    )


class SkillCategory(Base):
    """Skill category for organization."""

    __tablename__ = "skill_categories"

    id = Column(Integer, primary_key=True)
    key = Column(String(50), unique=True, nullable=False)  # e.g., 'combat', 'social'
    name = Column(String(100), nullable=False)  # e.g., '战斗技能'
    name_en = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)
