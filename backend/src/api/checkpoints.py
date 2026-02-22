"""Checkpoint API routes for session state management."""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from sqlalchemy.orm import Session

from src.core.auth import get_current_user
from src.core.database import get_db
from src.models.user import User
from src.services.session import SessionService, Checkpoint, ConflictResolution

router = APIRouter(prefix="/checkpoints", tags=["checkpoints"])


# Request/Response Schemas
class CheckpointCreateRequest(BaseModel):
    """Request to create a checkpoint."""

    session_id: str = Field(..., description="Session UUID")
    notes: Optional[str] = Field(None, description="Optional notes for the checkpoint")


class CheckpointResponse(BaseModel):
    """Response with checkpoint data."""

    id: str
    session_id: str
    timestamp: str
    session_state: dict
    character_states: dict
    event_id: Optional[str]
    notes: Optional[str]


class CheckpointListResponse(BaseModel):
    """Response for checkpoint list."""

    checkpoints: List[CheckpointResponse]


class ResumeRequest(BaseModel):
    """Request to resume a session."""

    session_id: str = Field(..., description="Session UUID")
    conflict_resolution: Optional[str] = Field(
        "keep_latest",
        description="Conflict resolution strategy: keep_checkpoint, keep_latest, or merge"
    )


class ResumeResponse(BaseModel):
    """Response for session resume."""

    success: bool
    session: Optional[dict]
    checkpoint: Optional[CheckpointResponse]
    new_events: List[dict]
    conflicts: List[dict]
    message: str


# Endpoints
@router.post("", response_model=CheckpointResponse, status_code=status.HTTP_201_CREATED)
def create_checkpoint(
    request: CheckpointCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a manual checkpoint for a session.

    Saves the current session state including scene, world state,
    and character states for later recovery.
    """
    try:
        session_uuid = uuid.UUID(request.session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

    service = SessionService(db)

    try:
        checkpoint = service.create_checkpoint(
            session_uuid,
            current_user.id,
            notes=request.notes,
        )
        return checkpoint.to_dict()
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.get("/{session_id}", response_model=CheckpointListResponse)
def list_checkpoints(
    session_id: str,
    limit: int = 10,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List checkpoints for a session.

    Returns checkpoints for a session, newest first.
    """
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

    service = SessionService(db)
    checkpoints = service.get_checkpoints(session_uuid, limit)

    return {
        "checkpoints": [cp.to_dict() for cp in checkpoints]
    }


@router.get("/{session_id}/latest", response_model=CheckpointResponse)
def get_latest_checkpoint(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the latest checkpoint for a session.

    Returns the most recent checkpoint state.
    """
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

    service = SessionService(db)
    checkpoint = service.get_latest_checkpoint(session_uuid)

    if not checkpoint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No checkpoint found for session",
        )

    return checkpoint.to_dict()


@router.post("/resume", response_model=ResumeResponse)
def resume_from_checkpoint(
    request: ResumeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Resume a session from checkpoint.

    Loads the session from checkpoint and handles any conflicts
    with events that occurred after the checkpoint.
    """
    try:
        session_uuid = uuid.UUID(request.session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

    # Parse conflict resolution
    try:
        resolution = ConflictResolution(request.conflict_resolution or "keep_latest")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid conflict_resolution. Must be: keep_checkpoint, keep_latest, or merge",
        )

    service = SessionService(db)
    result = service.resume_session(
        session_uuid,
        current_user.id,
        resolution=resolution,
    )

    return result.to_dict()


@router.get("/health")
def checkpoints_health():
    """Health check for checkpoints API."""
    return {"status": "ok", "service": "checkpoints"}
