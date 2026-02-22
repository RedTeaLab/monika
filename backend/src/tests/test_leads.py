"""Tests for the Lead database model."""
import pytest
from datetime import datetime, timedelta
import uuid

from src.models.lead import (
    Lead,
    LeadChoice,
    LeadPriority,
    LeadType,
    LeadStatus,
    LeadVisibility,
    LeadExecutionMethod,
)
from src.models.user import User
from src.models.character import Character
from src.models.session import GameSession
from src.models.event import Event, EventType, VisibilityLevel
from src.models.campaign import Campaign


@pytest.fixture
def test_session_with_leads(test_db):
    """Create a test session with associated leads."""
    # Create a user
    user = User(
        username="testkeeper",
        email="keeper@test.com",
        hashed_password="hash",
    )
    test_db.add(user)
    test_db.flush()

    # Create a character
    character = Character(
        name="Test Investigator",
        owner_id=user.id,
        str=50,
        dex=50,
        int=70,
        edu=60,
        app=40,
        pow=50,
        siz=50,
        con=50,
    )
    test_db.add(character)
    test_db.flush()

    # Create a game session
    session = GameSession(
        id=uuid.uuid4(),
        owner_id=user.id,
        character_id=character.id,
        name="Test Session",
        state="active",
    )
    test_db.add(session)
    test_db.flush()

    # Create a campaign
    campaign = Campaign(
        id=uuid.uuid4(),
        name="Test Campaign",
        keeper_id=user.id,
        invite_code="TEST1234",
    )
    test_db.add(campaign)
    test_db.flush()

    # Create an event
    event = Event(
        id=uuid.uuid4(),
        session_id=session.id,
        actor_player_id=user.id,
        actor_role="system",
        event_type=EventType.MESSAGE,
        payload={"text": "Test event"},
        visibility=VisibilityLevel.PUBLIC,
    )
    test_db.add(event)
    test_db.flush()

    return {
        "user": user,
        "character": character,
        "session": session,
        "campaign": campaign,
        "event": event,
    }


class TestLeadModel:
    """Test Lead model functionality."""

    def test_create_lead_minimal(self, test_session_with_leads, test_db):
        """Test creating a lead with minimal fields."""
        data = test_session_with_leads
        lead = Lead(
            session_id=data["session"].id,
            title="Investigate the library",
            description="Search for clues about the missing artifact.",
        )
        test_db.add(lead)
        test_db.commit()

        assert lead.id is not None
        assert lead.title == "Investigate the library"
        assert lead.description == "Search for clues about the missing artifact."
        assert lead.priority == LeadPriority.MEDIUM.value
        assert lead.type == LeadType.INVESTIGATE.value
        assert lead.status == LeadStatus.AVAILABLE.value
        assert lead.visibility == LeadVisibility.ALL.value
        assert lead.execution_method == LeadExecutionMethod.COMMAND.value

    def test_create_lead_full(self, test_session_with_leads, test_db):
        """Test creating a lead with all fields."""
        data = test_session_with_leads
        lead = Lead(
            session_id=data["session"].id,
            campaign_id=data["campaign"].id,
            source_event_id=data["event"].id,
            source_scene_id="scene_library",
            title="Talk to the librarian",
            description="Ask about recent visitors.",
            priority=LeadPriority.HIGH.value,
            type=LeadType.INTERACT.value,
            execution_method=LeadExecutionMethod.CHOICE.value,
            execution_data={"choices": ["ask_hours", "ask_visitors"]},
            visibility=LeadVisibility.SPECIFIC_PLAYER.value,
            visible_to_player_ids=[1, 2],
            status=LeadStatus.AVAILABLE.value,
            rewards=[{"type": "clue", "id": "clue_1"}],
            consequences=["alert_librarian"],
            narrative_on_complete="The librarian reveals important information.",
            created_by_player_id=data["user"].id,
            auto_generated="true",
            ai_generated="true",
            ai_confidence=85,
        )
        test_db.add(lead)
        test_db.commit()

        assert lead.campaign_id == data["campaign"].id
        assert lead.source_event_id == data["event"].id
        assert lead.priority == LeadPriority.HIGH.value
        assert lead.execution_method == LeadExecutionMethod.CHOICE.value
        assert lead.visibility == LeadVisibility.SPECIFIC_PLAYER.value
        assert lead.auto_generated == "true"
        assert lead.ai_generated == "true"
        assert lead.ai_confidence == 85

    def test_to_dict(self, test_session_with_leads, test_db):
        """Test Lead.to_dict() method."""
        data = test_session_with_leads
        lead = Lead(
            session_id=data["session"].id,
            title="Test Lead",
            description="Test description",
        )
        test_db.add(lead)
        test_db.commit()

        result = lead.to_dict()

        assert "id" in result
        assert result["title"] == "Test Lead"
        assert result["description"] == "Test description"
        assert result["priority"] == LeadPriority.MEDIUM.value
        assert result["status"] == LeadStatus.AVAILABLE.value
        assert isinstance(result["auto_generated"], bool)
        assert isinstance(result["ai_generated"], bool)

    def test_is_visible_to_all(self, test_session_with_leads, test_db):
        """Test visibility for 'all' leads."""
        data = test_session_with_leads
        lead = Lead(
            session_id=data["session"].id,
            title="Test Lead",
            description="Test description",
            visibility=LeadVisibility.ALL.value,
        )
        test_db.add(lead)
        test_db.commit()

        # Keeper sees all
        assert lead.is_visible_to(user_id=999, is_keeper=True) is True

        # Regular player sees all
        assert lead.is_visible_to(user_id=1, is_keeper=False) is True

    def test_is_visible_to_kp_only(self, test_session_with_leads, test_db):
        """Test visibility for 'kp_only' leads."""
        data = test_session_with_leads
        lead = Lead(
            session_id=data["session"].id,
            title="Secret Lead",
            description="Only keeper can see",
            visibility=LeadVisibility.KP_ONLY.value,
        )
        test_db.add(lead)
        test_db.commit()

        # Keeper sees all
        assert lead.is_visible_to(user_id=999, is_keeper=True) is True

        # Regular player doesn't see
        assert lead.is_visible_to(user_id=1, is_keeper=False) is False

    def test_is_visible_to_specific_player(self, test_session_with_leads, test_db):
        """Test visibility for 'specific_player' leads."""
        data = test_session_with_leads
        lead = Lead(
            session_id=data["session"].id,
            title="Private Lead",
            description="Only specific players can see",
            visibility=LeadVisibility.SPECIFIC_PLAYER.value,
            visible_to_player_ids=[1, 2, 3],
        )
        test_db.add(lead)
        test_db.commit()

        # Keeper sees all
        assert lead.is_visible_to(user_id=999, is_keeper=True) is True

        # Authorized player sees
        assert lead.is_visible_to(user_id=2, is_keeper=False) is True

        # Unauthorized player doesn't see
        assert lead.is_visible_to(user_id=999, is_keeper=False) is False

    def test_is_expired_by_time(self, test_session_with_leads, test_db):
        """Test lead expiration by time."""
        data = test_session_with_leads
        lead = Lead(
            session_id=data["session"].id,
            title="Time Limited Lead",
            description="Expires soon",
            expires_at=datetime.utcnow() - timedelta(hours=1),
        )
        test_db.add(lead)
        test_db.commit()

        assert lead.is_expired() is True

    def test_is_expired_by_status(self, test_session_with_leads, test_db):
        """Test lead expiration by status."""
        data = test_session_with_leads
        lead = Lead(
            session_id=data["session"].id,
            title="Expired Lead",
            description="Already expired",
            status=LeadStatus.EXPIRED.value,
        )
        test_db.add(lead)
        test_db.commit()

        assert lead.is_expired() is True

    def test_is_not_expired(self, test_session_with_leads, test_db):
        """Test lead that is not expired."""
        data = test_session_with_leads
        lead = Lead(
            session_id=data["session"].id,
            title="Valid Lead",
            description="Still available",
            expires_at=datetime.utcnow() + timedelta(hours=1),
        )
        test_db.add(lead)
        test_db.commit()

        assert lead.is_expired() is False

    def test_can_complete(self, test_session_with_leads, test_db):
        """Test which lead statuses can be completed."""
        data = test_session_with_leads

        # Available lead can be completed
        lead1 = Lead(
            session_id=data["session"].id,
            title="Available Lead",
            description="A lead that can be completed",
            status=LeadStatus.AVAILABLE.value,
        )
        test_db.add(lead1)
        test_db.commit()
        assert lead1.can_complete() is True

        # In-progress lead can be completed
        lead2 = Lead(
            session_id=data["session"].id,
            title="In Progress Lead",
            description="A lead that is in progress",
            status=LeadStatus.IN_PROGRESS.value,
        )
        test_db.add(lead2)
        test_db.commit()
        assert lead2.can_complete() is True

        # Completed lead cannot be completed again
        lead3 = Lead(
            session_id=data["session"].id,
            title="Completed Lead",
            description="A lead that is already completed",
            status=LeadStatus.COMPLETED.value,
        )
        test_db.add(lead3)
        test_db.commit()
        assert lead3.can_complete() is False

    def test_mark_completed(self, test_session_with_leads, test_db):
        """Test marking a lead as completed."""
        data = test_session_with_leads
        lead = Lead(
            session_id=data["session"].id,
            title="Test Lead",
            description="Test description",
            status=LeadStatus.AVAILABLE.value,
        )
        test_db.add(lead)
        test_db.commit()

        lead.mark_completed(player_id=data["user"].id)
        test_db.commit()

        assert lead.status == LeadStatus.COMPLETED.value
        assert lead.completed_at is not None
        assert lead.completed_by_player_id == data["user"].id

    def test_mark_failed(self, test_session_with_leads, test_db):
        """Test marking a lead as failed."""
        data = test_session_with_leads
        lead = Lead(
            session_id=data["session"].id,
            title="Test Lead",
            description="Test description",
            status=LeadStatus.AVAILABLE.value,
        )
        test_db.add(lead)
        test_db.commit()

        lead.mark_failed()
        test_db.commit()

        assert lead.status == LeadStatus.FAILED.value

    def test_mark_expired(self, test_session_with_leads, test_db):
        """Test marking a lead as expired."""
        data = test_session_with_leads
        lead = Lead(
            session_id=data["session"].id,
            title="Test Lead",
            description="Test description",
            status=LeadStatus.AVAILABLE.value,
        )
        test_db.add(lead)
        test_db.commit()

        lead.mark_expired()
        test_db.commit()

        assert lead.status == LeadStatus.EXPIRED.value

    def test_add_related_lead(self, test_session_with_leads, test_db):
        """Test adding related leads."""
        data = test_session_with_leads
        lead1 = Lead(
            session_id=data["session"].id,
            title="Parent Lead",
            description="Parent lead description",
        )
        test_db.add(lead1)
        test_db.flush()

        lead2 = Lead(
            session_id=data["session"].id,
            title="Related Lead",
            description="Related lead description",
        )
        test_db.add(lead2)
        test_db.flush()

        # Add related lead using the method
        lead1.add_related_lead(lead2.id)

        # Verify in-memory state before commit
        assert str(lead2.id) in lead1.related_lead_ids

        # Commit to save changes
        test_db.commit()

        # Query lead1 fresh from database
        lead1_from_db = (
            test_db.query(Lead)
            .filter(Lead.id == lead1.id)
            .first()
        )

        # Verify after database round-trip
        assert lead1_from_db is not None
        assert str(lead2.id) in lead1_from_db.related_lead_ids

    def test_parent_child_relationship(self, test_session_with_leads, test_db):
        """Test parent-child lead relationships."""
        data = test_session_with_leads
        parent_lead = Lead(
            session_id=data["session"].id,
            title="Parent Lead",
            description="Parent lead description",
        )
        test_db.add(parent_lead)
        test_db.flush()

        child_lead = Lead(
            session_id=data["session"].id,
            title="Child Lead",
            description="Child lead description",
            parent_lead_id=parent_lead.id,
        )
        test_db.add(child_lead)
        test_db.commit()

        assert child_lead.parent_lead_id == parent_lead.id


class TestLeadChoiceModel:
    """Test LeadChoice model functionality."""

    def test_create_lead_choice(self, test_session_with_leads, test_db):
        """Test creating a lead choice."""
        data = test_session_with_leads
        lead = Lead(
            session_id=data["session"].id,
            title="Lead with choices",
            description="Lead with multiple choice options",
            execution_method=LeadExecutionMethod.CHOICE.value,
        )
        test_db.add(lead)
        test_db.flush()

        choice = LeadChoice(
            lead_id=lead.id,
            choice_id="option_1",
            label="Ask about the book",
            description="Inquire about the rare book",
            target_scene_id="scene_library",
            display_order=1,
        )
        test_db.add(choice)
        test_db.commit()

        assert choice.id is not None
        assert choice.choice_id == "option_1"
        assert choice.label == "Ask about the book"
        assert choice.target_scene_id == "scene_library"
        assert choice.display_order == 1

    def test_lead_choice_to_dict(self, test_session_with_leads, test_db):
        """Test LeadChoice.to_dict() method."""
        data = test_session_with_leads
        lead = Lead(
            session_id=data["session"].id,
            title="Lead with choices",
            description="Lead for testing to_dict",
            execution_method=LeadExecutionMethod.CHOICE.value,
        )
        test_db.add(lead)
        test_db.flush()

        choice = LeadChoice(
            lead_id=lead.id,
            choice_id="option_1",
            label="Choice 1",
            requires_check={"skill": "spot_hidden", "difficulty": "regular"},
        )
        test_db.add(choice)
        test_db.commit()

        result = choice.to_dict()

        assert "id" in result
        assert result["choice_id"] == "option_1"
        assert result["label"] == "Choice 1"
        assert result["requires_check"]["skill"] == "spot_hidden"

    def test_lead_choices_relationship(self, test_session_with_leads, test_db):
        """Test the relationship between Lead and LeadChoice."""
        data = test_session_with_leads
        lead = Lead(
            session_id=data["session"].id,
            title="Lead with multiple choices",
            description="Lead with two choices",
            execution_method=LeadExecutionMethod.CHOICE.value,
        )
        test_db.add(lead)
        test_db.flush()

        choice1 = LeadChoice(
            lead_id=lead.id,
            choice_id="option_1",
            label="Option 1",
            display_order=1,
        )
        choice2 = LeadChoice(
            lead_id=lead.id,
            choice_id="option_2",
            label="Option 2",
            display_order=2,
        )
        test_db.add_all([choice1, choice2])
        test_db.commit()

        assert len(lead.choices) == 2
        assert lead.choices[0].choice_id == "option_1"
        assert lead.choices[1].choice_id == "option_2"


class TestLeadQuerying:
    """Test querying leads from the database."""

    def test_query_leads_by_session(self, test_session_with_leads, test_db):
        """Test querying leads by session ID."""
        data = test_session_with_leads

        lead1 = Lead(
            session_id=data["session"].id,
            title="Session Lead 1",
            description="First lead for session",
        )
        lead2 = Lead(
            session_id=data["session"].id,
            title="Session Lead 2",
            description="Second lead for session",
        )
        test_db.add_all([lead1, lead2])
        test_db.commit()

        leads = (
            test_db.query(Lead)
            .filter(Lead.session_id == data["session"].id)
            .all()
        )

        assert len(leads) == 2
        assert {lead.title for lead in leads} == {"Session Lead 1", "Session Lead 2"}

    def test_query_leads_by_status(self, test_session_with_leads, test_db):
        """Test querying leads by status."""
        data = test_session_with_leads

        lead1 = Lead(
            session_id=data["session"].id,
            title="Available Lead",
            description="Available lead",
            status=LeadStatus.AVAILABLE.value,
        )
        lead2 = Lead(
            session_id=data["session"].id,
            title="Completed Lead",
            description="Completed lead",
            status=LeadStatus.COMPLETED.value,
        )
        lead3 = Lead(
            session_id=data["session"].id,
            title="Another Available",
            description="Another available lead",
            status=LeadStatus.AVAILABLE.value,
        )
        test_db.add_all([lead1, lead2, lead3])
        test_db.commit()

        available_leads = (
            test_db.query(Lead)
            .filter(
                Lead.session_id == data["session"].id,
                Lead.status == LeadStatus.AVAILABLE.value,
            )
            .all()
        )

        assert len(available_leads) == 2

    def test_query_leads_by_priority(self, test_session_with_leads, test_db):
        """Test querying leads by priority."""
        data = test_session_with_leads

        lead1 = Lead(
            session_id=data["session"].id,
            title="Critical Lead",
            description="Critical priority lead",
            priority=LeadPriority.CRITICAL.value,
        )
        lead2 = Lead(
            session_id=data["session"].id,
            title="Low Priority Lead",
            description="Low priority lead",
            priority=LeadPriority.LOW.value,
        )
        test_db.add_all([lead1, lead2])
        test_db.commit()

        critical_leads = (
            test_db.query(Lead)
            .filter(
                Lead.session_id == data["session"].id,
                Lead.priority == LeadPriority.CRITICAL.value,
            )
            .all()
        )

        assert len(critical_leads) == 1
        assert critical_leads[0].title == "Critical Lead"

    def test_query_active_leads_only(self, test_session_with_leads, test_db):
        """Test querying only active (not expired/completed/failed) leads."""
        data = test_session_with_leads

        lead1 = Lead(
            session_id=data["session"].id,
            title="Available Lead",
            description="Available lead",
            status=LeadStatus.AVAILABLE.value,
        )
        lead2 = Lead(
            session_id=data["session"].id,
            title="In Progress Lead",
            description="In progress lead",
            status=LeadStatus.IN_PROGRESS.value,
        )
        lead3 = Lead(
            session_id=data["session"].id,
            title="Completed Lead",
            description="Completed lead",
            status=LeadStatus.COMPLETED.value,
        )
        lead4 = Lead(
            session_id=data["session"].id,
            title="Expired Lead",
            description="Expired lead",
            status=LeadStatus.EXPIRED.value,
        )
        test_db.add_all([lead1, lead2, lead3, lead4])
        test_db.commit()

        active_statuses = [
            LeadStatus.AVAILABLE.value,
            LeadStatus.IN_PROGRESS.value,
        ]
        active_leads = (
            test_db.query(Lead)
            .filter(
                Lead.session_id == data["session"].id,
                Lead.status.in_(active_statuses),
            )
            .all()
        )

        assert len(active_leads) == 2
