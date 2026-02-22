"""Visibility Filter Service for Multiplayer Messages."""
from dataclasses import dataclass
from enum import Enum
from typing import List, Optional

from src.models.message import Message


class VisibilityLevel(str, Enum):
    """Visibility levels for messages."""
    PUBLIC = "public"
    KP_ONLY = "kp"
    PARTY = "party"
    PRIVATE = "private"


@dataclass
class VisibilityContext:
    """Context for visibility filtering."""
    viewer_id: str
    viewer_role: str  # "keeper" or "player"


class VisibilityFilter:
    """
    Filters messages based on visibility levels and viewer context.

    Rules:
    - PUBLIC: Visible to everyone
    - KP_ONLY: Visible only to keepers
    - PARTY: Visible to all players and keepers
    - PRIVATE: Visible only to specified users (and sender)

    Sender can always see their own messages regardless of visibility.
    """

    def filter_message(self, message: Message, context: VisibilityContext) -> bool:
        """
        Check if a message should be visible to the viewer.

        Args:
            message: The message to check
            context: Viewer context (viewer_id, viewer_role)

        Returns:
            True if message should be visible, False otherwise
        """
        # Sender can always see their own messages
        if str(message.sender_id) == str(context.viewer_id):
            return True

        # Get visibility level (default to PUBLIC if None)
        visibility = message.visibility or "public"

        # Apply visibility rules
        if visibility == VisibilityLevel.PUBLIC.value:
            return True

        elif visibility == VisibilityLevel.KP_ONLY.value:
            # Only keepers can see KP_ONLY messages
            return context.viewer_role == "keeper"

        elif visibility == VisibilityLevel.PARTY.value:
            # All players and keepers can see PARTY messages
            return True

        elif visibility == VisibilityLevel.PRIVATE.value:
            # Only specified users can see PRIVATE messages
            visible_to = message.visible_to or []
            return str(context.viewer_id) in [str(v) for v in visible_to]

        # Default: visible (fail-safe)
        return True

    def filter_messages(self, messages: List[Message], context: VisibilityContext) -> List[Message]:
        """
        Filter a list of messages based on visibility context.

        Args:
            messages: List of messages to filter
            context: Viewer context

        Returns:
            List of visible messages
        """
        return [msg for msg in messages if self.filter_message(msg, context)]
