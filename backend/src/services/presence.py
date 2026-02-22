"""Presence service for tracking online users in multiplayer sessions."""
import uuid
from typing import Optional, Dict, List
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from src.models.user import User


class PresenceService:
    """Service for tracking user presence (online/offline/away) in campaigns."""

    # In-memory storage for presence data
    # In production, this would use Redis or similar
    _presence: Dict[str, Dict[str, Dict]] = {}  # {campaign_id: {user_id: {status, last_seen}}}

    def __init__(self, db: Session):
        self.db = db

    async def mark_online(self, campaign_id: str, user_id: str) -> None:
        """Mark a user as online in a campaign."""
        if campaign_id not in self._presence:
            self._presence[campaign_id] = {}

        self._presence[campaign_id][user_id] = {
            "status": "online",
            "last_seen": datetime.utcnow(),
        }

    async def mark_offline(self, campaign_id: str, user_id: str) -> None:
        """Mark a user as offline in a campaign."""
        if campaign_id in self._presence and user_id in self._presence[campaign_id]:
            self._presence[campaign_id][user_id]["status"] = "offline"
            self._presence[campaign_id][user_id]["last_seen"] = datetime.utcnow()

    async def mark_away(self, campaign_id: str, user_id: str) -> None:
        """Mark a user as away in a campaign."""
        if campaign_id not in self._presence:
            self._presence[campaign_id] = {}

        self._presence[campaign_id][user_id] = {
            "status": "away",
            "last_seen": datetime.utcnow(),
        }

    async def get_status(self, campaign_id: str, user_id: str) -> Optional[str]:
        """Get the online status of a user in a campaign."""
        if campaign_id not in self._presence:
            return "offline"

        if user_id not in self._presence[campaign_id]:
            return "offline"

        return self._presence[campaign_id][user_id]["status"]

    async def get_online_users(self, campaign_id: str) -> List[Dict]:
        """Get all online users in a campaign."""
        if campaign_id not in self._presence:
            return []

        online_users = []
        for user_id, data in self._presence[campaign_id].items():
            if data["status"] == "online":
                user = self.db.query(User).filter(User.id == user_id).first()
                if user:
                    online_users.append({
                        "id": str(user.id),
                        "username": user.username,
                        "status": "online",
                    })

        return online_users

    async def cleanup_stale_presence(self, timeout_minutes: int = 5) -> None:
        """Clean up stale presence entries older than timeout."""
        timeout = timedelta(minutes=timeout_minutes)
        now = datetime.utcnow()

        for campaign_id in list(self._presence.keys()):
            for user_id in list(self._presence[campaign_id].keys()):
                last_seen = self._presence[campaign_id][user_id]["last_seen"]
                if now - last_seen > timeout:
                    # Mark as offline instead of removing
                    await self.mark_offline(campaign_id, user_id)
