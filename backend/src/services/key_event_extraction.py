"""Key event extraction service for M3 Memory Web milestone.

This module provides functionality to extract important events from session logs,
including combat, SAN checks, discoveries, and other significant moments.
"""

import uuid
from datetime import datetime
from typing import List, Optional, Set, Dict, Any

from sqlalchemy.orm import Session

from src.models.event import Event, EventType, VisibilityLevel
from src.models.character import Character
from src.schemas.summary import (
    KeyEvent,
    KeyEventType,
    EventVisibility,
    EventOutcome,
    EventParticipant,
    ParticipantRole,
)


# Priority mapping: higher number = higher priority
EVENT_TYPE_PRIORITY = {
    KeyEventType.CHARACTER_DIED: 100,
    KeyEventType.MADNESS_TRIGGERED: 90,
    KeyEventType.COMBAT_OCCURRED: 80,
    KeyEventType.SAN_CHECK_FAILED: 70,
    KeyEventType.CHARACTER_INJURED: 60,
    KeyEventType.SCENE_TRANSITION: 50,
    KeyEventType.CLUE_DISCOVERED: 40,
    KeyEventType.PUZZLE_SOLVED: 35,
    KeyEventType.MYSTERY_REVEALED: 30,
    KeyEventType.CRITICAL_FAILURE: 20,
}


class KeyEventExtractor:
    """Service for extracting key events from session event logs.

    This service identifies significant events that should be highlighted
    in session summaries, including:
    - Combat encounters
    - SAN check failures
    - Character injuries and deaths
    - Scene transitions
    - Critical discoveries
    - Critical failures

    Key events are ranked by importance and returned as structured objects.
    """

    # Mapping of EventType to KeyEventType
    EVENT_TYPE_MAPPING = {
        EventType.COMBAT_START: KeyEventType.COMBAT_OCCURRED,
        EventType.COMBAT_END: KeyEventType.COMBAT_OCCURRED,
        EventType.COMBAT_ROUND: KeyEventType.COMBAT_OCCURRED,
        EventType.DAMAGE: KeyEventType.CHARACTER_INJURED,
        EventType.HP_CHANGE: KeyEventType.CHARACTER_INJURED,
        EventType.SAN_CHECK: KeyEventType.SAN_CHECK_FAILED,
        EventType.SAN_LOSS: KeyEventType.SAN_CHECK_FAILED,
        EventType.INSANITY_GAIN: KeyEventType.MADNESS_TRIGGERED,
        EventType.SCENE_CHANGE: KeyEventType.SCENE_TRANSITION,
    }

    def __init__(self, db: Session):
        """Initialize the key event extractor.

        Args:
            db: Database session
        """
        self.db = db

    def extract_key_events(
        self,
        events: List[Event],
        limit: Optional[int] = None,
        event_types: Optional[List[KeyEventType]] = None,
    ) -> List[KeyEvent]:
        """Extract key events from a list of events.

        Args:
            events: List of events to analyze
            limit: Optional limit on number of key events to return
            event_types: Optional filter to only extract specific event types

        Returns:
            List of KeyEvent objects, ranked by importance
        """
        if not events:
            return []

        key_events = []

        for event in events:
            key_event = self._convert_to_key_event(event)
            if key_event:
                # Apply type filter if specified
                if event_types and key_event.type not in event_types:
                    continue
                key_events.append(key_event)

        # Rank by importance
        key_events = self._rank_by_importance(key_events)

        # Apply limit if specified
        if limit:
            key_events = key_events[:limit]

        return key_events

    def _convert_to_key_event(self, event: Event) -> Optional[KeyEvent]:
        """Convert an Event to a KeyEvent if it's a significant event.

        Args:
            event: The event to convert

        Returns:
            KeyEvent if the event is significant, None otherwise
        """
        # Check if event type maps to a key event type
        key_event_type = self.EVENT_TYPE_MAPPING.get(event.event_type)

        if not key_event_type:
            # Check for special cases like critical failures
            if event.event_type == EventType.ROLL:
                payload = event.payload or {}
                success_level = payload.get("success_level", "")
                if success_level == "fumble":
                    key_event_type = KeyEventType.CRITICAL_FAILURE
                else:
                    return None
            else:
                return None

        # Handle HP changes for character death
        if event.event_type == EventType.HP_CHANGE:
            payload = event.payload or {}
            new_hp = payload.get("new", 0)
            if new_hp <= 0:
                key_event_type = KeyEventType.CHARACTER_DIED

        # Build title and description
        title = self._build_title(event, key_event_type)
        description = self._build_description(event, key_event_type)

        # Determine visibility
        visibility = EventVisibility.PUBLIC
        if event.visibility == VisibilityLevel.KP_ONLY:
            visibility = EventVisibility.KP_ONLY

        # Build key event
        return KeyEvent(
            event_id=str(event.id),
            timestamp=event.timestamp,
            type=key_event_type,
            title=title,
            description=description,
            participants=self._extract_participants(event),
            outcome=self._extract_outcome(event, key_event_type),
            related_clues=self._extract_clues(event),
            visibility=visibility,
        )

    def _build_title(self, event: Event, key_event_type: KeyEventType) -> str:
        """Build a title for a key event.

        Args:
            event: The original event
            key_event_type: The type of key event

        Returns:
            Title string
        """
        title_map = {
            KeyEventType.COMBAT_OCCURRED: "Combat Encounter",
            KeyEventType.SAN_CHECK_FAILED: "SAN Check",
            KeyEventType.MADNESS_TRIGGERED: "Madness Triggered",
            KeyEventType.CHARACTER_INJURED: "Character Injured",
            KeyEventType.CHARACTER_DIED: "Character Death",
            KeyEventType.SCENE_TRANSITION: "Scene Change",
            KeyEventType.CLUE_DISCOVERED: "Clue Discovered",
            KeyEventType.PUZZLE_SOLVED: "Puzzle Solved",
            KeyEventType.MYSTERY_REVEALED: "Mystery Revealed",
            KeyEventType.CRITICAL_FAILURE: "Critical Failure",
        }

        return title_map.get(key_event_type, "Significant Event")

    def _build_description(self, event: Event, key_event_type: KeyEventType) -> str:
        """Build a description for a key event.

        Args:
            event: The original event
            key_event_type: The type of key event

        Returns:
            Description string
        """
        # Use existing description if available
        if event.description:
            return event.description

        # Generate description from event type and payload
        payload = event.payload or {}
        event_type = event.event_type.value

        if event_type == "combat_start":
            enemy = payload.get("enemy", "enemy")
            return f"Combat started with {enemy}."
        elif event_type == "combat_end":
            result = payload.get("result", "unknown")
            return f"Combat ended with {result}."
        elif event_type == "damage":
            amount = payload.get("amount", 0)
            source = payload.get("source", "unknown source")
            return f"Took {amount} damage from {source}."
        elif event_type == "hp_change":
            new_hp = payload.get("new", 0)
            old_hp = payload.get("old", 0)
            if new_hp <= 0:
                return f"Character died (HP: {old_hp} -> {new_hp})."
            return f"HP changed from {old_hp} to {new_hp}."
        elif event_type == "san_check":
            reason = payload.get("reason", "unknown cause")
            roll = payload.get("roll", 0)
            loss = payload.get("loss_amount", 0)
            return f"SAN check for {reason}: rolled {roll}, lost {loss} SAN."
        elif event_type == "san_loss":
            amount = payload.get("amount", 0)
            reason = payload.get("reason", "unknown cause")
            return f"Lost {amount} SAN from {reason}."
        elif event_type == "insanity_gain":
            ins_type = payload.get("type", "unknown")
            return f"Insanity triggered ({ins_type} type)."
        elif event_type == "scene_change":
            old_scene = payload.get("old_scene", "previous location")
            new_scene = payload.get("new_scene", "new location")
            return f"Moved from {old_scene} to {new_scene}."
        elif event_type == "roll" and payload.get("success_level") == "fumble":
            skill = payload.get("skill", "skill")
            roll = payload.get("roll", 0)
            return f"Critical failure on {skill}: rolled {roll}."
        else:
            return f"Event of type {event_type} occurred."

    def _extract_participants(self, event: Event) -> List[EventParticipant]:
        """Extract participants from an event.

        Args:
            event: The original event

        Returns:
            List of EventParticipant objects
        """
        participants = []

        if event.character_id:
            participants.append(
                EventParticipant(
                    user_id=event.actor_player_id or 0,
                    character_id=event.character_id,
                    role=ParticipantRole.ACTIVE,
                )
            )

        return participants

    def _extract_outcome(
        self, event: Event, key_event_type: KeyEventType
    ) -> Optional[EventOutcome]:
        """Extract outcome information from an event.

        Args:
            event: The original event
            key_event_type: The type of key event

        Returns:
            EventOutcome if applicable, None otherwise
        """
        payload = event.payload or {}

        if key_event_type == KeyEventType.COMBAT_OCCURRED:
            if event.event_type == EventType.COMBAT_END:
                result = payload.get("result", "unknown")
                return EventOutcome(
                    success=result == "victory",
                    description=f"Combat result: {result}",
                )

        if key_event_type == KeyEventType.SAN_CHECK_FAILED:
            roll = payload.get("roll", 0)
            loss = payload.get("loss_amount", 0)
            return EventOutcome(
                success=False,
                description=f"Failed SAN check: rolled {roll}, lost {loss} SAN",
            )

        if key_event_type == KeyEventType.CHARACTER_INJURED:
            amount = payload.get("amount", 0)
            return EventOutcome(
                success=False,
                description=f"Character took {amount} damage",
            )

        return None

    def _extract_clues(self, event: Event) -> List[str]:
        """Extract clue information from an event.

        Args:
            event: The original event

        Returns:
            List of clue identifiers
        """
        payload = event.payload or {}

        if "clues" in payload and isinstance(payload["clues"], list):
            return payload["clues"]

        return []

    def _rank_by_importance(self, key_events: List[KeyEvent]) -> List[KeyEvent]:
        """Rank key events by importance.

        Args:
            key_events: List of key events to rank

        Returns:
            Sorted list of key events (most important first)
        """
        return sorted(
            key_events,
            key=lambda e: EVENT_TYPE_PRIORITY.get(e.type, 0),
            reverse=True,
        )
