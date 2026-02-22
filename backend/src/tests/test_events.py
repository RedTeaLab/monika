"""Tests for event logging service."""
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.database import Base
from src.models.event import Event, EventType, EventCategory, VisibilityLevel
from src.models.user import User
from src.models.character import Character
from src.services.events import EventLogger, EventRecord
from src.services.dice import BonusPenalty, RollResult


@pytest.fixture
def test_db():
    """Create a test database."""
    engine = create_engine("sqlite:///:memory:")
    TestingSessionLocal = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def test_user(test_db):
    """Create a test user."""
    user = User(username="testuser", email="test@example.com", hashed_password="hash")
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture
def test_character(test_db, test_user):
    """Create a test character."""
    character = Character(
        owner_id=test_user.id,
        name="Test Investigator",
        hp=12,
        san=60,
        max_san=60,
        luck=50,
    )
    test_db.add(character)
    test_db.commit()
    test_db.refresh(character)
    return character


class TestEventRecord:
    """Test EventRecord builder."""

    def test_build_roll_event(self, test_db, test_user, test_character):
        """Test building a roll event."""
        session_id = uuid.uuid4()

        event = (
            EventRecord(test_db, EventType.ROLL, "player")
            .session(session_id)
            .actor(test_user)
            .character(test_character)
            .payload(
                {
                    "skill": "spot_hidden",
                    "target": 50,
                    "roll": 25,
                    "success_level": "regular_success",
                    "bonus_penalty": "regular",
                }
            )
            .description("Rolled Spot Hidden: 25 - Regular Success")
            .save()
        )

        assert event.event_type == EventType.ROLL
        assert event.session_id == session_id
        assert event.actor_player_id == test_user.id
        assert event.character_id == test_character.id
        assert event.payload["skill"] == "spot_hidden"
        assert event.payload["roll"] == 25

    def test_build_damage_event(self, test_db, test_character):
        """Test building a damage event."""
        session_id = uuid.uuid4()

        event = (
            EventRecord(test_db, EventType.DAMAGE, "kp")
            .session(session_id)
            .character(test_character)
            .payload(
                {
                    "amount": 5,
                    "source": "cultist_knife",
                    "current_hp": 7,
                    "max_hp": 12,
                }
            )
            .description("Took 5 damage from cultist knife")
            .save()
        )

        assert event.event_type == EventType.DAMAGE
        assert event.payload["amount"] == 5
        assert event.payload["current_hp"] == 7


class TestEventLogger:
    """Test EventLogger service."""

    def test_record_and_retrieve_event(self, test_db, test_user):
        """Test recording and retrieving an event."""
        logger = EventLogger(test_db)
        session_id = uuid.uuid4()

        event = (
            logger.record(EventType.ROLL, "player")
            .session(session_id)
            .actor(test_user)
            .payload({"skill": "spot_hidden", "roll": 25, "target": 50})
            .save()
        )

        retrieved = logger.get_event(event.id)
        assert retrieved is not None
        assert retrieved.id == event.id
        assert retrieved.payload["roll"] == 25

    def test_get_session_events(self, test_db, test_user):
        """Test getting all events for a session."""
        logger = EventLogger(test_db)
        session_id = uuid.uuid4()

        # Create multiple events
        logger.record(EventType.SESSION_START, "system").session(session_id).save()
        logger.record(EventType.ROLL, "player").session(session_id).actor(test_user).save()
        logger.record(EventType.MESSAGE, "kp").session(session_id).save()

        events = logger.get_session_events(session_id)
        assert len(events) == 3

    def test_filter_session_events_by_type(self, test_db):
        """Test filtering session events by type."""
        logger = EventLogger(test_db)
        session_id = uuid.uuid4()

        logger.record(EventType.ROLL, "player").session(session_id).save()
        logger.record(EventType.MESSAGE, "kp").session(session_id).save()
        logger.record(EventType.ROLL, "player").session(session_id).save()

        roll_events = logger.get_session_events(session_id, event_type=EventType.ROLL)
        assert len(roll_events) == 2

    def test_get_character_events(self, test_db, test_character):
        """Test getting events for a character."""
        logger = EventLogger(test_db)
        session_id = uuid.uuid4()

        logger.record(EventType.DAMAGE, "kp").session(session_id).character(test_character).save()
        logger.record(EventType.HEAL, "kp").session(session_id).character(test_character).save()

        events = logger.get_character_events(test_character.id)
        assert len(events) == 2

    def test_get_state_changes(self, test_db, test_character):
        """Test getting state changes organized by type."""
        logger = EventLogger(test_db)
        session_id = uuid.uuid4()

        logger.record(EventType.DAMAGE, "kp").session(session_id).character(test_character).save()
        logger.record(EventType.SAN_LOSS, "kp").session(session_id).character(test_character).save()
        logger.record(EventType.ROLL, "player").session(session_id).character(test_character).save()

        state_changes = logger.get_state_changes(session_id)
        assert len(state_changes["hp"]) == 1
        assert len(state_changes["san"]) == 1
        assert len(state_changes["luck"]) == 0

    def test_create_summary(self, test_db):
        """Test creating session summary."""
        logger = EventLogger(test_db)
        session_id = uuid.uuid4()

        logger.record(EventType.SESSION_START, "system").session(session_id).save()
        logger.record(EventType.ROLL, "player").session(session_id).save()
        logger.record(EventType.MESSAGE, "kp").session(session_id).save()
        logger.record(EventType.SESSION_END, "system").session(session_id).save()

        summary = logger.create_summary(session_id)
        assert summary["total_events"] == 4
        assert "session_start" in summary["event_counts"]
        assert summary["event_counts"]["session_start"] == 1

    def test_event_visibility(self, test_db):
        """Test event visibility filtering."""
        logger = EventLogger(test_db)
        session_id = uuid.uuid4()

        public_event = (
            logger.record(EventType.MESSAGE, "kp")
            .session(session_id)
            .visibility(VisibilityLevel.PUBLIC)
            .save()
        )

        kp_event = (
            logger.record(EventType.MESSAGE, "kp")
            .session(session_id)
            .visibility(VisibilityLevel.KP_ONLY)
            .save()
        )

        assert public_event.visibility == VisibilityLevel.PUBLIC
        assert kp_event.visibility == VisibilityLevel.KP_ONLY

    def test_parent_event_reference(self, test_db, test_character):
        """Test referencing parent event."""
        logger = EventLogger(test_db)
        session_id = uuid.uuid4()

        original_roll = (
            logger.record(EventType.ROLL, "player")
            .session(session_id)
            .character(test_character)
            .payload({"roll": 65, "target": 50})
            .save()
        )

        push_roll = (
            logger.record(EventType.PUSH_ROLL, "player")
            .session(session_id)
            .character(test_character)
            .parent(original_roll.id)
            .payload({"roll": 80, "target": 50, "consequence": "san_loss"})
            .save()
        )

        assert push_roll.parent_event_id == original_roll.id
        assert logger.get_event(push_roll.id).parent_event_id == original_roll.id


class TestEventImmutability:
    """Test that events are immutable once created."""

    def test_events_append_only(self, test_db, test_user):
        """Test that events cannot be modified once saved."""
        logger = EventLogger(test_db)
        session_id = uuid.uuid4()

        event = (
            logger.record(EventType.ROLL, "player")
            .session(session_id)
            .actor(test_user)
            .payload({"roll": 25})
            .save()
        )

        original_timestamp = event.timestamp
        original_payload = event.payload.copy()

        # Try to modify the event (this shouldn't affect the database)
        event.payload["roll"] = 999

        # Reload from database
        test_db.expire(event)
        test_db.refresh(event)

        # Values should remain unchanged
        assert event.timestamp == original_timestamp
        assert event.payload["roll"] == 25


class TestM3EventExtensions:
    """Test M3 Memory Web extensions to the Event model."""

    def test_event_category_assignment(self, test_db, test_user):
        """Test setting event category."""
        logger = EventLogger(test_db)
        session_id = uuid.uuid4()

        event = (
            logger.record(EventType.ROLL, "player")
            .session(session_id)
            .actor(test_user)
            .category(EventCategory.CHECK)
            .save()
        )

        assert event.category == EventCategory.CHECK

    def test_event_sequence_auto_increment(self, test_db, test_user):
        """Test that sequence numbers auto-increment per session."""
        logger = EventLogger(test_db)
        session_id = uuid.uuid4()

        event1 = (
            logger.record(EventType.MESSAGE, "player")
            .session(session_id)
            .actor(test_user)
            .save()
        )
        event2 = (
            logger.record(EventType.ROLL, "player")
            .session(session_id)
            .actor(test_user)
            .save()
        )
        event3 = (
            logger.record(EventType.MESSAGE, "kp")
            .session(session_id)
            .save()
        )

        assert event1.sequence == 1
        assert event2.sequence == 2
        assert event3.sequence == 3

    def test_event_with_input_raw(self, test_db):
        """Test storing raw user input."""
        logger = EventLogger(test_db)
        session_id = uuid.uuid4()

        event = (
            logger.record(EventType.ROLL, "player")
            .session(session_id)
            .input_raw("/roll spot_hidden 50")
            .save()
        )

        assert event.input_raw == "/roll spot_hidden 50"
        assert event.to_dict()["input_raw"] == "/roll spot_hidden 50"

    def test_event_with_narration(self, test_db):
        """Test storing AI-generated or KP-written narrative."""
        logger = EventLogger(test_db)
        session_id = uuid.uuid4()

        narration = "You carefully search the dimly lit room..."
        event = (
            logger.record(EventType.ROLL, "system")
            .session(session_id)
            .narration(narration)
            .save()
        )

        assert event.narration == narration
        assert event.to_dict()["narration"] == narration

    def test_event_with_client_timestamp(self, test_db):
        """Test storing client-side timestamp for sync."""
        logger = EventLogger(test_db)
        session_id = uuid.uuid4()

        client_ts = datetime(2026, 2, 22, 10, 30, 0, tzinfo=timezone.utc)
        event = (
            logger.record(EventType.MESSAGE, "player")
            .session(session_id)
            .client_timestamp(client_ts)
            .save()
        )

        # SQLite doesn't preserve timezone, check the datetime values match
        assert event.client_timestamp is not None
        assert event.client_timestamp.year == 2026
        assert event.client_timestamp.month == 2
        assert event.client_timestamp.day == 22
        # Check that server timestamp is different (set by database)
        assert event.timestamp != event.client_timestamp

    def test_event_with_source(self, test_db):
        """Test storing event source."""
        logger = EventLogger(test_db)
        session_id = uuid.uuid4()

        event = (
            logger.record(EventType.MESSAGE, "player")
            .session(session_id)
            .source("web")
            .save()
        )

        assert event.source == "web"

        api_event = (
            logger.record(EventType.MESSAGE, "system")
            .session(session_id)
            .source("api")
            .save()
        )

        assert api_event.source == "api"

    def test_event_with_tags(self, test_db):
        """Test storing tags for search and filtering."""
        logger = EventLogger(test_db)
        session_id = uuid.uuid4()

        tags = ["investigation", "library", "clue"]
        event = (
            logger.record(EventType.ROLL, "player")
            .session(session_id)
            .tags(tags)
            .save()
        )

        assert event.tags == tags
        assert event.to_dict()["tags"] == tags

    def test_event_with_checkpoint_reference(self, test_db):
        """Test associating event with checkpoint."""
        logger = EventLogger(test_db)
        session_id = uuid.uuid4()
        checkpoint_id = uuid.uuid4()

        event = (
            logger.record(EventType.CHECKPOINT, "system")
            .session(session_id)
            .checkpoint(checkpoint_id)
            .save()
        )

        assert event.checkpoint_id == checkpoint_id
        assert event.to_dict()["checkpoint_id"] == str(checkpoint_id)

    def test_event_with_state_changes(self, test_db, test_character):
        """Test storing detailed state changes."""
        logger = EventLogger(test_db)
        session_id = uuid.uuid4()

        state_changes = [
            {
                "path": f"characters.{test_character.id}.derived.HP",
                "type": "decrement",
                "old_value": 12,
                "new_value": 10,
                "delta": -2,
                "metadata": {"reason": "combat_damage", "source": "cultist_knife"}
            }
        ]

        event = (
            logger.record(EventType.DAMAGE, "kp")
            .session(session_id)
            .character(test_character)
            .state_changes(state_changes)
            .save()
        )

        assert event.state_changes_json == state_changes
        assert event.to_dict()["state_changes_json"] == state_changes

    def test_full_m3_event_builder(self, test_db, test_user, test_character):
        """Test building a complete M3 event with all extensions."""
        logger = EventLogger(test_db)
        session_id = uuid.uuid4()

        state_changes = [
            {
                "path": f"characters.{test_character.id}.clues.discovered",
                "type": "add",
                "added": ["clue_old_book"]
            }
        ]

        event = (
            logger.record(EventType.ROLL, "player")
            .session(session_id)
            .actor(test_user)
            .character(test_character)
            .category(EventCategory.CHECK)
            .input_raw("/roll library_use")
            .narration("You carefully examine the ancient tome...")
            .client_timestamp(datetime(2026, 2, 22, 10, 30, 0, tzinfo=timezone.utc))
            .source("web")
            .tags(["investigation", "library", "clue"])
            .state_changes(state_changes)
            .payload({"skill": "library_use", "roll": 25, "target": 50})
            .description("Library Use check: 25/50 - Success")
            .visibility(VisibilityLevel.PUBLIC)
            .save()
        )

        # Verify all fields
        assert event.sequence == 1
        assert event.category == EventCategory.CHECK
        assert event.input_raw == "/roll library_use"
        assert event.narration == "You carefully examine the ancient tome..."
        assert event.client_timestamp is not None
        assert event.source == "web"
        assert event.tags == ["investigation", "library", "clue"]
        assert event.state_changes_json == state_changes
        assert event.payload["roll"] == 25

        # Verify to_dict includes all M3 fields
        event_dict = event.to_dict()
        assert "sequence" in event_dict
        assert "category" in event_dict
        assert "input_raw" in event_dict
        assert "narration" in event_dict
        assert "client_timestamp" in event_dict
        assert "source" in event_dict
        assert "tags" in event_dict
        assert "state_changes_json" in event_dict
        assert "checkpoint_id" in event_dict

    def test_sequence_independent_per_session(self, test_db):
        """Test that sequence numbers are independent per session."""
        logger = EventLogger(test_db)
        session1_id = uuid.uuid4()
        session2_id = uuid.uuid4()

        # Add events to session 1
        event1 = logger.record(EventType.MESSAGE, "player").session(session1_id).save()
        event2 = logger.record(EventType.MESSAGE, "player").session(session1_id).save()

        # Add events to session 2
        event3 = logger.record(EventType.MESSAGE, "player").session(session2_id).save()
        event4 = logger.record(EventType.MESSAGE, "player").session(session2_id).save()

        # Each session should have its own sequence
        assert event1.sequence == 1
        assert event2.sequence == 2
        assert event3.sequence == 1  # New session, sequence starts at 1
        assert event4.sequence == 2
