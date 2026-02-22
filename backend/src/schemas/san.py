"""SAN (Sanity) system Pydantic schemas."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class SANCategory(str, Enum):
    """Categories of SAN loss triggers."""

    BODILY_HORROR = "bodily_horror"
    DISCOVERY = "discovery"
    VIOLENCE = "violence"
    UNNATURAL = "unnatural"
    KNOWLEDGE = "knowledge"
    HELPLESSNESS = "helplessness"
    PERSONAL = "personal"
    CREATURE_SPECIFIC = "creature_specific"


class SANState(str, Enum):
    """SAN state for character mental health status."""

    STABLE = "stable"
    UNSETTLED = "unsettled"
    DISTURBED = "disturbed"
    UNSTABLE = "unstable"
    CRITICAL = "critical"
    INSANE = "insane"


class SANWarningLevel(str, Enum):
    """Warning levels for SAN status."""

    NORMAL = "normal"
    WARNING = "warning"
    DANGER = "danger"
    CRITICAL = "critical"


class TriggerType(str, Enum):
    """Types of SAN check triggers."""

    SCENE = "scene"
    EVENT = "event"
    ENCOUNTER = "encounter"
    SPELL = "spell"
    CREATURE = "creature"


class MadnessType(str, Enum):
    """Types of madness."""

    TEMPORARY_FAINT = "faint"
    TEMPORARY_PANIC = "panic"
    TEMPORARY_FLEE = "flee"
    TEMPORARY_STUNNED = "stunned"
    TEMPORARY_RAVING = "raving"
    INDEFINITE_AMNESIA = "amnesia"
    INDEFINITE_DELUSION = "delusion"
    INDEFINITE_HALLUCINATION = "hallucination"
    INDEFINITE_PARANOIA = "paranoia"
    INDEFINITE_PHOBIA = "phobia"
    INDEFINITE_MANIA = "mania"
    INDEFINITE_SCHIZOPHRENIA = "schizophrenia"


class SuccessLevel(str, Enum):
    """Success level for SAN checks."""

    CRITICAL = "critical"
    EXTREME = "extreme"
    HARD = "hard"
    REGULAR = "regular"
    FAILURE = "failure"
    FUMBLE = "fumble"


class SANTriggerInfo(BaseModel):
    """Information about what triggered a SAN check."""

    type: TriggerType
    source_id: str
    description: str
    kp_note: Optional[str] = None


class SANCheckParams(BaseModel):
    """Parameters for a SAN check."""

    character_id: int
    current_san: int
    san_cap: int = Field(..., description="Current SAN cap (99 - Cthulhu Mythos)")
    difficulty: str = "regular"


class SANLossDefinition(BaseModel):
    """Definition of SAN loss for a trigger."""

    success_min: int = 0
    success_max: int = 0
    failure_min: int = 0
    failure_max: int = 0
    critical_loss: int = 0
    fumble_loss: Optional[int] = None


class SANLossResult(BaseModel):
    """Result of SAN loss calculation."""

    actual_loss: int
    reason: str
    can_reduce: bool = False


class MadnessSymptom(BaseModel):
    """A symptom of madness."""

    id: str
    name: str
    description: str
    modifier: Optional[int] = None
    prohibited_actions: list[str] = []
    required_actions: list[str] = []


class MadnessTrigger(BaseModel):
    """Information about triggered madness."""

    trigger_id: str
    madness_type: MadnessType
    symptoms: list[MadnessSymptom] = []
    duration_minutes: Optional[int] = None
    duration_hours: Optional[int] = None
    is_real_life: bool = False
    recovery_conditions: list[str] = []


class SANCheckResult(BaseModel):
    """Result of a SAN check."""

    roll: int
    success_level: SuccessLevel
    passed: bool
    san_loss: SANLossResult
    madness_triggered: Optional[MadnessTrigger] = None


class SANCheckRequest(BaseModel):
    """Request to perform a SAN check."""

    character_id: int
    session_id: Optional[str] = None
    trigger: SANTriggerInfo
    loss_definition: SANLossDefinition
    bonus_penalty: int = 0
    force_roll: Optional[int] = None


class SANCheckResponse(BaseModel):
    """Response from a SAN check."""

    check_id: str
    session_id: Optional[str] = None
    timestamp: datetime
    trigger: SANTriggerInfo
    check_params: SANCheckParams
    result: SANCheckResult
    previous_san: int
    final_san: int


class SANThreshold(BaseModel):
    """Predefined SAN threshold for common scenarios."""

    id: str
    category: SANCategory
    description: str
    loss: SANLossDefinition
    once_only: bool = False
    per_session: bool = False
    cumulative: bool = False


class SANRecoverRequest(BaseModel):
    """Request to recover SAN."""

    character_id: int
    amount: int
    reason: str
    session_id: Optional[str] = None


class SANRecoverResponse(BaseModel):
    """Response from SAN recovery."""

    character_id: int
    previous_san: int
    recovered: int
    current_san: int
    max_san: int
    reason: str


PREDEFINED_SAN_THRESHOLDS: dict[str, SANThreshold] = {
    "corpse_fresh": SANThreshold(
        id="corpse_fresh",
        category=SANCategory.BODILY_HORROR,
        description="发现新鲜的尸体",
        loss=SANLossDefinition(success_min=0, success_max=0, failure_min=1, failure_max=4),
    ),
    "corpse_mutilated": SANThreshold(
        id="corpse_mutilated",
        category=SANCategory.BODILY_HORROR,
        description="发现被肢解的尸体",
        loss=SANLossDefinition(success_min=0, success_max=1, failure_min=1, failure_max=6),
    ),
    "corpse_loved_one": SANThreshold(
        id="corpse_loved_one",
        category=SANCategory.PERSONAL,
        description="发现亲友的尸体",
        loss=SANLossDefinition(success_min=1, success_max=4, failure_min=1, failure_max=8),
        once_only=True,
    ),
    "combat_violence": SANThreshold(
        id="combat_violence",
        category=SANCategory.VIOLENCE,
        description="极端暴力场面",
        loss=SANLossDefinition(success_min=0, success_max=0, failure_min=1, failure_max=4),
    ),
    "unnatural_creature": SANThreshold(
        id="unnatural_creature",
        category=SANCategory.UNNATURAL,
        description="首次遭遇神话生物",
        loss=SANLossDefinition(success_min=0, success_max=1, failure_min=6, failure_max=20),
        once_only=True,
    ),
    "forbidden_knowledge": SANThreshold(
        id="forbidden_knowledge",
        category=SANCategory.KNOWLEDGE,
        description="阅读禁忌文本",
        loss=SANLossDefinition(success_min=3, success_max=3, failure_min=6, failure_max=6),
    ),
    "phobia_trigger": SANThreshold(
        id="phobia_trigger",
        category=SANCategory.PERSONAL,
        description="遭遇恐惧源",
        loss=SANLossDefinition(success_min=0, success_max=1, failure_min=3, failure_max=6),
    ),
}
