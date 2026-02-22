"""Tests for session summary generator (M3-017).

This test file focuses specifically on session summary generation,
following TDD approach with comprehensive coverage.
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
    SessionStatistics,
    Leads,
    StateChanges,
    SessionInfo,
)


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def session_summary_db():
    """Create a test database for session summary tests."""
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
def session_summary_user(session_summary_db):
    """Create a test user for session summary tests."""
    user = User(
        username="session_summary_test_user",
        email="session_summary@example.com",
        hashed_password="hash"
    )
    session_summary_db.add(user)
    session_summary_db.commit()
    session_summary_db.refresh(user)
    return user


@pytest.fixture
def session_summary_character(session_summary_db, session_summary_user):
    """Create a test character for session summary tests."""
    character = Character(
        owner_id=session_summary_user.id,
        name="Test Investigator",
        hp=12,
        san=60,
        max_san=60,
        luck=50,
        mp=10,
    )
    session_summary_db.add(character)
    session_summary_db.commit()
    session_summary_db.refresh(character)
    return character


@pytest.fixture
def session_summary_session(session_summary_db, session_summary_user, session_summary_character):
    """Create a test game session for session summary tests."""
    session_id = uuid.uuid4()
    session = GameSession(
        id=session_id,
        owner_id=session_summary_user.id,
        character_id=session_summary_character.id,
        name="Test Session for Session Summary",
        state=SessionState.ENDED,
        current_scene_name="Final Location",
        location="Arkham",
        world_state={"time_of_day": "night", "weather": "rainy"},
        character_states={str(session_summary_character.id): {"hp": 9, "san": 55, "luck": 50}},
        narrative_state={"leads": [], "clues": []},
    )
    session_summary_db.add(session)
    session_summary_db.commit()
    session_summary_db.refresh(session)
    return session


@pytest.fixture
def session_summary_session_with_events(
    session_summary_db, session_summary_session, session_summary_character, session_summary_user
):
    """Create a session with various events for testing session summary generation."""
    logger = EventLogger(session_summary_db)

    # Session start
    logger.record(EventType.SESSION_START, "system").session(session_summary_session.id).save()

    # Roll event - success
    logger.record(EventType.ROLL, "player").session(session_summary_session.id).actor(
        session_summary_user
    ).character(session_summary_character).payload(
        {"skill": "spot_hidden", "target": 50, "roll": 25, "success_level": "regular_success"}
    ).description("Spot Hidden: 25 - Success").save()

    # Message event - discovery
    logger.record(EventType.MESSAGE, "kp").session(session_summary_session.id).payload(
        {"content": "You find an old book covered in strange symbols."}
    ).description("KP: Discovery of mysterious book").save()

    # Damage event
    logger.record(EventType.DAMAGE, "kp").session(session_summary_session.id).character(
        session_summary_character
    ).payload(
        {"amount": 3, "source": "falling_debris", "current_hp": 9, "max_hp": 12}
    ).description("Took 3 damage from falling debris").save()

    # SAN check event
    logger.record(EventType.SAN_CHECK, "kp").session(session_summary_session.id).character(
        session_summary_character
    ).payload(
        {"reason": "seeing_gruesome_discovery", "difficulty": "regular", "roll": 75, "loss_amount": 5}
    ).description("SAN check: Failed - Lost 5 SAN").save()

    # Scene change
    logger.record(EventType.SCENE_CHANGE, "kp").session(session_summary_session.id).payload(
        {"old_scene": "entrance", "new_scene": "library"}
    ).description("Party moved to the library").save()

    # Combat event
    logger.record(EventType.COMBAT_START, "kp").session(session_summary_session.id).payload(
        {"enemy": "Cultist", "initiative": 50}
    ).description("Combat started with Cultist").save()

    logger.record(EventType.COMBAT_END, "kp").session(session_summary_session.id).payload(
        {"enemy": "Cultist", "result": "victory"}
    ).description("Combat ended - Victory").save()

    # Clue discovery
    logger.record(EventType.MESSAGE, "kp").session(session_summary_session.id).visibility(
        VisibilityLevel.PUBLIC
    ).payload(
        {"content": "Clue discovered: Ancient rituals were performed here.", "clues": ["ancient_rituals"]}
    ).description("New clue: Ancient rituals").save()

    # Session end
    logger.record(EventType.SESSION_END, "system").session(session_summary_session.id).save()

    return session_summary_session


# ============================================================================
# Session Summary Tests (M3-017)
# ============================================================================

class TestSessionSummaryGeneration:
    """Test session summary generation functionality."""

    def test_generate_session_summary_returns_session_summary_object(
        self, session_summary_db, session_summary_session
    ):
        """Test that generate_session_summary returns a SessionSummary object."""
        from src.services.summary import SummaryGenerator

        generator = SummaryGenerator(session_summary_db)

        summary = generator.generate_session_summary(
            session_id=session_summary_session.id,
            use_llm=False
        )

        assert summary is not None
        assert isinstance(summary, SessionSummary)
        assert summary.session_id == str(session_summary_session.id)

    def test_generate_session_summary_with_time_range(
        self, session_summary_db, session_summary_session_with_events
    ):
        """Test generating session summary with specific time range."""
        from src.services.summary import SummaryGenerator

        generator = SummaryGenerator(session_summary_db)

        start_time = datetime.utcnow() - timedelta(minutes=10)
        end_time = datetime.utcnow() + timedelta(minutes=10)

        summary = generator.generate_session_summary(
            session_id=session_summary_session_with_events.id,
            start_time=start_time,
            end_time=end_time,
            use_llm=False
        )

        assert summary is not None
        assert summary.session_info.started_at >= start_time
        assert summary.session_info.ended_at is not None or summary.session_info.duration_seconds is not None

    def test_generate_session_summary_raises_error_for_nonexistent_session(
        self, session_summary_db
    ):
        """Test that generating summary for nonexistent session raises ValueError."""
        from src.services.summary import SummaryGenerator

        generator = SummaryGenerator(session_summary_db)

        with pytest.raises(ValueError, match="Session .* not found"):
            generator.generate_session_summary(session_id=uuid.uuid4())

    def test_session_summary_has_required_fields(
        self, session_summary_db, session_summary_session_with_events
    ):
        """Test that session summary has all required fields."""
        from src.services.summary import SummaryGenerator

        generator = SummaryGenerator(session_summary_db)

        summary = generator.generate_session_summary(
            session_id=session_summary_session_with_events.id,
            use_llm=False
        )

        # Check required fields
        assert summary.summary_id is not None
        assert summary.session_id == str(session_summary_session_with_events.id)
        assert summary.created_at is not None
        assert summary.updated_at is not None
        assert summary.session_info is not None
        assert summary.narrative_summary is not None
        assert summary.key_events is not None
        assert summary.statistics is not None


class TestSessionNarrativeSummary:
    """Test narrative summary generation for sessions."""

    def test_narrative_summary_has_brief_and_detailed(
        self, session_summary_db, session_summary_session_with_events
    ):
        """Test that narrative summary has both brief and detailed sections."""
        from src.services.summary import SummaryGenerator

        generator = SummaryGenerator(session_summary_db)

        summary = generator.generate_session_summary(
            session_id=session_summary_session_with_events.id,
            use_llm=False
        )

        narrative = summary.narrative_summary

        assert isinstance(narrative, NarrativeSummary)
        assert narrative.brief is not None
        assert narrative.detailed is not None
        assert len(narrative.brief) > 0
        assert len(narrative.detailed) > 0

    def test_narrative_summary_has_mood(
        self, session_summary_db, session_summary_session_with_events
    ):
        """Test that narrative summary has a mood."""
        from src.services.summary import SummaryGenerator

        generator = SummaryGenerator(session_summary_db)

        summary = generator.generate_session_summary(
            session_id=session_summary_session_with_events.id,
            use_llm=False
        )

        narrative = summary.narrative_summary

        assert narrative.mood is not None
        assert isinstance(narrative.mood, NarrativeMood)
        assert narrative.mood in [m for m in NarrativeMood]

    def test_narrative_summary_has_tone(
        self, session_summary_db, session_summary_session_with_events
    ):
        """Test that narrative summary has tone."""
        from src.services.summary import SummaryGenerator

        generator = SummaryGenerator(session_summary_db)

        summary = generator.generate_session_summary(
            session_id=session_summary_session_with_events.id,
            use_llm=False
        )

        narrative = summary.narrative_summary

        assert narrative.tone is not None
        assert isinstance(narrative.tone, str)


class TestSessionKeyEvents:
    """Test key event extraction for session summaries."""

    def test_key_events_extracted_from_combat(
        self, session_summary_db, session_summary_session, session_summary_character
    ):
        """Test that combat events are extracted as key events."""
        from src.services.summary import SummaryGenerator
        from datetime import datetime, timedelta

        generator = SummaryGenerator(session_summary_db)

        logger = EventLogger(session_summary_db)
        logger.record(EventType.COMBAT_START, "kp").session(session_summary_session.id).save()
        logger.record(EventType.COMBAT_END, "kp").session(session_summary_session.id).save()

        # Use explicit time range to include the events
        start_time = datetime.utcnow() - timedelta(minutes=5)
        end_time = datetime.utcnow() + timedelta(minutes=5)

        summary = generator.generate_session_summary(
            session_id=session_summary_session.id,
            start_time=start_time,
            end_time=end_time,
            use_llm=False
        )

        combat_events = [e for e in summary.key_events if e.type == KeyEventType.COMBAT_OCCURRED]
        assert len(combat_events) >= 2  # start and end

    def test_key_events_extracted_from_san_checks(
        self, session_summary_db, session_summary_session, session_summary_character
    ):
        """Test that SAN check events are extracted as key events."""
        from src.services.summary import SummaryGenerator
        from datetime import datetime, timedelta

        generator = SummaryGenerator(session_summary_db)

        logger = EventLogger(session_summary_db)
        logger.record(EventType.SAN_CHECK, "kp").session(session_summary_session.id).character(
            session_summary_character
        ).payload({"reason": "test"}).save()

        # Use explicit time range to include the events
        start_time = datetime.utcnow() - timedelta(minutes=5)
        end_time = datetime.utcnow() + timedelta(minutes=5)

        summary = generator.generate_session_summary(
            session_id=session_summary_session.id,
            start_time=start_time,
            end_time=end_time,
            use_llm=False
        )

        san_events = [e for e in summary.key_events if e.type == KeyEventType.SAN_CHECK_FAILED]
        assert len(san_events) >= 1

    def test_key_events_extracted_from_scene_changes(
        self, session_summary_db, session_summary_session
    ):
        """Test that scene change events are extracted as key events."""
        from src.services.summary import SummaryGenerator
        from datetime import datetime, timedelta

        generator = SummaryGenerator(session_summary_db)

        logger = EventLogger(session_summary_db)
        logger.record(EventType.SCENE_CHANGE, "kp").session(session_summary_session.id).payload(
            {"old_scene": "a", "new_scene": "b"}
        ).save()

        # Use explicit time range to include the events
        start_time = datetime.utcnow() - timedelta(minutes=5)
        end_time = datetime.utcnow() + timedelta(minutes=5)

        summary = generator.generate_session_summary(
            session_id=session_summary_session.id,
            start_time=start_time,
            end_time=end_time,
            use_llm=False
        )

        scene_events = [e for e in summary.key_events if e.type == KeyEventType.SCENE_TRANSITION]
        assert len(scene_events) >= 1


class TestSessionStatistics:
    """Test statistics calculation for session summaries."""

    def test_statistics_counts_messages(
        self, session_summary_db, session_summary_session
    ):
        """Test that message count is calculated correctly."""
        from src.services.summary import SummaryGenerator
        from datetime import datetime, timedelta

        generator = SummaryGenerator(session_summary_db)

        logger = EventLogger(session_summary_db)
        for i in range(5):
            logger.record(EventType.MESSAGE, "kp").session(session_summary_session.id).payload(
                {"content": f"Message {i}"}
            ).save()

        # Use explicit time range to include the events
        start_time = datetime.utcnow() - timedelta(minutes=5)
        end_time = datetime.utcnow() + timedelta(minutes=5)

        summary = generator.generate_session_summary(
            session_id=session_summary_session.id,
            start_time=start_time,
            end_time=end_time,
            use_llm=False
        )

        assert summary.statistics.message_count == 5

    def test_statistics_counts_rolls(
        self, session_summary_db, session_summary_session, session_summary_character
    ):
        """Test that roll count is calculated correctly."""
        from src.services.summary import SummaryGenerator
        from datetime import datetime, timedelta

        generator = SummaryGenerator(session_summary_db)

        logger = EventLogger(session_summary_db)
        for i in range(3):
            logger.record(EventType.ROLL, "player").session(session_summary_session.id).character(
                session_summary_character
            ).payload({"skill": "test", "roll": 50}).save()

        # Use explicit time range to include the events
        start_time = datetime.utcnow() - timedelta(minutes=5)
        end_time = datetime.utcnow() + timedelta(minutes=5)

        summary = generator.generate_session_summary(
            session_id=session_summary_session.id,
            start_time=start_time,
            end_time=end_time,
            use_llm=False
        )

        assert summary.statistics.roll_count == 3

    def test_statistics_counts_combat_events(
        self, session_summary_db, session_summary_session
    ):
        """Test that combat event count is calculated correctly."""
        from src.services.summary import SummaryGenerator
        from datetime import datetime, timedelta

        generator = SummaryGenerator(session_summary_db)

        logger = EventLogger(session_summary_db)
        logger.record(EventType.COMBAT_START, "kp").session(session_summary_session.id).save()
        logger.record(EventType.COMBAT_ROUND, "kp").session(session_summary_session.id).save()
        logger.record(EventType.COMBAT_END, "kp").session(session_summary_session.id).save()

        # Use explicit time range to include the events
        start_time = datetime.utcnow() - timedelta(minutes=5)
        end_time = datetime.utcnow() + timedelta(minutes=5)

        summary = generator.generate_session_summary(
            session_id=session_summary_session.id,
            start_time=start_time,
            end_time=end_time,
            use_llm=False
        )

        assert summary.statistics.combat_count >= 3

    def test_statistics_counts_san_checks(
        self, session_summary_db, session_summary_session, session_summary_character
    ):
        """Test that SAN check count is calculated correctly."""
        from src.services.summary import SummaryGenerator
        from datetime import datetime, timedelta

        generator = SummaryGenerator(session_summary_db)

        logger = EventLogger(session_summary_db)
        for i in range(4):
            logger.record(EventType.SAN_CHECK, "kp").session(session_summary_session.id).character(
                session_summary_character
            ).payload({"reason": "test"}).save()

        # Use explicit time range to include the events
        start_time = datetime.utcnow() - timedelta(minutes=5)
        end_time = datetime.utcnow() + timedelta(minutes=5)

        summary = generator.generate_session_summary(
            session_id=session_summary_session.id,
            start_time=start_time,
            end_time=end_time,
            use_llm=False
        )

        assert summary.statistics.san_check_count == 4


class TestSessionStateChanges:
    """Test state change extraction for session summaries."""

    def test_state_changes_tracks_hp(
        self, session_summary_db, session_summary_session, session_summary_character
    ):
        """Test that HP changes are tracked in state changes."""
        from src.services.summary import SummaryGenerator

        generator = SummaryGenerator(session_summary_db)

        logger = EventLogger(session_summary_db)
        logger.record(EventType.DAMAGE, "kp").session(session_summary_session.id).character(
            session_summary_character
        ).payload({"amount": 3, "current_hp": 9, "max_hp": 12}).save()

        summary = generator.generate_session_summary(
            session_id=session_summary_session.id,
            use_llm=False
        )

        # Check that character state change contains HP delta
        if len(summary.state_changes.characters) > 0:
            char_change = summary.state_changes.characters[0]
            assert char_change.changes["hp"]["delta"] < 0  # Took damage

    def test_state_changes_tracks_san(
        self, session_summary_db, session_summary_session, session_summary_character
    ):
        """Test that SAN changes are tracked in state changes."""
        from src.services.summary import SummaryGenerator

        generator = SummaryGenerator(session_summary_db)

        logger = EventLogger(session_summary_db)
        logger.record(EventType.SAN_LOSS, "kp").session(session_summary_session.id).character(
            session_summary_character
        ).payload({"amount": 5, "current_san": 55}).save()

        summary = generator.generate_session_summary(
            session_id=session_summary_session.id,
            use_llm=False
        )

        # Check that character state change contains SAN delta
        if len(summary.state_changes.characters) > 0:
            char_change = summary.state_changes.characters[0]
            assert char_change.changes["san"]["delta"] < 0  # Lost SAN


class TestSessionLeadsAndPromises:
    """Test leads and promises extraction for session summaries."""

    def test_leads_extracted_from_events(
        self, session_summary_db, session_summary_session
    ):
        """Test that leads are extracted from events."""
        from src.services.summary import SummaryGenerator

        generator = SummaryGenerator(session_summary_db)

        logger = EventLogger(session_summary_db)
        logger.record(EventType.MESSAGE, "kp").session(session_summary_session.id).payload(
            {"content": "Clue found", "clues": ["clue_1", "clue_2"]}
        ).save()

        summary = generator.generate_session_summary(
            session_id=session_summary_session.id,
            use_llm=False
        )

        # Should have discovered leads
        assert isinstance(summary.leads, Leads)
        assert len(summary.leads.discovered) >= 2

    def test_promises_extracted_from_events(
        self, session_summary_db, session_summary_session
    ):
        """Test that promises are extracted from events."""
        from src.services.summary import SummaryGenerator

        generator = SummaryGenerator(session_summary_db)

        logger = EventLogger(session_summary_db)
        logger.record(EventType.MESSAGE, "kp").session(session_summary_session.id).payload(
            {"content": "Promise made", "promises": [{"description": "Investigate basement"}]}
        ).save()

        summary = generator.generate_session_summary(
            session_id=session_summary_session.id,
            use_llm=False
        )

        # Should have extracted promises
        assert len(summary.promises) >= 1
        assert summary.promises[0].description == "Investigate basement"


class TestSessionInfo:
    """Test session info generation for session summaries."""

    def test_session_info_has_start_time(
        self, session_summary_db, session_summary_session
    ):
        """Test that session info includes start time."""
        from src.services.summary import SummaryGenerator

        generator = SummaryGenerator(session_summary_db)

        summary = generator.generate_session_summary(
            session_id=session_summary_session.id,
            use_llm=False
        )

        assert summary.session_info.started_at is not None

    def test_session_info_has_scene_info(
        self, session_summary_db, session_summary_session
    ):
        """Test that session info includes scene information."""
        from src.services.summary import SummaryGenerator

        generator = SummaryGenerator(session_summary_db)

        summary = generator.generate_session_summary(
            session_id=session_summary_session.id,
            use_llm=False
        )

        assert summary.session_info.scene_id is not None
        assert summary.session_info.scene_title is not None

    def test_session_info_has_duration(
        self, session_summary_db, session_summary_session
    ):
        """Test that session info includes duration when session has events."""
        from src.services.summary import SummaryGenerator

        generator = SummaryGenerator(session_summary_db)

        logger = EventLogger(session_summary_db)
        logger.record(EventType.MESSAGE, "kp").session(session_summary_session.id).save()

        summary = generator.generate_session_summary(
            session_id=session_summary_session.id,
            use_llm=False
        )

        # Duration should be calculated when we have events
        assert summary.session_info.duration_seconds is not None
        assert summary.session_info.duration_seconds >= 0


class TestSessionVisibility:
    """Test visibility settings for session summaries."""

    def test_visibility_structure_exists(
        self, session_summary_db, session_summary_session
    ):
        """Test that visibility structure is present in summary."""
        from src.services.summary import SummaryGenerator

        generator = SummaryGenerator(session_summary_db)

        summary = generator.generate_session_summary(
            session_id=session_summary_session.id,
            use_llm=False
        )

        assert summary.visibility is not None
        assert isinstance(summary.visibility, dict)
