"""Leads API service for managing game leads and clues."""
import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime

from sqlalchemy.orm import Session

from src.models.lead import (
    Lead,
    LeadChoice,
    LeadPriority,
    LeadType,
    LeadStatus,
    LeadVisibility,
    LeadExecutionMethod,
)
from src.models.session import GameSession
from src.models.event import Event, EventType, VisibilityLevel


class LeadsService:
    """Service for managing leads in game sessions."""

    def __init__(self, db: Session):
        """Initialize the leads service.

        Args:
            db: Database session
        """
        self.db = db

    def create_lead(
        self,
        session_id: uuid.UUID,
        title: str,
        description: str,
        priority: str = LeadPriority.MEDIUM.value,
        type: str = LeadType.INVESTIGATE.value,
        execution_method: str = LeadExecutionMethod.COMMAND.value,
        execution_data: Optional[Dict[str, Any]] = None,
        visibility: str = LeadVisibility.ALL.value,
        visible_to_player_ids: Optional[List[int]] = None,
        rewards: Optional[List[Dict[str, Any]]] = None,
        consequences: Optional[List[str]] = None,
        narrative_on_complete: Optional[str] = None,
        narrative_on_fail: Optional[str] = None,
        expires_at: Optional[datetime] = None,
        expires_on_event_id: Optional[uuid.UUID] = None,
        expires_on_condition: Optional[str] = None,
        source_event_id: Optional[uuid.UUID] = None,
        source_scene_id: Optional[str] = None,
        created_by_player_id: Optional[int] = None,
        auto_generated: bool = False,
        ai_generated: bool = False,
        ai_confidence: Optional[int] = None,
        choices: Optional[List[Dict[str, Any]]] = None,
    ) -> Lead:
        """Create a new lead.

        Args:
            session_id: Session ID
            title: Lead title
            description: Lead description
            priority: Priority level (critical/high/medium/low)
            type: Lead type (investigate/interact/travel/combat/rest/custom)
            execution_method: How the lead is executed (command/choice/automatic)
            execution_data: Additional execution data
            visibility: Who can see this lead (all/kp/specific_player)
            visible_to_player_ids: List of player IDs who can see this lead
            rewards: List of rewards for completing the lead
            consequences: List of consequences
            narrative_on_complete: Narrative text when completed
            narrative_on_fail: Narrative text when failed
            expires_at: Optional expiration time
            expires_on_event_id: Optional event ID that triggers expiration
            expires_on_condition: Optional condition for expiration
            source_event_id: Event that created this lead
            source_scene_id: Scene where this lead was created
            created_by_player_id: Player who created this lead
            auto_generated: Whether this was auto-generated
            ai_generated: Whether this was AI-generated
            ai_confidence: AI confidence score (0-100)
            choices: List of choices for execution_method='choice'

        Returns:
            The created Lead object

        Raises:
            ValueError: If validation fails
        """
        # Validate session exists
        session = (
            self.db.query(GameSession)
            .filter(GameSession.id == session_id)
            .first()
        )

        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Validate priority
        try:
            LeadPriority(priority)
        except ValueError:
            raise ValueError(f"Invalid priority: {priority}")

        # Validate type
        try:
            LeadType(type)
        except ValueError:
            raise ValueError(f"Invalid type: {type}")

        # Validate execution_method
        try:
            LeadExecutionMethod(execution_method)
        except ValueError:
            raise ValueError(f"Invalid execution_method: {execution_method}")

        # Validate visibility
        try:
            LeadVisibility(visibility)
        except ValueError:
            raise ValueError(f"Invalid visibility: {visibility}")

        # Create the lead
        lead = Lead(
            session_id=session_id,
            campaign_id=session.campaign_id,
            title=title,
            description=description,
            priority=priority,
            type=type,
            execution_method=execution_method,
            execution_data=execution_data or {},
            visibility=visibility,
            visible_to_player_ids=visible_to_player_ids or [],
            status=LeadStatus.AVAILABLE.value,
            rewards=rewards or [],
            consequences=consequences or [],
            narrative_on_complete=narrative_on_complete,
            narrative_on_fail=narrative_on_fail,
            expires_at=expires_at,
            expires_on_event_id=expires_on_event_id,
            expires_on_condition=expires_on_condition,
            source_event_id=source_event_id,
            source_scene_id=source_scene_id,
            created_by_player_id=created_by_player_id,
            auto_generated="true" if auto_generated else "false",
            ai_generated="true" if ai_generated else "false",
            ai_confidence=ai_confidence,
        )

        self.db.add(lead)
        self.db.flush()

        # Create choices if provided
        if choices and execution_method == LeadExecutionMethod.CHOICE.value:
            for choice_data in choices:
                choice = LeadChoice(
                    lead_id=lead.id,
                    choice_id=choice_data.get("choice_id", ""),
                    label=choice_data.get("label", ""),
                    description=choice_data.get("description"),
                    target_scene_id=choice_data.get("target_scene_id"),
                    target_lead_id=choice_data.get("target_lead_id"),
                    condition=choice_data.get("condition"),
                    requires_check=choice_data.get("requires_check", {}),
                    consequences=choice_data.get("consequences", []),
                    narrative=choice_data.get("narrative"),
                    display_order=choice_data.get("display_order", 0),
                )
                self.db.add(choice)

        self.db.commit()
        self.db.refresh(lead)

        return lead

    def get_leads(
        self,
        session_id: uuid.UUID,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        type: Optional[str] = None,
        visibility: Optional[str] = None,
        user_id: Optional[int] = None,
        is_keeper: bool = False,
    ) -> List[Lead]:
        """Get leads for a session with optional filtering.

        Args:
            session_id: Session ID
            status: Filter by status
            priority: Filter by priority
            type: Filter by type
            visibility: Filter by visibility
            user_id: User ID for visibility check
            is_keeper: Whether the user is a keeper

        Returns:
            List of Lead objects
        """
        # Validate session exists
        session = (
            self.db.query(GameSession)
            .filter(GameSession.id == session_id)
            .first()
        )

        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Build query
        query = self.db.query(Lead).filter(Lead.session_id == session_id)

        # Apply filters
        if status:
            query = query.filter(Lead.status == status)

        if priority:
            query = query.filter(Lead.priority == priority)

        if type:
            query = query.filter(Lead.type == type)

        if visibility:
            query = query.filter(Lead.visibility == visibility)

        # Order by priority and created_at
        query = query.order_by(
            Lead.priority.desc(),
            Lead.created_at.asc(),
        )

        leads = query.all()

        # Filter by visibility if not keeper
        if not is_keeper and user_id is not None:
            leads = [lead for lead in leads if lead.is_visible_to(user_id, False)]

        return leads

    def get_lead_by_id(
        self,
        lead_id: uuid.UUID,
        user_id: Optional[int] = None,
        is_keeper: bool = False,
    ) -> Optional[Lead]:
        """Get a lead by ID.

        Args:
            lead_id: Lead ID
            user_id: User ID for visibility check
            is_keeper: Whether the user is a keeper

        Returns:
            Lead object or None if not found
        """
        lead = (
            self.db.query(Lead)
            .filter(Lead.id == lead_id)
            .first()
        )

        if not lead:
            return None

        # Check visibility
        if user_id and not is_keeper:
            if not lead.is_visible_to(user_id, False):
                return None

        return lead

    def update_lead_status(
        self,
        lead_id: uuid.UUID,
        status: str,
        completed_by_player_id: Optional[int] = None,
    ) -> Optional[Lead]:
        """Update a lead's status.

        Args:
            lead_id: Lead ID
            status: New status
            completed_by_player_id: Player who completed the lead (for completed status)

        Returns:
            Updated Lead object or None if not found

        Raises:
            ValueError: If validation fails
        """
        # Validate status
        try:
            LeadStatus(status)
        except ValueError:
            raise ValueError(f"Invalid status: {status}")

        lead = (
            self.db.query(Lead)
            .filter(Lead.id == lead_id)
            .first()
        )

        if not lead:
            return None

        # Update status
        lead.status = status

        # Set completion data if completing
        if status == LeadStatus.COMPLETED.value:
            lead.completed_at = datetime.utcnow()
            lead.completed_by_player_id = completed_by_player_id

        self.db.commit()
        self.db.refresh(lead)

        return lead

    def delete_lead(self, lead_id: uuid.UUID) -> bool:
        """Delete a lead.

        Args:
            lead_id: Lead ID

        Returns:
            True if deleted, False if not found
        """
        lead = (
            self.db.query(Lead)
            .filter(Lead.id == lead_id)
            .first()
        )

        if not lead:
            return False

        self.db.delete(lead)
        self.db.commit()

        return True

    def add_related_lead(
        self,
        lead_id: uuid.UUID,
        related_lead_id: uuid.UUID,
    ) -> Optional[Lead]:
        """Add a related lead to a lead.

        Args:
            lead_id: Lead ID
            related_lead_id: Related lead ID to add

        Returns:
            Updated Lead object or None if not found
        """
        lead = (
            self.db.query(Lead)
            .filter(Lead.id == lead_id)
            .first()
        )

        if not lead:
            return None

        # Verify related lead exists
        related_lead = (
            self.db.query(Lead)
            .filter(Lead.id == related_lead_id)
            .first()
        )

        if not related_lead:
            raise ValueError(f"Related lead {related_lead_id} not found")

        lead.add_related_lead(related_lead_id)
        self.db.commit()
        self.db.refresh(lead)

        return lead
