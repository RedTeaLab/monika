"""Session API routes for game session management."""

import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from sqlalchemy.orm import Session

from src.core.auth import get_current_user
from src.core.database import get_db
from src.models.user import User
from src.models.session import GameSession, SessionState
from src.models.character import Character

router = APIRouter(prefix="/sessions", tags=["sessions"])


# Request/Response Schemas
class SessionCreateRequest(BaseModel):
    """Request to create a new game session."""

    name: str = Field(..., min_length=1, max_length=200, description="Session name")
    module_id: Optional[str] = Field(None, description="Module/scenario ID")
    campaign_id: Optional[str] = Field(None, description="Campaign UUID (optional)")
    initial_scene: Optional[str] = Field(None, description="Starting scene ID")
    location: Optional[str] = Field(None, description="Initial location")


class SessionUpdateRequest(BaseModel):
    """Request to update a game session."""

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    current_scene_id: Optional[str] = None
    current_scene_name: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None


class SessionStateUpdateRequest(BaseModel):
    """Request to update session state (world/narrative)."""

    world_state: Optional[dict] = Field(None, description="World state updates")
    narrative_state: Optional[dict] = Field(None, description="Narrative state updates")


class SessionResponse(BaseModel):
    """Response with session data."""

    id: str
    name: str
    state: str
    campaign_id: Optional[str]
    module_id: Optional[str]
    current_scene_id: Optional[str]
    current_scene_name: Optional[str]
    location: Optional[str]
    world_state: dict
    character_states: dict
    narrative_state: dict
    started_at: Optional[str]
    paused_at: Optional[str]
    ended_at: Optional[str]
    notes: Optional[str]
    created_at: Optional[str]
    updated_at: Optional[str]


class SessionListResponse(BaseModel):
    """Response for session list."""

    id: str
    name: str
    state: str
    module_id: Optional[str]
    started_at: str
    updated_at: str


class SessionResumeResponse(BaseModel):
    """Response for session resume with full context."""

    session: SessionResponse
    characters: List[dict]
    recent_events: List[dict]


# Endpoints
@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def create_session(
    request: SessionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new game session.

    Creates a new game session that players can join.
    Optionally links to a campaign and starts at a specific scene.
    """
    session = GameSession(
        owner_id=current_user.id,
        name=request.name,
        module_id=request.module_id,
        campaign_id=uuid.UUID(request.campaign_id) if request.campaign_id else None,
        current_scene_id=request.initial_scene,
        location=request.location,
        state=SessionState.ACTIVE.value,
        world_state={},
        narrative_state={"leads": [], "clues": [], "promises": []},
    )

    db.add(session)
    db.commit()
    db.refresh(session)

    return session.to_dict()


@router.get("", response_model=List[SessionListResponse])
def list_sessions(
    state: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List game sessions for the current user.

    Can filter by state (active, paused, ended, archived).
    """
    query = db.query(GameSession).filter(GameSession.owner_id == current_user.id)

    if state:
        query = query.filter(GameSession.state == state)

    sessions = query.order_by(GameSession.updated_at.desc()).offset(offset).limit(limit).all()

    return [
        {
            "id": str(s.id),
            "name": s.name,
            "state": s.state,
            "module_id": s.module_id,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        }
        for s in sessions
    ]


@router.get("/{session_id}", response_model=SessionResponse)
def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get details of a specific game session.

    Includes world state, narrative state, and character state snapshots.
    """
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

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

    return session.to_dict()


@router.post("/{session_id}/resume", response_model=SessionResumeResponse)
def resume_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Resume a paused session.

    Returns the session data along with character states and recent events
    to help players remember where they left off.
    """
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

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

    if session.state == SessionState.ENDED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot resume an ended session",
        )

    # Update state to active if paused
    if session.state == SessionState.PAUSED.value:
        session.state = SessionState.ACTIVE.value
        session.paused_at = None
        db.commit()

    # Get characters involved in this session
    characters = db.query(Character).filter(Character.owner_id == current_user.id).all()

    # Get recent events (from the events service)
    # For now, return empty list - will be populated when events service is integrated
    recent_events = []

    return {
        "session": session.to_dict(),
        "characters": [
            {
                "id": c.id,
                "name": c.name,
                "hp": c.hp,
                "hp_max": c.hp_max,
                "san": c.san,
                "max_san": c.max_san,
                "luck": c.luck,
                "mp": c.mp,
                "mp_max": c.mp_max,
                "state_snapshot": session.get_character_state(c.id),
            }
            for c in characters
        ],
        "recent_events": recent_events,
    }


@router.post("/{session_id}/pause", response_model=SessionResponse)
def pause_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Pause an active session.

    Saves the current state so the session can be resumed later.
    """
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

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

    if session.state != SessionState.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot pause a session in state: {session.state}",
        )

    session.state = SessionState.PAUSED.value
    session.paused_at = datetime.utcnow()
    db.commit()
    db.refresh(session)

    return session.to_dict()


@router.post("/{session_id}/end", response_model=SessionResponse)
def end_session(
    session_id: str,
    notes: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """End a game session.

    Marks the session as ended and saves final notes.
    """
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

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

    if session.state == SessionState.ENDED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session is already ended",
        )

    session.state = SessionState.ENDED.value
    session.ended_at = datetime.utcnow()
    if notes:
        session.notes = (session.notes or "") + f"\n\nSession ended: {notes}"
    db.commit()
    db.refresh(session)

    return session.to_dict()


@router.patch("/{session_id}", response_model=SessionResponse)
def update_session(
    session_id: str,
    request: SessionUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update session metadata.

    Can update name, current scene, location, or notes.
    """
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

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

    if request.name is not None:
        session.name = request.name
    if request.current_scene_id is not None:
        session.current_scene_id = request.current_scene_id
    if request.current_scene_name is not None:
        session.current_scene_name = request.current_scene_name
    if request.location is not None:
        session.location = request.location
    if request.notes is not None:
        session.notes = request.notes

    db.commit()
    db.refresh(session)

    return session.to_dict()


@router.patch("/{session_id}/state", response_model=SessionResponse)
def update_session_state(
    session_id: str,
    request: SessionStateUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update session world or narrative state.

    Use this to update leads, clues, world conditions, etc.
    Changes are merged with existing state.
    """
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

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

    # Merge world state updates
    if request.world_state:
        if session.world_state is None:
            session.world_state = {}
        session.world_state = {**session.world_state, **request.world_state}

    # Merge narrative state updates
    if request.narrative_state:
        if session.narrative_state is None:
            session.narrative_state = {}
        session.narrative_state = {**session.narrative_state, **request.narrative_state}

    db.commit()
    db.refresh(session)

    return session.to_dict()


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a game session.

    Permanently deletes the session and all associated data.
    Use with caution - this cannot be undone.
    """
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

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

    db.delete(session)
    db.commit()

    return None


@router.get("/health")
def sessions_health():
    """Health check for sessions API."""
    return {"status": "ok", "service": "sessions"}


@router.get("/{session_id}/output-config", response_model=dict)
def get_output_config(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get output configuration for a session."""
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

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

    world_state = session.world_state or {}
    output_config = world_state.get("output_config", {})

    if not output_config:
        output_config = {
            "format": "normal",
            "max_length": None,
            "include_state_changes": True,
            "include_leads": True,
            "include_hints": True,
        }

    return output_config


@router.put("/{session_id}/output-config", response_model=dict)
def update_output_config(
    session_id: str,
    request: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update output configuration for a session."""
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

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

    world_state = session.world_state or {}
    world_state["output_config"] = request
    session.world_state = world_state
    db.commit()
    db.refresh(session)

    return request
