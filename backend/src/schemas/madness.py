"""Madness system schemas for CoC 7e."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class MadnessType(str, Enum):
    """Types of madness in CoC 7e."""

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


class MadnessCategory(str, Enum):
    """Category of madness."""

    TEMPORARY = "temporary"
    INDEFINITE = "indefinite"


class MadnessSeverity(str, Enum):
    """Severity of madness symptoms."""

    MILD = "mild"
    MODERATE = "moderate"
    SEVERE = "severe"
    EXTREME = "extreme"


class MadnessSymptom(BaseModel):
    """A symptom of madness."""

    id: str
    name: str
    description: str
    effect_type: str = "behavior"
    modifier: Optional[int] = None
    prohibited_actions: list[str] = []
    required_actions: list[str] = []
    duration_modifier: int = 0


MADNESS_SYMPTOMS: dict[MadnessType, list[MadnessSymptom]] = {
    MadnessType.TEMPORARY_FAINT: [
        MadnessSymptom(
            id="faint_unconscious",
            name="失去意识",
            description="角色陷入昏迷状态",
            effect_type="state",
            prohibited_actions=["move", "act", "speak"],
        ),
    ],
    MadnessType.TEMPORARY_PANIC: [
        MadnessSymptom(
            id="panic_flee",
            name="恐慌逃跑",
            description="角色因恐惧而逃离现场",
            effect_type="behavior",
            required_actions=["flee"],
            prohibited_actions=["attack", "investigate"],
        ),
    ],
    MadnessType.TEMPORARY_FLEE: [
        MadnessSymptom(
            id="flee_random",
            name="漫无目的奔跑",
            description="角色随机奔跑，无法控制",
            effect_type="behavior",
            required_actions=["run"],
            prohibited_actions=["stop", "interact"],
        ),
    ],
    MadnessType.TEMPORARY_STUNNED: [
        MadnessSymptom(
            id="stunned_freeze",
            name="惊呆冻结",
            description="角色无法行动，站立不动",
            effect_type="state",
            prohibited_actions=["act", "move"],
        ),
    ],
    MadnessType.TEMPORARY_RAVING: [
        MadnessSymptom(
            id="raving_incoherent",
            name="谵妄胡言",
            description="角色无法进行有意义交流",
            effect_type="communication",
            modifier=-50,
            prohibited_actions=["persuade", "fast_talk"],
        ),
    ],
    MadnessType.INDEFINITE_AMNESIA: [
        MadnessSymptom(
            id="amnesia_memory",
            name="记忆丧失",
            description="角色忘记重要的人和事",
            effect_type="cognitive",
            prohibited_actions=["recall_memory"],
        ),
    ],
    MadnessType.INDEFINITE_DELUSION: [
        MadnessSymptom(
            id="delusion_false_belief",
            name="虚假信念",
            description="角色持有错误的信念",
            effect_type="cognitive",
            modifier=-20,
        ),
    ],
    MadnessType.INDEFINITE_HALLUCINATION: [
        MadnessSymptom(
            id="hallucination_visions",
            name="幻视幻听",
            description="角色看到或听到不存在的事物",
            effect_type="perception",
            modifier=-30,
        ),
    ],
    MadnessType.INDEFINITE_PARANOIA: [
        MadnessSymptom(
            id="paranoia_suspicion",
            name="偏执多疑",
            description="角色怀疑所有人的动机",
            effect_type="social",
            modifier=-40,
            prohibited_actions=["trust", "cooperate"],
        ),
    ],
    MadnessType.INDEFINITE_PHOBIA: [
        MadnessSymptom(
            id="phobia_fear",
            name="特定恐惧",
            description="角色对特定事物产生强烈恐惧",
            effect_type="behavior",
            modifier=-30,
        ),
    ],
    MadnessType.INDEFINITE_MANIA: [
        MadnessSymptom(
            id="mania_obsession",
            name="躁狂执念",
            description="角色对某事物产生过度痴迷",
            effect_type="behavior",
            required_actions=["pursue_obsession"],
        ),
    ],
    MadnessType.INDEFINITE_SCHIZOPHRENIA: [
        MadnessSymptom(
            id="schizophrenia_dissociation",
            name="精神分裂",
            description="角色与现实脱节",
            effect_type="cognitive",
            modifier=-50,
            prohibited_actions=["normal_interaction"],
        ),
    ],
}


class MadnessEpisode(BaseModel):
    """A madness episode instance."""

    id: str
    character_id: int
    madness_type: MadnessType
    category: MadnessCategory
    symptoms: list[MadnessSymptom]

    started_at: datetime
    ends_at: Optional[datetime] = None

    duration_minutes: Optional[int] = None
    duration_hours: Optional[int] = None

    trigger_reason: str
    trigger_san_loss: int
    trigger_san_before: int
    trigger_san_after: int

    is_active: bool = True
    is_real_life: bool = False

    recovery_conditions: list[str] = []
    recovery_roll_required: bool = False
    recovery_roll_made: bool = False
    recovery_roll_result: Optional[str] = None


class MadnessTriggerRequest(BaseModel):
    """Request to trigger madness."""

    character_id: int
    san_loss: int
    san_before: int
    san_after: int
    reason: str
    force_type: Optional[MadnessType] = None


class MadnessTriggerResponse(BaseModel):
    """Response from madness trigger."""

    episode: MadnessEpisode
    is_temporary: bool
    duration_text: str
    symptoms_summary: list[str]


class MadnessRecoveryRequest(BaseModel):
    """Request to attempt madness recovery."""

    episode_id: str
    character_id: int
    force_roll: Optional[int] = None


class MadnessRecoveryResponse(BaseModel):
    """Response from madness recovery attempt."""

    episode_id: str
    character_id: int
    recovered: bool
    roll: Optional[int] = None
    success: bool = False
    message: str


class MadnessStatusResponse(BaseModel):
    """Response for character madness status."""

    character_id: int
    has_active_madness: bool
    active_episodes: list[MadnessEpisode] = []
    madness_history_count: int = 0
    temporary_madness_count: int = 0
    indefinite_madness_count: int = 0
    current_madness_summary: Optional[str] = None
