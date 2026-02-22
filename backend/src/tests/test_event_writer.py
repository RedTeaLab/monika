"""Tests for EventWriter service."""
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from src.models.event import Event, EventType, EventCategory, VisibilityLevel


class TestEventWriter:
    """Test cases for EventWriter service."""

    def test_write_single_event_basic(self, _db):
        """Test writing a basic single event."""
        from src.services.event_writer import EventWriter

        writer = EventWriter(_db)

        event = writer.write_event(
            session_id=uuid.uuid4(),
            event_type=EventType.MESSAGE,
            actor_role="system",
            payload={"text": "Hello, world!"},
        )

        assert event is not None
        assert event.id is not None
        assert event.event_type == EventType.MESSAGE
        assert event.actor_role == "system"
        assert event.payload == {"text": "Hello, world!"}
        assert event.visibility == VisibilityLevel.PUBLIC

    def test_write_event_with_all_fields(self, _db):
        """Test writing an event with all fields populated."""
        from src.services.event_writer import EventWriter

        writer = EventWriter(_db)
        session_id = uuid.uuid4()
        character_id = 1
        actor_player_id = 1

        event = writer.write_event(
            session_id=session_id,
            event_type=EventType.ROLL,
            actor_role="player",
            actor_player_id=actor_player_id,
            character_id=character_id,
            payload={"skill": "shoot", "value": 50, "success": "hard"},
            visibility=VisibilityLevel.KP_ONLY,
            input_raw="/roll shoot",
            narration="The player takes aim and fires!",
            source="web",
            tags=["combat", "ranged"],
            category=EventCategory.CHECK,
            description="Player rolled shoot with hard success",
        )

        assert event.session_id == session_id
        assert event.actor_player_id == actor_player_id
        assert event.character_id == character_id
        assert event.payload == {"skill": "shoot", "value": 50, "success": "hard"}
        assert event.visibility == VisibilityLevel.KP_ONLY
        assert event.input_raw == "/roll shoot"
        assert event.narration == "The player takes aim and fires!"
        assert event.source == "web"
        assert event.tags == ["combat", "ranged"]
        assert event.category == EventCategory.CHECK
        assert event.description == "Player rolled shoot with hard success"

    def test_write_event_generates_uuid(self, _db):
        """Test that events get generated UUIDs."""
        from src.services.event_writer import EventWriter

        writer = EventWriter(_db)

        event1 = writer.write_event(
            session_id=uuid.uuid4(),
            event_type=EventType.MESSAGE,
            actor_role="system",
        )

        event2 = writer.write_event(
            session_id=uuid.uuid4(),
            event_type=EventType.MESSAGE,
            actor_role="system",
        )

        assert event1.id != event2.id
        # Verify UUID format
        assert isinstance(event1.id, uuid.UUID)
        assert isinstance(event2.id, uuid.UUID)

    def test_write_event_has_timestamp(self, _db):
        """Test that events have timestamps set automatically."""
        from src.services.event_writer import EventWriter

        writer = EventWriter(_db)

        before = datetime.now(timezone.utc)
        event = writer.write_event(
            session_id=uuid.uuid4(),
            event_type=EventType.MESSAGE,
            actor_role="system",
        )
        after = datetime.now(timezone.utc)

        assert event.timestamp is not None
        # Convert to timezone-aware for comparison if needed
        if event.timestamp.tzinfo is None:
            event_timestamp = event.timestamp.replace(tzinfo=timezone.utc)
        else:
            event_timestamp = event.timestamp

        # Allow for small timing differences
        assert event_timestamp >= before.replace(microsecond=0)
        assert event_timestamp <= after.replace(microsecond=0) or event_timestamp <= after

    def test_write_event_with_client_timestamp(self, _db):
        """Test writing an event with client-provided timestamp."""
        from src.services.event_writer import EventWriter

        writer = EventWriter(_db)
        client_ts = datetime(2025, 1, 15, 10, 30, 0, tzinfo=timezone.utc)

        event = writer.write_event(
            session_id=uuid.uuid4(),
            event_type=EventType.MESSAGE,
            actor_role="system",
            client_timestamp=client_ts,
        )

        assert event.client_timestamp is not None
        # Compare as naive or aware consistently
        if event.client_timestamp.tzinfo is not None:
            assert event.client_timestamp == client_ts
        else:
            assert event.client_timestamp.replace(tzinfo=timezone.utc) == client_ts

    def test_write_event_with_parent_link(self, _db):
        """Test writing an event that links to a parent event."""
        from src.services.event_writer import EventWriter

        writer = EventWriter(_db)
        session_id = uuid.uuid4()

        # Write parent event
        parent_event = writer.write_event(
            session_id=session_id,
            event_type=EventType.ROLL,
            actor_role="player",
            payload={"skill": "jump", "value": 30},
        )

        # Write child event (e.g., push roll)
        child_event = writer.write_event(
            session_id=session_id,
            event_type=EventType.PUSH_ROLL,
            actor_role="player",
            payload={"original_event": str(parent_event.id)},
            parent_event_id=parent_event.id,
        )

        assert child_event.parent_event_id == parent_event.id
        assert child_event.id != parent_event.id

    def test_write_event_generates_sequence(self, _db):
        """Test that events get sequence numbers within a session."""
        from src.services.event_writer import EventWriter

        writer = EventWriter(_db)
        session_id = uuid.uuid4()

        event1 = writer.write_event(
            session_id=session_id,
            event_type=EventType.MESSAGE,
            actor_role="system",
        )

        event2 = writer.write_event(
            session_id=session_id,
            event_type=EventType.MESSAGE,
            actor_role="system",
        )

        event3 = writer.write_event(
            session_id=session_id,
            event_type=EventType.MESSAGE,
            actor_role="system",
        )

        # All events in same session should have sequential numbers
        assert event1.sequence is not None
        assert event2.sequence is not None
        assert event3.sequence is not None
        assert event1.sequence < event2.sequence < event3.sequence

    def test_batch_write_events(self, _db):
        """Test batch writing multiple events."""
        from src.services.event_writer import EventWriter

        writer = EventWriter(_db)
        session_id = uuid.uuid4()

        events_data = [
            {
                "event_type": EventType.MESSAGE,
                "actor_role": "system",
                "payload": {"text": "Event 1"},
            },
            {
                "event_type": EventType.MESSAGE,
                "actor_role": "system",
                "payload": {"text": "Event 2"},
            },
            {
                "event_type": EventType.MESSAGE,
                "actor_role": "system",
                "payload": {"text": "Event 3"},
            },
        ]

        events = writer.batch_write_events(session_id, events_data)

        assert len(events) == 3
        assert all(e.session_id == session_id for e in events)
        assert all(e.id is not None for e in events)

        # Verify sequence numbers are assigned
        sequences = [e.sequence for e in events]
        assert sequences == [1, 2, 3]

    def test_batch_write_with_parent_chain(self, _db):
        """Test batch writing events with parent chain linking."""
        from src.services.event_writer import EventWriter

        writer = EventWriter(_db)
        session_id = uuid.uuid4()

        # Create a chain of events
        events_data = [
            {
                "event_type": EventType.ROLL,
                "actor_role": "player",
                "payload": {"skill": "search", "value": 45},
                "description": "Initial search roll",
            },
            {
                "event_type": EventType.PUSH_ROLL,
                "actor_role": "player",
                "payload": {"reason": "didn't find anything"},
                "description": "Push the roll",
                "parent_chain": True,  # Link to previous event
            },
            {
                "event_type": EventType.LUCK_SPEND,
                "actor_role": "player",
                "payload": {"amount": 1},
                "description": "Spend luck",
                "parent_chain": True,  # Link to previous event
            },
        ]

        events = writer.batch_write_events(session_id, events_data)

        assert len(events) == 3
        # First event should have no parent
        assert events[0].parent_event_id is None
        # Second event should link to first
        assert events[1].parent_event_id == events[0].id
        # Third event should link to second
        assert events[2].parent_event_id == events[1].id

    def test_batch_write_different_sessions(self, _db):
        """Test batch writing events across different sessions."""
        from src.services.event_writer import EventWriter

        writer = EventWriter(_db)
        session_id_1 = uuid.uuid4()
        session_id_2 = uuid.uuid4()

        events_data = [
            {
                "session_id": session_id_1,
                "event_type": EventType.MESSAGE,
                "actor_role": "system",
                "payload": {"text": "Session 1 event"},
            },
            {
                "session_id": session_id_2,
                "event_type": EventType.MESSAGE,
                "actor_role": "system",
                "payload": {"text": "Session 2 event"},
            },
        ]

        events = writer.batch_write_events(None, events_data)

        assert len(events) == 2
        assert events[0].session_id == session_id_1
        assert events[1].session_id == session_id_2
        # Different sessions should have independent sequences
        assert events[0].sequence == 1
        assert events[1].sequence == 1

    def test_timestamp_synchronization(self, _db):
        """Test timestamp synchronization between server and client."""
        from src.services.event_writer import EventWriter

        writer = EventWriter(_db)

        # Client timestamp from a different timezone
        client_ts = datetime(2025, 6, 15, 12, 0, 0, tzinfo=timezone.utc)

        # Server timestamp should be captured
        server_before = datetime.now(timezone.utc)

        event = writer.write_event(
            session_id=uuid.uuid4(),
            event_type=EventType.MESSAGE,
            actor_role="system",
            client_timestamp=client_ts,
        )

        server_after = datetime.now(timezone.utc)

        # Both timestamps should be set
        assert event.timestamp is not None
        # Compare timestamps - handle timezone awareness consistently
        if event.client_timestamp is not None and event.client_timestamp.tzinfo is not None:
            assert event.client_timestamp == client_ts
        else:
            # If stored as naive, compare date/time parts
            assert event.client_timestamp.year == client_ts.year
            assert event.client_timestamp.month == client_ts.month
            assert event.client_timestamp.day == client_ts.day
            assert event.client_timestamp.hour == client_ts.hour
            assert event.client_timestamp.minute == client_ts.minute

    def test_write_event_without_session(self, _db):
        """Test writing an event without a session (system-wide)."""
        from src.services.event_writer import EventWriter

        writer = EventWriter(_db)

        event = writer.write_event(
            session_id=None,
            event_type=EventType.SESSION_START,
            actor_role="system",
            payload={"version": "1.0"},
        )

        assert event.session_id is None
        assert event.sequence is None  # No sequence without session
        assert event.event_type == EventType.SESSION_START

    def test_write_combat_event_chain(self, _db):
        """Test writing a combat event chain."""
        from src.services.event_writer import EventWriter

        writer = EventWriter(_db)
        session_id = uuid.uuid4()

        # Combat start
        combat_start = writer.write_event(
            session_id=session_id,
            event_type=EventType.COMBAT_START,
            actor_role="kp",
            payload={"enemy": "Deep Ones", "count": 3},
            narration="Three Deep Ones emerge from the water!",
            category=EventCategory.COMBAT,
        )

        # Combat round events
        round1 = writer.write_event(
            session_id=session_id,
            event_type=EventType.COMBAT_ROUND,
            actor_role="system",
            payload={"round": 1},
            parent_event_id=combat_start.id,
            category=EventCategory.COMBAT,
        )

        # Damage event
        damage = writer.write_event(
            session_id=session_id,
            event_type=EventType.DAMAGE,
            actor_role="system",
            payload={"target": "player", "amount": 2, "weapon": "claw"},
            parent_event_id=round1.id,
            category=EventCategory.COMBAT,
        )

        # Verify chain
        assert combat_start.parent_event_id is None
        assert round1.parent_event_id == combat_start.id
        assert damage.parent_event_id == round1.id

        # All should be in same sequence
        assert combat_start.sequence is not None
        assert round1.sequence == combat_start.sequence + 1
        assert damage.sequence == round1.sequence + 1

    def test_event_id_can_be_custom(self, _db):
        """Test that custom event IDs can be provided."""
        from src.services.event_writer import EventWriter

        writer = EventWriter(_db)
        custom_id = uuid.uuid4()

        event = writer.write_event(
            session_id=uuid.uuid4(),
            event_type=EventType.MESSAGE,
            actor_role="system",
            event_id=custom_id,
        )

        assert event.id == custom_id

    def test_state_changes_tracking(self, _db):
        """Test writing events with state changes tracking."""
        from src.services.event_writer import EventWriter

        writer = EventWriter(_db)

        state_changes = [
            {
                "path": "hp",
                "type": "decrease",
                "old_value": 10,
                "new_value": 8,
                "delta": -2,
            },
            {
                "path": "san",
                "type": "decrease",
                "old_value": 50,
                "new_value": 45,
                "delta": -5,
            },
        ]

        event = writer.write_event(
            session_id=uuid.uuid4(),
            event_type=EventType.DAMAGE,
            actor_role="system",
            payload={"target": "player", "amount": 2},
            state_changes_json=state_changes,
        )

        assert event.state_changes_json == state_changes

    def test_visibility_levels(self, _db):
        """Test all visibility levels."""
        from src.services.event_writer import EventWriter

        writer = EventWriter(_db)

        # Test PUBLIC
        public_event = writer.write_event(
            session_id=uuid.uuid4(),
            event_type=EventType.MESSAGE,
            actor_role="system",
            payload={},
            visibility=VisibilityLevel.PUBLIC,
        )
        assert public_event.visibility == VisibilityLevel.PUBLIC

        # Test KP_ONLY
        kp_event = writer.write_event(
            session_id=uuid.uuid4(),
            event_type=EventType.MESSAGE,
            actor_role="kp",
            payload={},
            visibility=VisibilityLevel.KP_ONLY,
        )
        assert kp_event.visibility == VisibilityLevel.KP_ONLY

    def test_event_categories(self, _db):
        """Test event categories."""
        from src.services.event_writer import EventWriter

        writer = EventWriter(_db)

        categories = [
            EventCategory.INTERACTION,
            EventCategory.CHECK,
            EventCategory.COMBAT,
            EventCategory.CHASE,
            EventCategory.SANITY,
            EventCategory.STATE,
            EventCategory.SYSTEM,
        ]

        for category in categories:
            event = writer.write_event(
                session_id=uuid.uuid4(),
                event_type=EventType.MESSAGE,
                actor_role="system",
                payload={},
                category=category,
            )
            assert event.category == category

    def test_batch_write_maintains_order(self, _db):
        """Test that batch writes maintain insertion order."""
        from src.services.event_writer import EventWriter

        writer = EventWriter(_db)
        session_id = uuid.uuid4()

        # Create 10 events
        events_data = [
            {
                "event_type": EventType.MESSAGE,
                "actor_role": "system",
                "payload": {"index": i},
                "description": f"Event {i}",
            }
            for i in range(10)
        ]

        events = writer.batch_write_events(session_id, events_data)

        # Verify order
        for i, event in enumerate(events):
            assert event.payload["index"] == i
            assert event.sequence == i + 1

    def test_write_event_with_checkpoint(self, _db):
        """Test writing an event associated with a checkpoint."""
        from src.services.event_writer import EventWriter

        writer = EventWriter(_db)
        checkpoint_id = uuid.uuid4()

        event = writer.write_event(
            session_id=uuid.uuid4(),
            event_type=EventType.CHECKPOINT,
            actor_role="system",
            payload={"checkpoint_number": 1},
            checkpoint_id=checkpoint_id,
        )

        assert event.checkpoint_id == checkpoint_id
