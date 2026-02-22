"""Snapshot Generation Service for M3 Memory Web.

This service manages state snapshots that capture the complete game state
at specific points in time for recovery and comparison purposes.
"""

import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any

from sqlalchemy.orm import Session
from sqlalchemy import desc

from src.models.session import GameSession
from src.models.character import Character
from src.models.checkpoint import Checkpoint, CheckpointType

# Import snapshot schemas
from src.schemas.state_snapshot import (
    SnapshotType as SchemaSnapshotType,
    CharacterSnapshot,
    WorldStateSnapshot,
    NarrativeStateSnapshot,
    StateSnapshot,
    SnapshotQueryParams,
)


class SnapshotService:
    """Service for creating and managing state snapshots.

    This service provides methods to:
    - Create snapshots of game state
    - Retrieve snapshots by ID
    - List snapshots with filtering
    - Get the latest snapshot for a session

    Snapshots capture:
    - Session state (current scene, location, etc.)
    - Character states (HP, SAN, Luck, MP, skills)
    - World state (flags, timers, NPCs)
    - Narrative state (leads, clues, promises)
    """

    def __init__(self, db: Session):
        """Initialize the snapshot service.

        Args:
            db: Database session
        """
        self.db = db

    def create_snapshot(
        self,
        session_id: uuid.UUID,
        snapshot_type: SchemaSnapshotType = SchemaSnapshotType.MANUAL,
        name: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[List[str]] = None,
        created_by: Optional[int] = None,
    ) -> StateSnapshot:
        """Create a new state snapshot for a session.

        Args:
            session_id: Session ID to snapshot
            snapshot_type: Type of snapshot (manual, auto, checkpoint, etc.)
            name: Optional name for the snapshot
            description: Optional description
            tags: Optional list of tags for filtering
            created_by: User ID who created the snapshot

        Returns:
            StateSnapshot object

        Raises:
            ValueError: If session not found
        """
        # Validate session exists
        session = self.db.query(GameSession).filter(GameSession.id == session_id).first()

        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Get all characters for this session
        characters = self._get_session_characters(session)

        # Build character snapshots
        character_snapshots = self._capture_character_states(characters)

        # Build world state snapshot
        world_state = self._capture_world_state(session)

        # Build narrative state snapshot
        narrative_state = self._capture_narrative_state(session)

        # Map snapshot type to checkpoint type
        checkpoint_type = self._map_snapshot_type_to_checkpoint_type(snapshot_type)

        # Create checkpoint in database
        checkpoint = Checkpoint(
            id=uuid.uuid4(),
            session_id=session_id,
            checkpoint_type=checkpoint_type.value,
            session_state={
                "current_scene_id": session.current_scene_id,
                "current_scene_name": session.current_scene_name,
                "location": session.location,
            },
            character_states={
                str(char.id): {
                    "hp": char.hp,
                    "max_hp": (char.con + char.siz) // 2,
                    "mp": char.mp,
                    "max_mp": char.pow // 2,
                    "san": char.san,
                    "max_san": char.max_san,
                    "luck": char.luck,
                }
                for char in characters
            },
            world_state=session.world_state or {},
            narrative_state=session.narrative_state or {},
            scene_id=session.current_scene_id,
            scene_name=session.current_scene_name,
            name=name,
            created_by_player_id=created_by,
            auto_created="true" if snapshot_type != SchemaSnapshotType.MANUAL else "false",
        )

        self.db.add(checkpoint)
        self.db.commit()
        self.db.refresh(checkpoint)

        # Build and return StateSnapshot
        return self._build_state_snapshot(checkpoint, session, characters, name, description, tags)

    def get_snapshot(self, snapshot_id: str) -> Optional[StateSnapshot]:
        """Get a snapshot by ID.

        Args:
            snapshot_id: Snapshot ID (UUID as string)

        Returns:
            StateSnapshot object or None if not found
        """
        try:
            checkpoint_uuid = uuid.UUID(snapshot_id)
        except ValueError:
            return None

        checkpoint = self.db.query(Checkpoint).filter(Checkpoint.id == checkpoint_uuid).first()

        if not checkpoint or checkpoint.is_deleted == "true":
            return None

        # Get session and characters
        session = self.db.query(GameSession).filter(GameSession.id == checkpoint.session_id).first()

        if not session:
            return None

        characters = self._get_session_characters(session)

        return self._build_state_snapshot_from_checkpoint(checkpoint, session, characters)

    def list_snapshots(
        self,
        session_id: Optional[uuid.UUID] = None,
        snapshot_type: Optional[SchemaSnapshotType] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        tags: Optional[List[str]] = None,
        limit: int = 10,
        offset: int = 0,
    ) -> List[StateSnapshot]:
        """List snapshots with optional filtering.

        Args:
            session_id: Filter by session ID
            snapshot_type: Filter by snapshot type
            start_date: Filter by creation date (start)
            end_date: Filter by creation date (end)
            tags: Filter by tags
            limit: Maximum number of results
            offset: Number of results to skip

        Returns:
            List of StateSnapshot objects
        """
        query = self.db.query(Checkpoint).filter(Checkpoint.is_deleted == "false")

        if session_id:
            query = query.filter(Checkpoint.session_id == session_id)

        if snapshot_type:
            checkpoint_type = self._map_snapshot_type_to_checkpoint_type(snapshot_type)
            query = query.filter(Checkpoint.checkpoint_type == checkpoint_type.value)

        if start_date:
            query = query.filter(Checkpoint.created_at >= start_date)

        if end_date:
            query = query.filter(Checkpoint.created_at <= end_date)

        # Order by creation date (newest first), then by id for deterministic ordering
        query = query.order_by(desc(Checkpoint.created_at), desc(Checkpoint.id))

        # Apply pagination
        checkpoints = query.offset(offset).limit(limit).all()

        # Build snapshots
        snapshots = []
        for checkpoint in checkpoints:
            session = (
                self.db.query(GameSession).filter(GameSession.id == checkpoint.session_id).first()
            )

            if session:
                characters = self._get_session_characters(session)
                snapshot = self._build_state_snapshot_from_checkpoint(
                    checkpoint, session, characters
                )
                snapshots.append(snapshot)

        return snapshots

    def get_latest_snapshot(self, session_id: uuid.UUID) -> Optional[StateSnapshot]:
        """Get the latest snapshot for a session.

        Args:
            session_id: Session ID

        Returns:
            Latest StateSnapshot or None if not found
        """
        checkpoint = (
            self.db.query(Checkpoint)
            .filter(Checkpoint.session_id == session_id, Checkpoint.is_deleted == "false")
            .order_by(desc(Checkpoint.created_at), desc(Checkpoint.id))
            .first()
        )

        if not checkpoint:
            return None

        session = self.db.query(GameSession).filter(GameSession.id == session_id).first()

        if not session:
            return None

        characters = self._get_session_characters(session)

        return self._build_state_snapshot_from_checkpoint(checkpoint, session, characters)

    def _get_session_characters(self, session: GameSession) -> List[Character]:
        """Get all characters for a session.

        Args:
            session: GameSession object

        Returns:
            List of Character objects
        """
        characters = []

        # Get main character if exists
        if session.character_id:
            char = self.db.query(Character).filter(Character.id == session.character_id).first()
            if char:
                characters.append(char)

        # Get additional characters from character_states
        if session.character_states:
            for char_id_str in session.character_states.keys():
                try:
                    char_id = int(char_id_str)
                    if session.character_id != char_id:
                        char = self.db.query(Character).filter(Character.id == char_id).first()
                        if char and char not in characters:
                            characters.append(char)
                except ValueError:
                    continue

        return characters

    def _capture_character_states(
        self, characters: List[Character]
    ) -> Dict[int, CharacterSnapshot]:
        """Capture character states for snapshot.

        Args:
            characters: List of Character objects

        Returns:
            Dictionary mapping character_id to CharacterSnapshot
        """
        snapshots = {}

        for char in characters:
            # Calculate max_hp and max_mp from CoC 7e rules
            max_hp = (char.con + char.siz) // 2
            max_mp = char.pow // 2

            # Determine status based on HP
            status = "healthy"
            if char.hp <= 0:
                status = "unconscious"
            elif char.hp < max_hp // 2:
                status = "wounded"

            snapshot = CharacterSnapshot(
                character_id=char.id,
                character_name=char.name,
                owner_id=char.owner_id,
                attributes={
                    "str": char.str,
                    "con": char.con,
                    "dex": char.dex,
                    "app": char.app,
                    "pow": char.pow,
                    "int": char.int,
                    "siz": char.siz,
                    "edu": char.edu,
                },
                hp=char.hp,
                max_hp=max_hp,
                mp=char.mp,
                max_mp=max_mp,
                san=char.san,
                max_san=char.max_san,
                luck=char.luck,
                status=status,
                skills=char.skills or {},
                inventory=[],
                backstory=char.backstory or "",
                notes="",
                captured_at=datetime.utcnow(),
            )

            snapshots[char.id] = snapshot

        return snapshots

    def _capture_world_state(self, session: GameSession) -> WorldStateSnapshot:
        """Capture world state for snapshot.

        Args:
            session: GameSession object

        Returns:
            WorldStateSnapshot object
        """
        world_state = session.world_state or {}

        return WorldStateSnapshot(
            scene_id=session.current_scene_id,
            scene_name=session.current_scene_name,
            location=session.location,
            flags=world_state.get("flags", {}),
            counters=world_state.get("counters", {}),
            timers=world_state.get("timers", {}),
            npcs=world_state.get("npcs", {}),
            world_items=world_state.get("items", []),
            active_encounters=world_state.get("encounters", []),
            custom=world_state.get("custom", {}),
        )

    def _capture_narrative_state(self, session: GameSession) -> NarrativeStateSnapshot:
        """Capture narrative state for snapshot.

        Args:
            session: GameSession object

        Returns:
            NarrativeStateSnapshot object
        """
        narrative_state = session.narrative_state or {}

        return NarrativeStateSnapshot(
            leads=narrative_state.get("leads", []),
            discovered_clues=narrative_state.get("clues", []),
            resolved_mysteries=narrative_state.get("resolved_mysteries", []),
            promises=narrative_state.get("promises", []),
            story_beats=narrative_state.get("story_beats", []),
            branches_taken=narrative_state.get("branches_taken", []),
            branches_available=narrative_state.get("branches_available", []),
            encountered_npcs=narrative_state.get("npcs_met", []),
            npc_relationships=narrative_state.get("npc_relationships", {}),
            visited_locations=narrative_state.get("visited_locations", []),
            chapter=narrative_state.get("chapter"),
            progress_percentage=narrative_state.get("progress", 0.0),
        )

    def _map_snapshot_type_to_checkpoint_type(
        self, snapshot_type: SchemaSnapshotType
    ) -> CheckpointType:
        """Map schema snapshot type to checkpoint type.

        Args:
            snapshot_type: Schema snapshot type

        Returns:
            CheckpointType enum value
        """
        mapping = {
            SchemaSnapshotType.MANUAL: CheckpointType.MANUAL,
            SchemaSnapshotType.AUTO: CheckpointType.AUTO,
            SchemaSnapshotType.CHECKPOINT: CheckpointType.AUTO,
            SchemaSnapshotType.SESSION_START: CheckpointType.SESSION_START,
            SchemaSnapshotType.SESSION_END: CheckpointType.AUTO,
            SchemaSnapshotType.PRE_COMBAT: CheckpointType.AUTO,
            SchemaSnapshotType.POST_COMBAT: CheckpointType.AUTO,
        }
        return mapping.get(snapshot_type, CheckpointType.MANUAL)

    def _map_checkpoint_type_to_snapshot_type(self, checkpoint_type: str) -> SchemaSnapshotType:
        """Map checkpoint type to schema snapshot type.

        Args:
            checkpoint_type: Checkpoint type string

        Returns:
            SchemaSnapshotType enum value
        """
        mapping = {
            CheckpointType.MANUAL.value: SchemaSnapshotType.MANUAL,
            CheckpointType.AUTO.value: SchemaSnapshotType.AUTO,
            CheckpointType.PAUSE.value: SchemaSnapshotType.CHECKPOINT,
            CheckpointType.SESSION_START.value: SchemaSnapshotType.SESSION_START,
        }
        return mapping.get(checkpoint_type, SchemaSnapshotType.MANUAL)

    def _build_state_snapshot(
        self,
        checkpoint: Checkpoint,
        session: GameSession,
        characters: List[Character],
        name: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> StateSnapshot:
        """Build StateSnapshot from checkpoint and session data.

        Args:
            checkpoint: Checkpoint database model
            session: GameSession object
            characters: List of Character objects
            name: Optional name override
            description: Optional description override
            tags: Optional tags override

        Returns:
            StateSnapshot object
        """
        # Get character states
        character_snapshots = self._capture_character_states(characters)

        # Build world state
        world_state = self._capture_world_state(session)

        # Build narrative state
        narrative_state = self._capture_narrative_state(session)

        # Determine name and description from checkpoint if not provided
        snapshot_name = name or f"Snapshot {checkpoint.created_at.strftime('%Y-%m-%d %H:%M')}"
        snapshot_description = description or checkpoint.notes

        # Get tags
        snapshot_tags = tags or []

        return StateSnapshot(
            snapshot_id=str(checkpoint.id),
            session_id=str(checkpoint.session_id),
            created_at=checkpoint.created_at,
            snapshot_type=self._map_checkpoint_type_to_snapshot_type(checkpoint.checkpoint_type),
            name=snapshot_name,
            description=snapshot_description,
            reference_timestamp=checkpoint.created_at,
            world_state=world_state,
            narrative_state=narrative_state,
            character_states=character_snapshots,
            session_metadata={
                "state": session.state,
                "campaign_id": str(session.campaign_id) if session.campaign_id else None,
                "module_id": session.module_id,
            },
            tags=snapshot_tags,
        )

    def _build_state_snapshot_from_checkpoint(
        self,
        checkpoint: Checkpoint,
        session: GameSession,
        characters: List[Character],
    ) -> StateSnapshot:
        """Build StateSnapshot from existing checkpoint.

        Args:
            checkpoint: Checkpoint database model
            session: GameSession object
            characters: List of Character objects

        Returns:
            StateSnapshot object
        """
        # Build character snapshots
        character_snapshots = {}
        for char in characters:
            char_state_data = checkpoint.character_states.get(str(char.id), {})

            status = "healthy"
            if char_state_data.get("hp", 0) <= 0:
                status = "unconscious"
            elif char_state_data.get("hp", 0) < char_state_data.get("max_hp", 10) // 2:
                status = "wounded"

            character_snapshots[char.id] = CharacterSnapshot(
                character_id=char.id,
                character_name=char.name,
                owner_id=char.owner_id,
                attributes={
                    "str": char.str,
                    "con": char.con,
                    "dex": char.dex,
                    "app": char.app,
                    "pow": char.pow,
                    "int": char.int,
                    "siz": char.siz,
                    "edu": char.edu,
                },
                hp=char_state_data.get("hp", char.hp),
                max_hp=char_state_data.get("max_hp", (char.con + char.siz) // 2),
                mp=char_state_data.get("mp", char.mp),
                max_mp=char_state_data.get("max_mp", char.pow // 2),
                san=char_state_data.get("san", char.san),
                max_san=char_state_data.get("max_san", char.max_san),
                luck=char_state_data.get("luck", char.luck),
                status=status,
                skills=char.skills or {},
                inventory=[],
                backstory=char.backstory or "",
                notes="",
                captured_at=checkpoint.created_at,
            )

        # Build world state from checkpoint data
        world_state = WorldStateSnapshot(
            scene_id=checkpoint.scene_id,
            scene_name=checkpoint.scene_name,
            location=checkpoint.session_state.get("location") if checkpoint.session_state else None,
            flags=checkpoint.world_state.get("flags", {}) if checkpoint.world_state else {},
            counters=checkpoint.world_state.get("counters", {}) if checkpoint.world_state else {},
            timers=checkpoint.world_state.get("timers", {}) if checkpoint.world_state else {},
            npcs=checkpoint.world_state.get("npcs", {}) if checkpoint.world_state else {},
            world_items=checkpoint.world_state.get("items", []) if checkpoint.world_state else [],
            active_encounters=checkpoint.world_state.get("encounters", [])
            if checkpoint.world_state
            else [],
            custom=checkpoint.world_state.get("custom", {}) if checkpoint.world_state else {},
        )

        # Build narrative state from checkpoint data
        narrative_state = NarrativeStateSnapshot(
            leads=checkpoint.narrative_state.get("leads", []) if checkpoint.narrative_state else [],
            discovered_clues=checkpoint.narrative_state.get("clues", [])
            if checkpoint.narrative_state
            else [],
            resolved_mysteries=checkpoint.narrative_state.get("resolved_mysteries", [])
            if checkpoint.narrative_state
            else [],
            promises=checkpoint.narrative_state.get("promises", [])
            if checkpoint.narrative_state
            else [],
            story_beats=checkpoint.narrative_state.get("story_beats", [])
            if checkpoint.narrative_state
            else [],
            branches_taken=checkpoint.narrative_state.get("branches_taken", [])
            if checkpoint.narrative_state
            else [],
            branches_available=checkpoint.narrative_state.get("branches_available", [])
            if checkpoint.narrative_state
            else [],
            encountered_npcs=checkpoint.narrative_state.get("npcs_met", [])
            if checkpoint.narrative_state
            else [],
            npc_relationships=checkpoint.narrative_state.get("npc_relationships", {})
            if checkpoint.narrative_state
            else {},
            visited_locations=checkpoint.narrative_state.get("visited_locations", [])
            if checkpoint.narrative_state
            else [],
            chapter=checkpoint.narrative_state.get("chapter")
            if checkpoint.narrative_state
            else None,
            progress_percentage=checkpoint.narrative_state.get("progress", 0.0)
            if checkpoint.narrative_state
            else 0.0,
        )

        return StateSnapshot(
            snapshot_id=str(checkpoint.id),
            session_id=str(checkpoint.session_id),
            created_at=checkpoint.created_at,
            snapshot_type=self._map_checkpoint_type_to_snapshot_type(checkpoint.checkpoint_type),
            name=checkpoint.name or f"Snapshot {checkpoint.created_at.strftime('%Y-%m-%d %H:%M')}",
            description=checkpoint.notes,
            reference_timestamp=checkpoint.created_at,
            world_state=world_state,
            narrative_state=narrative_state,
            character_states=character_snapshots,
            session_metadata={
                "state": session.state,
                "campaign_id": str(session.campaign_id) if session.campaign_id else None,
                "module_id": session.module_id,
            },
            tags=[],
        )
