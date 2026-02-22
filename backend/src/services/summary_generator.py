"""Checkpoint summary generator service for M3 Memory Web milestone.

This module provides functionality to generate structured summaries at checkpoint points,
including narrative summaries, key event extraction, and state change calculation.
"""

import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any

from sqlalchemy.orm import Session
from sqlalchemy import and_, desc

from src.models.event import Event, EventType, VisibilityLevel
from src.models.checkpoint import Checkpoint, CheckpointType
from src.models.character import Character
from src.schemas.summary import (
    CheckpointSummary,
    CheckpointType as SchemaCheckpointType,
    KeyEvent,
    KeyEventType,
    EventParticipant,
    ParticipantRole,
    EventVisibility,
    EventOutcome,
    StateChanges,
    CharacterStateChange,
    CharacterStatus,
    StatusChange,
    NumericStateChange,
    SANStateChange,
    Discovery,
    DiscoveryType,
    DiscoveryVisibility,
    Consequence,
    ConsequenceType,
    ConsequenceSeverity,
    Promise,
    PromiseStatus,
)


class CheckpointSummaryGenerator:
    """Service for generating checkpoint summaries.

    This service provides methods to:
    - Generate checkpoint summaries with narrative
    - Extract key events from checkpoint events
    - Calculate state changes from events
    - Generate narrative from event data
    """

    def __init__(self, db: Session):
        """Initialize the checkpoint summary generator.

        Args:
            db: Database session
        """
        self.db = db

    def generate_checkpoint_summary(
        self,
        checkpoint_id: uuid.UUID,
        events_since_checkpoint: Optional[List[Event]] = None,
    ) -> CheckpointSummary:
        """Generate a summary at a checkpoint point.

        Args:
            checkpoint_id: UUID of the checkpoint
            events_since_checkpoint: List of events since last checkpoint (optional)

        Returns:
            CheckpointSummary object

        Raises:
            ValueError: If checkpoint not found
        """
        # Get checkpoint from database
        checkpoint = self.db.query(Checkpoint).filter(Checkpoint.id == checkpoint_id).first()
        if not checkpoint:
            raise ValueError(f"Checkpoint {checkpoint_id} not found")

        # Get events since last checkpoint if not provided
        if events_since_checkpoint is None:
            events_since_checkpoint = self._get_events_since_checkpoint(checkpoint)

        # Generate narrative
        narrative = self.generate_narrative(events_since_checkpoint, checkpoint)

        # Build checkpoint summary
        checkpoint_summary = CheckpointSummary(
            checkpoint_id=str(checkpoint.id),
            session_id=str(checkpoint.session_id),
            timestamp=checkpoint.created_at,
            checkpoint_type=SchemaCheckpointType(checkpoint.checkpoint_type),
            narrative=narrative,
            character_states=checkpoint.character_states or {},
            current_scene=checkpoint.scene_name,
            world_state=checkpoint.world_state or {},
            recent_events=[str(e.id) for e in events_since_checkpoint[-10:]] if events_since_checkpoint else []
        )

        return checkpoint_summary

    def _get_events_since_checkpoint(self, checkpoint: Checkpoint) -> List[Event]:
        """Get events that occurred since the last checkpoint.

        Args:
            checkpoint: Checkpoint to get events since

        Returns:
            List of events since the checkpoint
        """
        # Get previous checkpoint for this session
        prev_checkpoint = (
            self.db.query(Checkpoint)
            .filter(
                and_(
                    Checkpoint.session_id == checkpoint.session_id,
                    Checkpoint.created_at < checkpoint.created_at,
                    Checkpoint.is_deleted == "false",
                )
            )
            .order_by(desc(Checkpoint.created_at))
            .first()
        )

        # Build query for events
        query = self.db.query(Event).filter(Event.session_id == checkpoint.session_id)

        if prev_checkpoint:
            # Events since previous checkpoint
            query = query.filter(Event.timestamp >= prev_checkpoint.created_at)
        else:
            # All events for session (first checkpoint)
            # Use session creation time or earliest event
            from src.models.session import GameSession
            session = self.db.query(GameSession).filter(GameSession.id == checkpoint.session_id).first()
            if session and session.started_at:
                query = query.filter(Event.timestamp >= session.started_at)

        # Events up to this checkpoint
        query = query.filter(Event.timestamp <= checkpoint.created_at)

        # Order by timestamp
        events = query.order_by(Event.timestamp.asc()).all()

        return events

    def generate_narrative(
        self,
        events: List[Event],
        checkpoint: Optional[Checkpoint] = None
    ) -> str:
        """Generate a narrative summary from events.

        Args:
            events: List of events to generate narrative from
            checkpoint: Optional checkpoint for context

        Returns:
            Narrative string
        """
        if not events:
            if checkpoint:
                return f"Checkpoint created at {checkpoint.created_at.strftime('%H:%M')}. No new events since last checkpoint."
            return "No events to summarize."

        # Count events by type
        event_counts: Dict[str, int] = {}
        for event in events:
            et = event.event_type.value if hasattr(event, 'event_type') else str(event.get('event_type', 'unknown'))
            event_counts[et] = event_counts.get(et, 0) + 1

        # Build narrative parts
        parts = []

        # Add checkpoint time info
        if checkpoint:
            parts.append(f"Checkpoint created at {checkpoint.created_at.strftime('%H:%M')}.")

            # Add scene info
            if checkpoint.scene_name:
                parts.append(f"Current location: {checkpoint.scene_name}")

        # Add event summaries
        if event_counts.get('combat_start', 0) > 0:
            combat_count = event_counts.get('combat_start', 0)
            combat_end = event_counts.get('combat_end', 0)
            if combat_end > 0:
                parts.append(f"Combat occurred ({combat_count} started, {combat_end} ended)")
            else:
                parts.append(f"Combat initiated ({combat_count} times)")

        if event_counts.get('san_check', 0) > 0:
            parts.append(f"SAN checks performed: {event_counts['san_check']}")

        if event_counts.get('damage', 0) > 0:
            parts.append(f"Characters took damage ({event_counts['damage']} instances)")

        # Check for scene changes
        scene_changes = event_counts.get('scene_change', 0)
        if scene_changes > 0:
            parts.append(f"Scene transitions: {scene_changes}")

        # Check for clue discoveries
        clues_found = 0
        for event in events:
            payload = event.payload or {}
            if 'clues' in payload and isinstance(payload['clues'], list):
                clues_found += len(payload['clues'])
        if clues_found > 0:
            parts.append(f"Clues discovered: {clues_found}")

        # Add message count
        message_count = event_counts.get('message', 0)
        if message_count > 0:
            parts.append(f"{message_count} narrative messages")

        # If no specific events, add general info
        if len(parts) <= 1 or (len(parts) == 2 and checkpoint and checkpoint.scene_name):
            total_events = len(events)
            parts.append(f"A total of {total_events} events occurred.")

        return ". ".join(parts) + "."

    def extract_key_events(self, events: List[Event]) -> List[KeyEvent]:
        """Extract key events from a list of events.

        Args:
            events: List of events to analyze

        Returns:
            List of KeyEvent objects
        """
        key_events = []

        # Define event types that are key events
        key_event_types_map = {
            EventType.COMBAT_START: KeyEventType.COMBAT_OCCURRED,
            EventType.COMBAT_END: KeyEventType.COMBAT_OCCURRED,
            EventType.SAN_CHECK: KeyEventType.SAN_CHECK_FAILED,
            EventType.INSANITY_GAIN: KeyEventType.MADNESS_TRIGGERED,
            EventType.DAMAGE: KeyEventType.CHARACTER_INJURED,
            EventType.SCENE_CHANGE: KeyEventType.SCENE_TRANSITION,
        }

        for event in events:
            # Check if this is a key event type
            if event.event_type in key_event_types_map:
                key_event_type = key_event_types_map[event.event_type]

                # Build title and description
                title = self._build_event_title(event, key_event_type)
                description = event.description or self._build_event_description(event)

                # Determine visibility
                visibility = EventVisibility.PUBLIC
                if event.visibility == VisibilityLevel.KP_ONLY:
                    visibility = EventVisibility.KP_ONLY

                # Build key event
                key_event = KeyEvent(
                    event_id=str(event.id),
                    timestamp=event.timestamp,
                    type=key_event_type,
                    title=title,
                    description=description,
                    participants=self._extract_participants(event),
                    outcome=self._extract_outcome(event),
                    related_clues=self._extract_related_clues(event),
                    visibility=visibility,
                )

                key_events.append(key_event)

            # Check for character deaths (HP changes to 0 or below)
            if event.event_type == EventType.HP_CHANGE:
                payload = event.payload or {}
                new_hp = payload.get("new", payload.get("current_hp", 1))
                if new_hp is not None and new_hp <= 0:
                    key_event = KeyEvent(
                        event_id=str(event.id),
                        timestamp=event.timestamp,
                        type=KeyEventType.CHARACTER_DIED,
                        title="Character Death",
                        description=f"Character has died (HP: {new_hp}).",
                        participants=self._extract_participants(event),
                        visibility=EventVisibility.PUBLIC,
                    )
                    key_events.append(key_event)

            # Check for critical failures (rolls of 96-100)
            if event.event_type == EventType.ROLL:
                payload = event.payload or {}
                roll_value = payload.get("roll", 0)
                if roll_value >= 96:
                    key_event = KeyEvent(
                        event_id=str(event.id),
                        timestamp=event.timestamp,
                        type=KeyEventType.CRITICAL_FAILURE,
                        title="Critical Failure",
                        description=f"Critical failure on skill check (rolled {roll_value}).",
                        participants=self._extract_participants(event),
                        visibility=EventVisibility.PUBLIC,
                    )
                    key_events.append(key_event)

        return key_events

    def _build_event_title(self, event: Event, key_event_type: KeyEventType) -> str:
        """Build a title for a key event.

        Args:
            event: Event object
            key_event_type: Type of key event

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
            KeyEventType.CRITICAL_FAILURE: "Critical Failure",
        }

        return title_map.get(key_event_type, "Significant Event")

    def _build_event_description(self, event: Event) -> str:
        """Build a description for an event.

        Args:
            event: Event object

        Returns:
            Description string
        """
        if event.description:
            return event.description

        # Generate description from event type
        event_type = event.event_type.value if hasattr(event, 'event_type') else str(event.get('event_type', 'unknown'))
        payload = event.payload or {}

        if event_type == "combat_start":
            enemy = payload.get("enemy", "an enemy")
            return f"Combat initiated with {enemy}."
        elif event_type == "combat_end":
            result = payload.get("result", "ended")
            return f"Combat concluded ({result})."
        elif event_type == "san_check":
            reason = payload.get("reason", "unknown cause")
            loss = payload.get("loss_amount", payload.get("loss", 0))
            return f"SAN check for {reason} (lost {loss} SAN)."
        elif event_type == "damage":
            amount = payload.get("amount", 0)
            source = payload.get("source", "unknown source")
            return f"Took {amount} damage from {source}."
        elif event_type == "scene_change":
            old_scene = payload.get("old_scene", "previous location")
            new_scene = payload.get("new_scene", "new location")
            return f"Moved from {old_scene} to {new_scene}."
        elif event_type == "roll":
            skill = payload.get("skill", "skill")
            roll = payload.get("roll", 0)
            return f"Rolled {skill}: {roll}."
        else:
            return f"Event of type {event_type} occurred."

    def _extract_participants(self, event: Event) -> List[EventParticipant]:
        """Extract participants from an event.

        Args:
            event: Event object

        Returns:
            List of EventParticipant objects
        """
        participants = []

        if event.character_id:
            participants.append(EventParticipant(
                user_id=event.actor_player_id or 0,
                character_id=event.character_id,
                role=ParticipantRole.ACTIVE if event.actor_role == "player" else ParticipantRole.WITNESS
            ))

        return participants

    def _extract_outcome(self, event: Event) -> Optional[EventOutcome]:
        """Extract outcome from an event.

        Args:
            event: Event object

        Returns:
            EventOutcome object or None
        """
        payload = event.payload or {}

        if event.event_type == EventType.ROLL:
            success = payload.get("success_level") in ["regular_success", "hard_success", "extreme_success"]
            return EventOutcome(
                success=success,
                description=payload.get("success_level", "unknown"),
            )

        if event.event_type == EventType.SAN_CHECK:
            success = payload.get("loss_amount", 0) == 0
            return EventOutcome(
                success=success,
                description=f"Lost {payload.get('loss_amount', 0)} SAN",
            )

        if event.event_type in (EventType.COMBAT_START, EventType.COMBAT_END):
            return EventOutcome(
                success=event.event_type == EventType.COMBAT_END,
                description=event.description or "",
            )

        return None

    def _extract_related_clues(self, event: Event) -> List[str]:
        """Extract related clues from an event.

        Args:
            event: Event object

        Returns:
            List of clue identifiers
        """
        payload = event.payload or {}

        if 'clues' in payload and isinstance(payload['clues'], list):
            return payload['clues']

        return []

    def calculate_state_changes(self, events: List[Event]) -> StateChanges:
        """Calculate state changes from events.

        Args:
            events: List of events to analyze

        Returns:
            StateChanges object
        """
        # Track character state changes
        character_changes: Dict[int, Dict[str, Dict[str, Any]]] = {}

        # Track discoveries
        discoveries = []

        # Track consequences
        consequences = []

        for event in events:
            # Process state change events
            if event.character_id and event.event_type in (
                EventType.HP_CHANGE,
                EventType.DAMAGE,
                EventType.HEAL,
                EventType.SAN_CHANGE,
                EventType.SAN_LOSS,
                EventType.LUCK_CHANGE,
                EventType.MP_CHANGE,
            ):
                char_id = event.character_id
                if char_id not in character_changes:
                    character_changes[char_id] = {
                        "hp": {"old": 0, "new": 0, "delta": 0, "events": []},
                        "san": {"old": 0, "new": 0, "delta": 0, "events": []},
                        "luck": {"old": 0, "new": 0, "delta": 0, "events": []},
                        "mp": {"old": 0, "new": 0, "delta": 0, "events": []},
                    }

                # Update state changes
                payload = event.payload or {}

                if event.event_type in (EventType.HP_CHANGE, EventType.DAMAGE, EventType.HEAL):
                    amount = payload.get("amount", 0) or payload.get("change", 0)
                    if event.event_type in (EventType.DAMAGE, EventType.HP_CHANGE):
                        character_changes[char_id]["hp"]["delta"] -= abs(amount)
                    else:  # HEAL
                        character_changes[char_id]["hp"]["delta"] += abs(amount)
                    character_changes[char_id]["hp"]["events"].append(str(event.id))

                elif event.event_type in (EventType.SAN_CHANGE, EventType.SAN_LOSS):
                    amount = payload.get("amount", 0) or payload.get("loss", 0)
                    character_changes[char_id]["san"]["delta"] -= abs(amount)
                    character_changes[char_id]["san"]["events"].append(str(event.id))

                elif event.event_type == EventType.LUCK_CHANGE:
                    amount = payload.get("change", 0)
                    character_changes[char_id]["luck"]["delta"] += amount
                    character_changes[char_id]["luck"]["events"].append(str(event.id))

                elif event.event_type == EventType.MP_CHANGE:
                    amount = payload.get("amount", 0) or payload.get("change", 0)
                    character_changes[char_id]["mp"]["delta"] += amount
                    character_changes[char_id]["mp"]["events"].append(str(event.id))

            # Extract discoveries
            payload = event.payload or {}
            if 'clues' in payload and isinstance(payload['clues'], list) and payload['clues']:
                for clue in payload['clues']:
                    discovery = Discovery(
                        discovery_id=str(uuid.uuid4()),
                        timestamp=event.timestamp,
                        type=DiscoveryType.CLUE,
                        content={
                            "title": str(clue),
                            "description": f"Clue discovered: {clue}",
                            "evidence": [str(event.id)]
                        },
                        discoverer={
                            "user_id": event.actor_player_id or 0,
                            "character_id": event.character_id
                        },
                        visibility=DiscoveryVisibility.PARTY
                    )
                    discoveries.append(discovery)

            # Extract consequences from damage
            if event.event_type == EventType.DAMAGE:
                payload = event.payload or {}
                amount = payload.get("amount", 0)
                if amount > 0:
                    consequence = Consequence(
                        consequence_id=str(uuid.uuid4()),
                        timestamp=event.timestamp,
                        type=ConsequenceType.INJURY,
                        description=f"Character took {amount} damage",
                        severity=ConsequenceSeverity.MODERATE if amount < 5 else ConsequenceSeverity.MAJOR,
                        cause={
                            "event_id": str(event.id),
                            "description": payload.get("source", "unknown source")
                        },
                        affected={
                            "characters": [event.character_id] if event.character_id else [],
                            "party": False
                        }
                    )
                    consequences.append(consequence)

        # Build CharacterStateChange objects
        character_state_changes = []
        for char_id, changes in character_changes.items():
            # Get character name
            character = self.db.query(Character).filter(Character.id == char_id).first()
            char_name = character.name if character else f"Character {char_id}"

            # Only include characters with actual changes
            if any(changes[s]["delta"] != 0 for s in ["hp", "san", "luck", "mp"]):
                character_state_changes.append(
                    CharacterStateChange(
                        character_id=char_id,
                        character_name=char_name,
                        changes=changes,
                        status_changes=self._determine_status_changes(changes),
                        skill_changes=[],
                        inventory_changes={"added": [], "removed": [], "used": []},
                    )
                )

        return StateChanges(
            characters=character_state_changes,
            discoveries=discoveries,
            consequences=consequences,
        )

    def _determine_status_changes(self, changes: Dict[str, Dict[str, Any]]) -> List[StatusChange]:
        """Determine status changes based on state changes.

        Args:
            changes: Dictionary of state changes

        Returns:
            List of StatusChange objects
        """
        status_changes = []

        # Check HP for injury/death
        hp_delta = changes.get("hp", {}).get("delta", 0)
        if hp_delta < 0:
            old_status = CharacterStatus.HEALTHY
            if hp_delta >= -3:
                new_status = CharacterStatus.INJURED
            elif hp_delta >= -6:
                new_status = CharacterStatus.WOUNDED
            else:
                new_status = CharacterStatus.CRITICAL

            if hp_delta <= -12:
                new_status = CharacterStatus.DYING

            status_changes.append(StatusChange(
                old=old_status,
                new=new_status,
                reason=f"HP changed by {hp_delta}"
            ))

        # Check SAN for madness
        san_delta = changes.get("san", {}).get("delta", 0)
        if san_delta < 0:
            status_changes.append(StatusChange(
                old=CharacterStatus.HEALTHY,
                new=CharacterStatus.TEMPORARY_MADNESS,
                reason=f"SAN decreased by {abs(san_delta)}"
            ))

        return status_changes
