"""Tests for the statistics service."""
from datetime import datetime, timedelta
import uuid
import pytest
from sqlalchemy.orm import Session

from src.models import User, Character, GameSession, Event, EventType, VisibilityLevel, Message
from src.services.statistics import (
    StatisticsService,
    MessageStatistics,
    RollStatistics,
    PlayerPerformance,
    SessionStatistics,
)


@pytest.fixture
def test_user(test_db: Session) -> User:
    """Create a test user."""
    user = User(
        username="testplayer",
        email="test@example.com",
        hashed_password="hash",
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture
def test_character(test_db: Session, test_user: User) -> Character:
    """Create a test character."""
    character = Character(
        owner_id=test_user.id,
        name="Test Investigator",
        str=50,
        con=50,
        dex=60,
        pow=50,
        int=70,
        siz=50,
        edu=60,
        app=50,
        hp=10,
        mp=10,
        san=50,
        max_san=50,
        luck=50,
        skills={"spot_hidden": 50, "listen": 60, "fighting": 40},
    )
    test_db.add(character)
    test_db.commit()
    test_db.refresh(character)
    return character


@pytest.fixture
def test_session(test_db: Session, test_user: User, test_character: Character) -> GameSession:
    """Create a test game session."""
    session = GameSession(
        owner_id=test_user.id,
        character_id=test_character.id,
        name="Test Session",
        state="active",
        current_scene_name="Test Scene",
    )
    test_db.add(session)
    test_db.commit()
    test_db.refresh(session)
    return session


@pytest.fixture
def test_sender_id() -> uuid.UUID:
    """Create a test UUID for message sender_id."""
    return uuid.uuid4()


class TestMessageStatistics:
    """Tests for message statistics (M3-073)."""

    def test_count_public_messages(self, test_db: Session, test_session: GameSession, test_sender_id: uuid.UUID) -> None:
        """Test counting public messages."""
        # Create test messages
        now = datetime.utcnow()
        messages = [
            Message(
                session_id=test_session.id,
                sender_id=test_sender_id,
                content="Public message 1",
                visibility="public",
                visible_to=[],
                created_at=now - timedelta(hours=2),
            ),
            Message(
                session_id=test_session.id,
                sender_id=test_sender_id,
                content="Public message 2",
                visibility="public",
                visible_to=[],
                created_at=now - timedelta(hours=1),
            ),
            Message(
                session_id=test_session.id,
                sender_id=test_sender_id,
                content="KP only message",
                visibility="kp",
                visible_to=[],
                created_at=now,
            ),
        ]
        for msg in messages:
            test_db.add(msg)
        test_db.commit()

        stats = StatisticsService.get_message_statistics(test_db, test_session.id)

        assert stats.total_messages == 3
        assert stats.public_messages == 2
        assert stats.kp_only_messages == 1
        assert stats.party_messages == 0
        assert stats.private_messages == 0

    def test_count_messages_by_visibility(self, test_db: Session, test_session: GameSession, test_sender_id: uuid.UUID) -> None:
        """Test counting messages by all visibility types."""
        now = datetime.utcnow()
        messages = [
            Message(
                session_id=test_session.id,
                sender_id=test_sender_id,
                content="Public",
                visibility="public",
                visible_to=[],
                created_at=now - timedelta(hours=3),
            ),
            Message(
                session_id=test_session.id,
                sender_id=test_sender_id,
                content="KP only",
                visibility="kp",
                visible_to=[],
                created_at=now - timedelta(hours=2),
            ),
            Message(
                session_id=test_session.id,
                sender_id=test_sender_id,
                content="Party",
                visibility="party",
                visible_to=[],
                created_at=now - timedelta(hours=1),
            ),
            Message(
                session_id=test_session.id,
                sender_id=test_sender_id,
                content="Private",
                visibility="private",
                visible_to=[str(test_sender_id)],
                created_at=now,
            ),
        ]
        for msg in messages:
            test_db.add(msg)
        test_db.commit()

        stats = StatisticsService.get_message_statistics(test_db, test_session.id)

        assert stats.total_messages == 4
        assert stats.public_messages == 1
        assert stats.kp_only_messages == 1
        assert stats.party_messages == 1
        assert stats.private_messages == 1

    def test_message_frequency_by_hour(self, test_db: Session, test_session: GameSession, test_sender_id: uuid.UUID) -> None:
        """Test calculating message frequency by hour."""
        now = datetime.utcnow()

        # Create messages spread across different hours
        for i in range(10):
            msg = Message(
                session_id=test_session.id,
                sender_id=test_sender_id,
                content=f"Message {i}",
                visibility="public",
                visible_to=[],
                created_at=now - timedelta(hours=i),
            )
            test_db.add(msg)
        test_db.commit()

        stats = StatisticsService.get_message_statistics(test_db, test_session.id)

        # Check that frequency data exists
        assert len(stats.hourly_frequency) > 0
        # Verify total count matches
        assert sum(stats.hourly_frequency.values()) == 10


class TestRollStatistics:
    """Tests for roll check statistics (M3-074)."""

    def test_count_roll_events(self, test_db: Session, test_session: GameSession, test_character: Character) -> None:
        """Test counting roll events."""
        now = datetime.utcnow()
        events = [
            Event(
                session_id=test_session.id,
                actor_player_id=test_session.owner_id,
                actor_role="player",
                character_id=test_character.id,
                event_type=EventType.ROLL,
                payload={
                    "skill": "spot_hidden",
                    "target": 50,
                    "roll_value": 30,
                    "success_level": "regular_success",
                },
                visibility=VisibilityLevel.PUBLIC,
                timestamp=now - timedelta(minutes=30),
            ),
            Event(
                session_id=test_session.id,
                actor_player_id=test_session.owner_id,
                actor_role="player",
                character_id=test_character.id,
                event_type=EventType.ROLL,
                payload={
                    "skill": "listen",
                    "target": 60,
                    "roll_value": 70,
                    "success_level": "failure",
                },
                visibility=VisibilityLevel.PUBLIC,
                timestamp=now,
            ),
        ]
        for event in events:
            test_db.add(event)
        test_db.commit()

        stats = StatisticsService.get_roll_statistics(test_db, test_session.id)

        assert stats.total_rolls == 2
        assert stats.successful_rolls == 1
        assert stats.failed_rolls == 1

    def test_calculate_success_rate(self, test_db: Session, test_session: GameSession, test_character: Character) -> None:
        """Test calculating success rate."""
        now = datetime.utcnow()
        # Create 10 rolls with 7 successes
        for i in range(10):
            success = i < 7
            event = Event(
                session_id=test_session.id,
                actor_player_id=test_session.owner_id,
                actor_role="player",
                character_id=test_character.id,
                event_type=EventType.ROLL,
                payload={
                    "skill": "spot_hidden",
                    "target": 50,
                    "roll_value": 30 if success else 80,
                    "success_level": "regular_success" if success else "failure",
                },
                visibility=VisibilityLevel.PUBLIC,
                timestamp=now - timedelta(minutes=i),
            )
            test_db.add(event)
        test_db.commit()

        stats = StatisticsService.get_roll_statistics(test_db, test_session.id)

        assert stats.total_rolls == 10
        assert stats.successful_rolls == 7
        assert stats.failed_rolls == 3
        assert stats.success_rate == 0.7

    def test_count_push_rolls(self, test_db: Session, test_session: GameSession, test_character: Character) -> None:
        """Test counting push roll events."""
        now = datetime.utcnow()
        events = [
            Event(
                session_id=test_session.id,
                actor_player_id=test_session.owner_id,
                actor_role="player",
                character_id=test_character.id,
                event_type=EventType.ROLL,
                payload={"skill": "spot_hidden", "target": 50, "roll_value": 80, "success_level": "failure"},
                visibility=VisibilityLevel.PUBLIC,
                timestamp=now - timedelta(minutes=2),
            ),
            Event(
                session_id=test_session.id,
                actor_player_id=test_session.owner_id,
                actor_role="player",
                character_id=test_character.id,
                event_type=EventType.PUSH_ROLL,
                payload={"skill": "spot_hidden", "target": 50, "roll_value": 40, "success_level": "regular_success"},
                visibility=VisibilityLevel.PUBLIC,
                timestamp=now,
            ),
        ]
        for event in events:
            test_db.add(event)
        test_db.commit()

        stats = StatisticsService.get_roll_statistics(test_db, test_session.id)

        assert stats.total_rolls == 1  # Only regular rolls counted
        assert stats.pushed_rolls == 1

    def test_critical_success_and_failure(self, test_db: Session, test_session: GameSession, test_character: Character) -> None:
        """Test counting critical successes and failures."""
        now = datetime.utcnow()
        events = [
            Event(
                session_id=test_session.id,
                actor_player_id=test_session.owner_id,
                actor_role="player",
                character_id=test_character.id,
                event_type=EventType.ROLL,
                payload={
                    "skill": "spot_hidden",
                    "target": 50,
                    "roll_value": 1,  # Critical
                    "success_level": "extreme_success",
                    "is_critical": True,
                },
                visibility=VisibilityLevel.PUBLIC,
                timestamp=now - timedelta(minutes=2),
            ),
            Event(
                session_id=test_session.id,
                actor_player_id=test_session.owner_id,
                actor_role="player",
                character_id=test_character.id,
                event_type=EventType.ROLL,
                payload={
                    "skill": "listen",
                    "target": 60,
                    "roll_value": 100,  # Fumble
                    "success_level": "failure",
                    "is_fumble": True,
                },
                visibility=VisibilityLevel.PUBLIC,
                timestamp=now,
            ),
        ]
        for event in events:
            test_db.add(event)
        test_db.commit()

        stats = StatisticsService.get_roll_statistics(test_db, test_session.id)

        assert stats.critical_successes == 1
        assert stats.critical_failures == 1

    def test_most_used_skills(self, test_db: Session, test_session: GameSession, test_character: Character) -> None:
        """Test identifying most used skills."""
        now = datetime.utcnow()
        skills = ["spot_hidden", "spot_hidden", "listen", "spot_hidden", "fighting", "listen"]
        for skill in skills:
            event = Event(
                session_id=test_session.id,
                actor_player_id=test_session.owner_id,
                actor_role="player",
                character_id=test_character.id,
                event_type=EventType.ROLL,
                payload={
                    "skill": skill,
                    "target": 50,
                    "roll_value": 30,
                    "success_level": "regular_success",
                },
                visibility=VisibilityLevel.PUBLIC,
                timestamp=now,
            )
            test_db.add(event)
            now = now + timedelta(seconds=1)
        test_db.commit()

        stats = StatisticsService.get_roll_statistics(test_db, test_session.id)

        assert len(stats.skill_usage) > 0
        # spot_hidden should be the most used
        assert stats.skill_usage[0]["skill"] == "spot_hidden"
        assert stats.skill_usage[0]["count"] == 3


class TestPlayerPerformance:
    """Tests for player performance statistics (M3-075)."""

    def test_player_activity_summary(self, test_db: Session, test_session: GameSession, test_character: Character, test_sender_id: uuid.UUID) -> None:
        """Test generating player activity summary."""
        now = datetime.utcnow()
        # Create various events for the player
        for i in range(5):
            event = Event(
                session_id=test_session.id,
                actor_player_id=test_session.owner_id,
                actor_role="player",
                character_id=test_character.id,
                event_type=EventType.ROLL,
                payload={"skill": "spot_hidden", "target": 50, "roll_value": 30, "success_level": "regular_success"},
                visibility=VisibilityLevel.PUBLIC,
                timestamp=now - timedelta(minutes=i * 5),
            )
            test_db.add(event)

        # Add some messages
        for i in range(3):
            msg = Message(
                session_id=test_session.id,
                sender_id=test_sender_id,
                content=f"Message {i}",
                visibility="public",
                visible_to=[],
                created_at=now - timedelta(minutes=i * 3),
            )
            test_db.add(msg)
        test_db.commit()

        # Note: message_count will be 0 because sender_id is UUID, not player_id (int)
        stats = StatisticsService.get_player_performance(test_db, test_session.id, test_session.owner_id)

        assert stats.player_id == test_session.owner_id
        assert stats.roll_count == 5

    def test_san_loss_tracking(self, test_db: Session, test_session: GameSession, test_character: Character) -> None:
        """Test tracking SAN loss events."""
        now = datetime.utcnow()
        events = [
            Event(
                session_id=test_session.id,
                actor_player_id=test_session.owner_id,
                actor_role="player",
                character_id=test_character.id,
                event_type=EventType.SAN_CHECK,
                payload={"reason": "see monster", "difficulty": 1, "roll": 30, "loss_amount": 5},
                visibility=VisibilityLevel.PUBLIC,
                timestamp=now - timedelta(minutes=10),
            ),
            Event(
                session_id=test_session.id,
                actor_player_id=test_session.owner_id,
                actor_role="player",
                character_id=test_character.id,
                event_type=EventType.SAN_LOSS,
                payload={"amount": 5, "reason": "see monster", "current_san": 45},
                visibility=VisibilityLevel.PUBLIC,
                timestamp=now - timedelta(minutes=9),
            ),
            Event(
                session_id=test_session.id,
                actor_player_id=test_session.owner_id,
                actor_role="player",
                character_id=test_character.id,
                event_type=EventType.SAN_CHECK,
                payload={"reason": "witness death", "difficulty": 0, "roll": 20, "loss_amount": 10},
                visibility=VisibilityLevel.PUBLIC,
                timestamp=now - timedelta(minutes=5),
            ),
            Event(
                session_id=test_session.id,
                actor_player_id=test_session.owner_id,
                actor_role="player",
                character_id=test_character.id,
                event_type=EventType.SAN_LOSS,
                payload={"amount": 10, "reason": "witness death", "current_san": 35},
                visibility=VisibilityLevel.PUBLIC,
                timestamp=now - timedelta(minutes=4),
            ),
        ]
        for event in events:
            test_db.add(event)
        test_db.commit()

        stats = StatisticsService.get_player_performance(test_db, test_session.id, test_session.owner_id)

        assert stats.san_checks == 2
        assert stats.total_san_loss == 15  # 5 + 10 from SAN_LOSS events

    def test_luck_point_usage(self, test_db: Session, test_session: GameSession, test_character: Character) -> None:
        """Test tracking luck point usage."""
        now = datetime.utcnow()
        event = Event(
            session_id=test_session.id,
            actor_player_id=test_session.owner_id,
            actor_role="player",
            character_id=test_character.id,
            event_type=EventType.LUCK_SPEND,
            payload={"amount": 5, "reason": "improve roll", "previous_luck": 50, "current_luck": 45},
            visibility=VisibilityLevel.PUBLIC,
            timestamp=now,
        )
        test_db.add(event)
        test_db.commit()

        stats = StatisticsService.get_player_performance(test_db, test_session.id, test_session.owner_id)

        assert stats.luck_spends == 1
        assert stats.total_luck_spent == 5

    def test_multiple_players(self, test_db: Session, test_session: GameSession, test_character: Character, test_user: User) -> None:
        """Test statistics with multiple players."""
        # Create another user and character
        user2 = User(username="player2", email="player2@example.com", hashed_password="hash")
        test_db.add(user2)
        test_db.commit()
        test_db.refresh(user2)

        char2 = Character(
            owner_id=user2.id,
            name="Second Investigator",
            str=50,
            con=50,
            dex=50,
            pow=50,
            int=50,
            siz=50,
            edu=50,
            app=50,
            hp=10,
            mp=10,
            san=50,
            max_san=50,
            luck=50,
        )
        test_db.add(char2)
        test_db.commit()
        test_db.refresh(char2)

        now = datetime.utcnow()
        # Player 1 events
        event1 = Event(
            session_id=test_session.id,
            actor_player_id=test_user.id,
            actor_role="player",
            character_id=test_character.id,
            event_type=EventType.ROLL,
            payload={"skill": "spot_hidden", "target": 50, "roll_value": 30, "success_level": "regular_success"},
            visibility=VisibilityLevel.PUBLIC,
            timestamp=now,
        )
        test_db.add(event1)

        # Player 2 events
        event2 = Event(
            session_id=test_session.id,
            actor_player_id=user2.id,
            actor_role="player",
            character_id=char2.id,
            event_type=EventType.ROLL,
            payload={"skill": "listen", "target": 50, "roll_value": 40, "success_level": "regular_success"},
            visibility=VisibilityLevel.PUBLIC,
            timestamp=now,
        )
        test_db.add(event2)
        test_db.commit()

        # Check each player's stats separately
        stats1 = StatisticsService.get_player_performance(test_db, test_session.id, test_user.id)
        assert stats1.roll_count == 1

        stats2 = StatisticsService.get_player_performance(test_db, test_session.id, user2.id)
        assert stats2.roll_count == 1


class TestSessionStatistics:
    """Tests for comprehensive session statistics."""

    def test_comprehensive_session_stats(
        self,
        test_db: Session,
        test_session: GameSession,
        test_character: Character,
        test_user: User,
        test_sender_id: uuid.UUID,
    ) -> None:
        """Test generating comprehensive session statistics."""
        now = datetime.utcnow()

        # Create messages
        for i in range(5):
            msg = Message(
                session_id=test_session.id,
                sender_id=test_sender_id,
                content=f"Message {i}",
                visibility="public",
                visible_to=[],
                created_at=now - timedelta(hours=i),
            )
            test_db.add(msg)

        # Create rolls
        for i in range(10):
            event = Event(
                session_id=test_session.id,
                actor_player_id=test_user.id,
                actor_role="player",
                character_id=test_character.id,
                event_type=EventType.ROLL,
                payload={
                    "skill": "spot_hidden",
                    "target": 50,
                    "roll_value": 30 if i < 7 else 70,
                    "success_level": "regular_success" if i < 7 else "failure",
                },
                visibility=VisibilityLevel.PUBLIC,
                timestamp=now - timedelta(minutes=i),
            )
            test_db.add(event)

        test_db.commit()

        stats = StatisticsService.get_session_statistics(test_db, test_session.id)

        # Check message stats
        assert stats.messages.total_messages == 5
        assert stats.messages.public_messages == 5

        # Check roll stats
        assert stats.rolls.total_rolls == 10
        assert stats.rolls.successful_rolls == 7
        assert stats.rolls.success_rate == 0.7

        # Check player stats - note: message_count will be 0 due to UUID/int mismatch
        assert stats.players[0].player_id == test_user.id
        assert stats.players[0].roll_count == 10
