"""Summary generation service for M3 Memory Web milestone.

This module provides functionality to generate structured summaries of game sessions,
including checkpoint summaries, scene summaries, and full session summaries.
"""

import uuid
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc

from src.models.event import Event, EventType, VisibilityLevel
from src.models.session import GameSession
from src.models.character import Character
from src.models.checkpoint import Checkpoint, CheckpointType
from src.models.summary import Summary, SummaryType
from src.services.events import EventLogger
from src.schemas.summary import (
    CheckpointSummary,
    SceneSummary,
    SessionSummary,
    KeyEvent,
    KeyEventType,
    NarrativeSummary,
    NarrativeMood,
    CharacterStateChange,
    CharacterStatus,
    Discovery,
    DiscoveryType,
    DiscoveryVisibility,
    Consequence,
    ConsequenceType,
    ConsequenceSeverity,
    Promise,
    PromiseStatus,
    SessionStatistics,
    Leads,
    StateChanges,
    SessionInfo,
    EventParticipant,
    ParticipantRole,
    EventVisibility,
    EventOutcome,
)


class SummaryGenerator:
    """Service for generating structured summaries of game sessions.

    This service provides methods to generate:
    - Checkpoint summaries: Brief summaries at checkpoint points
    - Scene summaries: Summaries of individual scenes
    - Session summaries: Comprehensive summaries of full sessions
    """

    def __init__(self, db: Session):
        """Initialize the summary generator.

        Args:
            db: Database session
        """
        self.db = db
        self.event_logger = EventLogger(db)

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

        # Get events since last checkpoint
        if events_since_checkpoint is None:
            events_since_checkpoint = self._get_events_since_checkpoint(checkpoint)

        # Generate narrative
        narrative = self._generate_checkpoint_narrative(events_since_checkpoint, checkpoint)

        # Build checkpoint summary
        checkpoint_summary = CheckpointSummary(
            checkpoint_id=str(checkpoint.id),
            session_id=str(checkpoint.session_id),
            timestamp=checkpoint.created_at,
            checkpoint_type=CheckpointType(checkpoint.checkpoint_type),
            narrative=narrative,
            character_states=checkpoint.character_states or {},
            current_scene=checkpoint.scene_name,
            world_state=checkpoint.world_state or {},
            recent_events=[str(e.id) for e in events_since_checkpoint[-10:]]  # Last 10 events
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
            query = query.filter(Event.timestamp >= checkpoint.session_id)

        # Events up to this checkpoint
        query = query.filter(Event.timestamp <= checkpoint.created_at)

        # Order by timestamp
        events = query.order_by(Event.timestamp.asc()).all()

        return events

    def _generate_checkpoint_narrative(
        self, events: List[Event], checkpoint: Checkpoint
    ) -> str:
        """Generate a brief narrative for a checkpoint.

        Args:
            events: Events since last checkpoint
            checkpoint: Current checkpoint

        Returns:
            Brief narrative string
        """
        if not events:
            return "No new events since last checkpoint."

        # Count events by type
        event_counts = {}
        for event in events:
            et = event.event_type.value
            event_counts[et] = event_counts.get(et, 0) + 1

        # Build narrative
        parts = []
        parts.append(f"Session checkpoint created at {checkpoint.created_at.strftime('%H:%M')}.")

        if checkpoint.scene_name:
            parts.append(f"Current location: {checkpoint.scene_name}")

        # Highlight key events
        if event_counts.get('combat_start', 0) > 0:
            parts.append(f"Combat initiated ({event_counts['combat_start']} times)")

        if event_counts.get('san_check', 0) > 0:
            parts.append(f"SAN checks performed: {event_counts['san_check']}")

        if event_counts.get('damage', 0) > 0:
            parts.append(f"Characters took damage ({event_counts['damage']} instances)")

        # Check for scene changes
        scene_changes = event_counts.get('scene_change', 0)
        if scene_changes > 0:
            parts.append(f"Scene transitions: {scene_changes}")

        return ". ".join(parts) + "."

    def generate_scene_summary(
        self,
        session_id: uuid.UUID,
        scene_id: str,
        scene_start: datetime,
        scene_end: Optional[datetime] = None,
    ) -> SceneSummary:
        """Generate a summary for a specific scene.

        Args:
            session_id: UUID of the session
            scene_id: Scene identifier
            scene_start: Start time of the scene
            scene_end: End time of the scene (optional)

        Returns:
            SceneSummary object
        """
        # Get events for this scene
        events = (
            self.db.query(Event)
            .filter(
                and_(
                    Event.session_id == session_id,
                    Event.timestamp >= scene_start,
                    Event.timestamp <= (scene_end or datetime.utcnow()),
                )
            )
            .order_by(Event.timestamp.asc())
            .all()
        )

        # Get scene info from session
        session = self.db.query(GameSession).filter(GameSession.id == session_id).first()
        scene_title = scene_id
        if session and session.current_scene_name:
            scene_title = session.current_scene_name

        # Extract participants
        participants = list(set([e.character_id for e in events if e.character_id]))

        # Generate narrative
        narrative = self._generate_scene_narrative(events, scene_title)

        # Extract key events
        key_events = self._extract_key_events(events)

        # Build scene summary
        scene_summary = SceneSummary(
            scene_id=scene_id,
            scene_title=scene_title,
            session_id=str(session_id),
            start_time=scene_start,
            end_time=scene_end,
            narrative=narrative,
            key_events=key_events,
            participants=participants,
        )

        return scene_summary

    def _generate_scene_narrative(self, events: List[Event], scene_title: str) -> str:
        """Generate a narrative for a scene.

        Args:
            events: Events in the scene
            scene_title: Title of the scene

        Returns:
            Narrative string
        """
        if not events:
            return f"No activity in {scene_title}."

        # Extract narrative elements
        messages = [e for e in events if e.event_type == EventType.MESSAGE]
        combat_events = [e for e in events if e.event_type in (EventType.COMBAT_START, EventType.COMBAT_END)]
        san_checks = [e for e in events if e.event_type == EventType.SAN_CHECK]

        parts = []
        parts.append(f"Scene: {scene_title}")
        parts.append(f"{len(events)} events occurred.")

        if messages:
            parts.append(f"KP and players exchanged {len(messages)} messages.")

        if combat_events:
            parts.append(f"{len(combat_events)} combat-related events.")

        if san_checks:
            parts.append(f"{len(san_checks)} SAN checks performed.")

        return " ".join(parts)

    def generate_session_summary(
        self,
        session_id: uuid.UUID,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        use_llm: bool = False,
    ) -> SessionSummary:
        """Generate a comprehensive session summary.

        Args:
            session_id: UUID of the session
            start_time: Start time for summary (default: session start)
            end_time: End time for summary (default: now)
            use_llm: Whether to use LLM for narrative generation (default: False)

        Returns:
            SessionSummary object
        """
        # Get session
        session = self.db.query(GameSession).filter(GameSession.id == session_id).first()
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Set default time range
        if start_time is None:
            start_time = session.started_at
        if end_time is None:
            end_time = datetime.utcnow()

        # Get events for time range
        events = (
            self.db.query(Event)
            .filter(
                and_(
                    Event.session_id == session_id,
                    Event.timestamp >= start_time,
                    Event.timestamp <= end_time,
                )
            )
            .order_by(Event.timestamp.asc())
            .all()
        )

        # Generate session info
        session_info = self._build_session_info(session, start_time, end_time)

        # Generate narrative summary
        narrative_summary = self._generate_narrative_summary(events, session, use_llm)

        # Extract key events
        key_events = self._extract_key_events(events)

        # Extract state changes
        state_changes = self._extract_state_changes(events)

        # Extract leads and promises
        leads = self._extract_leads(events)
        promises = self._extract_promises(events)

        # Calculate statistics
        statistics = self._calculate_statistics(events)

        # Build session summary
        summary_id = str(uuid.uuid4())
        now = datetime.utcnow()

        session_summary = SessionSummary(
            summary_id=summary_id,
            session_id=str(session_id),
            created_at=now,
            updated_at=now,
            session_info=session_info,
            narrative_summary=narrative_summary,
            key_events=key_events,
            state_changes=state_changes,
            leads=leads,
            promises=promises,
            statistics=statistics,
            visibility={"public": ["narrative_summary", "key_events", "statistics"], "kp_only": ["state_changes"]},
        )

        return session_summary

    def _build_session_info(
        self, session: GameSession, start_time: datetime, end_time: datetime
    ) -> SessionInfo:
        """Build session info for summary.

        Args:
            session: GameSession object
            start_time: Summary start time
            end_time: Summary end time

        Returns:
            SessionInfo object
        """
        duration = None
        if start_time and end_time:
            duration = int((end_time - start_time).total_seconds())

        return SessionInfo(
            started_at=start_time,
            ended_at=end_time if session.state == "ended" else None,
            duration_seconds=duration,
            scene_id=session.current_scene_id,
            scene_title=session.current_scene_name,
        )

    def _generate_narrative_summary(
        self, events: List[Event], session: GameSession, use_llm: bool
    ) -> NarrativeSummary:
        """Generate narrative summary for session.

        Args:
            events: Events in the session
            session: GameSession object
            use_llm: Whether to use LLM (not implemented yet)

        Returns:
            NarrativeSummary object
        """
        # Determine mood based on events
        mood = self._determine_mood(events)

        # Generate brief summary
        brief = self._generate_brief_summary(events, session)

        # Generate detailed summary
        detailed = self._generate_detailed_summary(events, session)

        # Determine tone
        tone = self._determine_tone(events, mood)

        return NarrativeSummary(brief=brief, detailed=detailed, mood=mood, tone=tone)

    def _determine_mood(self, events: List[Event]) -> NarrativeMood:
        """Determine the mood of the session based on events.

        Args:
            events: Events to analyze

        Returns:
            NarrativeMood enum value
        """
        # Count event types
        event_types = [e.event_type for e in events]

        combat_count = sum(1 for et in event_types if et in (EventType.COMBAT_START, EventType.DAMAGE))
        san_check_count = sum(1 for et in event_types if et == EventType.SAN_CHECK)
        madness_count = sum(1 for et in event_types if et == EventType.INSANITY_GAIN)
        message_count = sum(1 for et in event_types if et == EventType.MESSAGE)

        # Determine mood based on event distribution
        if madness_count > 0 or san_check_count > len(events) * 0.3:
            return NarrativeMood.HORROR
        elif combat_count > len(events) * 0.2:
            return NarrativeMood.ACTION
        elif san_check_count > 0:
            return NarrativeMood.TENSE
        elif message_count > len(events) * 0.7:
            return NarrativeMood.MYSTERY
        else:
            return NarrativeMood.CALM

    def _generate_brief_summary(self, events: List[Event], session: GameSession) -> str:
        """Generate a brief (1-2 sentence) summary.

        Args:
            events: Events to summarize
            session: GameSession object

        Returns:
            Brief summary string
        """
        if not events:
            return f"Session '{session.name}' had no recorded events."

        duration = (events[-1].timestamp - events[0].timestamp).total_seconds() if len(events) > 1 else 0
        minutes = int(duration / 60) if duration > 60 else 0

        location = session.location or "Unknown location"

        if minutes > 0:
            return f"Session in {location} lasting {minutes} minutes with {len(events)} events."
        else:
            return f"Session in {location} with {len(events)} events."

    def _generate_detailed_summary(self, events: List[Event], session: GameSession) -> str:
        """Generate a detailed (2-3 paragraph) summary.

        Args:
            events: Events to summarize
            session: GameSession object

        Returns:
            Detailed summary string
        """
        if not events:
            return f"No activity recorded during session '{session.name}'."

        paragraphs = []

        # Paragraph 1: Overview
        paragraphs.append(
            f"The session began at {events[0].timestamp.strftime('%H:%M')} "
            f"in {session.location or session.current_scene_name or 'an unknown location'}. "
            f"A total of {len(events)} events were recorded over the course of the session."
        )

        # Paragraph 2: Key activities
        key_activities = []
        event_types = [e.event_type for e in events]

        if EventType.COMBAT_START in event_types:
            key_activities.append("combat occurred")
        if EventType.SAN_CHECK in event_types:
            key_activities.append("SAN checks were made")
        if EventType.SCENE_CHANGE in event_types:
            key_activities.append("the party moved between different locations")
        if EventType.DAMAGE in event_types:
            key_activities.append("characters took damage")

        if key_activities:
            paragraphs.append(
                "During the session, " + ", ".join(key_activities) + "."
            )

        # Paragraph 3: Conclusion
        if session.state == "ended":
            paragraphs.append("The session was concluded.")
        else:
            paragraphs.append(
                f"The session was last active at {events[-1].timestamp.strftime('%H:%M')}."
            )

        return "\n\n".join(paragraphs)

    def _determine_tone(self, events: List[Event], mood: NarrativeMood) -> str:
        """Determine descriptive tone text.

        Args:
            events: Events to analyze
            mood: Determined mood

        Returns:
            Tone description string
        """
        tone_descriptions = {
            NarrativeMood.CALM: "Peaceful exploration and investigation",
            NarrativeMood.TENSE: "Mounting tension and uncertainty",
            NarrativeMood.HORROR: "Terrifying encounters and disturbing revelations",
            NarrativeMood.MYSTERY: "Unraveling enigmatic clues and secrets",
            NarrativeMood.ACTION: "Fast-paced conflict and decisive action",
        }

        return tone_descriptions.get(mood, "A mix of exploration, investigation, and conflict")

    def _extract_key_events(self, events: List[Event]) -> List[KeyEvent]:
        """Extract key events from the event log.

        Args:
            events: All events

        Returns:
            List of KeyEvent objects
        """
        key_events = []

        # Define event types that are always key events
        key_event_types = {
            EventType.COMBAT_START: KeyEventType.COMBAT_OCCURRED,
            EventType.COMBAT_END: KeyEventType.COMBAT_OCCURRED,
            EventType.SAN_CHECK: KeyEventType.SAN_CHECK_FAILED,
            EventType.INSANITY_GAIN: KeyEventType.MADNESS_TRIGGERED,
            EventType.DAMAGE: KeyEventType.CHARACTER_INJURED,
            EventType.SCENE_CHANGE: KeyEventType.SCENE_TRANSITION,
        }

        for event in events:
            # Check if this is a key event type
            if event.event_type in key_event_types:
                key_event_type = key_event_types[event.event_type]

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
                    participants=[],
                    outcome=None,
                    related_clues=[],
                    visibility=visibility,
                )

                key_events.append(key_event)

            # Check for character deaths (HP changes)
            if event.event_type == EventType.HP_CHANGE:
                payload = event.payload or {}
                new_hp = payload.get("new", 0)
                if new_hp <= 0:
                    key_event = KeyEvent(
                        event_id=str(event.id),
                        timestamp=event.timestamp,
                        type=KeyEventType.CHARACTER_DIED,
                        title="Character Death",
                        description=f"Character {event.character_id} has died.",
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
        event_type = event.event_type.value
        payload = event.payload or {}

        if event_type == "combat_start":
            return f"Combat initiated at {event.timestamp.strftime('%H:%M')}."
        elif event_type == "combat_end":
            return "Combat concluded."
        elif event_type == "san_check":
            reason = payload.get("reason", "unknown cause")
            return f"SAN check for {reason}."
        elif event_type == "damage":
            amount = payload.get("amount", 0)
            source = payload.get("source", "unknown source")
            return f"Took {amount} damage from {source}."
        elif event_type == "scene_change":
            old_scene = payload.get("old_scene", "previous location")
            new_scene = payload.get("new_scene", "new location")
            return f"Moved from {old_scene} to {new_scene}."
        else:
            return f"Event of type {event_type} occurred."

    def _extract_state_changes(self, events: List[Event]) -> StateChanges:
        """Extract state changes from events.

        Args:
            events: All events

        Returns:
            StateChanges object
        """
        # Track character state changes
        character_changes: Dict[int, Dict[str, Any]] = {}

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
            ):
                char_id = event.character_id
                if char_id not in character_changes:
                    character_changes[char_id] = {
                        "hp": {"old": 0, "new": 0, "delta": 0, "events": []},
                        "san": {"old": 0, "new": 0, "delta": 0, "events": []},
                        "luck": {"old": 0, "new": 0, "delta": 0, "events": []},
                    }

                # Update state changes
                payload = event.payload or {}

                if event.event_type in (EventType.HP_CHANGE, EventType.DAMAGE, EventType.HEAL):
                    amount = payload.get("amount", 0) or payload.get("change", 0)
                    if event.event_type == EventType.DAMAGE or event.event_type == EventType.HP_CHANGE:
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

        # Build CharacterStateChange objects
        character_state_changes = []
        for char_id, changes in character_changes.items():
            # Get character name
            character = self.db.query(Character).filter(Character.id == char_id).first()
            char_name = character.name if character else f"Character {char_id}"

            # Only include characters with actual changes
            if any(changes[s]["delta"] != 0 for s in ["hp", "san", "luck"]):
                character_state_changes.append(
                    CharacterStateChange(
                        character_id=char_id,
                        character_name=char_name,
                        changes=changes,
                        status_changes=[],
                        skill_changes=[],
                        inventory_changes={"added": [], "removed": [], "used": []},
                    )
                )

        return StateChanges(
            characters=character_state_changes,
            discoveries=discoveries,
            consequences=consequences,
        )

    def _extract_leads(self, events: List[Event]) -> Leads:
        """Extract leads information from events.

        Args:
            events: All events

        Returns:
            Leads object
        """
        discovered = []
        resolved = []
        pending = []

        for event in events:
            payload = event.payload or {}

            # Check for clue discoveries
            if "clues" in payload and isinstance(payload["clues"], list):
                discovered.extend(payload["clues"])

            # Check for lead resolutions
            if "leads_resolved" in payload and isinstance(payload["leads_resolved"], list):
                resolved.extend(payload["leads_resolved"])

            # Check for pending leads
            if "leads_pending" in payload and isinstance(payload["leads_pending"], list):
                pending.extend(payload["leads_pending"])

        return Leads(discovered=list(set(discovered)), resolved=list(set(resolved)), pending=list(set(pending)))

    def _extract_promises(self, events: List[Event]) -> List[Promise]:
        """Extract promises from events.

        Args:
            events: All events

        Returns:
            List of Promise objects
        """
        promises = []

        for event in events:
            payload = event.payload or {}

            # Check for promises in payload
            if "promises" in payload and isinstance(payload["promises"], list):
                for promise_data in payload["promises"]:
                    if isinstance(promise_data, dict):
                        promises.append(
                            Promise(
                                description=promise_data.get("description", ""),
                                source_event_id=str(event.id),
                                status=PromiseStatus.PENDING,
                            )
                        )

        return promises

    def _calculate_statistics(self, events: List[Event]) -> SessionStatistics:
        """Calculate session statistics from events.

        Args:
            events: All events

        Returns:
            SessionStatistics object
        """
        message_count = sum(1 for e in events if e.event_type == EventType.MESSAGE)
        roll_count = sum(1 for e in events if e.event_type == EventType.ROLL)
        combat_count = sum(1 for e in events if e.event_type in (EventType.COMBAT_START, EventType.COMBAT_ROUND))
        san_check_count = sum(1 for e in events if e.event_type == EventType.SAN_CHECK)
        injury_count = sum(1 for e in events if e.event_type in (EventType.DAMAGE, EventType.HP_CHANGE))
        clue_discovery_count = sum(
            1 for e in events if "clues" in (e.payload or {}) and isinstance(e.payload["clues"], list) and len(e.payload["clues"]) > 0
        )

        return SessionStatistics(
            message_count=message_count,
            roll_count=roll_count,
            combat_count=combat_count,
            san_check_count=san_check_count,
            injury_count=injury_count,
            clue_discovery_count=clue_discovery_count,
        )
