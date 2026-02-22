"""Event logging service for append-only audit trail."""
from datetime import datetime
import uuid
from typing import Optional, Any, Dict, List
from enum import Enum

from sqlalchemy.orm import Session
from sqlalchemy import func

from src.models.event import Event, EventType, EventCategory, VisibilityLevel
from src.models.user import User
from src.models.character import Character


class EventRecord:
    """Fluent builder for recording events."""

    def __init__(
        self,
        db: Session,
        event_type: EventType,
        actor_role: str = "system",
    ):
        self.db = db
        self._data = {
            "event_type": event_type,
            "actor_role": actor_role,
            "payload": {},
            "visibility": VisibilityLevel.PUBLIC,
        }

    def session(self, session_id: uuid.UUID) -> "EventRecord":
        """Set the session this event belongs to."""
        self._data["session_id"] = session_id
        return self

    def actor(self, user: User) -> "EventRecord":
        """Set the actor (user) who triggered this event."""
        self._data["actor_player_id"] = user.id
        return self

    def character(self, character: Character) -> "EventRecord":
        """Set the character affected by this event."""
        self._data["character_id"] = character.id
        return self

    def payload(self, data: Dict[str, Any]) -> "EventRecord":
        """Set the event payload."""
        self._data["payload"].update(data)
        return self

    def visibility(self, level: VisibilityLevel) -> "EventRecord":
        """Set who can see this event."""
        self._data["visibility"] = level
        return self

    def parent(self, event_id: uuid.UUID) -> "EventRecord":
        """Set the parent event this event relates to."""
        self._data["parent_event_id"] = event_id
        return self

    def description(self, text: str) -> "EventRecord":
        """Set a human-readable description."""
        self._data["description"] = text
        return self

    # M3 Memory Web extensions

    def category(self, cat: EventCategory) -> "EventRecord":
        """Set the event category for M3 Memory Web features."""
        self._data["category"] = cat
        return self

    def input_raw(self, raw_input: str) -> "EventRecord":
        """Set the raw user input/message."""
        self._data["input_raw"] = raw_input
        return self

    def narration(self, text: str) -> "EventRecord":
        """Set the narrative text for this event."""
        self._data["narration"] = text
        return self

    def client_timestamp(self, ts: datetime) -> "EventRecord":
        """Set the client-side timestamp."""
        self._data["client_timestamp"] = ts
        return self

    def source(self, src: str) -> "EventRecord":
        """Set the source of the event (web, api, system)."""
        self._data["source"] = src
        return self

    def tags(self, tag_list: List[str]) -> "EventRecord":
        """Set tags for search and filtering."""
        self._data["tags"] = tag_list
        return self

    def checkpoint(self, checkpoint_id: uuid.UUID) -> "EventRecord":
        """Associate this event with a checkpoint."""
        self._data["checkpoint_id"] = checkpoint_id
        return self

    def state_changes(self, changes: List[Dict[str, Any]]) -> "EventRecord":
        """Set detailed state changes for this event."""
        self._data["state_changes_json"] = changes
        return self

    def save(self) -> Event:
        """Save the event to the database and return it."""
        # M3: Assign sequence number if session_id is provided
        session_id = self._data.get("session_id")
        if session_id:
            # Get the next sequence number for this session
            last_seq = (
                self.db.query(func.max(Event.sequence))
                .filter(Event.session_id == session_id)
                .scalar()
            )
            self._data["sequence"] = (last_seq or 0) + 1

        event = Event(**self._data)
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event


class EventLogger:
    """Service for recording and querying game events."""

    def __init__(self, db: Session):
        self.db = db

    def record(self, event_type: EventType, actor_role: str = "system") -> EventRecord:
        """Start recording a new event.

        Args:
            event_type: The type of event to record
            actor_role: Who triggered the event ("kp", "player", or "system")

        Returns:
            EventRecord builder for fluent configuration
        """
        return EventRecord(self.db, event_type, actor_role)

    def get_event(self, event_id: uuid.UUID) -> Optional[Event]:
        """Get a single event by ID.

        Args:
            event_id: UUID of the event

        Returns:
            The event if found, None otherwise
        """
        return self.db.query(Event).filter(Event.id == event_id).first()

    def get_session_events(
        self,
        session_id: uuid.UUID,
        actor_role: Optional[str] = None,
        event_type: Optional[EventType] = None,
        visibility: Optional[VisibilityLevel] = None,
        character_id: Optional[int] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Event]:
        """Get events for a session with optional filters.

        Args:
            session_id: Session UUID
            actor_role: Filter by actor role
            event_type: Filter by event type
            visibility: Filter by visibility level
            character_id: Filter by character ID
            start_time: Filter events after this time
            end_time: Filter events before this time
            limit: Maximum number of events to return
            offset: Number of events to skip

        Returns:
            List of events, ordered by timestamp (newest first)
        """
        query = self.db.query(Event).filter(Event.session_id == session_id)

        if actor_role:
            query = query.filter(Event.actor_role == actor_role)
        if event_type:
            query = query.filter(Event.event_type == event_type)
        if visibility:
            query = query.filter(Event.visibility == visibility)
        if character_id is not None:
            query = query.filter(Event.character_id == character_id)
        if start_time:
            query = query.filter(Event.timestamp >= start_time)
        if end_time:
            query = query.filter(Event.timestamp <= end_time)

        return query.order_by(Event.timestamp.desc()).offset(offset).limit(limit).all()

    def get_character_events(
        self,
        character_id: int,
        event_types: Optional[list[EventType]] = None,
        limit: int = 50,
    ) -> list[Event]:
        """Get events affecting a specific character.

        Args:
            character_id: Character ID
            event_types: Optional list of event types to filter
            limit: Maximum number of events

        Returns:
            List of events affecting this character
        """
        query = self.db.query(Event).filter(Event.character_id == character_id)

        if event_types:
            query = query.filter(Event.event_type.in_(event_types))

        return query.order_by(Event.timestamp.desc()).limit(limit).all()

    def get_state_changes(
        self,
        session_id: uuid.UUID,
    ) -> Dict[str, list[Event]]:
        """Get all state change events organized by type.

        Args:
            session_id: Session UUID

        Returns:
            Dictionary mapping state type to list of events:
            {
                "hp": [events],
                "san": [events],
                "luck": [events],
                "mp": [events],
            }
        """
        state_types = [
            EventType.HP_CHANGE,
            EventType.SAN_CHANGE,
            EventType.LUCK_CHANGE,
            EventType.MP_CHANGE,
            EventType.DAMAGE,
            EventType.HEAL,
            EventType.SAN_LOSS,
        ]

        events = (
            self.db.query(Event)
            .filter(Event.session_id == session_id)
            .filter(Event.event_type.in_(state_types))
            .order_by(Event.timestamp.desc())
            .all()
        )

        # Group by state type
        result: Dict[str, list[Event]] = {
            "hp": [],
            "san": [],
            "luck": [],
            "mp": [],
        }

        for event in events:
            if event.event_type in (EventType.HP_CHANGE, EventType.DAMAGE, EventType.HEAL):
                result["hp"].append(event)
            elif event.event_type in (EventType.SAN_CHANGE, EventType.SAN_LOSS):
                result["san"].append(event)
            elif event.event_type == EventType.LUCK_CHANGE:
                result["luck"].append(event)
            elif event.event_type == EventType.MP_CHANGE:
                result["mp"].append(event)

        return result

    def create_summary(
        self,
        session_id: uuid.UUID,
    ) -> Dict[str, Any]:
        """Create a summary of session events.

        Args:
            session_id: Session UUID

        Returns:
            Summary dictionary with event counts and recent activity
        """
        events = (
            self.db.query(Event)
            .filter(Event.session_id == session_id)
            .order_by(Event.timestamp.asc())
            .all()
        )

        if not events:
            return {
                "total_events": 0,
                "start_time": None,
                "end_time": None,
                "event_counts": {},
                "recent_events": [],
            }

        # Count by type
        event_counts: Dict[str, int] = {}
        for event in events:
            et = event.event_type.value
            event_counts[et] = event_counts.get(et, 0) + 1

        return {
            "total_events": len(events),
            "start_time": events[0].timestamp.isoformat(),
            "end_time": events[-1].timestamp.isoformat(),
            "event_counts": event_counts,
            "recent_events": [e.to_dict() for e in events[-10:]],
        }
