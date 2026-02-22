"""Event API routes for game event log and audit trail."""

import csv
import io
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.core.auth import get_current_user
from src.core.database import get_db
from src.models.user import User
from src.models.session import GameSession
from src.services.events import EventLogger
from src.models.event import EventType, VisibilityLevel

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
        session_id = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

    # Verify session belongs to current user
    session = (
        db.query(GameSession)
        .filter(
            GameSession.id == session_id,
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
        session_id=session_id,
        actor_role=actor_role,
        event_type=parsed_event_type,
        limit=limit,
        offset=offset,
    )

    return [event.to_dict() for event in events]


# =============================================================================
# Export endpoint - must be defined BEFORE /{session_id} to avoid route conflicts
# =============================================================================
@router.get("/export/{session_id}")
def export_events(
    session_id: str,
    format: str = Query("json", description="Export format: json or csv"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    actor_role: Optional[str] = Query(None, description="Filter by actor role"),
    visibility: Optional[str] = Query(None, description="Filter by visibility"),
    character_id: Optional[int] = Query(None, description="Filter by character ID"),
    start_time: Optional[str] = Query(
        None, description="Filter events after this time (ISO format)"
    ),
    end_time: Optional[str] = Query(
        None, description="Filter events before this time (ISO format)"
    ),
    limit: int = Query(1000, ge=1, le=5000, description="Maximum number of events to export"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Export events for a session in various formats.

    Supports JSON and CSV export formats with filtering options.
    Returns all event fields in the export.
    """
    # Validate session_id format
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

    # Validate format
    if format not in ("json", "csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid format. Use 'json' or 'csv'.",
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

    # Parse visibility if provided
    parsed_visibility = None
    if visibility:
        try:
            parsed_visibility = VisibilityLevel(visibility)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid visibility: {visibility}",
            )

    # Parse time range if provided
    parsed_start_time = None
    if start_time:
        try:
            parsed_start_time = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid start_time format. Use ISO format.",
            )

    parsed_end_time = None
    if end_time:
        try:
            parsed_end_time = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid end_time format. Use ISO format.",
            )

    # Get events using the EventLogger service
    event_logger = EventLogger(db)
    events = event_logger.get_session_events(
        session_id=session_uuid,
        actor_role=actor_role,
        event_type=parsed_event_type,
        visibility=parsed_visibility,
        character_id=character_id,
        start_time=parsed_start_time,
        end_time=parsed_end_time,
        limit=limit,
        offset=0,
    )

    # Convert to dict format
    events_data = [e.to_dict() for e in events]

    if format == "json":
        # Return JSON response
        return {
            "session_id": str(session_uuid),
            "session_name": session.name,
            "total_events": len(events_data),
            "events": events_data,
            "export_time": datetime.utcnow().isoformat() + "Z",
        }
    else:
        # Return CSV response
        return StreamingResponse(
            content=_generate_csv(events_data),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=events_{session_id}.csv",
            },
        )


def _generate_csv(events: List[dict]) -> str:
    """Generate CSV content from events data."""
    if not events:
        # Return header only if no events
        return "id,session_id,actor_player_id,actor_role,character_id,event_type,category,payload,visibility,timestamp,description\n"

    output = io.StringIO()
    fieldnames = [
        "id",
        "session_id",
        "actor_player_id",
        "actor_role",
        "character_id",
        "event_type",
        "category",
        "payload",
        "visibility",
        "timestamp",
        "description",
    ]

    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()

    for event in events:
        # Convert payload dict to string for CSV
        row = event.copy()
        if isinstance(row.get("payload"), dict):
            row["payload"] = str(row["payload"])
        writer.writerow(row)

    return output.getvalue()


# =============================================================================
# Session-specific event endpoints
# =============================================================================


@router.get("/{session_id}")
def get_session_events(
    session_id: str,
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    actor_role: Optional[str] = Query(None, description="Filter by actor role"),
    visibility: Optional[str] = Query(None, description="Filter by visibility (public, kp)"),
    character_id: Optional[int] = Query(None, description="Filter by character ID"),
    start_time: Optional[str] = Query(
        None, description="Filter events after this time (ISO format)"
    ),
    end_time: Optional[str] = Query(
        None, description="Filter events before this time (ISO format)"
    ),
    sort_by: Optional[str] = Query(None, description="Sort field: timestamp, sequence, event_type"),
    sort_order: Optional[str] = Query(None, description="Sort order: asc or desc"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of events"),
    offset: int = Query(0, ge=0, description="Number of events to skip"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = (
        db.query(GameSession)
        .filter(
            GameSession.id == session_id,
            GameSession.owner_id == current_user.id,
        )
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    parsed_event_type = None
    if event_type:
        try:
            parsed_event_type = EventType(event_type)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid event_type: {event_type}",
            )

    parsed_visibility = None
    if visibility:
        try:
            parsed_visibility = VisibilityLevel(visibility)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid visibility: {visibility}",
            )

    parsed_start_time = None
    if start_time:
        try:
            parsed_start_time = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid start_time format. Use ISO format.",
            )

    parsed_end_time = None
    if end_time:
        try:
            parsed_end_time = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid end_time format. Use ISO format.",
            )

    resolved_sort_order = sort_order if sort_order else "desc"

    event_logger = EventLogger(db)
    try:
        result = event_logger.get_session_events(
            session_id=session_id,
            actor_role=actor_role,
            event_type=parsed_event_type,
            visibility=parsed_visibility,
            character_id=character_id,
            start_time=parsed_start_time,
            end_time=parsed_end_time,
            sort_by=sort_by,
            sort_order=resolved_sort_order,
            limit=limit,
            offset=offset,
            include_total=True,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    items = result["items"]
    total = result["total"]

    return {
        "items": [event.to_dict() for event in items],
        "pagination": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + limit < total,
        },
    }


@router.get("/{session_id}/{event_id}", response_model=EventListResponse)
def get_single_event(
    session_id: str,
    event_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a single event by ID within a session.

    Returns the event details if found and belongs to the session.
    """
    try:
        session_id = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

    try:
        event_uuid = uuid.UUID(event_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid event_id format",
        )

    # Verify session belongs to current user
    session = (
        db.query(GameSession)
        .filter(
            GameSession.id == session_id,
            GameSession.owner_id == current_user.id,
        )
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    # Get event
    event_logger = EventLogger(db)
    event = event_logger.get_event(event_uuid)

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # Verify event belongs to this session
    if event.session_id != session_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found in this session",
        )

    return event.to_dict()


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
        session_id = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

    # Verify session belongs to current user
    session = (
        db.query(GameSession)
        .filter(
            GameSession.id == session_id,
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
    summary = event_logger.create_summary(session_id)

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
        session_id = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

    # Verify session belongs to current user
    session = (
        db.query(GameSession)
        .filter(
            GameSession.id == session_id,
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
    state_changes = event_logger.get_state_changes(session_id)

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
