"""Socket.io service for multiplayer real-time communication.

This module provides Socket.io server functionality for the Monika TRPG platform,
supporting multiplayer campaigns, real-time messaging, presence tracking, and
game state synchronization.

Architecture:
- Integration with FastAPI via ASGI middleware
- JWT authentication middleware for connection security
- Room-based messaging for campaign isolation
- Heartbeat/ping mechanism for connection health
- Event-driven architecture for game events

WebSocket Events (Client → Server):
- campaign:join: Join a campaign room
- campaign:leave: Leave a campaign room
- game:message: Send game message with visibility
- spotlight:request: Request spotlight (speaking turn)
- spotlight:release: Release spotlight
- typing:start: User started typing
- typing:stop: User stopped typing

WebSocket Events (Server → Client):
- campaign:joined: Campaign joined successfully
- member:joined: New member joined campaign
- member:left: Member left campaign
- game:message: Game message received
- spotlight:granted: Spotlight granted to user
- spotlight:released: Spotlight released
- presence:update: Online users updated
- user:typing: User typing indicator
- error: Error occurred
"""
import asyncio
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional, Set

import socketio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.security import decode_access_token
from src.models.user import User
from src.models.character import Character
from src.models.campaign import Campaign, CampaignMember


logger = logging.getLogger(__name__)


# =============================================================================
# Constants
# =============================================================================

PING_INTERVAL = 30  # seconds
PING_TIMEOUT = 60   # seconds before disconnect
ROOM_PREFIX_CAMPAIGN = "campaign:"
ROOM_PREFIX_USER = "user:"


# =============================================================================
# Socket.io Server Configuration
# =============================================================================

# Create Async Socket.io server
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=['http://localhost:5173', 'http://localhost:3000'],
    ping_timeout=PING_TIMEOUT,
    ping_interval=PING_INTERVAL,
    max_http_buffer_size=10_000_000,  # 10MB for large messages
    logger=logger,
    engineio_logger=False
)


# =============================================================================
# Connection Tracking
# =============================================================================

class ConnectionTracker:
    """Track active Socket.io connections and room memberships."""

    def __init__(self):
        # sid -> {user_id, campaign_id, character_id}
        self._connections: Dict[str, Dict[str, Any]] = {}
        # user_id -> set of sids (for multi-device support)
        self._user_connections: Dict[str, Set[str]] = {}
        # campaign_id -> set of sids in room
        self._campaign_rooms: Dict[str, Set[str]] = {}
        # sid -> last_pong timestamp
        self._last_pong: Dict[str, datetime] = {}

    def add_connection(
        self,
        sid: str,
        user_id: str,
        campaign_id: Optional[str] = None,
        character_id: Optional[str] = None
    ):
        """Add a new connection."""
        self._connections[sid] = {
            "user_id": user_id,
            "campaign_id": campaign_id,
            "character_id": character_id,
            "connected_at": datetime.now()
        }
        self._last_pong[sid] = datetime.now()

        # Track user connections
        if user_id not in self._user_connections:
            self._user_connections[user_id] = set()
        self._user_connections[user_id].add(sid)

        logger.info(f"Connection added: sid={sid}, user_id={user_id}")

    def remove_connection(self, sid: str) -> Optional[str]:
        """Remove a connection and return user_id."""
        if sid not in self._connections:
            return None

        user_id = self._connections[sid]["user_id"]
        campaign_id = self._connections[sid].get("campaign_id")

        # Remove from connection tracking
        del self._connections[sid]
        if sid in self._last_pong:
            del self._last_pong[sid]

        # Remove from user connections
        if user_id in self._user_connections:
            self._user_connections[user_id].discard(sid)
            if not self._user_connections[user_id]:
                del self._user_connections[user_id]

        # Remove from campaign rooms
        if campaign_id and campaign_id in self._campaign_rooms:
            self._campaign_rooms[campaign_id].discard(sid)
            if not self._campaign_rooms[campaign_id]:
                del self._campaign_rooms[campaign_id]

        logger.info(f"Connection removed: sid={sid}, user_id={user_id}")
        return user_id

    def get_connection(self, sid: str) -> Optional[Dict[str, Any]]:
        """Get connection info."""
        return self._connections.get(sid)

    def update_pong(self, sid: str):
        """Update last pong timestamp for connection."""
        if sid in self._last_pong:
            self._last_pong[sid] = datetime.now()

    def is_connection_alive(self, sid: str) -> bool:
        """Check if connection is alive (responded to ping)."""
        if sid not in self._last_pong:
            return False
        return (datetime.now() - self._last_pong[sid]).total_seconds() < PING_TIMEOUT

    def join_campaign_room(self, sid: str, campaign_id: str):
        """Add connection to campaign room."""
        if campaign_id not in self._campaign_rooms:
            self._campaign_rooms[campaign_id] = set()
        self._campaign_rooms[campaign_id].add(sid)

        # Update connection info
        if sid in self._connections:
            self._connections[sid]["campaign_id"] = campaign_id

        logger.info(f"SID {sid} joined campaign room: {campaign_id}")

    def leave_campaign_room(self, sid: str, campaign_id: str):
        """Remove connection from campaign room."""
        if campaign_id in self._campaign_rooms:
            self._campaign_rooms[campaign_id].discard(sid)
            if not self._campaign_rooms[campaign_id]:
                del self._campaign_rooms[campaign_id]

        # Update connection info
        if sid in self._connections:
            self._connections[sid]["campaign_id"] = None

        logger.info(f"SID {sid} left campaign room: {campaign_id}")

    def get_campaign_members(self, campaign_id: str) -> List[Dict[str, Any]]:
        """Get all connections in a campaign room."""
        if campaign_id not in self._campaign_rooms:
            return []

        members = []
        for sid in self._campaign_rooms[campaign_id]:
            if sid in self._connections:
                members.append(self._connections[sid])

        return members

    def get_online_users(self, campaign_id: str) -> List[str]:
        """Get list of online user IDs in campaign."""
        members = self.get_campaign_members(campaign_id)
        # Unique user IDs
        return list(set(m["user_id"] for m in members))

    def get_user_sids(self, user_id: str) -> Set[str]:
        """Get all socket IDs for a user (multi-device)."""
        return self._user_connections.get(user_id, set()).copy()

    def get_all_connections(self) -> Dict[str, Dict[str, Any]]:
        """Get all connections (for debugging)."""
        return self._connections.copy()


# Global connection tracker
tracker = ConnectionTracker()


# =============================================================================
# Authentication Middleware
# =============================================================================

async def authenticate_socket(sid: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Authenticate a Socket.io connection using JWT token.

    Args:
        sid: Socket.io session ID
        data: Auth data from client (should contain token)

    Returns:
        User info dict if authenticated, None otherwise
    """
    token = data.get("token")

    if not token:
        logger.warning(f"Connection rejected: no token provided for sid={sid}")
        return None

    # Remove "Bearer " prefix if present
    if isinstance(token, str) and token.startswith("Bearer "):
        token = token[7:]

    try:
        # Decode JWT token
        payload = decode_access_token(token)
        if not payload:
            logger.warning(f"Connection rejected: invalid token for sid={sid}")
            return None

        user_id = payload.get("sub")

        if not user_id:
            logger.warning(f"Connection rejected: invalid token payload for sid={sid}")
            return None

        # Get user from database
        async for db in get_db():
            result = await db.execute(select(User).where(User.id == int(user_id)))
            user = result.scalar_one_or_none()

            if not user:
                logger.warning(f"Connection rejected: user not found for sid={sid}")
                return None

            return {
                "user_id": user_id,  # Keep as string from JWT
                "user_db_id": user.id,  # Integer DB ID
                "username": user.username,
                "email": user.email
            }

    except Exception as e:
        logger.error(f"Authentication error for sid={sid}: {e}")
        return None


# =============================================================================
# Socket.io Event Handlers
# =============================================================================

@sio.on("connect")
async def on_connect(sid: str, environ: Dict[str, Any]):
    """Handle client connection.

    Authenticates the connection and sends confirmation.
    """
    # Get auth data from handshake
    auth_data = environ.get("socketio", {}).get("auth", {})

    # Authenticate connection
    user_info = await authenticate_socket(sid, auth_data)

    if not user_info:
        # Reject connection
        return False

    # Add to tracker
    tracker.add_connection(sid, user_info["user_id"])

    # Send connection confirmation
    await sio.emit("connected", {
        "message": "Connected to Monika multiplayer server",
        "user_id": user_info["user_id"]
    }, to=sid)

    logger.info(f"Client connected: sid={sid}, user_id={user_info['user_id']}")


@sio.on("disconnect")
async def on_disconnect(sid: str):
    """Handle client disconnection.

    Removes from tracker and notifies campaign members.
    """
    connection = tracker.get_connection(sid)

    if connection:
        user_id = connection["user_id"]
        campaign_id = connection.get("campaign_id")

        # Remove from tracker
        tracker.remove_connection(sid)

        # Notify campaign members if in campaign
        if campaign_id:
            room_id = f"{ROOM_PREFIX_CAMPAIGN}{campaign_id}"

            # Get character info if available
            character_name = None
            if connection.get("character_id"):
                try:
                    async for db in get_db():
                        result = await db.execute(
                            select(Character).where(
                                Character.id == int(connection["character_id"])
                            )
                        )
                        character = result.scalar_one_or_none()
                        if character:
                            character_name = character.name
                except Exception:
                    pass

            # Notify remaining members
            await sio.emit("member:left", {
                "user_id": user_id,
                "character_name": character_name
            }, room=room_id, skip_sid=sid)

            # Send updated presence
            online_users = tracker.get_online_users(campaign_id)
            await sio.emit("presence:update", {
                "online_users": online_users
            }, room=room_id)

    logger.info(f"Client disconnected: sid={sid}")


@sio.on("campaign:join")
async def on_campaign_join(sid: str, data: Dict[str, Any]):
    """Handle campaign join request.

    Client sends: {campaign_id, character_id}
    Server responds: campaign:joined event
    """
    connection = tracker.get_connection(sid)

    if not connection:
        await sio.emit("error", {"message": "Not connected"}, to=sid)
        return

    campaign_id = data.get("campaign_id")
    character_id = data.get("character_id")

    if not campaign_id:
        await sio.emit("error", {"message": "campaign_id is required"}, to=sid)
        return

    # Verify campaign exists and user is member
    try:
        async for db in get_db():
            # Check campaign
            campaign_result = await db.execute(
                select(Campaign).where(Campaign.id == uuid.UUID(campaign_id))
            )
            campaign = campaign_result.scalar_one_or_none()

            if not campaign:
                await sio.emit("error", {"message": "Campaign not found"}, to=sid)
                return

            # Check membership
            member_result = await db.execute(
                select(CampaignMember).where(
                    CampaignMember.campaign_id == uuid.UUID(campaign_id),
                    CampaignMember.user_id == int(connection["user_id"])
                )
            )
            member = member_result.scalar_one_or_none()

            if not member:
                await sio.emit("error", {"message": "Not a member of this campaign"}, to=sid)
                return

            # Update character if provided
            if character_id:
                char_result = await db.execute(
                    select(Character).where(Character.id == int(character_id))
                )
                character = char_result.scalar_one_or_none()
                if character:
                    # Update member record
                    member.character_id = int(character_id)
                    await db.commit()

    except Exception as e:
        logger.error(f"Error joining campaign: {e}")
        await sio.emit("error", {"message": "Failed to join campaign"}, to=sid)
        return

    # Join room
    room_id = f"{ROOM_PREFIX_CAMPAIGN}{campaign_id}"
    sio.enter_room(sid, room_id)
    tracker.join_campaign_room(sid, campaign_id)

    # Get all campaign members
    members = tracker.get_campaign_members(campaign_id)

    # Send joined event to user
    await sio.emit("campaign:joined", {
        "campaign_id": campaign_id,
        "members": members
    }, to=sid)

    # Notify other members
    character_name = None
    if character_id:
        try:
            async for db in get_db():
                result = await db.execute(
                    select(Character).where(Character.id == int(character_id))
                )
                character = result.scalar_one_or_none()
                if character:
                    character_name = character.name
        except Exception:
            pass

    await sio.emit("member:joined", {
        "user_id": connection["user_id"],
        "character_name": character_name
    }, room=room_id, skip_sid=sid)

    # Send presence update
    online_users = tracker.get_online_users(campaign_id)
    await sio.emit("presence:update", {
        "online_users": online_users
    }, room=room_id)

    logger.info(f"User {connection['user_id']} joined campaign {campaign_id}")


@sio.on("campaign:leave")
async def on_campaign_leave(sid: str, data: Dict[str, Any]):
    """Handle campaign leave request.

    Client sends: {campaign_id}
    """
    connection = tracker.get_connection(sid)

    if not connection:
        return

    campaign_id = data.get("campaign_id")

    if not campaign_id:
        await sio.emit("error", {"message": "campaign_id is required"}, to=sid)
        return

    room_id = f"{ROOM_PREFIX_CAMPAIGN}{campaign_id}"

    # Leave room
    sio.leave_room(sid, room_id)
    tracker.leave_campaign_room(sid, campaign_id)

    # Notify remaining members
    await sio.emit("member:left", {
        "user_id": connection["user_id"],
        "character_name": connection.get("character_name")
    }, room=room_id, skip_sid=sid)

    # Send presence update
    online_users = tracker.get_online_users(campaign_id)
    await sio.emit("presence:update", {
        "online_users": online_users
    }, room=room_id)

    logger.info(f"User {connection['user_id']} left campaign {campaign_id}")


@sio.on("game:message")
async def on_game_message(sid: str, data: Dict[str, Any]):
    """Handle game message.

    Client sends: {content, visibility, visible_to}
    Server broadcasts: game:message to campaign room
    """
    connection = tracker.get_connection(sid)

    if not connection:
        await sio.emit("error", {"message": "Not connected"}, to=sid)
        return

    campaign_id = connection.get("campaign_id")

    if not campaign_id:
        await sio.emit("error", {"message": "Not in a campaign"}, to=sid)
        return

    content = data.get("content")
    visibility = data.get("visibility", "public")
    visible_to = data.get("visible_to", [])

    if not content:
        await sio.emit("error", {"message": "content is required"}, to=sid)
        return

    # Validate visibility
    valid_visibilities = ["public", "kp", "party", "private"]
    if visibility not in valid_visibilities:
        await sio.emit("error", {"message": f"Invalid visibility. Must be one of: {valid_visibilities}"}, to=sid)
        return

    room_id = f"{ROOM_PREFIX_CAMPAIGN}{campaign_id}"

    # Create message
    message = {
        "id": str(uuid.uuid4()),
        "sender_id": connection["user_id"],
        "content": content,
        "visibility": visibility,
        "visible_to": visible_to,
        "timestamp": datetime.now().isoformat()
    }

    # Broadcast to room
    # Note: Client-side filtering will handle visibility
    await sio.emit("game:message", message, room=room_id)

    logger.info(f"Message from {connection['user_id']} in campaign {campaign_id}: {content[:50]}")


@sio.on("typing:start")
async def on_typing_start(sid: str, data: Dict[str, Any]):
    """Handle typing start indicator.

    Broadcasts user:typing to campaign room.
    """
    connection = tracker.get_connection(sid)

    if not connection or not connection.get("campaign_id"):
        return

    room_id = f"{ROOM_PREFIX_CAMPAIGN}{connection['campaign_id']}"

    # Get character name
    character_name = None
    if connection.get("character_id"):
        try:
            async for db in get_db():
                result = await db.execute(
                    select(Character).where(Character.id == int(connection["character_id"]))
                )
                character = result.scalar_one_or_none()
                if character:
                    character_name = character.name
        except Exception:
            pass

    await sio.emit("user:typing", {
        "user_id": connection["user_id"],
        "character_name": character_name
    }, room=room_id, skip_sid=sid)


@sio.on("typing:stop")
async def on_typing_stop(sid: str, data: Dict[str, Any]):
    """Handle typing stop indicator.

    Currently just stops the typing indicator on clients.
    """
    connection = tracker.get_connection(sid)

    if not connection or not connection.get("campaign_id"):
        return

    room_id = f"{ROOM_PREFIX_CAMPAIGN}{connection['campaign_id']}"

    # Could emit a "typing:stop" event if needed
    # For now, clients use timeout to clear typing indicators


# =============================================================================
# Helper Functions
# =============================================================================

async def broadcast_to_campaign(campaign_id: str, event: str, data: Dict[str, Any]):
    """Broadcast an event to all members of a campaign.

    Args:
        campaign_id: Campaign UUID
        event: Event name
        data: Event data
    """
    room_id = f"{ROOM_PREFIX_CAMPAIGN}{campaign_id}"
    await sio.emit(event, data, room=room_id)


async def send_to_user(user_id: str, event: str, data: Dict[str, Any]):
    """Send an event to all sockets for a user.

    Args:
        user_id: User UUID
        event: Event name
        data: Event data
    """
    sids = tracker.get_user_sids(user_id)

    for sid in sids:
        await sio.emit(event, data, to=sid)


async def get_online_count(campaign_id: str) -> int:
    """Get the number of online users in a campaign.

    Args:
        campaign_id: Campaign UUID

    Returns:
        Number of online users
    """
    return len(tracker.get_online_users(campaign_id))


# =============================================================================
# ASGI Integration
# =============================================================================

# Create ASGI app for Socket.io
socketio_app = socketio.ASGIApp(sio)


# =============================================================================
# Health Check
# =============================================================================

async def get_socketio_stats() -> Dict[str, Any]:
    """Get Socket.io server statistics.

    Returns:
        Dict with connection stats
    """
    connections = tracker.get_all_connections()

    return {
        "total_connections": len(connections),
        "total_users": len(tracker._user_connections),
        "campaigns": len(tracker._campaign_rooms),
        "connections": [
            {
                "sid": sid,
                "user_id": conn["user_id"],
                "campaign_id": conn.get("campaign_id"),
                "connected_at": conn["connected_at"].isoformat()
            }
            for sid, conn in connections.items()
        ]
    }
