"""Event Writer Service for append-only event logging.

This service provides a simplified interface for writing game events to the database.
It focuses on:
- Writing individual events with automatic ID generation
- Batch writing multiple events
- Event chain linking (parent_event_id)
- Timestamp synchronization
- Sequence number generation per session

For query functionality, see EventLogger in events.py.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional, Any, Dict, List

from sqlalchemy.orm import Session
from sqlalchemy import func

from src.models.event import Event, EventType, EventCategory, VisibilityLevel


class EventWriter:
    """Service for writing events to the database.

    This class provides methods to write individual and batch events,
    handle ID generation, timestamp synchronization, and event chain linking.

    Example:
        writer = EventWriter(db)

        # Write a single event
        event = writer.write_event(
            session_id=session_id,
            event_type=EventType.MESSAGE,
            actor_role="system",
            payload={"text": "Hello!"}
        )

        # Write multiple events
        events = writer.batch_write_events(
            session_id,
            [
                {"event_type": EventType.MESSAGE, "actor_role": "system", "payload": {}},
                {"event_type": EventType.MESSAGE, "actor_role": "system", "payload": {}},
            ]
        )
    """

    def __init__(self, db: Session):
        """Initialize the EventWriter with a database session.

        Args:
            db: SQLAlchemy database session
        """
        self.db = db

    def write_event(
        self,
        session_id: Optional[uuid.UUID] = None,
        event_type: EventType = EventType.MESSAGE,
        actor_role: str = "system",
        actor_player_id: Optional[int] = None,
        character_id: Optional[int] = None,
        payload: Optional[Dict[str, Any]] = None,
        visibility: VisibilityLevel = VisibilityLevel.PUBLIC,
        description: Optional[str] = None,
        # M3 fields
        event_id: Optional[uuid.UUID] = None,
        input_raw: Optional[str] = None,
        narration: Optional[str] = None,
        client_timestamp: Optional[datetime] = None,
        source: str = "system",
        tags: Optional[List[str]] = None,
        category: Optional[EventCategory] = None,
        checkpoint_id: Optional[uuid.UUID] = None,
        state_changes_json: Optional[List[Dict[str, Any]]] = None,
        parent_event_id: Optional[uuid.UUID] = None,
    ) -> Event:
        """Write a single event to the database.

        Args:
            session_id: UUID of the session this event belongs to
            event_type: Type of event (from EventType enum)
            actor_role: Role of the actor ("kp", "player", "system")
            actor_player_id: ID of the player who triggered the event
            character_id: ID of the character affected by the event
            payload: Event-specific data
            visibility: Who can see this event
            description: Human-readable description
            event_id: Custom UUID for the event (optional, auto-generated if not provided)
            input_raw: Raw user input that triggered this event
            narration: Narrative text for the event
            client_timestamp: Client-side timestamp
            source: Source of the event ("web", "api", "system")
            tags: Tags for search and filtering
            category: Event category for grouping
            checkpoint_id: Associated checkpoint ID
            state_changes_json: Detailed state changes
            parent_event_id: ID of the parent event for chaining

        Returns:
            The created Event object
        """
        # Generate sequence number if session_id is provided
        sequence = None
        if session_id:
            sequence = self._get_next_sequence(session_id)

        # Create the event
        event = Event(
            id=event_id or uuid.uuid4(),
            session_id=session_id,
            sequence=sequence,
            actor_player_id=actor_player_id,
            actor_role=actor_role,
            character_id=character_id,
            event_type=event_type,
            category=category,
            payload=payload or {},
            visibility=visibility,
            input_raw=input_raw,
            narration=narration,
            client_timestamp=client_timestamp,
            source=source,
            tags=tags or [],
            checkpoint_id=checkpoint_id,
            state_changes_json=state_changes_json or [],
            parent_event_id=parent_event_id,
            description=description,
        )

        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)

        return event

    def batch_write_events(
        self,
        session_id: Optional[uuid.UUID],
        events_data: List[Dict[str, Any]],
    ) -> List[Event]:
        """Write multiple events to the database in a single transaction.

        This method handles:
        - Auto-generation of sequence numbers per session
        - Event chain linking via parent_chain flag

        Args:
            session_id: Default session ID for events (can be overridden per event)
            events_data: List of event data dictionaries with keys:
                - event_type: EventType enum value
                - actor_role: "kp", "player", or "system"
                - payload: Event data (dict)
                - Other optional fields from write_event()

        Returns:
            List of created Event objects

        Example:
            events = writer.batch_write_events(session_id, [
                {"event_type": EventType.ROLL, "actor_role": "player"},
                {"event_type": EventType.PUSH_ROLL, "actor_role": "player", "parent_chain": True},
            ])
        """
        events: List[Event] = []
        last_event_id: Optional[uuid.UUID] = None

        # Pre-calculate starting sequence for each unique session
        # Build a map of session_id -> starting sequence
        session_sequences: Dict[uuid.UUID, int] = {}
        for data in events_data:
            event_session_id = data.get("session_id", session_id)
            if event_session_id and event_session_id not in session_sequences:
                session_sequences[event_session_id] = self._get_next_sequence(event_session_id)

        # Default session sequence if no specific session
        default_start = session_sequences.get(session_id, 0) if session_id else 0

        for i, data in enumerate(events_data):
            # Extract session_id (use default or per-event override)
            event_session_id = data.get("session_id", session_id)

            # Calculate sequence - use per-session counter if available
            sequence = None
            if event_session_id:
                if event_session_id in session_sequences:
                    sequence = session_sequences[event_session_id]
                    session_sequences[event_session_id] += 1  # Increment for next event in same session
                else:
                    # Session seen for first time in this batch
                    sequence = self._get_next_sequence(event_session_id)
                    session_sequences[event_session_id] = sequence + 1

            # Handle parent chain linking
            parent_id = data.get("parent_event_id")
            if data.get("parent_chain") and last_event_id:
                parent_id = last_event_id

            # Create event
            event = Event(
                id=data.get("event_id") or uuid.uuid4(),
                session_id=event_session_id,
                sequence=sequence,
                actor_player_id=data.get("actor_player_id"),
                actor_role=data.get("actor_role", "system"),
                character_id=data.get("character_id"),
                event_type=data.get("event_type", EventType.MESSAGE),
                category=data.get("category"),
                payload=data.get("payload", {}),
                visibility=data.get("visibility", VisibilityLevel.PUBLIC),
                input_raw=data.get("input_raw"),
                narration=data.get("narration"),
                client_timestamp=data.get("client_timestamp"),
                source=data.get("source", "system"),
                tags=data.get("tags", []),
                checkpoint_id=data.get("checkpoint_id"),
                state_changes_json=data.get("state_changes", []),
                parent_event_id=parent_id,
                description=data.get("description"),
            )

            self.db.add(event)
            events.append(event)
            last_event_id = event.id

        # Commit all events in one transaction
        self.db.commit()

        # Refresh all events to get database-generated values
        for event in events:
            self.db.refresh(event)

        return events

    def write_event_chain(
        self,
        session_id: Optional[uuid.UUID],
        events_data: List[Dict[str, Any]],
    ) -> List[Event]:
        """Write a chain of events that are linked together.

        Each event is linked to the previous one via parent_event_id.

        Args:
            session_id: Session ID for all events
            events_data: List of event data dictionaries

        Returns:
            List of created Event objects in chain order
        """
        return self.batch_write_events(session_id, events_data)

    def _get_next_sequence(self, session_id: uuid.UUID) -> int:
        """Get the next sequence number for a session.

        Args:
            session_id: The session to get the next sequence for

        Returns:
            The next sequence number (1-based)
        """
        last_seq = (
            self.db.query(func.max(Event.sequence))
            .filter(Event.session_id == session_id)
            .scalar()
        )
        return (last_seq or 0) + 1

    def link_to_parent(self, event_id: uuid.UUID, parent_event_id: uuid.UUID) -> Event:
        """Link an event to a parent event after creation.

        Args:
            event_id: The event to link
            parent_event_id: The parent event to link to

        Returns:
            The updated event
        """
        event = self.db.query(Event).filter(Event.id == event_id).first()
        if event:
            event.parent_event_id = parent_event_id
            self.db.commit()
            self.db.refresh(event)
        return event
