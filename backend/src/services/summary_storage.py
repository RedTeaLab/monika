"""Summary storage service for M3 Memory Web milestone.

This module provides functionality to write, update, and query summaries
in the database, including support for versioning.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from sqlalchemy.orm import Session
from sqlalchemy import and_, desc

from src.models.summary import Summary, SummaryType


class SummaryStorageService:
    """Service for storing and retrieving summaries.

    This service provides methods to:
    - Write new summaries to the database
    - Update existing summaries
    - Query summaries by various criteria
    - Handle summary versioning (through updates)
    - Soft delete summaries
    """

    def __init__(self, db: Session):
        """Initialize the summary storage service.

        Args:
            db: Database session
        """
        self.db = db

    def write_checkpoint_summary(
        self,
        session_id: uuid.UUID,
        checkpoint_type: str,
        narrative: str,
        scene_name: Optional[str] = None,
        character_states: Optional[Dict[str, Any]] = None,
        world_state: Optional[Dict[str, Any]] = None,
        event_ids: Optional[List[str]] = None,
        checkpoint_id: Optional[uuid.UUID] = None,
    ) -> Summary:
        """Write a checkpoint summary to the database.

        Args:
            session_id: Session UUID
            checkpoint_type: Type of checkpoint (manual, auto, etc.)
            narrative: Narrative summary text
            scene_name: Current scene name
            character_states: Character states at checkpoint
            world_state: World state at checkpoint
            event_ids: List of event IDs covered by this summary
            checkpoint_id: Associated checkpoint UUID (optional)

        Returns:
            Created Summary instance
        """
        # Extract key events from event IDs
        key_events = []
        if event_ids:
            from src.models.event import Event
            events = self.db.query(Event).filter(
                Event.id.in_([uuid.UUID(eid) for eid in event_ids])
            ).all()

            for event in events:
                if event.event_type.value in ['combat_start', 'combat_end', 'chase_start',
                                              'chase_end', 'san_check', 'insanity_gain',
                                              'scene_change', 'damage']:
                    key_events.append({
                        "event_type": event.event_type.value,
                        "description": event.description or "",
                        "event_id": str(event.id),
                        "timestamp": event.timestamp.isoformat() if event.timestamp else None,
                    })

        # Get event range
        first_event_id = None
        last_event_id = None
        if event_ids:
            first_event_id = uuid.UUID(event_ids[0])
            last_event_id = uuid.UUID(event_ids[-1])

        summary = Summary(
            session_id=session_id,
            checkpoint_id=checkpoint_id,
            summary_type=SummaryType.CHECKPOINT.value,
            narrative_summary=narrative,
            key_events=key_events,
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
            scene_name=scene_name,
            participant_character_ids=[],
            total_events=len(event_ids) if event_ids else 0,
            first_event_id=first_event_id,
            last_event_id=last_event_id,
            generated_by="ai",
        )

        self.db.add(summary)
        self.db.commit()
        self.db.refresh(summary)

        return summary

    def write_session_summary(
        self,
        session_id: uuid.UUID,
        narrative_summary: str,
        event_ids: Optional[List[str]] = None,
        total_events: int = 0,
        scene_name: Optional[str] = None,
        generated_by: str = "ai",
        model_used: Optional[str] = None,
    ) -> Summary:
        """Write a session summary to the database.

        Args:
            session_id: Session UUID
            narrative_summary: Narrative summary text
            event_ids: List of event IDs covered by this summary
            total_events: Total number of events
            scene_name: Current scene name
            generated_by: Who generated the summary ("ai" or "manual")
            model_used: LLM model used (if AI generated)

        Returns:
            Created Summary instance
        """
        # Get event range
        first_event_id = None
        last_event_id = None
        first_event_sequence = None
        last_event_sequence = None

        if event_ids:
            first_event_id = uuid.UUID(event_ids[0])
            last_event_id = uuid.UUID(event_ids[-1])

            from src.models.event import Event
            first_event = self.db.query(Event).filter(Event.id == first_event_id).first()
            last_event = self.db.query(Event).filter(Event.id == last_event_id).first()

            if first_event:
                first_event_sequence = getattr(first_event, 'sequence', None)
            if last_event:
                last_event_sequence = getattr(last_event, 'sequence', None)

        summary = Summary(
            session_id=session_id,
            summary_type=SummaryType.SESSION.value,
            narrative_summary=narrative_summary,
            key_events=[],
            state_changes=[],
            discovered_clues=[],
            pending_promises=[],
            scene_name=scene_name,
            participant_character_ids=[],
            total_events=total_events or len(event_ids) if event_ids else 0,
            first_event_id=first_event_id,
            last_event_id=last_event_id,
            first_event_sequence=first_event_sequence,
            last_event_sequence=last_event_sequence,
            generated_by=generated_by,
            model_used=model_used,
        )

        self.db.add(summary)
        self.db.commit()
        self.db.refresh(summary)

        return summary

    def write_summary(
        self,
        session_id: uuid.UUID,
        summary_type: SummaryType,
        narrative_summary: str,
        events: Optional[List] = None,
        checkpoint_id: Optional[uuid.UUID] = None,
        scene_id: Optional[str] = None,
        scene_name: Optional[str] = None,
        generated_by: str = "ai",
        model_used: Optional[str] = None,
        generation_method: Optional[str] = None,
    ) -> Summary:
        """Write a generic summary to the database.

        This is a more flexible method that can handle different summary types.

        Args:
            session_id: Session UUID
            summary_type: Type of summary (checkpoint, scene, session)
            narrative_summary: Narrative summary text
            events: List of Event objects (optional)
            checkpoint_id: Associated checkpoint UUID
            scene_id: Scene identifier
            scene_name: Scene name
            generated_by: Who generated the summary
            model_used: LLM model used
            generation_method: How the summary was generated

        Returns:
            Created Summary instance
        """
        # Convert events to key events
        key_events = []
        state_changes = []
        discovered_clues = []
        participant_character_ids = set()
        event_counts = {}

        if events:
            for event in events:
                # Count events by type
                event_type = event.event_type.value if hasattr(event, 'event_type') else 'unknown'
                event_counts[event_type] = event_counts.get(event_type, 0) + 1

                # Extract key events
                if hasattr(event, 'event_type'):
                    if event.event_type.value in ['combat_start', 'combat_end', 'chase_start',
                                                  'chase_end', 'san_check', 'insanity_gain',
                                                  'scene_change']:
                        key_events.append({
                            "event_type": event.event_type.value,
                            "description": event.description or "",
                            "event_id": str(event.id),
                            "timestamp": event.timestamp.isoformat() if event.timestamp else None,
                        })

                    # Track participants
                    if event.character_id:
                        participant_character_ids.add(event.character_id)

                # Extract clues from payload
                if hasattr(event, 'payload') and event.payload:
                    if 'clues' in event.payload:
                        discovered_clues.extend(event.payload['clues'])

        # Get event range
        first_event_id = None
        last_event_id = None
        first_event_sequence = None
        last_event_sequence = None
        time_range_start = None
        time_range_end = None

        if events and len(events) > 0:
            first_event = events[0]
            last_event = events[-1]

            if hasattr(first_event, 'id'):
                first_event_id = first_event.id
                first_event_sequence = getattr(first_event, 'sequence', None)
                time_range_start = getattr(first_event, 'timestamp', None)

            if hasattr(last_event, 'id'):
                last_event_id = last_event.id
                last_event_sequence = getattr(last_event, 'sequence', None)
                time_range_end = getattr(last_event, 'timestamp', None)

        summary = Summary(
            session_id=session_id,
            checkpoint_id=checkpoint_id,
            summary_type=summary_type.value,
            narrative_summary=narrative_summary,
            key_events=key_events,
            state_changes=state_changes,
            discovered_clues=discovered_clues,
            pending_promises=[],
            scene_id=scene_id,
            scene_name=scene_name,
            participant_character_ids=list(participant_character_ids),
            total_events=len(events) if events else 0,
            event_counts=event_counts,
            first_event_id=first_event_id,
            last_event_id=last_event_id,
            first_event_sequence=first_event_sequence,
            last_event_sequence=last_event_sequence,
            time_range_start=time_range_start,
            time_range_end=time_range_end,
            generated_by=generated_by,
            model_used=model_used,
            generation_method=generation_method,
        )

        self.db.add(summary)
        self.db.commit()
        self.db.refresh(summary)

        return summary

    def update_summary(
        self,
        summary_id: uuid.UUID,
        narrative_summary: Optional[str] = None,
        key_events: Optional[List[Dict[str, Any]]] = None,
        state_changes: Optional[List[Dict[str, Any]]] = None,
        discovered_clues: Optional[List[str]] = None,
        user_rating: Optional[int] = None,
        user_feedback: Optional[str] = None,
    ) -> Summary:
        """Update an existing summary.

        This handles versioning by updating the existing record and tracking changes.

        Args:
            summary_id: Summary UUID to update
            narrative_summary: New narrative summary text
            key_events: Updated key events
            state_changes: Updated state changes
            discovered_clues: Updated discovered clues
            user_rating: User rating (1-5)
            user_feedback: User feedback text

        Returns:
            Updated Summary instance

        Raises:
            ValueError: If summary not found
        """
        summary = self.db.query(Summary).filter(Summary.id == summary_id).first()

        if not summary:
            raise ValueError(f"Summary {summary_id} not found")

        # Update fields if provided
        if narrative_summary is not None:
            summary.narrative_summary = narrative_summary
        if key_events is not None:
            summary.key_events = key_events
        if state_changes is not None:
            summary.state_changes = state_changes
        if discovered_clues is not None:
            summary.discovered_clues = discovered_clues
        if user_rating is not None:
            summary.user_rating = user_rating
        if user_feedback is not None:
            summary.user_feedback = user_feedback

        # Update timestamp
        summary.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(summary)

        return summary

    def get_summary_by_id(self, summary_id: uuid.UUID) -> Optional[Summary]:
        """Get a summary by its ID.

        Args:
            summary_id: Summary UUID

        Returns:
            Summary instance or None if not found
        """
        return self.db.query(Summary).filter(
            and_(
                Summary.id == summary_id,
                Summary.is_deleted == "false"
            )
        ).first()

    def get_latest_summary(
        self,
        session_id: uuid.UUID,
        summary_type: Optional[SummaryType] = None,
    ) -> Optional[Summary]:
        """Get the latest summary for a session.

        Args:
            session_id: Session UUID
            summary_type: Optional filter by summary type

        Returns:
            Latest Summary instance or None
        """
        query = self.db.query(Summary).filter(
            and_(
                Summary.session_id == session_id,
                Summary.is_deleted == "false"
            )
        )

        if summary_type:
            query = query.filter(Summary.summary_type == summary_type.value)

        # Order by created_at desc, then by id desc as tiebreaker
        return query.order_by(Summary.created_at.desc(), Summary.id.desc()).first()

    def get_summaries_by_session(
        self,
        session_id: uuid.UUID,
        summary_type: Optional[SummaryType] = None,
        limit: int = 10,
        offset: int = 0,
    ) -> List[Summary]:
        """Get summaries for a session.

        Args:
            session_id: Session UUID
            summary_type: Optional filter by summary type
            limit: Maximum number of summaries to return
            offset: Number of summaries to skip

        Returns:
            List of Summary instances
        """
        query = self.db.query(Summary).filter(
            and_(
                Summary.session_id == session_id,
                Summary.is_deleted == "false"
            )
        )

        if summary_type:
            query = query.filter(Summary.summary_type == summary_type.value)

        return query.order_by(Summary.created_at.desc()).offset(offset).limit(limit).all()

    def delete_summary(self, summary_id: uuid.UUID) -> bool:
        """Soft delete a summary.

        Args:
            summary_id: Summary UUID to delete

        Returns:
            True if deleted successfully

        Raises:
            ValueError: If summary not found
        """
        summary = self.db.query(Summary).filter(Summary.id == summary_id).first()

        if not summary:
            raise ValueError(f"Summary {summary_id} not found")

        summary.mark_deleted()
        self.db.commit()

        return True

    def get_checkpoint_summaries(
        self,
        session_id: uuid.UUID,
        limit: int = 10,
    ) -> List[Summary]:
        """Get checkpoint summaries for a session.

        Args:
            session_id: Session UUID
            limit: Maximum number of summaries to return

        Returns:
            List of checkpoint Summary instances
        """
        return self.get_summaries_by_session(
            session_id=session_id,
            summary_type=SummaryType.CHECKPOINT,
            limit=limit,
        )

    def get_session_summaries(
        self,
        session_id: uuid.UUID,
        limit: int = 10,
    ) -> List[Summary]:
        """Get session summaries for a session.

        Args:
            session_id: Session UUID
            limit: Maximum number of summaries to return

        Returns:
            List of session Summary instances
        """
        return self.get_summaries_by_session(
            session_id=session_id,
            summary_type=SummaryType.SESSION,
            limit=limit,
        )
