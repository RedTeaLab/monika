"""Summary data structures for M3 Memory Web milestone.

This module defines Pydantic schemas for structured game session summaries,
including narrative summaries, key events, state changes, and more.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field
from enum import Enum


# ============================================================================
# Event Types for Key Events
# ============================================================================

class KeyEventType(str, Enum):
    """Types of key events that should be highlighted in summaries."""

    CLUE_DISCOVERED = "clue_discovered"
    COMBAT_OCCURRED = "combat_occurred"
    SAN_CHECK_FAILED = "san_check_failed"
    MADNESS_TRIGGERED = "madness_triggered"
    CHARACTER_INJURED = "character_injured"
    CHARACTER_DIED = "character_died"
    SCENE_TRANSITION = "scene_transition"
    PUZZLE_SOLVED = "puzzle_solved"
    MYSTERY_REVEALED = "mystery_revealed"
    CRITICAL_FAILURE = "critical_failure"


# ============================================================================
# Visibility Levels
# ============================================================================

class EventVisibility(str, Enum):
    """Visibility levels for events and summaries."""

    PUBLIC = "public"
    KP_ONLY = "kp"
    PLAYER_PREFIX = "player:"


# ============================================================================
# Participant Role in Events
# ============================================================================

class ParticipantRole(str, Enum):
    """Role of a participant in an event."""

    ACTIVE = "active"      # Directly participated
    PASSIVE = "passive"    # Was affected but didn't act
    WITNESS = "witness"    # Observed the event


# ============================================================================
# Basic Event and Participant Structures
# ============================================================================

class EventParticipant(BaseModel):
    """A participant in a key event."""

    user_id: int
    character_id: Optional[int] = None
    role: ParticipantRole

    model_config = {"from_attributes": True}


class EventOutcome(BaseModel):
    """The outcome of a key event."""

    success: bool
    description: str
    consequences: Optional[List[str]] = None

    model_config = {"from_attributes": True}


class KeyEvent(BaseModel):
    """A key event that should be highlighted in session summaries."""

    event_id: str
    timestamp: datetime
    type: KeyEventType
    title: str
    description: str
    participants: List[EventParticipant] = []
    outcome: Optional[EventOutcome] = None
    related_clues: List[str] = []
    visibility: EventVisibility = EventVisibility.PUBLIC

    model_config = {"from_attributes": True}


# ============================================================================
# State Change Structures
# ============================================================================

class NumericStateChange(BaseModel):
    """Change in a numeric state value (HP, SAN, Luck, MP)."""

    old: int
    new: int
    delta: int

    model_config = {"from_attributes": True}


class SANStateChange(NumericStateChange):
    """SAN change with associated events."""

    events: List[str] = []  # Event IDs that caused SAN changes


class CharacterStatus(str, Enum):
    """Character status conditions."""

    HEALTHY = "healthy"
    INJURED = "injured"
    WOUNDED = "wounded"
    CRITICAL = "critical"
    UNCONSCIOUS = "unconscious"
    DYING = "dying"
    DEAD = "dead"
    INSANE = "insane"
    TEMPORARY_MADNESS = "temporary_madness"
    INDEFINITE_MADNESS = "indefinite_madness"


class StatusChange(BaseModel):
    """A change in character status."""

    old: CharacterStatus
    new: CharacterStatus
    reason: str

    model_config = {"from_attributes": True}


class SkillChange(BaseModel):
    """A change in a skill value."""

    skill_id: str
    old_value: int
    new_value: int
    reason: Literal["growth", "injury", "other"]

    model_config = {"from_attributes": True}


class InventoryChange(BaseModel):
    """Changes to character inventory."""

    added: List[str] = []
    removed: List[str] = []
    used: List[str] = []

    model_config = {"from_attributes": True}


class CharacterStateChange(BaseModel):
    """Complete state change tracking for a character."""

    character_id: int
    character_name: str
    changes: Dict[str, Any] = Field(default_factory=dict)
    status_changes: List[StatusChange] = []
    skill_changes: List[SkillChange] = []
    inventory_changes: InventoryChange = Field(default_factory=InventoryChange)

    model_config = {"from_attributes": True}


# ============================================================================
# Discovery and Consequence Structures
# ============================================================================

class DiscoveryType(str, Enum):
    """Types of discoveries in game."""

    CLUE = "clue"
    INFORMATION = "information"
    ITEM = "item"
    LOCATION = "location"
    NPC_SECRET = "npc_secret"


class DiscoveryContent(BaseModel):
    """Content of a discovery."""

    title: str
    description: str
    evidence: Optional[List[str]] = None  # Supporting event IDs

    model_config = {"from_attributes": True}


class Discoverer(BaseModel):
    """Who made a discovery."""

    user_id: int
    character_id: Optional[int] = None

    model_config = {"from_attributes": True}


class DiscoveryVisibility(str, Enum):
    """Visibility level for discoveries."""

    PUBLIC = "public"
    PARTY = "party"
    PRIVATE = "private"
    KP = "kp"


class Discovery(BaseModel):
    """A discovery made during gameplay."""

    discovery_id: str
    timestamp: datetime
    type: DiscoveryType
    content: DiscoveryContent
    discoverer: Discoverer
    visibility: DiscoveryVisibility = DiscoveryVisibility.PARTY

    model_config = {"from_attributes": True}


class ConsequenceType(str, Enum):
    """Types of consequences."""

    INJURY = "injury"
    SAN_LOSS = "san_loss"
    MADNESS = "madness"
    RESOURCE_LOSS = "resource_loss"
    STORY_BRANCH = "story_branch"


class ConsequenceSeverity(str, Enum):
    """Severity levels for consequences."""

    MINOR = "minor"
    MODERATE = "moderate"
    MAJOR = "major"
    CRITICAL = "critical"


class ConsequenceCause(BaseModel):
    """The cause of a consequence."""

    event_id: str
    description: str

    model_config = {"from_attributes": True}


class ConsequenceAffected(BaseModel):
    """Who/what is affected by a consequence."""

    characters: List[int] = []
    party: bool = False

    model_config = {"from_attributes": True}


class ConsequenceStatus(str, Enum):
    """Current status of a consequence."""

    ACTIVE = "active"
    RESOLVED = "resolved"
    ONGOING = "ongoing"


class Consequence(BaseModel):
    """A consequence resulting from game events."""

    consequence_id: str
    timestamp: datetime
    type: ConsequenceType
    description: str
    severity: ConsequenceSeverity
    cause: ConsequenceCause
    affected: ConsequenceAffected
    status: ConsequenceStatus = ConsequenceStatus.ACTIVE

    model_config = {"from_attributes": True}


# ============================================================================
# Promise Structure
# ============================================================================

class PromiseStatus(str, Enum):
    """Status of a promise made in-game."""

    PENDING = "pending"
    FULFILLED = "fulfilled"
    BROKEN = "broken"


class Promise(BaseModel):
    """A promise made during gameplay."""

    description: str
    source_event_id: str
    status: PromiseStatus = PromiseStatus.PENDING

    model_config = {"from_attributes": True}


# ============================================================================
# Narrative Summary Structure
# ============================================================================

class NarrativeMood(str, Enum):
    """Mood of the narrative summary."""

    CALM = "calm"
    TENSE = "tense"
    HORROR = "horror"
    MYSTERY = "mystery"
    ACTION = "action"


class NarrativeSummary(BaseModel):
    """Narrative summary of a session."""

    brief: str = Field(..., description="1-2 sentence brief summary")
    detailed: str = Field(..., description="2-3 paragraph detailed summary")
    mood: NarrativeMood = Field(default=NarrativeMood.MYSTERY)
    tone: str = Field(default="", description="Descriptive tone text")

    model_config = {"from_attributes": True}


# ============================================================================
# Session Info Structure
# ============================================================================

class SessionInfo(BaseModel):
    """Basic session information for summaries."""

    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    scene_id: Optional[str] = None
    scene_title: Optional[str] = None

    model_config = {"from_attributes": True}


# ============================================================================
# Statistics Structure
# ============================================================================

class SessionStatistics(BaseModel):
    """Statistics for a session."""

    message_count: int = 0
    roll_count: int = 0
    combat_count: int = 0
    san_check_count: int = 0
    injury_count: int = 0
    clue_discovery_count: int = 0

    model_config = {"from_attributes": True}


# ============================================================================
# Leads Structure
# ============================================================================

class Leads(BaseModel):
    """Leads and their status in a summary."""

    discovered: List[str] = []  # New lead IDs
    resolved: List[str] = []    # Resolved lead IDs
    pending: List[str] = []     # Pending lead IDs

    model_config = {"from_attributes": True}


# ============================================================================
# State Changes Aggregate Structure
# ============================================================================

class StateChanges(BaseModel):
    """Aggregate of all state changes in a session."""

    characters: List[CharacterStateChange] = []
    discoveries: List[Discovery] = []
    consequences: List[Consequence] = []

    model_config = {"from_attributes": True}


# ============================================================================
# Complete Session Summary Structure
# ============================================================================

class SessionSummary(BaseModel):
    """Complete structured summary of a game session.

    This is the main output of the summary generation system, providing
    a comprehensive overview of a game session including narrative,
    key events, state changes, and statistics.
    """

    # === Basic Information ===
    summary_id: str
    session_id: str
    created_at: datetime
    updated_at: datetime

    # === Session Information ===
    session_info: SessionInfo

    # === Narrative Summary ===
    narrative_summary: NarrativeSummary

    # === Key Events ===
    key_events: List[KeyEvent] = []

    # === State Changes ===
    state_changes: StateChanges = Field(default_factory=StateChanges)

    # === Leads and Promises ===
    leads: Leads = Field(default_factory=Leads)
    promises: List[Promise] = []

    # === Statistics ===
    statistics: SessionStatistics = Field(default_factory=SessionStatistics)

    # === Visibility Control ===
    visibility: Dict[str, Any] = Field(default_factory=dict)

    model_config = {"from_attributes": True}


# ============================================================================
# Summary Generation Request/Response
# ============================================================================

class SummaryGenerationRequest(BaseModel):
    """Request to generate a summary."""

    session_id: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    include_kp_only: bool = False
    force_regenerate: bool = False


class SummaryGenerationResponse(BaseModel):
    """Response from summary generation."""

    summary_id: str
    session_id: str
    status: Literal["pending", "completed", "failed"]
    message: Optional[str] = None
    summary: Optional[SessionSummary] = None


# ============================================================================
# Summary Query Parameters
# ============================================================================

class SummaryQueryParams(BaseModel):
    """Query parameters for filtering summaries."""

    session_id: Optional[str] = None
    campaign_id: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    limit: int = Field(default=10, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


# ============================================================================
# Checkpoint Summary Structure (for M3-015)
# ============================================================================

class CheckpointType(str, Enum):
    """Types of checkpoints."""

    MANUAL = "manual"
    AUTO = "auto"
    SCENE_CHANGE = "scene_change"
    COMBAT_END = "combat_end"
    SESSION_END = "session_end"


class CheckpointSummary(BaseModel):
    """Summary at a checkpoint point."""

    checkpoint_id: str
    session_id: str
    timestamp: datetime
    checkpoint_type: CheckpointType

    # Brief narrative at checkpoint
    narrative: str

    # Key state values
    character_states: Dict[int, Dict[str, int]] = {}
    current_scene: Optional[str] = None
    world_state: Dict[str, Any] = {}

    # Recent events since last checkpoint
    recent_events: List[str] = []  # Event IDs

    model_config = {"from_attributes": True}


# ============================================================================
# Scene Summary Structure (for M3-016)
# ============================================================================

class SceneSummary(BaseModel):
    """Summary of events in a specific scene."""

    scene_id: str
    scene_title: str
    session_id: str
    start_time: datetime
    end_time: Optional[datetime] = None

    # Scene narrative
    narrative: str

    # Key events in this scene
    key_events: List[KeyEvent] = []

    # Participants in this scene
    participants: List[int] = []  # Character IDs

    model_config = {"from_attributes": True}
