"""Tests for summary system (M3-014 to M3-021).

Tests follow TDD approach with fixtures and comprehensive coverage.
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
from src.services.events import EventLogger
from src.schemas.summary import (
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
    CheckpointSummary,
    CheckpointType,
    SceneSummary,
    EventVisibility,
    SANStateChange,
)


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def summary_db():
    """Create a test database for summary tests."""
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
def summary_user(summary_db):
    """Create a test user for summary tests."""
    user = User(
        username="summary_test_user",
        email="summary@example.com",
        hashed_password="hash"
    )
    summary_db.add(user)
    summary_db.commit()
    summary_db.refresh(user)
    return user


@pytest.fixture
def summary_character(summary_db, summary_user):
    """Create a test character for summary tests."""
    character = Character(
        owner_id=summary_user.id,
        name="Test Investigator",
        hp=12,
        san=60,
        max_san=60,
        luck=50,
        mp=10,
    )
    summary_db.add(character)
    summary_db.commit()
    summary_db.refresh(character)
    return character


@pytest.fixture
def summary_session(summary_db, summary_user, summary_character):
    """Create a test game session for summary tests."""
    session_id = uuid.uuid4()
    session = GameSession(
        id=session_id,
        owner_id=summary_user.id,
        character_id=summary_character.id,
        name="Test Session for Summary",
        state=SessionState.ACTIVE,
        current_scene_name="Mysterious Library",
        location="Arkham",
        world_state={"time_of_day": "night", "weather": "rainy"},
        character_states={str(summary_character.id): {"hp": 12, "san": 60, "luck": 50}},
        narrative_state={"leads": [], "clues": []},
    )
    summary_db.add(session)
    summary_db.commit()
    summary_db.refresh(session)
    return session


@pytest.fixture
def summary_session_with_events(summary_db, summary_session, summary_character, summary_user):
    """Create a session with various events for testing summary generation."""
    logger = EventLogger(summary_db)

    # Session start
    logger.record(EventType.SESSION_START, "system").session(summary_session.id).save()

    # Roll event
    logger.record(EventType.ROLL, "player").session(summary_session.id).actor(summary_user).character(
        summary_character
    ).payload(
        {"skill": "spot_hidden", "target": 50, "roll": 25, "success_level": "regular_success"}
    ).description("Spot Hidden: 25 - Success").save()

    # Message event
    logger.record(EventType.MESSAGE, "kp").session(summary_session.id).payload(
        {"content": "You find an old book covered in strange symbols."}
    ).description("KP: Discovery of mysterious book").save()

    # Damage event
    logger.record(EventType.DAMAGE, "kp").session(summary_session.id).character(
        summary_character
    ).payload(
        {"amount": 3, "source": "falling_debris", "current_hp": 9, "max_hp": 12}
    ).description("Took 3 damage from falling debris").save()

    # SAN check event
    logger.record(EventType.SAN_CHECK, "kp").session(summary_session.id).character(
        summary_character
    ).payload(
        {"reason": "seeing_gruesome_discovery", "difficulty": "regular", "roll": 75, "loss_amount": 5}
    ).description("SAN check: Failed - Lost 5 SAN").save()

    # Clue discovery
    logger.record(EventType.MESSAGE, "kp").session(summary_session.id).visibility(
        VisibilityLevel.PUBLIC
    ).payload(
        {"content": "Clue discovered: Ancient rituals were performed here."}
    ).description("New clue: Ancient rituals").save()

    return summary_session


# ============================================================================
# Summary Schema Tests (M3-014)
# ============================================================================

class TestSummarySchemas:
    """Test summary data structures and validation."""

    def test_session_summary_basic_fields(self):
        """Test basic session summary fields."""
        summary = SessionSummary(
            summary_id=str(uuid.uuid4()),
            session_id=str(uuid.uuid4()),
            created_at=datetime.now(),
            updated_at=datetime.now(),
            session_info=SessionInfo(
                started_at=datetime.now() - timedelta(hours=2),
                scene_id="scene_001",
                scene_title="The Mysterious Manor"
            ),
            narrative_summary=NarrativeSummary(
                brief="Investigation of mysterious manor.",
                detailed="The investigators arrived at the old manor and discovered evidence of cult activity.",
                mood=NarrativeMood.MYSTERY,
                tone="Suspenseful with hints of horror"
            )
        )

        assert summary.summary_id
        assert summary.session_id
        assert summary.narrative_summary.brief
        assert summary.narrative_summary.mood == NarrativeMood.MYSTERY

    def test_key_event_structure(self):
        """Test key event structure."""
        event = KeyEvent(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(),
            type=KeyEventType.CLUE_DISCOVERED,
            title="Found Ancient Tome",
            description="Discovered a tome hidden in the library",
            visibility=EventVisibility.PUBLIC
        )

        assert event.type == KeyEventType.CLUE_DISCOVERED
        assert event.title
        assert event.visibility == EventVisibility.PUBLIC

    def test_character_state_change(self):
        """Test character state change structure."""
        state_change = CharacterStateChange(
            character_id=1,
            character_name="Test Investigator",
            changes={
                "hp": {"old": 12, "new": 9, "delta": -3},
                "san": {"old": 60, "new": 55, "delta": -5, "events": ["event_001"]},
                "luck": {"old": 50, "new": 48, "delta": -2}
            },
            status_changes=[
                StatusChange(old=CharacterStatus.HEALTHY, new=CharacterStatus.INJURED, reason="Combat damage")
            ]
        )

        assert state_change.character_id == 1
        assert state_change.changes["hp"]["delta"] == -3
        assert len(state_change.status_changes) == 1

    def test_discovery_structure(self):
        """Test discovery structure."""
        discovery = Discovery(
            discovery_id=str(uuid.uuid4()),
            timestamp=datetime.now(),
            type=DiscoveryType.CLUE,
            content={
                "title": "Ancient Tome",
                "description": "A book containing dark rituals",
                "evidence": ["event_001", "event_002"]
            },
            discoverer={
                "user_id": 1,
                "character_id": 1
            },
            visibility=DiscoveryVisibility.PARTY
        )

        assert discovery.type == DiscoveryType.CLUE
        assert discovery.content.title == "Ancient Tome"
        assert discovery.visibility == DiscoveryVisibility.PARTY

    def test_consequence_structure(self):
        """Test consequence structure."""
        consequence = Consequence(
            consequence_id=str(uuid.uuid4()),
            timestamp=datetime.now(),
            type=ConsequenceType.INJURY,
            description="Investigator injured by trap",
            severity=ConsequenceSeverity.MODERATE,
            cause={
                "event_id": "event_001",
                "description": "Triggered floor trap"
            },
            affected={
                "characters": [1],
                "party": False
            }
        )

        assert consequence.type == ConsequenceType.INJURY
        assert consequence.severity == ConsequenceSeverity.MODERATE
        assert consequence.affected.characters == [1]

    def test_promise_structure(self):
        """Test promise structure."""
        promise = Promise(
            description="Investigate the basement tomorrow",
            source_event_id="event_001",
            status=PromiseStatus.PENDING
        )

        assert promise.status == PromiseStatus.PENDING
        assert promise.source_event_id == "event_001"

    def test_session_statistics(self):
        """Test session statistics."""
        stats = SessionStatistics(
            message_count=45,
            roll_count=12,
            combat_count=2,
            san_check_count=3,
            injury_count=1,
            clue_discovery_count=2
        )

        assert stats.message_count == 45
        assert stats.combat_count == 2
        assert stats.clue_discovery_count == 2

    def test_checkpoint_summary(self):
        """Test checkpoint summary structure."""
        checkpoint = CheckpointSummary(
            checkpoint_id=str(uuid.uuid4()),
            session_id=str(uuid.uuid4()),
            timestamp=datetime.now(),
            checkpoint_type=CheckpointType.SCENE_CHANGE,
            narrative="Entered the main hall of the mansion",
            character_states={1: {"hp": 10, "san": 55, "luck": 48}},
            current_scene="main_hall",
            world_state={"location": "mansion", "time": "night"}
        )

        assert checkpoint.checkpoint_type == CheckpointType.SCENE_CHANGE
        assert checkpoint.current_scene == "main_hall"
        assert checkpoint.character_states[1]["hp"] == 10

    def test_scene_summary(self):
        """Test scene summary structure."""
        scene = SceneSummary(
            scene_id="scene_001",
            scene_title="The Library",
            session_id=str(uuid.uuid4()),
            start_time=datetime.now() - timedelta(hours=1),
            narrative="Explored the library and found clues",
            participants=[1, 2, 3]
        )

        assert scene.scene_title == "The Library"
        assert len(scene.participants) == 3


# ============================================================================
# Summary Generator Tests (M3-015 to M3-018)
# ============================================================================

class TestSummaryGenerator:
    """Test summary generation functionality."""

    def test_generate_checkpoint_summary(self, summary_db, summary_session, summary_user, summary_character):
        """Test generating a checkpoint summary."""
        from src.services.summary import SummaryGenerator
        from src.models.checkpoint import Checkpoint, CheckpointType

        generator = SummaryGenerator(summary_db)

        # Create a checkpoint
        checkpoint = Checkpoint.create_from_session(
            session_id=summary_session.id,
            session_state={"current_scene": "library"},
            character_states={str(summary_character.id): {"hp": 12, "san": 60}},
            world_state={"time": "night"},
            narrative_state={"leads": []},
            checkpoint_type=CheckpointType.MANUAL,
            scene_name="The Mysterious Library",
            created_by_player_id=summary_user.id,
        )
        summary_db.add(checkpoint)
        summary_db.commit()

        # Generate checkpoint summary
        summary = generator.generate_checkpoint_summary(checkpoint.id)

        assert summary is not None
        assert summary.checkpoint_id == str(checkpoint.id)
        assert summary.session_id == str(summary_session.id)
        assert summary.checkpoint_type == CheckpointType.MANUAL
        assert summary.current_scene == "The Mysterious Library"
        assert isinstance(summary.narrative, str)

    def test_generate_scene_summary(self, summary_db, summary_session, summary_user):
        """Test generating a scene summary."""
        from src.services.summary import SummaryGenerator
        from datetime import datetime

        generator = SummaryGenerator(summary_db)

        # Create some events for the scene
        logger = EventLogger(summary_db)
        logger.record(EventType.SCENE_CHANGE, "kp").session(summary_session.id).payload(
            {"old_scene": "entrance", "new_scene": "library"}
        ).description("Entered the library").save()

        logger.record(EventType.MESSAGE, "kp").session(summary_session.id).payload(
            {"content": "The library is filled with ancient books."}
        ).save()

        # Generate scene summary
        scene_start = datetime.utcnow() - timedelta(hours=1)
        summary = generator.generate_scene_summary(
            session_id=summary_session.id,
            scene_id="library",
            scene_start=scene_start,
        )

        assert summary is not None
        assert summary.scene_id == "library"
        assert summary.session_id == str(summary_session.id)
        assert summary.start_time == scene_start
        assert isinstance(summary.narrative, str)

    def test_generate_session_summary(self, summary_db, summary_session, summary_user, summary_character):
        """Test generating a full session summary."""
        from src.services.summary import SummaryGenerator
        from datetime import datetime, timedelta

        generator = SummaryGenerator(summary_db)

        # Create various events
        logger = EventLogger(summary_db)
        logger.record(EventType.COMBAT_START, "kp").session(summary_session.id).save()
        logger.record(EventType.SAN_CHECK, "kp").session(summary_session.id).character(
            summary_character
        ).payload({"reason": "seeing_horror"}).save()
        logger.record(EventType.DAMAGE, "kp").session(summary_session.id).character(
            summary_character
        ).payload({"amount": 3}).save()

        # Generate session summary with time range that includes the events
        start_time = datetime.utcnow() - timedelta(minutes=5)
        end_time = datetime.utcnow() + timedelta(minutes=5)
        summary = generator.generate_session_summary(summary_session.id, start_time=start_time, end_time=end_time, use_llm=False)

        assert summary is not None
        assert summary.session_id == str(summary_session.id)
        assert summary.narrative_summary.brief
        assert summary.narrative_summary.detailed
        assert summary.narrative_summary.mood in NarrativeMood
        assert len(summary.key_events) >= 1  # Should have at least combat or damage event
        assert summary.statistics.message_count >= 0

    def test_extract_key_events(self, summary_db, summary_session, summary_character):
        """Test extracting key events from session."""
        from src.services.summary import SummaryGenerator

        generator = SummaryGenerator(summary_db)

        # Create various events
        logger = EventLogger(summary_db)
        logger.record(EventType.COMBAT_START, "kp").session(summary_session.id).save()
        logger.record(EventType.SAN_CHECK, "kp").session(summary_session.id).character(
            summary_character
        ).payload({"reason": "seeing_horror", "roll": 75}).save()
        logger.record(EventType.MESSAGE, "kp").session(summary_session.id).save()
        logger.record(EventType.DAMAGE, "kp").session(summary_session.id).character(
            summary_character
        ).payload({"amount": 5}).save()

        # Get events
        events = logger.get_session_events(summary_session.id)

        # Extract key events
        key_events = generator._extract_key_events(events)

        assert len(key_events) >= 3  # COMBAT_START, SAN_CHECK, DAMAGE
        combat_events = [e for e in key_events if e.type == KeyEventType.COMBAT_OCCURRED]
        san_events = [e for e in key_events if e.type == KeyEventType.SAN_CHECK_FAILED]
        injury_events = [e for e in key_events if e.type == KeyEventType.CHARACTER_INJURED]

        assert len(combat_events) >= 1
        assert len(san_events) >= 1
        assert len(injury_events) >= 1


# ============================================================================
# Summary Storage Tests (M3-019 to M3-021)
# ============================================================================

class TestSummaryStorage:
    """Test summary storage and retrieval.

    These tests will be implemented when the summary storage is created.
    """

    def test_write_summary_to_database(self, summary_session):
        """Test writing a summary to the database."""
        # This test will be implemented in M3-019
        pytest.skip("Not yet implemented - M3-019")

    def test_update_existing_summary(self, summary_session):
        """Test updating an existing summary."""
        # This test will be implemented in M3-020
        pytest.skip("Not yet implemented - M3-020")

    def test_query_summaries_by_session(self, summary_session):
        """Test querying summaries by session ID."""
        # This test will be implemented in M3-021
        pytest.skip("Not yet implemented - M3-021")


# ============================================================================
# Integration Tests
# ============================================================================

class TestSummaryIntegration:
    """Integration tests for the summary system."""

    def test_end_to_end_summary_generation(self, summary_session_with_events):
        """Test complete summary generation flow."""
        # This will be a comprehensive integration test
        pytest.skip("Not yet implemented - waiting for M3-019")

    def test_summary_with_visibility_filtering(self, summary_db, summary_session, summary_user):
        """Test that summaries respect visibility settings."""
        logger = EventLogger(summary_db)

        # Create events with different visibility levels
        logger.record(EventType.MESSAGE, "kp").session(summary_session.id).visibility(
            VisibilityLevel.PUBLIC
        ).payload({"content": "Public message"}).save()

        logger.record(EventType.MESSAGE, "kp").session(summary_session.id).visibility(
            VisibilityLevel.KP_ONLY
        ).payload({"content": "KP only message"}).save()

        # Test that summary filters correctly
        pytest.skip("Not yet implemented")

    def test_summary_across_multiple_scenes(self, summary_db, summary_session, summary_character):
        """Test summary generation across scene transitions."""
        logger = EventLogger(summary_db)

        # Scene 1 events
        logger.record(EventType.SCENE_CHANGE, "kp").session(summary_session.id).payload(
            {"old_scene": "scene_1", "new_scene": "scene_2"}
        ).save()

        # Scene 2 events
        logger.record(EventType.MESSAGE, "kp").session(summary_session.id).payload(
            {"content": "Scene 2 begins"}
        ).save()

        # Test scene aggregation
        pytest.skip("Not yet implemented")


# ============================================================================
# Performance Tests
# ============================================================================

class TestSummaryPerformance:
    """Performance tests for summary generation."""

    def test_summary_generation_with_many_events(self, summary_db, summary_session):
        """Test summary generation with a large number of events."""
        logger = EventLogger(summary_db)

        # Create 1000 events
        for i in range(1000):
            logger.record(EventType.MESSAGE, "kp").session(summary_session.id).payload(
                {"content": f"Message {i}"}
            ).save()

        # Test performance
        pytest.skip("Not yet implemented - performance benchmarking")

    def test_concurrent_summary_generation(self, summary_session):
        """Test concurrent summary generation."""
        pytest.skip("Not yet implemented - concurrency testing")
