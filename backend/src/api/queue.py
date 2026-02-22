"""Message Queue and Session Snapshot API routes."""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field

from src.core.auth import get_current_user
from src.models.user import User
from src.services.message_queue import MessageQueue, ProcessResult
from src.services.session_snapshot import SessionSnapshotService, RecoveryResult

router = APIRouter(prefix="/game/queue", tags=["queue"])

# Separate router for recovery (will be registered separately in main.py)
router_recover = APIRouter(prefix="/game/recover", tags=["recovery"])

# Global service instances
_message_queue = MessageQueue()
_snapshot_service = SessionSnapshotService()


def get_message_queue() -> MessageQueue:
    """Dependency injection for message queue."""
    return _message_queue


def get_snapshot_service() -> SessionSnapshotService:
    """Dependency injection for snapshot service."""
    return _snapshot_service


# Request/Response Models
class EnqueueMessageRequest(BaseModel):
    """Request model for enqueuing a message."""
    session_id: str = Field(..., description="Session ID")
    user_id: str = Field(..., description="User ID")
    content: str = Field(..., min_length=1, description="Message content")
    visibility: str = Field("public", description="Visibility level")
    visible_to: List[str] = Field(default_factory=list, description="Users who can see private messages")


class EnqueueMessageResponse(BaseModel):
    """Response model for enqueue."""
    success: bool = Field(..., description="Whether enqueue was successful")
    message_id: str = Field(..., description="Enqueued message ID")
    queue_position: int = Field(..., description="Position in queue")
    message: str = Field(..., description="Human-readable message")


class QueueStatusResponse(BaseModel):
    """Response model for queue status."""
    session_id: str = Field(..., description="Session ID")
    queue_size: int = Field(..., description="Number of messages in queue")
    processing: bool = Field(..., description="Whether queue is being processed")
    version: int = Field(..., description="Queue version for conflict detection")


class ProcessQueueResponse(BaseModel):
    """Response model for queue processing."""
    processed_count: int = Field(..., description="Number of messages processed")
    failed_count: int = Field(..., description="Number of messages that failed")
    message: str = Field(..., description="Human-readable message")


class CreateSnapshotRequest(BaseModel):
    """Request model for creating snapshot."""
    session_id: str = Field(..., description="Session ID")
    state: dict = Field(..., description="Current session state")
    message_count: int = Field(0, description="Number of messages to include")


class CreateSnapshotResponse(BaseModel):
    """Response model for snapshot creation."""
    snapshot_id: str = Field(..., description="Snapshot ID")
    session_id: str = Field(..., description="Session ID")
    state: dict = Field(..., description="Snapshot state")
    timestamp: str = Field(..., description="Snapshot timestamp")


class GetSnapshotResponse(BaseModel):
    """Response model for getting snapshot."""
    snapshot_id: str = Field(..., description="Snapshot ID")
    session_id: str = Field(..., description="Session ID")
    state: dict = Field(..., description="Snapshot state")
    message_count: int = Field(..., description="Number of messages in snapshot")
    timestamp: str = Field(..., description="Snapshot timestamp")


class RecoverSessionRequest(BaseModel):
    """Request model for session recovery."""
    session_id: str = Field(..., description="Session ID")
    last_message_id: Optional[str] = Field(None, description="Last message ID received")


class RecoverSessionResponse(BaseModel):
    """Response model for session recovery."""
    success: bool = Field(..., description="Whether recovery was successful")
    state: dict = Field(..., description="Recovered session state")
    missed_messages: List[dict] = Field(..., description="Messages client missed")
    snapshot_id: str = Field(..., description="Snapshot ID used for recovery")
    message: str = Field(..., description="Human-readable message")


# Message Queue Endpoints
@router.post("", response_model=EnqueueMessageResponse)
async def enqueue_message(
    request: EnqueueMessageRequest,
    current_user: User = Depends(get_current_user),
    queue: MessageQueue = Depends(get_message_queue),
):
    """Enqueue a message for processing.

    Args:
        request: Enqueue request
        current_user: Authenticated user
        queue: Message queue service

    Returns:
        Enqueue result
    """
    result = await queue.enqueue({
        "session_id": request.session_id,
        "user_id": request.user_id,
        "content": request.content,
        "visibility": request.visibility,
        "visible_to": request.visible_to,
    })

    return EnqueueMessageResponse(
        success=result.success,
        message_id=result.message_id,
        queue_position=result.queue_position,
        message=result.message,
    )


@router.get("/status", response_model=QueueStatusResponse)
async def get_queue_status(
    session_id: str = Query(..., description="Session ID"),
    current_user: User = Depends(get_current_user),
    queue: MessageQueue = Depends(get_message_queue),
):
    """Get current queue status.

    Args:
        session_id: Session ID
        current_user: Authenticated user
        queue: Message queue service

    Returns:
        Queue status
    """
    status = queue.get_status(session_id)

    return QueueStatusResponse(
        session_id=session_id,
        queue_size=status.queue_size,
        processing=status.processing,
        version=status.version,
    )


@router.post("/process", response_model=ProcessQueueResponse)
async def process_queue(
    session_id: str = Query(..., description="Session ID"),
    current_user: User = Depends(get_current_user),
    queue: MessageQueue = Depends(get_message_queue),
):
    """Process all messages in the queue.

    Args:
        session_id: Session ID
        current_user: Authenticated user
        queue: Message queue service

    Returns:
        Processing result
    """
    async def handler(msg):
        # Default handler - just process the message
        # In production, this would integrate with the message system
        return True

    result = await queue.process(session_id, handler)

    return ProcessQueueResponse(
        processed_count=result.processed_count,
        failed_count=result.failed_count,
        message=result.message,
    )


@router.delete("")
async def clear_queue(
    session_id: str = Query(..., description="Session ID"),
    current_user: User = Depends(get_current_user),
    queue: MessageQueue = Depends(get_message_queue),
):
    """Clear all messages from the queue.

    Args:
        session_id: Session ID
        current_user: Authenticated user
        queue: Message queue service

    Returns:
        Success confirmation
    """
    queue.clear(session_id)
    return {"success": True, "message": "Queue cleared"}


# Session Snapshot Endpoints
@router.post("/snapshots", response_model=CreateSnapshotResponse, status_code=status.HTTP_201_CREATED)
async def create_snapshot(
    request: CreateSnapshotRequest,
    current_user: User = Depends(get_current_user),
    snapshot_service: SessionSnapshotService = Depends(get_snapshot_service),
):
    """Create a session snapshot.

    Args:
        request: Snapshot creation request
        current_user: Authenticated user
        snapshot_service: Snapshot service

    Returns:
        Created snapshot
    """
    snapshot = snapshot_service.create_snapshot(
        session_id=request.session_id,
        state=request.state,
    )

    return CreateSnapshotResponse(
        snapshot_id=snapshot.id,
        session_id=snapshot.session_id,
        state=snapshot.state,
        timestamp=snapshot.timestamp.isoformat(),
    )


@router.get("/snapshots", response_model=GetSnapshotResponse)
async def get_snapshot(
    session_id: str = Query(..., description="Session ID"),
    current_user: User = Depends(get_current_user),
    snapshot_service: SessionSnapshotService = Depends(get_snapshot_service),
):
    """Get the latest snapshot for a session.

    Args:
        session_id: Session ID
        current_user: Authenticated user
        snapshot_service: Snapshot service

    Returns:
        Latest snapshot

    Raises:
        HTTPException: If no snapshot found
    """
    snapshot = snapshot_service.get_latest_snapshot(session_id)

    if snapshot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No snapshot found for session"
        )

    return GetSnapshotResponse(
        snapshot_id=snapshot.id,
        session_id=snapshot.session_id,
        state=snapshot.state,
        message_count=snapshot.message_count,
        timestamp=snapshot.timestamp.isoformat(),
    )


@router.post("/recover", response_model=RecoverSessionResponse)
async def recover_session(
    request: RecoverSessionRequest,
    current_user: User = Depends(get_current_user),
    snapshot_service: SessionSnapshotService = Depends(get_snapshot_service),
):
    """Recover a session from snapshot.

    Args:
        request: Recovery request
        current_user: Authenticated user
        snapshot_service: Snapshot service

    Returns:
        Recovery result with state and missed messages
    """
    result = snapshot_service.recover_session(
        session_id=request.session_id,
        last_message_id=request.last_message_id,
    )

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=result.message
        )

    return RecoverSessionResponse(
        success=result.success,
        state=result.state,
        missed_messages=result.missed_messages,
        snapshot_id=result.snapshot_id,
        message=result.message,
    )
