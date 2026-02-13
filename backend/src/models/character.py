"""Character database model."""
from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from src.core.database import Base

class Character(Base):
    """Character/Investigator model for CoC 7e."""
    __tablename__ = "characters"

    # Primary key
    id = Column(Integer, primary_key=True, index=True)

    # Basic info
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    age = Column(Integer, default=0)
    gender = Column(String(20), default="")
    occupation = Column(String(100), default="")
    mental_illness = Column(String(200), default="")
    backstory = Column(String(2000), default="")

    # Attributes (CoC 7e standard: 3-21)
    str = Column(Integer, default=50)  # Strength
    con = Column(Integer, default=50)  # Constitution
    dex = Column(Integer, default=50)  # Dexterity
    app = Column(Integer, default=50)  # Appearance
    pow = Column(Integer, default=50)  # Power
    int = Column(Integer, default=50)  # Intelligence
    siz = Column(Integer, default=50)  # Size
    edu = Column(Integer, default=50)  # Education

    # Derived stats
    hp = Column(Integer, default=10)   # Hit Points = (CON + SIZ) / 2
    mp = Column(Integer, default=10)  # Magic Points = POW / 2
    san = Column(Integer, default=50)  # Sanity = POW * 5
    max_san = Column(Integer, default=50)  # Maximum Sanity
    luck = Column(Integer, default=50)  # Luck points

    # CoC 7e extended data (JSON fields)
    occupation_data = Column(JSON, nullable=True)  # 职业详细信息
    skills = Column(JSON, nullable=True, default="{}")  # 技能数据
    interests = Column(JSON, nullable=True, default="[]")  # 兴趣领域
    languages = Column(JSON, nullable=True, default="[]")  # 语言技能
    spells = Column(JSON, nullable=True, default="[]")  # 魔法
    development_points = Column(Integer, default=0)  # 发展点数

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
