"""Character growth system schemas for CoC 7e."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class GrowthCheckResult(str, Enum):
    """Result of a growth check."""

    SUCCESS = "success"
    FAILURE = "failure"
    CRITICAL_SUCCESS = "critical_success"


class SkillExperience(BaseModel):
    """Experience record for a skill."""

    skill_name: str
    times_used: int = 0
    last_used_at: Optional[datetime] = None
    is_marked_for_growth: bool = False


class GrowthRecord(BaseModel):
    """A record of skill growth."""

    id: str
    character_id: int
    skill_name: str
    previous_value: int
    new_value: int
    improvement: int
    check_roll: int
    check_result: GrowthCheckResult
    session_id: Optional[str] = None
    created_at: datetime


class GrowthCheckRequest(BaseModel):
    """Request to perform a growth check."""

    character_id: int
    skill_name: str
    force_roll: Optional[int] = None
    session_id: Optional[str] = None


class GrowthCheckResponse(BaseModel):
    """Response from a growth check."""

    character_id: int
    skill_name: str
    skill_value: int
    roll: int
    result: GrowthCheckResult
    improvement: int
    new_value: int
    message: str


class MarkSkillRequest(BaseModel):
    """Request to mark a skill for growth."""

    character_id: int
    skill_name: str
    session_id: Optional[str] = None


class MarkSkillResponse(BaseModel):
    """Response from marking a skill."""

    character_id: int
    skill_name: str
    times_used: int
    is_marked_for_growth: bool
    message: str


class GrowthHistoryRequest(BaseModel):
    """Request to get growth history."""

    character_id: int
    limit: int = 10


class GrowthHistoryResponse(BaseModel):
    """Response with growth history."""

    character_id: int
    total_improvements: int
    records: list[GrowthRecord]


class SkillExperienceResponse(BaseModel):
    """Response with skill experience status."""

    character_id: int
    skills: list[SkillExperience]
    marked_count: int
    can_perform_growth: bool


class GrowthPreviewRequest(BaseModel):
    """Request to preview potential growth."""

    character_id: int
    skill_name: str


class GrowthPreviewResponse(BaseModel):
    """Response with growth preview."""

    skill_name: str
    current_value: int
    min_improvement: int = 1
    max_improvement: int = 10
    average_improvement: float = 5.5
    chance_of_success: float
    message: str
