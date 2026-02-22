import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.main import app
from src.core.database import Base, get_db

# Import all models to ensure they're registered with Base
from src.models import (
    User, Character, GameSession, SessionState,
    Event, EventType, VisibilityLevel, Rule, RuleFAQ,
    Campaign, CampaignMember, CampaignStatus, CampaignRole, MemberStatus,
    Lead, LeadChoice, LeadPriority, LeadType, LeadStatus, LeadVisibility, LeadExecutionMethod,
    Message, MessageVisibility
)

# Use SQLite for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

_engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
# Export for tests that need direct access to engine
engine = _engine
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


@pytest.fixture(scope="function")
def _db():
    """Create and manage a database session for testing."""
    # Create all tables
    Base.metadata.create_all(bind=_engine)
    db = TestingSessionLocal()
    yield db
    db.close()
    # Clean up
    Base.metadata.drop_all(bind=_engine)


@pytest.fixture(scope="function")
def client(_db):
    """Create a test client with database session override."""
    db_session = _db  # Get the session from the fixture

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def test_db():
    """Alias for backwards compatibility - returns a session directly."""
    Base.metadata.create_all(bind=_engine)
    db = TestingSessionLocal()
    yield db
    db.close()
    Base.metadata.drop_all(bind=_engine)
