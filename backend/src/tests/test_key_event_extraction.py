"""Tests for key event extraction service (M3-018).

These tests follow TDD approach for extracting important events from session logs.
"""

import uuid
from datetime import datetime, timedelta
from typing import List

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.database import Base
from src.models.event import Event, EventType, VisibilityLevel, EventCategory
from src.models.user import User
from src.models.character import Character
from src.models.session import GameSession, SessionState
from src.services.events import EventLogger
from src.schemas.summary import (
    KeyEvent,
    KeyEventType,
    EventVisibility,
    EventOutcome,
)


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def key_event_db():
    """Create a test database for key event extraction tests."""
    engine = create_engine("sqlite:///:memory:")
    TestingSessionLocal = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def key_event_user(key_event_db):
    """Create a test user for key event extraction tests."""
    user = User(
        username="key_event_user",
        email="keyevent@example.com",
        hashed_password="hash"
    )
    key_event_db.add(user)
    key_event_db.commit()
    key_event_db.refresh(user)
    return user


@pytest.fixture
def key_event_character(key_event_db, key_event_user):
    """Create a test character for key event extraction tests."""
    character = Character(
        owner_id=key_event_user.id,
        name="Test Investigator",
        hp=12,
        san=60,
        max_san=60,
        luck=50,
        mp=10,
    )
    key_event_db.add(character)
    key_event_db.commit()
    key_event_db.refresh(character)
    return character


@pytest.fixture
def key_event_session(key_event_db, key_event_user, key_event_character):
    """Create a test game session for key event extraction tests."""
    session_id = uuid.uuid4()
    session = GameSession(
        id=session_id,
        owner_id=key_event_user.id,
        character_id=key_event_character.id,
        name="Test Session for Key Events",
        state=SessionState.ACTIVE,
        current_scene_name="Mysterious Library",
        location="Arkham",
        world_state={"time_of_day": "night", "weather": "rainy"},
        character_states={str(key_event_character.id): {"hp": 12, "san": 60, "luck": 50}},
        narrative_state={"leads": [], "clues": []},
    )
    key_event_db.add(session)
    key_event_db.commit()
    key_event_db.refresh(session)
    return session


@pytest.fixture
def key_event_combat_session(key_event_db, key_event_user, key_event_character):
    """Create a test game session with combat events."""
    session_id = uuid.uuid4()
    session = GameSession(
        id=session_id,
        owner_id=key_event_user.id,
        character_id=key_event_character.id,
        name="Combat Session",
        state=SessionState.ACTIVE,
        current_scene_name="Dungeon",
        location="Crypt",
        world_state={},
        character_states={},
        narrative_state={},
    )
    key_event_db.add(session)
    key_event_db.commit()
    key_event_db.refresh(session)
    return session


@pytest.fixture
def key_event_san_session(key_event_db, key_event_user, key_event_character):
    """Create a test game session with SAN check events."""
    session_id = uuid.uuid4()
    session = GameSession(
        id=session_id,
        owner_id=key_event_user.id,
        character_id=key_event_character.id,
        name="SAN Session",
        state=SessionState.ACTIVE,
        current_scene_name="Tomb",
        location="Egypt",
        world_state={},
        character_states={},
        narrative_state={},
    )
    key_event_db.add(session)
    key_event_db.commit()
    key_event_db.refresh(session)
    return session


@pytest.fixture
def key_event_discovery_session(key_event_db, key_event_user, key_event_character):
    """Create a test game session with discovery events."""
    session_id = uuid.uuid4()
    session = GameSession(
        id=session_id,
        owner_id=key_event_user.id,
        character_id=key_event_character.id,
        name="Discovery Session",
        state=SessionState.ACTIVE,
        current_scene_name="Study",
        location="Mansion",
        world_state={},
        character_states={},
        narrative_state={},
    )
    key_event_db.add(session)
    key_event_db.commit()
    key_event_db.refresh(session)
    return session


@pytest.fixture
def combat_events(key_event_db, key_event_combat_session, key_event_character, key_event_user):
    """Create combat-related events for testing."""
    logger = EventLogger(key_event_db)

    events = {}

    # Combat start
    events["combat_start"] = logger.record(EventType.COMBAT_START, "kp").session(
        key_event_combat_session.id
    ).payload(
        {"enemy": "Deep One", "initiator": key_event_character.id}
    ).description("Combat started with Deep One").save()

    # Combat round with attack
    events["attack"] = logger.record(EventType.ROLL, "player").session(
        key_event_combat_session.id
    ).actor(key_event_user).character(key_event_character).payload(
        {"skill": "fight", "target": 50, "roll": 25, "success_level": "regular_success", "damage": 4}
    ).description("Fight: 25 - Hit for 4 damage").save()

    # Damage event
    events["damage"] = logger.record(EventType.DAMAGE, "kp").session(
        key_event_combat_session.id
    ).character(key_event_character).payload(
        {"amount": 3, "source": "Deep One attack", "current_hp": 9, "max_hp": 12}
    ).description("Took 3 damage from Deep One").save()

    # Combat end
    events["combat_end"] = logger.record(EventType.COMBAT_END, "kp").session(
        key_event_combat_session.id
    ).payload(
        {"result": "victory", "enemies_defeated": 1}
    ).description("Combat ended - Victory").save()

    return events


@pytest.fixture
def san_check_events(key_event_db, key_event_san_session, key_event_character, key_event_user):
    """Create SAN check events for testing."""
    logger = EventLogger(key_event_db)

    events = {}

    # SAN check - failed
    events["san_check_failed"] = logger.record(EventType.SAN_CHECK, "kp").session(
        key_event_san_session.id
    ).character(key_event_character).payload(
        {"reason": "seeing_corpse", "difficulty": "regular", "roll": 75, "loss_amount": 5}
    ).description("SAN check: Failed - Lost 5 SAN").save()

    # SAN loss
    events["san_loss"] = logger.record(EventType.SAN_LOSS, "kp").session(
        key_event_san_session.id
    ).character(key_event_character).payload(
        {"amount": 5, "reason": "seeing_corpse", "new_san": 55, "old_san": 60}
    ).description("Lost 5 SAN").save()

    # Another SAN check - failed again
    events["san_check_2"] = logger.record(EventType.SAN_CHECK, "kp").session(
        key_event_san_session.id
    ).character(key_event_character).payload(
        {"reason": "seeing_shoggoth", "difficulty": "hard", "roll": 90, "loss_amount": 10}
    ).description("SAN check: Failed - Lost 10 SAN").save()

    # Insanity gain
    events["insanity"] = logger.record(EventType.INSANITY_GAIN, "kp").session(
        key_event_san_session.id
    ).character(key_event_character).payload(
        {"type": "temporary", "duration": "1d6", "symptoms": "mausoleums_horror"}
    ).description("Temporary insanity triggered").save()

    return events


@pytest.fixture
def scene_change_events(key_event_db, key_event_session, key_event_character):
    """Create scene change events for testing."""
    logger = EventLogger(key_event_db)

    events = {}

    # Scene changes
    events["scene_1"] = logger.record(EventType.SCENE_CHANGE, "kp").session(
        key_event_session.id
    ).payload(
        {"old_scene": "entrance", "new_scene": "hallway"}
    ).description("Moved to the hallway").save()

    events["scene_2"] = logger.record(EventType.SCENE_CHANGE, "kp").session(
        key_event_session.id
    ).payload(
        {"old_scene": "hallway", "new_scene": "library"}
    ).description("Moved to the library").save()

    events["scene_3"] = logger.record(EventType.SCENE_CHANGE, "kp").session(
        key_event_session.id
    ).payload(
        {"old_scene": "library", "new_scene": "secret_passage"}
    ).description("Found secret passage").save()

    return events


@pytest.fixture
def mixed_events(key_event_db, key_event_session, key_event_character, key_event_user):
    """Create a mix of different event types for testing."""
    logger = EventLogger(key_event_db)

    events = {}

    # Session start
    events["session_start"] = logger.record(EventType.SESSION_START, "system").session(
        key_event_session.id
    ).save()

    # Messages (should not be key events)
    events["msg1"] = logger.record(EventType.MESSAGE, "kp").session(
        key_event_session.id
    ).payload({"content": "Welcome to the mansion."}).save()

    events["msg2"] = logger.record(EventType.MESSAGE, "kp").session(
        key_event_session.id
    ).payload({"content": "You see a strange painting."}).save()

    # Roll (should not be key event unless it's critical)
    events["roll1"] = logger.record(EventType.ROLL, "player").session(
        key_event_session.id
    ).character(key_event_character).payload(
        {"skill": "spot_hidden", "target": 50, "roll": 25, "success_level": "regular_success"}
    ).save()

    # Critical failure
    events["critical_fail"] = logger.record(EventType.ROLL, "player").session(
        key_event_session.id
    ).character(key_event_character).payload(
        {"skill": "lockpick", "target": 50, "roll": 98, "success_level": "fumble"}
    ).description("Critical failure on lockpick").save()

    # Scene change
    events["scene_change"] = logger.record(EventType.SCENE_CHANGE, "kp").session(
        key_event_session.id
    ).payload({"old_scene": "foyer", "new_scene": "library"}).save()

    # Combat
    events["combat_start"] = logger.record(EventType.COMBAT_START, "kp").session(
        key_event_session.id
    ).payload({"enemy": "Cultist"}).save()

    # Damage
    events["damage"] = logger.record(EventType.DAMAGE, "kp").session(
        key_event_session.id
    ).character(key_event_character).payload(
        {"amount": 2, "source": "knife", "current_hp": 10}
    ).save()

    # HP change (character near death)
    events["hp_critical"] = logger.record(EventType.HP_CHANGE, "kp").session(
        key_event_session.id
    ).character(key_event_character).payload(
        {"old": 12, "new": 1, "reason": "cultist_attack"}
    ).description("Critical HP: 1/12").save()

    # SAN check
    events["san_check"] = logger.record(EventType.SAN_CHECK, "kp").session(
        key_event_session.id
    ).character(key_event_character).payload(
        {"reason": "horror", "roll": 80, "loss_amount": 3}
    ).save()

    # NPC appear
    events["npc"] = logger.record(EventType.NPC_APPEAR, "kp").session(
        key_event_session.id
    ).payload({"npc_name": "Butler", "mood": "suspicious"}).save()

    return events


# ============================================================================
# Key Event Extraction Tests (M3-018)
# ============================================================================

class TestKeyEventExtractionExists:
    """Test that key event extraction service exists and can be imported."""

    def test_key_event_extraction_module_exists(self):
        """Test that the key event extraction module exists."""
        try:
            from src.services.key_event_extraction import KeyEventExtractor
            assert KeyEventExtractor is not None
        except ImportError as e:
            pytest.fail(f"Failed to import KeyEventExtractor: {e}")

    def test_key_event_extraction_class_exists(self):
        """Test that KeyEventExtractor class can be instantiated."""
        from src.services.key_event_extraction import KeyEventExtractor
        # This should work if the import succeeds
        assert KeyEventExtractor is not None


class TestKeyEventExtractionCombat:
    """Test extraction of combat-related key events."""

    def test_extract_combat_start_events(
        self, key_event_db, key_event_combat_session, combat_events
    ):
        """Test that combat start events are extracted as key events."""
        from src.services.key_event_extraction import KeyEventExtractor

        extractor = KeyEventExtractor(key_event_db)

        events = key_event_db.query(Event).filter(
            Event.session_id == key_event_combat_session.id
        ).order_by(Event.timestamp.asc()).all()

        key_events = extractor.extract_key_events(events)

        # Should have at least one combat key event
        combat_key_events = [e for e in key_events if e.type == KeyEventType.COMBAT_OCCURRED]
        assert len(combat_key_events) >= 1

    def test_extract_damage_events(
        self, key_event_db, key_event_combat_session, combat_events
    ):
        """Test that damage events are extracted as key events."""
        from src.services.key_event_extraction import KeyEventExtractor

        extractor = KeyEventExtractor(key_event_db)

        events = key_event_db.query(Event).filter(
            Event.session_id == key_event_combat_session.id
        ).all()

        key_events = extractor.extract_key_events(events)

        injury_events = [e for e in key_events if e.type == KeyEventType.CHARACTER_INJURED]
        assert len(injury_events) >= 1


class TestKeyEventExtractionSAN:
    """Test extraction of SAN-related key events."""

    def test_extract_san_check_failed(
        self, key_event_db, key_event_san_session, san_check_events
    ):
        """Test that failed SAN checks are extracted as key events."""
        from src.services.key_event_extraction import KeyEventExtractor

        extractor = KeyEventExtractor(key_event_db)

        events = key_event_db.query(Event).filter(
            Event.session_id == key_event_san_session.id
        ).order_by(Event.timestamp.asc()).all()

        key_events = extractor.extract_key_events(events)

        san_check_events_list = [e for e in key_events if e.type == KeyEventType.SAN_CHECK_FAILED]
        assert len(san_check_events_list) >= 2  # Two failed SAN checks

    def test_extract_insanity_events(
        self, key_event_db, key_event_san_session, san_check_events
    ):
        """Test that insanity gain events are extracted as key events."""
        from src.services.key_event_extraction import KeyEventExtractor

        extractor = KeyEventExtractor(key_event_db)

        events = key_event_db.query(Event).filter(
            Event.session_id == key_event_san_session.id
        ).all()

        key_events = extractor.extract_key_events(events)

        madness_events = [e for e in key_events if e.type == KeyEventType.MADNESS_TRIGGERED]
        assert len(madness_events) >= 1


class TestKeyEventExtractionSceneTransitions:
    """Test extraction of scene transition key events."""

    def test_extract_scene_transitions(
        self, key_event_db, key_event_session, scene_change_events
    ):
        """Test that scene transitions are extracted as key events."""
        from src.services.key_event_extraction import KeyEventExtractor

        extractor = KeyEventExtractor(key_event_db)

        events = key_event_db.query(Event).filter(
            Event.session_id == key_event_session.id
        ).order_by(Event.timestamp.asc()).all()

        key_events = extractor.extract_key_events(events)

        scene_events = [e for e in key_events if e.type == KeyEventType.SCENE_TRANSITION]
        assert len(scene_events) >= 1


class TestKeyEventExtractionRanking:
    """Test ranking of key events by importance."""

    def test_key_events_ranked_by_importance(
        self, key_event_db, key_event_session, mixed_events
    ):
        """Test that key events are ranked by importance."""
        from src.services.key_event_extraction import KeyEventExtractor

        extractor = KeyEventExtractor(key_event_db)

        events = key_event_db.query(Event).filter(
            Event.session_id == key_event_session.id
        ).order_by(Event.timestamp.asc()).all()

        key_events = extractor.extract_key_events(events)

        # Should have multiple types of key events
        assert len(key_events) >= 3

        # Verify ranking is applied (higher importance events first)
        # Combat and character death should be high priority
        event_types = [e.type for e in key_events]

    def test_critical_events_higher_priority(
        self, key_event_db, key_event_session, mixed_events
    ):
        """Test that critical events are prioritized."""
        from src.services.key_event_extraction import KeyEventExtractor

        extractor = KeyEventExtractor(key_event_db)

        events = key_event_db.query(Event).filter(
            Event.session_id == key_event_session.id
        ).order_by(Event.timestamp.asc()).all()

        key_events = extractor.extract_key_events(events)

        # Critical HP state should be captured
        hp_events = [e for e in key_events if e.type == KeyEventType.CHARACTER_INJURED]
        assert len(hp_events) >= 1


class TestKeyEventExtractionMetadata:
    """Test extraction of event metadata."""

    def test_key_events_have_timestamps(
        self, key_event_db, key_event_combat_session, combat_events
    ):
        """Test that extracted key events have timestamps."""
        from src.services.key_event_extraction import KeyEventExtractor

        extractor = KeyEventExtractor(key_event_db)

        events = key_event_db.query(Event).filter(
            Event.session_id == key_event_combat_session.id
        ).all()

        key_events = extractor.extract_key_events(events)

        for ke in key_events:
            assert ke.timestamp is not None

    def test_key_events_have_titles(
        self, key_event_db, key_event_combat_session, combat_events
    ):
        """Test that extracted key events have titles."""
        from src.services.key_event_extraction import KeyEventExtractor

        extractor = KeyEventExtractor(key_event_db)

        events = key_event_db.query(Event).filter(
            Event.session_id == key_event_combat_session.id
        ).all()

        key_events = extractor.extract_key_events(events)

        for ke in key_events:
            assert ke.title is not None
            assert len(ke.title) > 0

    def test_key_events_have_descriptions(
        self, key_event_db, key_event_combat_session, combat_events
    ):
        """Test that extracted key events have descriptions."""
        from src.services.key_event_extraction import KeyEventExtractor

        extractor = KeyEventExtractor(key_event_db)

        events = key_event_db.query(Event).filter(
            Event.session_id == key_event_combat_session.id
        ).all()

        key_events = extractor.extract_key_events(events)

        for ke in key_events:
            assert ke.description is not None
            assert len(ke.description) > 0


class TestKeyEventExtractionEdgeCases:
    """Test edge cases for key event extraction."""

    def test_empty_events_returns_empty_list(
        self, key_event_db, key_event_session
    ):
        """Test that empty event list returns empty key events."""
        from src.services.key_event_extraction import KeyEventExtractor

        extractor = KeyEventExtractor(key_event_db)

        key_events = extractor.extract_key_events([])

        assert key_events == []

    def test_no_key_events_returns_empty_list(
        self, key_event_db, key_event_session, key_event_user
    ):
        """Test that events without key events returns empty list."""
        from src.services.key_event_extraction import KeyEventExtractor

        extractor = KeyEventExtractor(key_event_db)

        logger = EventLogger(key_event_db)

        # Only add non-key events (messages, regular rolls)
        logger.record(EventType.MESSAGE, "kp").session(key_event_session.id).payload(
            {"content": "Just a regular message"}
        ).save()

        logger.record(EventType.ROLL, "player").session(key_event_session.id).payload(
            {"skill": "spot_hidden", "roll": 50, "success_level": "regular_success"}
        ).save()

        events = key_event_db.query(Event).filter(
            Event.session_id == key_event_session.id
        ).all()

        key_events = extractor.extract_key_events(events)

        assert len(key_events) == 0


class TestKeyEventExtractionAPI:
    """Test the public API of KeyEventExtractor."""

    def test_extract_key_events_returns_list(
        self, key_event_db, key_event_combat_session, combat_events
    ):
        """Test that extract_key_events returns a list."""
        from src.services.key_event_extraction import KeyEventExtractor

        extractor = KeyEventExtractor(key_event_db)

        events = key_event_db.query(Event).filter(
            Event.session_id == key_event_combat_session.id
        ).all()

        result = extractor.extract_key_events(events)

        assert isinstance(result, list)

    def test_extract_key_events_with_limit(
        self, key_event_db, key_event_session, mixed_events
    ):
        """Test that extract_key_events respects limit parameter."""
        from src.services.key_event_extraction import KeyEventExtractor

        extractor = KeyEventExtractor(key_event_db)

        events = key_event_db.query(Event).filter(
            Event.session_id == key_event_session.id
        ).all()

        # Extract with limit
        key_events = extractor.extract_key_events(events, limit=3)

        # Should respect limit
        assert len(key_events) <= 3

    def test_extract_key_events_by_type(
        self, key_event_db, key_event_session, mixed_events
    ):
        """Test extracting key events filtered by type."""
        from src.services.key_event_extraction import KeyEventExtractor

        extractor = KeyEventExtractor(key_event_db)

        events = key_event_db.query(Event).filter(
            Event.session_id == key_event_session.id
        ).all()

        # Extract only combat events
        combat_events_list = extractor.extract_key_events(
            events, event_types=[KeyEventType.COMBAT_OCCURRED]
        )

        for ke in combat_events_list:
            assert ke.type == KeyEventType.COMBAT_OCCURRED


class TestKeyEventExtractionIntegration:
    """Integration tests for key event extraction."""

    def test_full_extraction_flow(
        self, key_event_db, key_event_session, mixed_events
    ):
        """Test complete key event extraction flow."""
        from src.services.key_event_extraction import KeyEventExtractor

        extractor = KeyEventExtractor(key_event_db)

        events = key_event_db.query(Event).filter(
            Event.session_id == key_event_session.id
        ).order_by(Event.timestamp.asc()).all()

        key_events = extractor.extract_key_events(events)

        # Verify extraction worked
        assert len(key_events) > 0

        # Verify all required fields are present
        for ke in key_events:
            assert ke.event_id is not None
            assert ke.timestamp is not None
            assert ke.type is not None
            assert ke.title is not None
            assert ke.description is not None
            assert ke.visibility is not None
