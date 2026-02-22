"""Script database models for scenario/module management."""

from sqlalchemy import Column, String, Text, JSON, DateTime, Integer, ForeignKey, Enum, Boolean
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from src.core.database import Base
import uuid
import enum
import os

USE_POSTGRESQL = os.environ.get("DATABASE_URL", "").startswith("postgresql")


class ScriptStatus(str, enum.Enum):
    """Script validation status."""

    DRAFT = "draft"
    VALIDATING = "validating"
    VALID = "valid"
    INVALID = "invalid"
    PUBLISHED = "published"


class ScriptType(str, enum.Enum):
    """Script/scenario type."""

    SCENARIO = "scenario"
    ONE_SHOT = "one_shot"
    CAMPAIGN = "campaign"
    HANDOUT = "handout"
    NPC_LIST = "npc_list"


class Script(Base):
    """Script/Scenario model for game modules."""

    __tablename__ = "scripts"

    if USE_POSTGRESQL:
        id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    else:
        id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    name = Column(String(255), nullable=False, index=True)
    description = Column(Text)
    script_type = Column(String(50), default=ScriptType.SCENARIO.value)
    status = Column(String(50), default=ScriptStatus.DRAFT.value, index=True)

    metadata_json = Column(JSON)
    cover_image_url = Column(String(512))
    tags = Column(JSON)

    if USE_POSTGRESQL:
        scene_ids = Column(ARRAY(UUID(as_uuid=True)))
    else:
        scene_ids = Column(JSON)

    scene_count = Column(Integer, default=0)
    npc_count = Column(Integer, default=0)
    clue_count = Column(Integer, default=0)

    current_version = Column(Integer, default=1)
    validation_errors = Column(JSON)
    validation_warnings = Column(JSON)

    is_public = Column(Boolean, default=False)
    download_count = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    owner = relationship("User", backref="scripts")
    versions = relationship(
        "ScriptVersion", back_populates="script", order_by="desc(ScriptVersion.version_number)"
    )
    scenes = relationship(
        "ScriptScene", back_populates="script", order_by="ScriptScene.order_index"
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "owner_id": self.owner_id,
            "name": self.name,
            "description": self.description,
            "script_type": self.script_type,
            "status": self.status,
            "metadata": self.metadata_json,
            "cover_image_url": self.cover_image_url,
            "tags": self.tags or [],
            "scene_count": self.scene_count,
            "npc_count": self.npc_count,
            "clue_count": self.clue_count,
            "current_version": self.current_version,
            "validation_errors": self.validation_errors,
            "validation_warnings": self.validation_warnings,
            "is_public": self.is_public,
            "download_count": self.download_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class ScriptVersion(Base):
    """Version history for scripts."""

    __tablename__ = "script_versions"

    if USE_POSTGRESQL:
        id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    else:
        id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    script_id = Column(
        String(36), ForeignKey("scripts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_number = Column(Integer, nullable=False)

    content_json = Column(JSON, nullable=False)
    change_notes = Column(Text)

    file_size_bytes = Column(Integer)
    file_hash = Column(String(64))

    validation_status = Column(String(50))
    validation_errors = Column(JSON)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    script = relationship("Script", back_populates="versions")

    def to_dict(self):
        return {
            "id": str(self.id),
            "script_id": str(self.script_id),
            "version_number": self.version_number,
            "change_notes": self.change_notes,
            "file_size_bytes": self.file_size_bytes,
            "file_hash": self.file_hash,
            "validation_status": self.validation_status,
            "validation_errors": self.validation_errors,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ScriptScene(Base):
    """Scene within a script."""

    __tablename__ = "script_scenes"

    if USE_POSTGRESQL:
        id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    else:
        id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    script_id = Column(
        String(36), ForeignKey("scripts.id", ondelete="CASCADE"), nullable=False, index=True
    )

    name = Column(String(255), nullable=False)
    order_index = Column(Integer, default=0)

    description = Column(Text)
    location = Column(String(255))
    time_of_day = Column(String(100))
    atmosphere = Column(String(100))

    content_json = Column(JSON)
    npcs = Column(JSON)
    clues = Column(JSON)
    handouts = Column(JSON)

    estimated_duration_minutes = Column(Integer)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    script = relationship("Script", back_populates="scenes")

    def to_dict(self):
        return {
            "id": str(self.id),
            "script_id": str(self.script_id),
            "name": self.name,
            "order_index": self.order_index,
            "description": self.description,
            "location": self.location,
            "time_of_day": self.time_of_day,
            "atmosphere": self.atmosphere,
            "npcs": self.npcs or [],
            "clues": self.clues or [],
            "handouts": self.handouts or [],
            "estimated_duration_minutes": self.estimated_duration_minutes,
        }


class ScriptAsset(Base):
    """Assets attached to scripts (images, handouts, etc)."""

    __tablename__ = "script_assets"

    if USE_POSTGRESQL:
        id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    else:
        id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    script_id = Column(
        String(36), ForeignKey("scripts.id", ondelete="CASCADE"), nullable=False, index=True
    )

    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255))
    mime_type = Column(String(100))
    file_size_bytes = Column(Integer)

    storage_path = Column(String(512), nullable=False)
    storage_type = Column(String(50), default="local")

    asset_type = Column(String(50))
    scene_id = Column(String(36))

    is_public = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def to_dict(self):
        return {
            "id": str(self.id),
            "script_id": str(self.script_id),
            "filename": self.filename,
            "original_filename": self.original_filename,
            "mime_type": self.mime_type,
            "file_size_bytes": self.file_size_bytes,
            "asset_type": self.asset_type,
            "is_public": self.is_public,
        }
