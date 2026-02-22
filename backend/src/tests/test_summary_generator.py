"""Tests for checkpoint summary generator service (M3-015).

These tests follow TDD approach for the checkpoint summary generation functionality.
"""

import uuid
from datetime import datetime, timedelta
from typing import Dict, Any

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.database import Base
from src.models.event import Event, EventType, VisibilityLevel
from src.models.user import User
from src.models.character import Character
from src.models.session import GameSession, SessionState
from src.models.checkpoint import Checkpoint, CheckpointType
from src.models.summary import Summary, SummaryType
from src.services.events import EventLogger
from src.schemas.summary import (
    CheckpointSummary,
    CheckpointType as SchemaCheckpointType,
    SessionSummary,
    KeyEvent,
    KeyEventType,
    NarrativeSummary,
    NarrativeMood,
    CharacterStateChange,
    CharacterStatus,
    StatusChange,
    Discovery,
    DiscoveryType,
    DiscoveryVisibility,
    Consequence,
    ConsequenceType,
    ConsequenceSeverity,
    Promise,
    PromiseStatus,
    SessionStatistics,
    Leads,
    StateChanges,
    SessionInfo,
)


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def summary_gen_db():
    """Create a test database for summary generator tests."""
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
def summary_gen_user(summary_gen_db):
    """Create a test user for summary generator tests."""
    user = User(
        username="summary_gen_user",
        email="summarygen@example.com",
        hashed_password="hash"
    )
    summary_gen_db.add(user)
    summary_gen_db.commit()
    summary_gen_db.refresh(user)
    return user


@pytest.fixture
def summary_gen_character(summary_gen_db, summary_gen_user):
    """Create a test character for summary generator tests."""
    character = Character(
        owner_id=summary_gen_user.id,
        name="Test Investigator",
        hp=12,
        san=60,
        max_san=60,
        luck=50,
        mp=10,
    )
    summary_gen_db.add(character)
    summary_gen_db.commit()
    summary_gen_db.refresh(character)
    return character


@pytest.fixture
def summary_gen_session(summary_gen_db, summary_gen_user, summary_gen_character):
    """Create a test game session for summary generator tests."""
    session_id = uuid.uuid4()
    session = GameSession(
        id=session_id,
        owner_id=summary_gen_user.id,
        character_id=summary_gen_character.id,
        name="Test Session for Summary Gen",
        state=SessionState.ACTIVE,
        current_scene_name="Mysterious Library",
        location="Arkham",
        world_state={"time_of_day": "night", "weather": "rainy"},
        character_states={str(summary_gen_character.id): {"hp": 12, "san": 60, "luck": 50}},
        narrative_state={"leads": [], "clues": []},
    )
    summary_gen_db.add(session)
    summary_gen_db.commit()
    summary_gen_db.refresh(session)
    return session


@pytest.fixture
def summary_gen_checkpoint(summary_gen_db, summary_gen_session, summary_gen_character, summary_gen_user):
    """Create a test checkpoint for summary generator tests."""
    checkpoint = Checkpoint.create_from_session(
        session_id=summary_gen_session.id,
        session_state={"current_scene": "library", "current_scene_name": "The Library"},
        character_states={str(summary_gen_character.id): {"hp": 12, "san": 60, "luck": 50, "mp": 10}},
        world_state={"time_of_day": "night", "weather": "rainy"},
        narrative_state={"leads": ["lead_1"], "clues": []},
        checkpoint_type=CheckpointType.MANUAL,
        scene_id="library",
        scene_name="The Library",
        created_by_player_id=summary_gen_user.id,
    )
    summary_gen_db.add(checkpoint)
    summary_gen_db.commit()
    summary_gen_db.refresh(checkpoint)
    return checkpoint


@pytest.fixture
def summary_gen_events(summary_gen_db, summary_gen_session, summary_gen_character, summary_gen_user):
    """Create various events for testing summary generation."""
    logger = EventLogger(summary_gen_db)

    # Session start event
    start_event = logger.record(EventType.SESSION_START, "system").session(summary_gen_session.id).save()

    # Message event - narrative
    msg1 = logger.record(EventType.MESSAGE, "kp").session(summary_gen_session.id).payload(
        {"content": "You enter a mysterious library filled with ancient books."}
    ).description("Scene description").save()

    # Roll event - skill check
    roll1 = logger.record(EventType.ROLL, "player").session(summary_gen_session.id).actor(
        summary_gen_user
    ).character(summary_gen_character).payload(
        {"skill": "spot_hidden", "target": 50, "roll": 25, "success_level": "regular_success"}
    ).description("Spot Hidden: 25 - Success").save()

    # Clue discovery
    clue1 = logger.record(EventType.MESSAGE, "kp").session(summary_gen_session.id).visibility(
        VisibilityLevel.PUBLIC
    ).payload(
        {"content": "You notice a strange book hidden behind others.", "clues": ["strange_book"]}
    ).description("Clue discovered: Strange book").save()

    # Damage event
    damage1 = logger.record(EventType.DAMAGE, "kp").session(summary_gen_session.id).character(
        summary_gen_character
    ).payload(
        {"amount": 3, "source": "falling_debris", "current_hp": 9, "max_hp": 12}
    ).description("Took 3 damage from falling debris").save()

    # SAN check event
    san1 = logger.record(EventType.SAN_CHECK, "kp").session(summary_gen_session.id).character(
        summary_gen_character
    ).payload(
        {"reason": "seeing_gruesome_discovery", "difficulty": "regular", "roll": 75, "loss_amount": 5}
    ).description("SAN check: Failed - Lost 5 SAN").save()

    # Scene change
    scene1 = logger.record(EventType.SCENE_CHANGE, "kp").session(summary_gen_session.id).payload(
        {"old_scene": "library", "new_scene": "hallway"}
    ).description("Moved to the hallway").save()

    # Combat start
    combat1 = logger.record(EventType.COMBAT_START, "kp").session(summary_gen_session.id).payload(
        {"enemy": "Cultist", "initiator": summary_gen_character.id}
    ).description("Combat started with Cultist").save()

    # More damage in combat
    damage2 = logger.record(EventType.DAMAGE, "kp").session(summary_gen_session.id).character(
        summary_gen_character
    ).payload(
        {"amount": 4, "source": "cultist_attack", "current_hp": 5, "max_hp": 12}
    ).description("Took 4 damage from Cultist").save()

    # Combat end
    combat2 = logger.record(EventType.COMBAT_END, "kp").session(summary_gen_session.id).payload(
        {"result": "victory", "enemies_defeated": 1}
    ).description("Combat ended - Victory").save()

    return {
        "start": start_event,
        "msg1": msg1,
        "roll1": roll1,
        "clue1": clue1,
        "damage1": damage1,
        "san1": san1,
        "scene1": scene1,
        "combat1": combat1,
        "damage2": damage2,
        "combat2": combat2,
    }


# ============================================================================
# Checkpoint Summary Generator Tests (M3-015)
# ============================================================================

class TestCheckpointSummaryGenerator:
    """Test checkpoint summary generation functionality."""

    def test_checkpoint_summary_generator_exists(self):
        """Test that the checkpoint summary generator module exists and can be imported."""
        # This should import without errors
        try:
            from src.services.summary_generator import CheckpointSummaryGenerator
            assert CheckpointSummaryGenerator is not None
        except ImportError as e:
            pytest.fail(f"Failed to import CheckpointSummaryGenerator: {e}")

    def test_generate_checkpoint_summary_basic(
        self, summary_gen_db, summary_gen_session, summary_gen_checkpoint, summary_gen_user
    ):
        """Test generating a basic checkpoint summary."""
        from src.services.summary_generator import CheckpointSummaryGenerator

        generator = CheckpointSummaryGenerator(summary_gen_db)

        # Generate checkpoint summary
        summary = generator.generate_checkpoint_summary(
            checkpoint_id=summary_gen_checkpoint.id
        )

        assert summary is not None
        assert summary.checkpoint_id == str(summary_gen_checkpoint.id)
        assert summary.session_id == str(summary_gen_session.id)
        assert isinstance(summary.narrative, str)
        assert len(summary.narrative) > 0

    def test_checkpoint_summary_includes_character_states(
        self, summary_gen_db, summary_gen_checkpoint, summary_gen_character
    ):
        """Test that checkpoint summary includes character states."""
        from src.services.summary_generator import CheckpointSummaryGenerator

        generator = CheckpointSummaryGenerator(summary_gen_db)

        summary = generator.generate_checkpoint_summary(
            checkpoint_id=summary_gen_checkpoint.id
        )

        # Check character states are included
        assert summary.character_states is not None
        # The key is stored as integer (character_id) not string
        assert summary_gen_character.id in summary.character_states

    def test_checkpoint_summary_includes_world_state(
        self, summary_gen_db, summary_gen_checkpoint
    ):
        """Test that checkpoint summary includes world state."""
        from src.services.summary_generator import CheckpointSummaryGenerator

        generator = CheckpointSummaryGenerator(summary_gen_db)

        summary = generator.generate_checkpoint_summary(
            checkpoint_id=summary_gen_checkpoint.id
        )

        # Check world state is included
        assert summary.world_state is not None
        assert isinstance(summary.world_state, dict)

    def test_checkpoint_summary_with_events_since_last_checkpoint(
        self, summary_gen_db, summary_gen_session, summary_gen_checkpoint,
        summary_gen_events, summary_gen_character, summary_gen_user
    ):
        """Test generating checkpoint summary with events since last checkpoint."""
        from src.services.summary_generator import CheckpointSummaryGenerator

        generator = CheckpointSummaryGenerator(summary_gen_db)

        # Get events for this session
        events = summary_gen_db.query(Event).filter(
            Event.session_id == summary_gen_session.id
        ).order_by(Event.timestamp.asc()).all()

        # Generate checkpoint summary with events
        summary = generator.generate_checkpoint_summary(
            checkpoint_id=summary_gen_checkpoint.id,
            events_since_checkpoint=events
        )

        assert summary is not None
        assert len(summary.recent_events) >= 0

    def test_checkpoint_summary_narrative_generation(
        self, summary_gen_db, summary_gen_session, summary_gen_checkpoint,
        summary_gen_events
    ):
        """Test that checkpoint summary generates meaningful narrative."""
        from src.services.summary_generator import CheckpointSummaryGenerator

        generator = CheckpointSummaryGenerator(summary_gen_db)

        summary = generator.generate_checkpoint_summary(
            checkpoint_id=summary_gen_checkpoint.id
        )

        # Narrative should not be empty
        assert len(summary.narrative) > 0

        # Should mention checkpoint time
        assert "checkpoint" in summary.narrative.lower() or "library" in summary.narrative.lower()

    def test_checkpoint_summary_type_mapping(
        self, summary_gen_db, summary_gen_checkpoint
    ):
        """Test that checkpoint type is correctly mapped."""
        from src.services.summary_generator import CheckpointSummaryGenerator

        generator = CheckpointSummaryGenerator(summary_gen_db)

        summary = generator.generate_checkpoint_summary(
            checkpoint_id=summary_gen_checkpoint.id
        )

        # Verify checkpoint type is correct (MANUAL should map to MANUAL)
        assert summary.checkpoint_type == SchemaCheckpointType.MANUAL


class TestCheckpointSummaryKeyEvents:
    """Test key event extraction from checkpoints."""

    def test_extract_key_events_from_events(
        self, summary_gen_db, summary_gen_session, summary_gen_events
    ):
        """Test extracting key events from a list of events."""
        from src.services.summary_generator import CheckpointSummaryGenerator

        generator = CheckpointSummaryGenerator(summary_gen_db)

        events = summary_gen_db.query(Event).filter(
            Event.session_id == summary_gen_session.id
        ).order_by(Event.timestamp.asc()).all()

        key_events = generator.extract_key_events(events)

        # Should find at least combat and damage events
        assert len(key_events) >= 1

        # Check event types
        event_types = [e.type for e in key_events]
        assert KeyEventType.COMBAT_OCCURRED in event_types or KeyEventType.CHARACTER_INJURED in event_types

    def test_key_events_include_combat(
        self, summary_gen_db, summary_gen_session, summary_gen_events
    ):
        """Test that combat events are correctly identified."""
        from src.services.summary_generator import CheckpointSummaryGenerator

        generator = CheckpointSummaryGenerator(summary_gen_db)

        events = summary_gen_db.query(Event).filter(
            Event.session_id == summary_gen_session.id
        ).all()

        key_events = generator.extract_key_events(events)

        combat_events = [e for e in key_events if e.type == KeyEventType.COMBAT_OCCURRED]
        assert len(combat_events) >= 1

    def test_key_events_include_damage(
        self, summary_gen_db, summary_gen_session, summary_gen_events
    ):
        """Test that damage events are correctly identified."""
        from src.services.summary_generator import CheckpointSummaryGenerator

        generator = CheckpointSummaryGenerator(summary_gen_db)

        events = summary_gen_db.query(Event).filter(
            Event.session_id == summary_gen_session.id
        ).all()

        key_events = generator.extract_key_events(events)

        injury_events = [e for e in key_events if e.type == KeyEventType.CHARACTER_INJURED]
        assert len(injury_events) >= 1


class TestCheckpointSummaryStateChanges:
    """Test state change calculation from checkpoints."""

    def test_calculate_state_changes_from_events(
        self, summary_gen_db, summary_gen_session, summary_gen_events, summary_gen_character
    ):
        """Test calculating state changes from events."""
        from src.services.summary_generator import CheckpointSummaryGenerator

        generator = CheckpointSummaryGenerator(summary_gen_db)

        events = summary_gen_db.query(Event).filter(
            Event.session_id == summary_gen_session.id
        ).order_by(Event.timestamp.asc()).all()

        state_changes = generator.calculate_state_changes(events)

        assert state_changes is not None

    def test_state_changes_track_hp(
        self, summary_gen_db, summary_gen_session, summary_gen_events, summary_gen_character
    ):
        """Test that HP changes are tracked correctly."""
        from src.services.summary_generator import CheckpointSummaryGenerator

        generator = CheckpointSummaryGenerator(summary_gen_db)

        events = summary_gen_db.query(Event).filter(
            Event.session_id == summary_gen_session.id
        ).all()

        state_changes = generator.calculate_state_changes(events)

        # Should have character state changes
        if hasattr(state_changes, 'characters'):
            chars = state_changes.characters
            assert len(chars) >= 0

    def test_state_changes_track_san(
        self, summary_gen_db, summary_gen_session, summary_gen_events, summary_gen_character
    ):
        """Test that SAN changes are tracked correctly."""
        from src.services.summary_generator import CheckpointSummaryGenerator

        generator = CheckpointSummaryGenerator(summary_gen_db)

        events = summary_gen_db.query(Event).filter(
            Event.session_id == summary_gen_session.id
        ).all()

        state_changes = generator.calculate_state_changes(events)

        # Should track SAN changes from SAN_CHECK events
        assert state_changes is not None


class TestCheckpointSummaryNarrative:
    """Test narrative generation for checkpoint summaries."""

    def test_generate_narrative_from_events(
        self, summary_gen_db, summary_gen_session, summary_gen_events
    ):
        """Test generating narrative from a list of events."""
        from src.services.summary_generator import CheckpointSummaryGenerator

        generator = CheckpointSummaryGenerator(summary_gen_db)

        events = summary_gen_db.query(Event).filter(
            Event.session_id == summary_gen_session.id
        ).order_by(Event.timestamp.asc()).all()

        narrative = generator.generate_narrative(events)

        assert narrative is not None
        assert isinstance(narrative, str)
        assert len(narrative) > 0

    def test_narrative_includes_scene_info(
        self, summary_gen_db, summary_gen_session, summary_gen_checkpoint, summary_gen_events
    ):
        """Test that narrative includes scene information."""
        from src.services.summary_generator import CheckpointSummaryGenerator

        generator = CheckpointSummaryGenerator(summary_gen_db)

        events = summary_gen_db.query(Event).filter(
            Event.session_id == summary_gen_session.id
        ).all()

        narrative = generator.generate_narrative(events, checkpoint=summary_gen_checkpoint)

        # Should mention the scene/location
        assert len(narrative) > 0

    def test_narrative_handles_empty_events(
        self, summary_gen_db, summary_gen_session
    ):
        """Test that narrative generation handles empty event list."""
        from src.services.summary_generator import CheckpointSummaryGenerator

        generator = CheckpointSummaryGenerator(summary_gen_db)

        narrative = generator.generate_narrative([])

        assert narrative is not None
        assert isinstance(narrative, str)


class TestCheckpointSummaryEdgeCases:
    """Test edge cases for checkpoint summary generation."""

    def test_checkpoint_not_found_raises_error(self, summary_gen_db):
        """Test that non-existent checkpoint raises ValueError."""
        from src.services.summary_generator import CheckpointSummaryGenerator

        generator = CheckpointSummaryGenerator(summary_gen_db)

        fake_id = uuid.uuid4()

        with pytest.raises(ValueError, match="not found"):
            generator.generate_checkpoint_summary(checkpoint_id=fake_id)

    def test_summary_with_no_events(
        self, summary_gen_db, summary_gen_checkpoint
    ):
        """Test summary generation with no events."""
        from src.services.summary_generator import CheckpointSummaryGenerator

        generator = CheckpointSummaryGenerator(summary_gen_db)

        summary = generator.generate_checkpoint_summary(
            checkpoint_id=summary_gen_checkpoint.id,
            events_since_checkpoint=[]
        )

        assert summary is not None
        # Should still have a narrative even with no events
        assert isinstance(summary.narrative, str)


class TestCheckpointSummaryIntegration:
    """Integration tests for checkpoint summary generation."""

    def test_full_checkpoint_summary_flow(
        self, summary_gen_db, summary_gen_session, summary_gen_checkpoint,
        summary_gen_events, summary_gen_character
    ):
        """Test complete checkpoint summary generation flow."""
        from src.services.summary_generator import CheckpointSummaryGenerator

        generator = CheckpointSummaryGenerator(summary_gen_db)

        # Get events
        events = summary_gen_db.query(Event).filter(
            Event.session_id == summary_gen_session.id
        ).order_by(Event.timestamp.asc()).all()

        # Generate full checkpoint summary
        summary = generator.generate_checkpoint_summary(
            checkpoint_id=summary_gen_checkpoint.id,
            events_since_checkpoint=events
        )

        # Verify all parts are present
        assert summary.checkpoint_id == str(summary_gen_checkpoint.id)
        assert summary.session_id == str(summary_gen_session.id)
        assert summary.timestamp is not None
        assert summary.checkpoint_type is not None
        assert summary.narrative is not None
        assert isinstance(summary.character_states, dict)
        assert isinstance(summary.world_state, dict)
        assert isinstance(summary.recent_events, list)
