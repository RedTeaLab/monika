"""Message database model for multiplayer chat."""
from datetime import datetime
import json
import uuid
from enum import Enum

from sqlalchemy import Column, String, DateTime, Text, ForeignKey, TypeDecorator
from sqlalchemy.sql import func
try:
    from sqlalchemy.dialects.postgresql import UUID
except ImportError:
    from sqlalchemy import String
    UUID = String

from src.core.database import Base


class StringArray(TypeDecorator):
    """SQLite-compatible array type that stores as JSON string.

    This type allows storing lists/arrays in SQLite by serializing them
    as JSON strings. It provides the same interface as PostgreSQL's ARRAY type.
    """
    impl = Text

    def process_bind_param(self, value, dialect):
        """Convert Python list to JSON string for storage."""
        if value is None:
            return "[]"
        if isinstance(value, str):
            return value  # Already a string
        return json.dumps(value)

    def process_result_value(self, value, dialect):
        """Convert JSON string back to Python list."""
        if value is None:
            return []
        if isinstance(value, list):
            return value  # Already a list
        return json.loads(value)


class MessageVisibility(str, Enum):
    """Visibility levels for messages."""
    PUBLIC = "public"
    KP_ONLY = "kp"
    PARTY = "party"
    PRIVATE = "private"


class Message(Base):
    """Chat messages in multiplayer sessions."""

    __tablename__ = "messages"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Session this message belongs to
    session_id = Column(UUID(as_uuid=True), ForeignKey("game_sessions.id"), nullable=False, index=True)

    # Who sent the message
    sender_id = Column(UUID(as_uuid=True), nullable=False, index=True)

    # Message content
    content = Column(Text, nullable=False)

    # Visibility level
    visibility = Column(String(20), nullable=False, default="public")

    # For PRIVATE visibility: list of user IDs who can see this message
    # Stored as JSON string for SQLite compatibility
    visible_to = Column(StringArray, nullable=False)

    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self) -> str:
        return f"<Message {self.id} from {self.sender_id}>"

    def to_dict(self) -> dict:
        """Convert message to dictionary for API responses."""
        return {
            "id": str(self.id),
            "session_id": str(self.session_id),
            "sender_id": str(self.sender_id),
            "content": self.content,
            "visibility": self.visibility,
            "visible_to": self.visible_to or [],
            "created_at": self.created_at.isoformat(),
        }
