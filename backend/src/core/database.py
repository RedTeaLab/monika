import uuid
from sqlalchemy import create_engine, TypeDecorator, String
from sqlalchemy.orm import declarative_base, sessionmaker
from typing import Generator

import src.core.config
from src.core.config import settings


class GUID(TypeDecorator):
    """Platform-independent GUID type.

    Uses PostgreSQL's UUID type when available, otherwise uses
    String(36) to store as string and accepts both UUID objects
    and string representations.
    """

    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif isinstance(value, uuid.UUID):
            return str(value)
        else:
            return str(uuid.UUID(value))

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(value)

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(String(36))


engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db() -> Generator:
    """Get database session for dependency injection."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db_sync() -> Generator:
    """Get synchronous database session for direct use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
