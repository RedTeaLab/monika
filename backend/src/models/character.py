"""Character database model."""

from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Boolean, Text
from sqlalchemy.sql import func
from src.core.database import Base


class Character(Base):
    """Character/Investigator model for CoC 7e."""

    __tablename__ = "characters"

    id = Column(Integer, primary_key=True, index=True)

    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    age = Column(Integer, default=0)
    gender = Column(String(20), default="")
    occupation = Column(String(100), default="")
    mental_illness = Column(String(200), default="")
    backstory = Column(String(2000), default="")

    str = Column(Integer, default=50)
    con = Column(Integer, default=50)
    dex = Column(Integer, default=50)
    app = Column(Integer, default=50)
    pow = Column(Integer, default=50)
    int = Column(Integer, default=50)
    siz = Column(Integer, default=50)
    edu = Column(Integer, default=50)

    hp = Column(Integer, default=10)
    mp = Column(Integer, default=10)
    san = Column(Integer, default=50)
    max_san = Column(Integer, default=50)
    luck = Column(Integer, default=50)

    occupation_data = Column(JSON, nullable=True)
    skills = Column(JSON, nullable=True, default="{}")
    interests = Column(JSON, nullable=True, default="[]")
    languages = Column(JSON, nullable=True, default="[]")
    spells = Column(JSON, nullable=True, default="[]")
    development_points = Column(Integer, default=0)

    is_favorite = Column(Boolean, default=False, index=True)
    is_template = Column(Boolean, default=False, index=True)
    is_public = Column(Boolean, default=False)
    share_code = Column(String(20), unique=True, nullable=True, index=True)
    template_source_id = Column(Integer, ForeignKey("characters.id"), nullable=True)

    portrait_url = Column(String(512), nullable=True)
    tags = Column(JSON, nullable=True, default="[]")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
