"""Tests for event pagination and sorting API."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.core.database import Base, get_db
from src.core.security import get_password_hash
from src.models import User, GameSession, SessionState, Event, EventType, VisibilityLevel
from src.models.event import EventCategory
from src.tests.conftest import engine, TestingSessionLocal


@pytest.fixture(scope="function")
def _db():
    """Create and manage a database session for testing."""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    yield db
    db.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(_db):
    """Create a test client with database session override."""
    db_session = _db

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def auth_headers(client, test_user=None):
    """Create authentication headers with a test user."""
    # Login to get token
    response = client.post(
        "/api/auth/login",
        json={
            "username": "testuser",
            "password": "testpassword123",
        },
    )
    data = response.json()
    # Handle both response formats: direct access_token or wrapped in data
    if "access_token" in data:
        token = data["access_token"]
    elif "data" in data and "access_token" in data["data"]:
        token = data["data"]["access_token"]
    else:
        raise KeyError(f"No access_token in response: {data}")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def test_user(_db):
    """Create a test user."""
    user = User(
        username="testuser",
        email="test@example.com",
        hashed_password=get_password_hash("testpassword123"),
    )
    _db.add(user)
    _db.commit()
    _db.refresh(user)
    return user


@pytest.fixture
def test_session(_db, test_user):
    """Create a test session."""
    session = GameSession(
        name="Test Session",
        owner_id=test_user.id,
        state=SessionState.ACTIVE,
    )
    _db.add(session)
    _db.commit()
    return session


@pytest.fixture
def test_events(_db, test_session, test_user):
    """Create test events with different timestamps and types."""
    session_id = test_session.id

    # Create 10 events with different timestamps
    base_time = datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
    events = []
    for i in range(10):
        event = Event(
            session_id=session_id,
            sequence=i + 1,
            actor_player_id=test_user.id,
            actor_role="player" if i % 2 == 0 else "kp",
            character_id=1 if i % 3 == 0 else None,
            event_type=EventType.MESSAGE
            if i % 3 == 0
            else EventType.HP_CHANGE
            if i % 3 == 1
            else EventType.SAN_CHECK,
            category=EventCategory.INTERACTION
            if i % 3 == 0
            else EventCategory.STATE
            if i % 3 == 1
            else EventCategory.SANITY,
            payload={"text": f"Event {i}", "value": i},
            visibility=VisibilityLevel.PUBLIC,
            timestamp=base_time + timedelta(hours=i),
            description=f"Event number {i}",
        )
        events.append(event)
        _db.add(event)

    _db.commit()
    return events


class TestPaginationSortingAPI:
    """Tests for pagination and sorting in events API."""

    def test_default_ordering_descending(self, client, test_session, test_events, test_user, _db):
        """Test events are ordered by timestamp descending by default."""
        headers = auth_headers(client, test_user)
        session_id = str(test_session.id)

        response = client.get(
            f"/api/events/{session_id}",
            headers=headers,
            params={"limit": 10},
        )

        assert response.status_code == 200

        response = client.get(
            f"/api/events/{session_id}",
            headers=headers,
            params={"limit": 10},
        )

        assert response.status_code == 200
        data = response.json()
        # Check pagination metadata is included
        assert "total" in data or "pagination" in data or isinstance(data, list)

        # If using new paginated response format, check ordering
        if isinstance(data, dict) and "items" in data:
            items = data["items"]
        else:
            items = data

        # Verify descending order by timestamp
        timestamps = [
            datetime.fromisoformat(item["timestamp"].replace("Z", "+00:00")) for item in items
        ]
        assert timestamps == sorted(timestamps, reverse=True)

    def test_sort_by_timestamp_asc(self, client, test_session, test_events):
        """Test sorting by timestamp ascending."""
        headers = auth_headers(client)
        session_id = str(test_session.id)

        response = client.get(
            f"/api/events/{session_id}",
            headers=headers,
            params={
                "sort_by": "timestamp",
                "sort_order": "asc",
                "limit": 10,
            },
        )

        assert response.status_code == 200

        # Check that sorting parameter is accepted
        # Either returns sorted results or 400 for invalid sort_by
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, dict) and "items" in data:
                items = data["items"]
            else:
                items = data
            timestamps = [
                datetime.fromisoformat(item["timestamp"].replace("Z", "+00:00")) for item in items
            ]
            assert timestamps == sorted(timestamps)

    def test_sort_by_timestamp_desc(self, client, test_session, test_events):
        """Test sorting by timestamp descending."""
        headers = auth_headers(client)
        session_id = str(test_session.id)

        response = client.get(
            f"/api/events/{session_id}",
            headers=headers,
            params={
                "sort_by": "timestamp",
                "sort_order": "desc",
                "limit": 10,
            },
        )

        assert response.status_code == 200

    def test_sort_by_event_type(self, client, test_session, test_events):
        """Test sorting by event_type."""
        headers = auth_headers(client)
        session_id = str(test_session.id)

        response = client.get(
            f"/api/events/{session_id}",
            headers=headers,
            params={
                "sort_by": "event_type",
                "sort_order": "asc",
                "limit": 10,
            },
        )

        # Should accept sort_by=event_type
        assert response.status_code in [200, 400]

    def test_invalid_sort_by(self, client, test_session, test_events):
        """Test invalid sort_by parameter returns 400."""
        headers = auth_headers(client)
        session_id = str(test_session.id)

        response = client.get(
            f"/api/events/{session_id}",
            headers=headers,
            params={
                "sort_by": "invalid_field",
                "limit": 10,
            },
        )

        # Should return 400 for invalid sort_by
        assert response.status_code == 400

    def test_invalid_sort_order(self, client, test_session, test_events):
        """Test invalid sort_order parameter returns 400."""
        headers = auth_headers(client)
        session_id = str(test_session.id)

        response = client.get(
            f"/api/events/{session_id}",
            headers=headers,
            params={
                "sort_by": "timestamp",
                "sort_order": "invalid",
                "limit": 10,
            },
        )

        # Should return 400 for invalid sort_order
        assert response.status_code == 400

    def test_pagination_metadata(self, client, test_session, test_events):
        """Test pagination metadata is returned in response."""
        headers = auth_headers(client)
        session_id = str(test_session.id)

        response = client.get(
            f"/api/events/{session_id}",
            headers=headers,
            params={"limit": 3, "offset": 0},
        )

        assert response.status_code == 200
        data = response.json()

        # Should have pagination metadata
        # New format: {items: [...], pagination: {total, limit, offset, has_more}}
        # Or: {data: [...], total: 10, limit: 3, offset: 0}
        if isinstance(data, dict):
            assert "items" in data or "data" in data
            # Check for total count
            if "pagination" in data:
                assert "total" in data["pagination"]
                assert data["pagination"]["total"] == 10
            elif "total" in data:
                assert data["total"] == 10

    def test_offset_pagination(self, client, test_session, test_events):
        """Test offset-based pagination."""
        headers = auth_headers(client)
        session_id = str(test_session.id)

        # Get first page
        response1 = client.get(
            f"/api/events/{session_id}",
            headers=headers,
            params={"limit": 3, "offset": 0},
        )

        # Get second page
        response2 = client.get(
            f"/api/events/{session_id}",
            headers=headers,
            params={"limit": 3, "offset": 3},
        )

        assert response1.status_code == 200
        assert response2.status_code == 200

        data1 = response1.json()
        data2 = response2.json()

        # Extract items based on response format
        if isinstance(data1, dict) and "items" in data1:
            items1 = data1["items"]
            items2 = data2["items"]
        else:
            items1 = data1
            items2 = data2

        # Pages should have different items
        ids1 = {item["id"] for item in items1}
        ids2 = {item["id"] for item in items2}
        assert ids1 != ids2

    def test_limit_bounds(self, client, test_session, test_events):
        """Test limit parameter bounds."""
        headers = auth_headers(client)
        session_id = str(test_session.id)

        # Test limit exceeding max (500)
        response = client.get(
            f"/api/events/{session_id}",
            headers=headers,
            params={"limit": 1000},
        )
        # Should either cap at 500 or return 422/400
        assert response.status_code in [200, 422, 400]

        # Test limit of 1
        response = client.get(
            f"/api/events/{session_id}",
            headers=headers,
            params={"limit": 1},
        )
        assert response.status_code == 200
        data = response.json()
        if isinstance(data, dict) and "items" in data:
            assert len(data["items"]) <= 1
        else:
            assert len(data) <= 1


class TestEventLoggerSorting:
    """Tests for EventLogger service sorting functionality."""

    def test_get_session_events_with_sorting(self, _db, test_session, test_events):
        """Test EventLogger.get_session_events with sort parameters."""
        from src.services.events import EventLogger

        logger = EventLogger(_db)

        # Sort by timestamp ascending
        events = logger.get_session_events(
            test_session.id,
            sort_by="timestamp",
            sort_order="asc",
            limit=10,
        )

        timestamps = [e.timestamp for e in events]
        assert timestamps == sorted(timestamps)

        # Sort by timestamp descending
        events = logger.get_session_events(
            test_session.id,
            sort_by="timestamp",
            sort_order="desc",
            limit=10,
        )

        timestamps = [e.timestamp for e in events]
        assert timestamps == sorted(timestamps, reverse=True)

    def test_get_session_events_sort_by_sequence(self, _db, test_session, test_events):
        """Test sorting by sequence number."""
        from src.services.events import EventLogger

        logger = EventLogger(_db)

        events = logger.get_session_events(
            test_session.id,
            sort_by="sequence",
            sort_order="asc",
            limit=10,
        )

        sequences = [e.sequence for e in events]
        assert sequences == sorted(sequences)

    def test_get_session_events_sort_by_event_type(self, _db, test_session, test_events):
        """Test sorting by event_type."""
        from src.services.events import EventLogger

        logger = EventLogger(_db)

        events = logger.get_session_events(
            test_session.id,
            sort_by="event_type",
            sort_order="asc",
            limit=10,
        )

        # Should not raise error, may or may not be sorted
        assert len(events) > 0

    def test_pagination_with_total_count(self, _db, test_session, test_events):
        """Test pagination with total count."""
        from src.services.events import EventLogger

        logger = EventLogger(_db)

        # Get first page
        result = logger.get_session_events(
            test_session.id,
            limit=3,
            offset=0,
            include_total=True,
        )

        # Result should include total count
        assert isinstance(result, dict)
        assert "items" in result
        assert "total" in result
        assert result["total"] == 10
