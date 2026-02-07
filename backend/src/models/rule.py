"""Rules database models for CoC 7e rules knowledge base."""
from sqlalchemy import Column, String, Text, JSON, DateTime, LargeBinary
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.sql import func
from src.core.database import Base
import uuid
import os

# Check if we're using PostgreSQL (production) or SQLite (testing)
USE_POSTGRESQL = os.environ.get("DATABASE_URL", "").startswith("postgresql")

# Import Vector type only if pgvector is available (PostgreSQL production)
try:
    from pgvector.sqlalchemy import Vector
    HAS_PGVECTOR = True
except ImportError:
    HAS_PGVECTOR = False


class Rule(Base):
    """Core rule entries for CoC 7e game mechanics."""

    __tablename__ = "rules"

    # UUID primary key - works differently in SQLite vs PostgreSQL
    if USE_POSTGRESQL:
        id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    else:
        # For SQLite, store UUID as string
        id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    title = Column(String(255), nullable=False, index=True)
    category = Column(String(100), nullable=False, index=True)
    subcategory = Column(String(100))
    content = Column(Text, nullable=False)
    example = Column(Text)
    mechanics = Column(JSON)

    # Array fields - use JSON for SQLite, ARRAY for PostgreSQL
    if USE_POSTGRESQL:
        aliases = Column(ARRAY(String))
        tags = Column(ARRAY(String))
        related_rule_ids = Column(ARRAY(UUID(as_uuid=True)))
    else:
        # For SQLite, store arrays as JSON
        aliases = Column(JSON)  # List[str]
        tags = Column(JSON)  # List[str]
        related_rule_ids = Column(JSON)  # List[str]

    # Embedding vector for semantic search (PostgreSQL with pgvector only)
    if HAS_PGVECTOR and USE_POSTGRESQL:
        embedding = Column(Vector(1536), nullable=True)
    else:
        # Fallback for SQLite testing: store as binary/JSON
        embedding = Column(LargeBinary, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def to_dict(self):
        """Convert rule to dictionary representation."""
        return {
            "id": str(self.id),
            "title": self.title,
            "category": self.category,
            "subcategory": self.subcategory,
            "content": self.content,
            "example": self.example,
            "mechanics": self.mechanics,
            "aliases": self.aliases or [],
            "tags": self.tags or [],
            "related_rule_ids": [str(id) for id in (self.related_rule_ids or [])],
        }

    def __repr__(self):
        return f"<Rule(id={self.id}, title={self.title}, category={self.category})>"


class RuleFAQ(Base):
    """Frequently asked questions about CoC 7e rules."""

    __tablename__ = "rule_faqs"

    # UUID primary key
    if USE_POSTGRESQL:
        id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    else:
        # For SQLite, store UUID as string
        id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    category = Column(String(100))

    # Array fields - use JSON for SQLite, ARRAY for PostgreSQL
    if USE_POSTGRESQL:
        related_rule_ids = Column(ARRAY(UUID(as_uuid=True)))
    else:
        # For SQLite, store arrays as JSON
        related_rule_ids = Column(JSON)  # List[str]

    # Embedding vector for semantic search (PostgreSQL with pgvector only)
    if HAS_PGVECTOR and USE_POSTGRESQL:
        embedding = Column(Vector(1536), nullable=True)
    else:
        # Fallback for SQLite testing: store as binary/JSON
        embedding = Column(LargeBinary, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<RuleFAQ(id={self.id}, question={self.question[:50]}...)>"
