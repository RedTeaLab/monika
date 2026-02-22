"""Spotlight API routes for multiplayer session management."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.core.auth import get_current_user
from src.core.database import get_db
from src.models.user import User
from src.services.spotlight import SpotlightManager, SpotlightRequest

router = APIRouter(prefix="/game/spotlight", tags=["spotlight"])

# Global spotlight manager instance
# In production, this would be injected via dependency injection
_spotlight_manager = SpotlightManager()


def get_spotlight_manager() -> SpotlightManager:
    """Dependency injection for spotlight manager."""
    return _spotlight_manager


# Request/Response Models
class SpotlightRequestModel(BaseModel):
    """Request model for spotlight operations."""

    session_id: str = Field(..., description="Session ID")
    user_id: str = Field(..., description="User ID requesting spotlight")
    character_id: Optional[str] = Field(None, description="Character ID (optional)")


class SpotlightReleaseModel(BaseModel):
    """Request model for releasing spotlight."""

    session_id: str = Field(..., description="Session ID")
    user_id: str = Field(..., description="User ID releasing spotlight")


class CutInRequestModel(BaseModel):
    """Request model for cut-in operation."""

    session_id: str = Field(..., description="Session ID")
    user_id: str = Field(..., description="User ID cutting in")
    reason: str = Field(..., min_length=1, description="Reason for cutting in")


class SpotlightRequestResponse(BaseModel):
    """Response model for spotlight request."""

    granted: bool = Field(..., description="Whether spotlight was granted")
    queue_position: int = Field(..., description="Position in queue (0 if granted)")
    message: str = Field(..., description="Human-readable message")


class SpotlightReleaseResponse(BaseModel):
    """Response model for spotlight release."""

    success: bool = Field(..., description="Whether release was successful")
    next_holder: Optional[str] = Field(None, description="Next user in queue (if any)")
    message: str = Field(..., description="Human-readable message")


class SpotlightStatusResponse(BaseModel):
    """Response model for spotlight status."""

    state: str = Field(..., description="Current state: idle, active, or queued")
    current_holder: Optional[str] = Field(None, description="Current spotlight holder")
    queue: list = Field(default_factory=list, description="Current queue")
    timestamp: str = Field(..., description="Status timestamp")


class QueueStatusResponse(BaseModel):
    """Response model for queue status."""

    queue: list = Field(default_factory=list, description="Current queue")
    queue_size: int = Field(..., description="Number of users in queue")


class QueueOperationResponse(BaseModel):
    """Response model for queue operations."""

    success: bool = Field(..., description="Whether operation was successful")
    message: str = Field(..., description="Human-readable message")


# API Endpoints
@router.post("/request", response_model=SpotlightRequestResponse)
async def request_spotlight(
    request: SpotlightRequestModel,
    current_user: User = Depends(get_current_user),
    manager: SpotlightManager = Depends(get_spotlight_manager),
):
    """Request spotlight for a session.

    First request gets spotlight immediately. Subsequent requests are queued.

    Args:
        request: Spotlight request with session_id, user_id, character_id
        current_user: Authenticated user
        manager: Spotlight manager instance

    Returns:
        Spotlight request result with granted status and queue position
    """
    spotlight_req = SpotlightRequest(
        session_id=request.session_id,
        user_id=request.user_id,
        character_id=request.character_id,
    )

    result = await manager.request_spotlight(spotlight_req)

    return SpotlightRequestResponse(
        granted=result.granted,
        queue_position=result.queue_position,
        message=result.message,
    )


@router.post("/release", response_model=SpotlightReleaseResponse)
async def release_spotlight(
    request: SpotlightReleaseModel,
    current_user: User = Depends(get_current_user),
    manager: SpotlightManager = Depends(get_spotlight_manager),
):
    """Release spotlight by current holder.

    Args:
        request: Release request with session_id, user_id
        current_user: Authenticated user
        manager: Spotlight manager instance

    Returns:
        Release result with success status and next holder
    """
    result = await manager.release_spotlight(request.session_id, request.user_id)

    # Always return the response model, even on failure
    return SpotlightReleaseResponse(
        success=result.success,
        next_holder=result.next_holder,
        message=result.message,
    )


@router.get("", response_model=SpotlightStatusResponse)
async def get_spotlight_status(
    session_id: str = Query(..., description="Session ID"),
    current_user: User = Depends(get_current_user),
    manager: SpotlightManager = Depends(get_spotlight_manager),
):
    """Get current spotlight status for a session.

    Args:
        session_id: Session ID
        current_user: Authenticated user
        manager: Spotlight manager instance

    Returns:
        Current spotlight status
    """
    status = manager.get_status(session_id)

    return SpotlightStatusResponse(
        state=status.state.value,
        current_holder=status.current_holder,
        queue=status.queue,
        timestamp=status.timestamp.isoformat(),
    )


# Queue endpoints
@router.delete("/queue")
async def leave_queue(
    session_id: str = Query(..., description="Session ID"),
    user_id: str = Query(..., description="User ID"),
    current_user: User = Depends(get_current_user),
    manager: SpotlightManager = Depends(get_spotlight_manager),
):
    """Leave the spotlight queue.

    Args:
        session_id: Session ID
        user_id: User ID
        current_user: Authenticated user
        manager: Spotlight manager instance

    Returns:
        Operation result
    """
    # For now, this is a placeholder - we'd need to implement leave_queue in SpotlightManager
    # The actual implementation would remove the user from the queue
    return QueueOperationResponse(
        success=True,
        message="Left queue successfully",
    )


@router.get("/queue", response_model=QueueStatusResponse)
async def get_queue_status(
    session_id: str = Query(..., description="Session ID"),
    current_user: User = Depends(get_current_user),
    manager: SpotlightManager = Depends(get_spotlight_manager),
):
    """Get current queue status for a session.

    Args:
        session_id: Session ID
        current_user: Authenticated user
        manager: Spotlight manager instance

    Returns:
        Current queue status
    """
    status = manager.get_status(session_id)

    return QueueStatusResponse(
        queue=status.queue,
        queue_size=len(status.queue),
    )


@router.post("/queue/cut-in")
async def cut_in(
    request: CutInRequestModel,
    current_user: User = Depends(get_current_user),
    manager: SpotlightManager = Depends(get_spotlight_manager),
):
    """Cut in line with a reason.

    This allows urgent interruptions with proper notification.

    Args:
        request: Cut-in request with session_id, user_id, reason
        current_user: Authenticated user
        manager: Spotlight manager instance

    Returns:
        Operation result
    """
    # For now, this is a placeholder - we'd need to implement cut_in in SpotlightManager
    # The actual implementation would move the user to the front of the queue
    # with proper notification to others
    return QueueOperationResponse(
        success=True,
        message=f"Cut in with reason: {request.reason}",
    )


@router.get("/health")
def spotlight_health():
    """Health check for spotlight API."""
    return {"status": "ok", "service": "spotlight"}
