"""Messages API routes with visibility control."""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field, validator
from sqlalchemy.orm import Session

from src.core.auth import get_current_user
from src.core.database import get_db
from src.models.user import User
from src.models.message import Message, MessageVisibility
from src.services.visibility import VisibilityFilter, VisibilityContext, VisibilityLevel

router = APIRouter(prefix="/game/messages", tags=["messages"])

# Global visibility filter instance
_visibility_filter = VisibilityFilter()


def get_visibility_filter() -> VisibilityFilter:
    """Dependency injection for visibility filter."""
    return _visibility_filter


# Request/Response Models
class SendMessageRequest(BaseModel):
    """Request model for sending a message."""

    session_id: str = Field(..., description="Session ID")
    sender_id: str = Field(..., description="Sender user ID")
    content: str = Field(..., min_length=1, description="Message content")
    visibility: str = Field("public", description="Visibility level: public, kp, party, private")
    visible_to: List[str] = Field(default_factory=list, description="User IDs who can see private messages")

    @validator('visibility')
    def validate_visibility(cls, v):
        """Validate visibility level."""
        valid_levels = ["public", "kp", "party", "private"]
        if v not in valid_levels:
            raise ValueError(f"Invalid visibility level. Must be one of: {', '.join(valid_levels)}")
        return v

    @validator('visible_to')
    def validate_private_recipients(cls, v, values):
        """Validate that private messages have recipients."""
        if 'visibility' in values and values['visibility'] == 'private' and not v:
            # Allow empty visible_to for sender-only messages
            pass
        return v


class MessageResponse(BaseModel):
    """Response model for a message."""

    id: str = Field(..., description="Message ID")
    session_id: str = Field(..., description="Session ID")
    sender_id: str = Field(..., description="Sender user ID")
    content: str = Field(..., description="Message content")
    visibility: str = Field(..., description="Visibility level")
    visible_to: List[str] = Field(default_factory=list, description="Users who can see this message")
    created_at: str = Field(..., description="Creation timestamp")


class MessagesListResponse(BaseModel):
    """Response model for messages list."""

    messages: List[MessageResponse] = Field(default_factory=list, description="List of messages")
    total_count: int = Field(0, description="Total number of messages")
    page: int = Field(1, description="Current page number")
    page_size: int = Field(50, description="Number of messages per page")


# In-memory message storage
# In production, this would be in the database
_messages_store: dict[str, list[Message]] = {}


def get_session_messages(session_id: str) -> list[Message]:
    """Get messages for a session from storage."""
    if session_id not in _messages_store:
        _messages_store[session_id] = []
    return _messages_store[session_id]


# API Endpoints
@router.post("", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message(
    request: SendMessageRequest,
    current_user: User = Depends(get_current_user),
):
    """Send a message with visibility control.

    Args:
        request: Message send request
        current_user: Authenticated user

    Returns:
        Created message
    """
    import uuid
    from datetime import datetime

    # Create message data (simplified, not a full SQLAlchemy model)
    message_data = {
        "id": str(uuid.uuid4()),
        "session_id": request.session_id,
        "sender_id": request.sender_id,
        "content": request.content,
        "visibility": request.visibility,
        "visible_to": request.visible_to,
        "created_at": datetime.now(),
    }

    # Create a simple message-like object
    class SimpleMessage:
        def __init__(self, data):
            self.id = data["id"]
            self.session_id = data["session_id"]
            self.sender_id = data["sender_id"]
            self.content = data["content"]
            self.visibility = data["visibility"]
            self.visible_to = data["visible_to"]
            self.created_at = data["created_at"]

    message = SimpleMessage(message_data)

    # Save to storage (in production, save to database)
    messages = get_session_messages(request.session_id)
    messages.append(message)

    # Return response
    return MessageResponse(
        id=message.id,
        session_id=message.session_id,
        sender_id=message.sender_id,
        content=message.content,
        visibility=message.visibility,
        visible_to=message.visible_to or [],
        created_at=message.created_at.isoformat(),
    )


@router.get("", response_model=MessagesListResponse)
async def get_messages(
    session_id: str = Query(..., description="Session ID"),
    viewer_id: str = Query(..., description="Viewer user ID"),
    viewer_role: str = Query("player", description="Viewer role: keeper or player"),
    visibility: Optional[str] = Query(None, description="Filter by visibility level"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Messages per page"),
    current_user: User = Depends(get_current_user),
    filter_service: VisibilityFilter = Depends(get_visibility_filter),
):
    """Get messages for a session, filtered by visibility.

    Args:
        session_id: Session ID
        viewer_id: Viewer user ID
        viewer_role: Viewer role (keeper or player)
        visibility: Optional visibility filter
        page: Page number
        page_size: Messages per page
        current_user: Authenticated user
        filter_service: Visibility filter service

    Returns:
        Filtered and paginated messages
    """
    # Get all messages for session
    messages = get_session_messages(session_id)

    # Create visibility context
    context = VisibilityContext(
        viewer_id=viewer_id,
        viewer_role=viewer_role,
    )

    # Filter messages by visibility
    visible_messages = []
    for msg in messages:
        if filter_service.filter_message(msg, context):
            # Apply additional visibility filter if specified
            if visibility is None or msg.visibility == visibility:
                visible_messages.append(msg)

    # Calculate pagination
    total_count = len(visible_messages)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_messages = visible_messages[start_idx:end_idx]

    # Convert to response format
    message_responses = [
        MessageResponse(
            id=str(msg.id),
            session_id=msg.session_id,
            sender_id=msg.sender_id,
            content=msg.content,
            visibility=msg.visibility,
            visible_to=msg.visible_to or [],
            created_at=msg.created_at.isoformat(),
        )
        for msg in paginated_messages
    ]

    return MessagesListResponse(
        messages=message_responses,
        total_count=total_count,
        page=page,
        page_size=page_size,
    )


@router.get("/health")
def messages_health():
    """Health check for messages API."""
    return {"status": "ok", "service": "messages"}
