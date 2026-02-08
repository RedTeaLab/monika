"""Event API routes for game event log and audit trail."""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field

from sqlalchemy.orm import Session

from src.core.auth import get_current_user
from src.core.database import get_db
from src.models.user import User
from src.models.session import GameSession
from src.services.events import EventLogger
from src.models.event import EventType

router = APIRouter(prefix="/events", tags=["events"])


# Request/Response Schemas
class EventListResponse(BaseModel):
    """Response for event list."""

    id: str
    session_id: str
    actor_player_id: Optional[int]
    actor_role: str
    character_id: Optional[int]
    event_type: str
    payload: dict
    visibility: str
    timestamp: str
    parent_event_id: Optional[str]
    description: Optional[str]


class EventSummaryResponse(BaseModel):
    """Response for event summary."""

    total_events: int
    start_time: Optional[str]
    end_time: Optional[str]
    event_counts: dict
    recent_events: List[dict]


class StateChangesResponse(BaseModel):
    """Response for state changes grouped by type."""

    hp: List[EventListResponse]
    san: List[EventListResponse]
    luck: List[EventListResponse]
    mp: List[EventListResponse]


# Endpoints
@router.get("", response_model=List[EventListResponse])
def get_events(
    session_id: Optional[str] = Query(None, description="Filter by session ID"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    actor_role: Optional[str] = Query(None, description="Filter by actor role"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of events"),
    offset: int = Query(0, ge=0, description="Number of events to skip"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get events with optional filtering.

    Can filter by session, event type, and actor role.
    Returns events ordered by timestamp (newest first).
    """
    if not session_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="session_id is required",
        )

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

    # Parse event type if provided
    parsed_event_type = None
    if event_type:
        try:
            parsed_event_type = EventType(event_type)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid event_type: {event_type}",
            )

    # Get events using the EventLogger service
    event_logger = EventLogger(db)
    events = event_logger.get_session_events(
        session_id=session_uuid,
        actor_role=actor_role,
        event_type=parsed_event_type,
        limit=limit,
        offset=offset,
    )

    return [event.to_dict() for event in events]


@router.get("/summary/{session_id}", response_model=EventSummaryResponse)
def get_event_summary(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a summary of events for a session.

    Includes event counts, time range, and recent events.
    """
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

    # Get summary using the EventLogger service
    event_logger = EventLogger(db)
    summary = event_logger.create_summary(session_uuid)

    return summary


@router.get("/state-changes/{session_id}", response_model=StateChangesResponse)
def get_state_changes(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get state change events for a session.

    Groups HP, SAN, Luck, and MP changes separately.
    """
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

    # Get state changes using the EventLogger service
    event_logger = EventLogger(db)
    state_changes = event_logger.get_state_changes(session_uuid)

    # Convert events to dict format
    return {
        "hp": [e.to_dict() for e in state_changes.get("hp", [])],
        "san": [e.to_dict() for e in state_changes.get("san", [])],
        "luck": [e.to_dict() for e in state_changes.get("luck", [])],
        "mp": [e.to_dict() for e in state_changes.get("mp", [])],
    }


@router.get("/health")
def events_health():
    """Health check for events API."""
    return {"status": "ok", "service": "events"}
