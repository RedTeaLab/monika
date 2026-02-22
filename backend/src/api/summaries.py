"""Summary API routes for M3 Memory Web milestone."""
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.core.auth import get_current_user
from src.core.database import get_db
from src.models.user import User
from src.models.session import GameSession
from src.models.summary import Summary, SummaryType
from src.services.summary import SummaryGenerator


router = APIRouter(prefix="/summaries", tags=["summaries"])


# Request/Response Schemas
class SummaryCreateRequest(BaseModel):
    """Request for creating a summary."""

    summary_type: str = Field(..., description="Type of summary: checkpoint, scene, or session")
    narrative_summary: str = Field(..., description="Narrative summary text")
    key_events: List[dict] = Field(default_factory=list, description="Key events")
    state_changes: List[dict] = Field(default_factory=list, description="State changes")
    discovered_clues: List[str] = Field(default_factory=list, description="Discovered clues")
    pending_promises: List[dict] = Field(default_factory=list, description="Pending promises")
    scene_id: Optional[str] = Field(None, description="Scene ID if applicable")
    scene_name: Optional[str] = Field(None, description="Scene name if applicable")
    checkpoint_id: Optional[str] = Field(None, description="Checkpoint ID if applicable")
    generated_by: str = Field("ai", description="Who generated: ai or manual")
    model_used: Optional[str] = Field(None, description="LLM model used")
    generation_method: Optional[str] = Field(None, description="Generation method")


class SummaryUpdateRequest(BaseModel):
    """Request for updating a summary."""

    narrative_summary: Optional[str] = None
    key_events: Optional[List[dict]] = None
    state_changes: Optional[List[dict]] = None
    discovered_clues: Optional[List[str]] = None
    pending_promises: Optional[List[dict]] = None
    user_rating: Optional[int] = Field(None, ge=1, le=5, description="User rating 1-5")
    user_feedback: Optional[str] = None


class SummaryResponse(BaseModel):
    """Response for a single summary."""

    id: str
    session_id: str
    checkpoint_id: Optional[str]
    summary_type: str
    time_range_start: Optional[str]
    time_range_end: Optional[str]
    narrative_summary: str
    key_events: List[dict]
    state_changes: List[dict]
    discovered_clues: List[str]
    pending_promises: List[dict]
    scene_id: Optional[str]
    scene_name: Optional[str]
    participant_character_ids: List[int]
    total_events: int
    event_counts: dict
    generated_by: str
    model_used: Optional[str]
    generation_method: Optional[str]
    user_rating: Optional[int]
    user_feedback: Optional[str]
    created_at: str
    updated_at: Optional[str]


class SummaryListResponse(BaseModel):
    """Response for list of summaries."""

    summaries: List[SummaryResponse]
    total: int


# Endpoints
@router.get("/{session_id}", response_model=SummaryListResponse)
def get_summaries(
    session_id: str,
    summary_type: Optional[str] = Query(None, description="Filter by summary type: checkpoint, scene, session"),
    start_date: Optional[datetime] = Query(None, description="Filter by start date (created_at >=)"),
    end_date: Optional[datetime] = Query(None, description="Filter by end date (created_at <=)"),
    limit: int = Query(20, ge=1, le=100, description="Maximum number of summaries"),
    offset: int = Query(0, ge=0, description="Number of summaries to skip"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get summaries for a session.

    Returns summaries ordered by creation time (newest first).
    Supports filtering by summary_type, start_date, and end_date.
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

    # Build query
    query = db.query(Summary).filter(
        Summary.session_id == session_uuid,
        Summary.is_deleted == "false"
    )

    if summary_type:
        query = query.filter(Summary.summary_type == summary_type)

    if start_date:
        query = query.filter(Summary.created_at >= start_date)

    if end_date:
        query = query.filter(Summary.created_at <= end_date)

    total = query.count()
    summaries = query.order_by(Summary.created_at.desc()).offset(offset).limit(limit).all()

    return SummaryListResponse(
        summaries=[s.to_dict() for s in summaries],
        total=total,
    )


@router.get("/{session_id}/{summary_id}", response_model=SummaryResponse)
def get_summary(
    session_id: str,
    summary_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a single summary by ID."""
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

    try:
        summary_uuid = uuid.UUID(summary_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid summary_id format",
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

    # Get summary
    summary = db.query(Summary).filter(
        Summary.id == summary_uuid,
        Summary.session_id == session_uuid,
        Summary.is_deleted == "false"
    ).first()

    if not summary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Summary not found",
        )

    return summary.to_dict()


@router.post("/{session_id}", response_model=SummaryResponse, status_code=status.HTTP_201_CREATED)
def create_summary(
    session_id: str,
    request: SummaryCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new summary for a session."""
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

    # Validate summary type
    try:
        summary_type = SummaryType(request.summary_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid summary_type: {request.summary_type}. Use: checkpoint, scene, or session",
        )

    # Parse checkpoint_id if provided
    checkpoint_uuid = None
    if request.checkpoint_id:
        try:
            checkpoint_uuid = uuid.UUID(request.checkpoint_id)
        except ValueError:
            pass

    # Create summary
    summary = Summary(
        session_id=session_uuid,
        checkpoint_id=checkpoint_uuid,
        summary_type=summary_type.value,
        narrative_summary=request.narrative_summary,
        key_events=request.key_events,
        state_changes=request.state_changes,
        discovered_clues=request.discovered_clues,
        pending_promises=request.pending_promises,
        scene_id=request.scene_id,
        scene_name=request.scene_name,
        participant_character_ids=[],
        total_events=0,
        generated_by=request.generated_by,
        model_used=request.model_used,
        generation_method=request.generation_method,
    )

    db.add(summary)
    db.commit()
    db.refresh(summary)

    return summary.to_dict()


@router.put("/{session_id}/{summary_id}", response_model=SummaryResponse)
def update_summary(
    session_id: str,
    summary_id: str,
    request: SummaryUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an existing summary."""
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

    try:
        summary_uuid = uuid.UUID(summary_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid summary_id format",
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

    # Get summary
    summary = db.query(Summary).filter(
        Summary.id == summary_uuid,
        Summary.session_id == session_uuid,
        Summary.is_deleted == "false"
    ).first()

    if not summary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Summary not found",
        )

    # Update fields
    if request.narrative_summary is not None:
        summary.narrative_summary = request.narrative_summary
    if request.key_events is not None:
        summary.key_events = request.key_events
    if request.state_changes is not None:
        summary.state_changes = request.state_changes
    if request.discovered_clues is not None:
        summary.discovered_clues = request.discovered_clues
    if request.pending_promises is not None:
        summary.pending_promises = request.pending_promises
    if request.user_rating is not None:
        summary.user_rating = request.user_rating
    if request.user_feedback is not None:
        summary.user_feedback = request.user_feedback

    db.commit()
    db.refresh(summary)

    return summary.to_dict()


@router.delete("/{session_id}/{summary_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_summary(
    session_id: str,
    summary_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Soft delete a summary."""
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format",
        )

    try:
        summary_uuid = uuid.UUID(summary_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid summary_id format",
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

    # Get summary
    summary = db.query(Summary).filter(
        Summary.id == summary_uuid,
        Summary.session_id == session_uuid,
        Summary.is_deleted == "false"
    ).first()

    if not summary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Summary not found",
        )

    # Soft delete
    summary.mark_deleted()
    db.commit()


@router.post("/{session_id}/generate", response_model=SummaryResponse)
def generate_session_summary(
    session_id: str,
    use_llm: bool = Query(False, description="Use LLM for narrative generation"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a session summary using the SummaryGenerator service."""
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

    # Generate summary
    generator = SummaryGenerator(db)
    session_summary = generator.generate_session_summary(session_uuid, use_llm=use_llm)

    # Create database summary
    summary = Summary(
        session_id=session_uuid,
        summary_type=SummaryType.SESSION.value,
        narrative_summary=session_summary.narrative_summary.detailed,
        key_events=[e.model_dump() for e in session_summary.key_events],
        state_changes=[],
        discovered_clues=list(session_summary.leads.discovered),
        pending_promises=[p.model_dump() for p in session_summary.promises],
        participant_character_ids=[],
        total_events=sum([
            session_summary.statistics.message_count,
            session_summary.statistics.roll_count,
            session_summary.statistics.combat_count,
        ]),
        generated_by="llm" if use_llm else "template",
    )

    db.add(summary)
    db.commit()
    db.refresh(summary)

    return summary.to_dict()


@router.get("/health")
def summaries_health():
    """Health check for summaries API."""
    return {"status": "ok", "service": "summaries"}
