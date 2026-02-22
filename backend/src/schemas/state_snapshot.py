"""State Snapshot data structures for M3 Memory Web milestone.

This module defines Pydantic schemas for state snapshots, which capture
the complete game state at specific points in time for recovery and
comparison purposes.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


# ============================================================================
# Snapshot Metadata
# ============================================================================

class SnapshotType(str, Enum):
    """Types of state snapshots."""

    CHECKPOINT = "checkpoint"
    MANUAL = "manual"
    AUTO = "auto"
    SESSION_START = "session_start"
    SESSION_END = "session_end"
    PRE_COMBAT = "pre_combat"
    POST_COMBAT = "post_combat"


# ============================================================================
# Character State Snapshot
# ============================================================================

class CharacterSnapshot(BaseModel):
    """Complete snapshot of a character's state."""

    character_id: int
    character_name: str
    owner_id: int

    # Core attributes
    attributes: Dict[str, int] = Field(default_factory=dict)
    hp: int
    max_hp: int
    mp: int
    max_mp: int
    san: int
    max_san: int
    luck: int

    # Derived stats
    status: str = "healthy"
    temporary_insanities: List[str] = []
    indefinite_insanities: List[str] = []

    # Skills snapshot
    skills: Dict[str, int] = Field(default_factory=dict)

    # Inventory snapshot
    inventory: List[Dict[str, Any]] = Field(default_factory=list)

    # Notes and backstory
    backstory: str = ""
    notes: str = ""

    # Timestamp when this character state was captured
    captured_at: datetime

    model_config = {"from_attributes": True}


# ============================================================================
# World State Snapshot
# ============================================================================

class WorldStateSnapshot(BaseModel):
    """Snapshot of the world/game state."""

    # Current scene
    scene_id: Optional[str] = None
    scene_name: Optional[str] = None
    location: Optional[str] = None

    # Environment state
    time_of_day: Optional[str] = None
    weather: Optional[str] = None
    lighting: Optional[str] = None

    # World-specific state
    flags: Dict[str, bool] = Field(default_factory=dict)
    counters: Dict[str, int] = Field(default_factory=dict)
    timers: Dict[str, Any] = Field(default_factory=dict)

    # NPCs state
    npcs: Dict[str, Dict[str, Any]] = Field(default_factory=dict)

    # Items/objects in world
    world_items: List[Dict[str, Any]] = Field(default_factory=list)

    # Encounters
    active_encounters: List[Dict[str, Any]] = Field(default_factory=list)

    # Custom state
    custom: Dict[str, Any] = Field(default_factory=dict)

    model_config = {"from_attributes": True}


# ============================================================================
# Narrative State Snapshot
# ============================================================================

class NarrativeStateSnapshot(BaseModel):
    """Snapshot of narrative/progress state."""

    # Leads and clues
    leads: List[Dict[str, Any]] = Field(default_factory=list)
    discovered_clues: List[str] = Field(default_factory=list)
    resolved_mysteries: List[str] = Field(default_factory=list)

    # Promises and commitments
    promises: List[Dict[str, Any]] = Field(default_factory=list)

    # Story flags
    story_beats: List[str] = Field(default_factory=list)
    branches_taken: List[str] = Field(default_factory=list)
    branches_available: List[str] = Field(default_factory=list)

    # NPCs met
    encountered_npcs: List[str] = Field(default_factory=list)
    npc_relationships: Dict[str, str] = Field(default_factory=dict)

    # Locations visited
    visited_locations: List[str] = Field(default_factory=list)

    # Campaign progress
    chapter: Optional[str] = None
    progress_percentage: float = 0.0

    model_config = {"from_attributes": True}


# ============================================================================
# Combat State Snapshot (if applicable)
# ============================================================================

class CombatParticipantSnapshot(BaseModel):
    """Snapshot of a combat participant."""

    character_id: Optional[int] = None
    npc_id: Optional[str] = None
    name: str
    is_npc: bool = False
    hp: int
    max_hp: int
    initiative: int
    status: str = "active"

    model_config = {"from_attributes": True}


class CombatStateSnapshot(BaseModel):
    """Snapshot of active combat state."""

    combat_id: str
    is_active: bool
    round_number: int = 0
    current_turn_index: int = 0
    participants: List[CombatParticipantSnapshot] = Field(default_factory=list)
    turn_order: List[str] = Field(default_factory=list)

    model_config = {"from_attributes": True}


# ============================================================================
# Chase State Snapshot (if applicable)
# ============================================================================

class ChaseParticipantSnapshot(BaseModel):
    """Snapshot of a chase participant."""

    character_id: Optional[int] = None
    npc_id: Optional[str] = None
    name: str
    is_npc: bool = False
    position: int = 0
    action_points: int = 0

    model_config = {"from_attributes": True}


class ChaseStateSnapshot(BaseModel):
    """Snapshot of active chase state."""

    chase_id: str
    is_active: bool
    round_number: int = 0
    participants: List[ChaseParticipantSnapshot] = Field(default_factory=list)
    obstacles: List[Dict[str, Any]] = Field(default_factory=list)

    model_config = {"from_attributes": True}


# ============================================================================
# Complete State Snapshot
# ============================================================================

class StateSnapshot(BaseModel):
    """Complete snapshot of game state at a point in time.

    This captures all necessary state to resume a session from a specific point.
    """

    # Metadata
    snapshot_id: str
    session_id: str
    created_at: datetime
    snapshot_type: SnapshotType = SnapshotType.MANUAL
    name: Optional[str] = None
    description: Optional[str] = None

    # Reference point (event ID or timestamp)
    reference_event_id: Optional[str] = None
    reference_timestamp: datetime

    # Component snapshots
    world_state: WorldStateSnapshot
    narrative_state: NarrativeStateSnapshot

    # Character states (mapped by character_id)
    character_states: Dict[int, CharacterSnapshot] = Field(default_factory=dict)

    # Optional: Active combat
    combat_state: Optional[CombatStateSnapshot] = None

    # Optional: Active chase
    chase_state: Optional[ChaseStateSnapshot] = None

    # Session metadata
    session_metadata: Dict[str, Any] = Field(default_factory=dict)

    # Size estimate (for storage management)
    size_bytes: Optional[int] = None

    # Tags for filtering
    tags: List[str] = Field(default_factory=list)

    model_config = {"from_attributes": True}


# ============================================================================
# Snapshot Comparison Result
# ============================================================================

class CharacterStateDelta(BaseModel):
    """Difference in character state between snapshots."""

    character_id: int
    character_name: str

    hp_delta: Optional[int] = None
    san_delta: Optional[int] = None
    luck_delta: Optional[int] = None
    mp_delta: Optional[int] = None

    status_changed: Optional[Dict[str, str]] = None  # old -> new
    skills_changed: Dict[str, Dict[str, int]] = Field(default_factory=dict)  # skill: {old, new}

    model_config = {"from_attributes": True}


class WorldStateDelta(BaseModel):
    """Difference in world state between snapshots."""

    location_changed: Optional[Dict[str, str]] = None
    scene_changed: Optional[Dict[str, str]] = None
    flags_changed: Dict[str, Dict[str, bool]] = Field(default_factory=dict)
    timers_changed: Dict[str, Any] = Field(default_factory=dict)

    model_config = {"from_attributes": True}


class NarrativeStateDelta(BaseModel):
    """Difference in narrative state between snapshots."""

    leads_added: List[str] = Field(default_factory=list)
    leads_resolved: List[str] = Field(default_factory=list)
    clues_discovered: List[str] = Field(default_factory=list)
    promises_made: List[str] = Field(default_factory=list)
    promises_fulfilled: List[str] = Field(default_factory=list)
    locations_visited: List[str] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class SnapshotComparison(BaseModel):
    """Comparison result between two snapshots."""

    snapshot_id_1: str
    snapshot_id_2: str

    time_delta_seconds: int
    events_between_count: int

    character_deltas: List[CharacterStateDelta] = Field(default_factory=list)
    world_delta: WorldStateDelta
    narrative_delta: NarrativeStateDelta

    combat_started: bool = False
    combat_ended: bool = False
    chase_started: bool = False
    chase_ended: bool = False

    model_config = {"from_attributes": True}


# ============================================================================
# Snapshot Version Info
# ============================================================================

class SnapshotVersion(BaseModel):
    """Version information for a snapshot."""

    snapshot_id: str
    version: int
    created_at: datetime
    created_by: int  # user_id
    change_description: Optional[str] = None

    model_config = {"from_attributes": True}


class SnapshotVersionHistory(BaseModel):
    """Version history for a snapshot."""

    snapshot_id: str
    current_version: int
    versions: List[SnapshotVersion] = Field(default_factory=list)

    model_config = {"from_attributes": True}


# ============================================================================
# Snapshot Query Parameters
# ============================================================================

class SnapshotQueryParams(BaseModel):
    """Query parameters for filtering snapshots."""

    session_id: Optional[str] = None
    snapshot_type: Optional[SnapshotType] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    tags: Optional[List[str]] = None
    limit: int = Field(default=10, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
    include_deleted: bool = False


# ============================================================================
# Snapshot Operations
# ============================================================================

class SnapshotCreateRequest(BaseModel):
    """Request to create a manual snapshot."""

    session_id: str
    name: Optional[str] = None
    description: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    snapshot_type: SnapshotType = SnapshotType.MANUAL


class SnapshotRestoreRequest(BaseModel):
    """Request to restore from a snapshot."""

    snapshot_id: str
    restore_strategy: str = Field(default="merge", description="merge|replace|prompt")
    confirm: bool = False


class SnapshotRestoreResponse(BaseModel):
    """Response from snapshot restoration."""

    snapshot_id: str
    session_id: str
    restore_strategy: str
    changes_applied: Dict[str, Any]
    conflicts: List[Dict[str, Any]] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


# ============================================================================
# Snapshot Export/Import
# ============================================================================

class SnapshotExportFormat(str, Enum):
    """Supported export formats for snapshots."""

    JSON = "json"
    MSGPACK = "msgpack"
    PRETTY_JSON = "pretty_json"


class SnapshotExportOptions(BaseModel):
    """Options for exporting snapshots."""

    format: SnapshotExportFormat = SnapshotExportFormat.JSON
    include_metadata: bool = True
    include_character_states: bool = True
    include_world_state: bool = True
    include_narrative_state: bool = True
    compress: bool = False


class SnapshotImportOptions(BaseModel):
    """Options for importing snapshots."""

    merge_strategy: str = Field(default="merge", description="merge|replace|prompt")
    validate_checksum: bool = True
    dry_run: bool = False
