"""Leads API routes for managing game leads and clues."""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field

from sqlalchemy.orm import Session

from src.core.auth import get_current_user
from src.core.database import get_db
from src.models.user import User
from src.models.session import GameSession
from src.models.lead import (
    Lead,
    LeadPriority,
    LeadType,
    LeadStatus,
    LeadVisibility,
    LeadExecutionMethod,
)
from src.services.leads import LeadsService

router = APIRouter(prefix="/leads", tags=["leads"])


# Request/Response Schemas
class LeadCreateRequest(BaseModel):
    """Request for creating a lead."""

    title: str = Field(..., min_length=1, max_length=200, description="Lead title")
    description: str = Field(..., min_length=1, description="Lead description")
    priority: str = Field("medium", description="Priority level")
    type: str = Field("investigate", description="Lead type")
    execution_method: str = Field("command", description="Execution method")
    execution_data: Optional[dict] = Field(None, description="Execution data")
    visibility: str = Field("all", description="Visibility setting")
    visible_to_player_ids: Optional[List[int]] = Field(None, description="Player IDs who can see this lead")
    rewards: Optional[List[dict]] = Field(None, description="Rewards for completion")
    consequences: Optional[List[str]] = Field(None, description="Consequences")
    narrative_on_complete: Optional[str] = Field(None, description="Narrative on complete")
    narrative_on_fail: Optional[str] = Field(None, description="Narrative on fail")
    expires_at: Optional[str] = Field(None, description="Expiration time (ISO format)")
    expires_on_event_id: Optional[str] = Field(None, description="Event ID that triggers expiration")
    expires_on_condition: Optional[str] = Field(None, description="Expiration condition")
    source_event_id: Optional[str] = Field(None, description="Source event ID")
    source_scene_id: Optional[str] = Field(None, description="Source scene ID")
    auto_generated: bool = Field(False, description="Auto-generated flag")
    ai_generated: bool = Field(False, description="AI-generated flag")
    ai_confidence: Optional[int] = Field(None, ge=0, le=100, description="AI confidence score")
    choices: Optional[List[dict]] = Field(None, description="Choices for choice execution")


class LeadChoiceSchema(BaseModel):
    """Schema for lead choice."""

    id: str
    lead_id: str
    choice_id: str
    label: str
    description: Optional[str]
    target_scene_id: Optional[str]
    target_lead_id: Optional[str]
    condition: Optional[str]
    requires_check: dict
    consequences: List[str]
    narrative: Optional[str]
    display_order: int


class LeadResponse(BaseModel):
    """Response for a lead."""

    id: str
    session_id: str
    campaign_id: Optional[str]
    source_event_id: Optional[str]
    source_scene_id: Optional[str]
    title: str
    description: str
    priority: str
    type: str
    execution_method: str
    execution_data: dict
    visibility: str
    visible_to_player_ids: List[int]
    status: str
    expires_on_event_id: Optional[str]
    expires_on_condition: Optional[str]
    expires_at: Optional[str]
    completed_at: Optional[str]
    completed_by_player_id: Optional[int]
    rewards: List[dict]
    consequences: List[str]
    narrative_on_complete: Optional[str]
    narrative_on_fail: Optional[str]
    related_lead_ids: List[str]
    parent_lead_id: Optional[str]
    created_by_player_id: Optional[int]
    auto_generated: bool
    ai_generated: bool
    ai_confidence: Optional[int]
    created_at: str
    updated_at: str
    choices: Optional[List[LeadChoiceSchema]] = None


class LeadStatusUpdateRequest(BaseModel):
    """Request for updating lead status."""

    status: str = Field(..., description="New status")


class LeadListResponse(BaseModel):
    """Response for lead list."""

    leads: List[LeadResponse]
    total: int


# Endpoints
@router.post("", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
def create_lead(
    session_id: str = Query(..., description="Session ID"),
    lead_data: LeadCreateRequest = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new lead for a session."""
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

    # Verify session belongs to current user
    session = (
        db.query(GameSession)
        .filter(
            GameSession.id == session_uuid,
            GameSession.owner_id == current_user.id,
        )
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    # Parse expires_at if provided
    expires_at = None
    if lead_data.expires_at:
        try:
            from datetime import datetime
            expires_at = datetime.fromisoformat(lead_data.expires_at.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid expires_at format. Use ISO 8601 format.",
            )

    # Parse UUIDs
    source_event_id = None
    if lead_data.source_event_id:
        try:
            source_event_id = uuid.UUID(lead_data.source_event_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid source_event_id format",
            )

    expires_on_event_id = None
    if lead_data.expires_on_event_id:
        try:
            expires_on_event_id = uuid.UUID(lead_data.expires_on_event_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid expires_on_event_id format",
            )

    # Create lead using service
    service = LeadsService(db)
    lead = service.create_lead(
        session_id=session_uuid,
        title=lead_data.title,
        description=lead_data.description,
        priority=lead_data.priority,
        type=lead_data.type,
        execution_method=lead_data.execution_method,
        execution_data=lead_data.execution_data,
        visibility=lead_data.visibility,
        visible_to_player_ids=lead_data.visible_to_player_ids,
        rewards=lead_data.rewards,
        consequences=lead_data.consequences,
        narrative_on_complete=lead_data.narrative_on_complete,
        narrative_on_fail=lead_data.narrative_on_fail,
        expires_at=expires_at,
        expires_on_event_id=expires_on_event_id,
        expires_on_condition=lead_data.expires_on_condition,
        source_event_id=source_event_id,
        source_scene_id=lead_data.source_scene_id,
        created_by_player_id=current_user.id,
        auto_generated=lead_data.auto_generated,
        ai_generated=lead_data.ai_generated,
        ai_confidence=lead_data.ai_confidence,
        choices=lead_data.choices,
    )

    return _lead_to_response(lead)


@router.get("", response_model=List[LeadResponse])
def get_leads(
    session_id: str = Query(..., description="Session ID"),
    status: Optional[str] = Query(None, description="Filter by status"),
    priority: Optional[str] = Query(None, description="Filter by priority"),
    type: Optional[str] = Query(None, description="Filter by type"),
    visibility: Optional[str] = Query(None, description="Filter by visibility"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get leads for a session with optional filtering."""
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

    # Verify session exists
    session = (
        db.query(GameSession)
        .filter(GameSession.id == session_uuid)
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    # Get leads using service
    service = LeadsService(db)
    leads = service.get_leads(
        session_id=session_uuid,
        status=status,
        priority=priority,
        type=type,
        visibility=visibility,
        user_id=current_user.id,
        is_keeper=False,  # TODO: Implement role check
    )

    return [_lead_to_response(lead) for lead in leads]


@router.get("/{lead_id}", response_model=LeadResponse)
def get_lead(
    lead_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific lead by ID."""
    try:
        lead_uuid = uuid.UUID(lead_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid lead_id format",
        )

    service = LeadsService(db)
    lead = service.get_lead_by_id(
        lead_id=lead_uuid,
        user_id=current_user.id,
        is_keeper=False,  # TODO: Implement role check
    )

    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found",
        )

    return _lead_to_response(lead)


@router.patch("/{lead_id}/status", response_model=LeadResponse)
def update_lead_status(
    lead_id: str,
    status_update: LeadStatusUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a lead's status."""
    try:
        lead_uuid = uuid.UUID(lead_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid lead_id format",
        )

    service = LeadsService(db)
    lead = service.update_lead_status(
        lead_id=lead_uuid,
        status=status_update.status,
        completed_by_player_id=current_user.id,
    )

    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found",
        )

    return _lead_to_response(lead)


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lead(
    lead_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a lead."""
    try:
        lead_uuid = uuid.UUID(lead_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid lead_id format",
        )

    service = LeadsService(db)
    deleted = service.delete_lead(lead_id=lead_uuid)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found",
        )


@router.post("/{lead_id}/related", response_model=LeadResponse)
def add_related_lead(
    lead_id: str,
    related_lead_id: str = Query(..., description="Related lead ID to add"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a related lead to this lead."""
    try:
        lead_uuid = uuid.UUID(lead_id)
        related_uuid = uuid.UUID(related_lead_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid lead_id format",
        )

    service = LeadsService(db)
    lead = service.add_related_lead(
        lead_id=lead_uuid,
        related_lead_id=related_uuid,
    )

    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found",
        )

    return _lead_to_response(lead)


@router.get("/health")
def leads_health():
    """Health check for leads API."""
    return {"status": "ok", "service": "leads"}


def _lead_to_response(lead: Lead) -> dict:
    """Convert Lead model to response dict."""
    from sqlalchemy.orm import selectinload

    # Load choices if not already loaded
    if not hasattr(lead, 'choices') or lead.choices is None:
        # We need to query with choices
        pass

    response = lead.to_dict()

    # Add choices if available
    if hasattr(lead, 'choices') and lead.choices:
        response['choices'] = [
            {
                "id": str(choice.id),
                "lead_id": str(choice.lead_id),
                "choice_id": choice.choice_id,
                "label": choice.label,
                "description": choice.description,
                "target_scene_id": choice.target_scene_id,
                "target_lead_id": str(choice.target_lead_id) if choice.target_lead_id else None,
                "condition": choice.condition,
                "requires_check": choice.requires_check or {},
                "consequences": choice.consequences or [],
                "narrative": choice.narrative,
                "display_order": choice.display_order,
            }
            for choice in lead.choices
        ]

    return response
