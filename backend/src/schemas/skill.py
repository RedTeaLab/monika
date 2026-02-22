"""Skill schemas for API."""

from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict, model_validator


class SkillBase(BaseModel):
    """Base skill schema."""

    name: str
    name_en: str
    base_value: int
    category: str
    available_modern: bool = True
    available_1920s: bool = True
    description: Optional[str] = None
    difficulty_levels: Optional[str] = None
    push_examples: Optional[str] = None
    push_failure_examples: Optional[str] = None
    opposing_skills: Optional[str] = None
    has_specializations: bool = False


class SkillCreate(SkillBase):
    """Schema for creating a skill."""

    parent_skill_id: Optional[int] = None


class SkillUpdate(BaseModel):
    """Schema for updating a skill."""

    name: Optional[str] = None
    name_en: Optional[str] = None
    base_value: Optional[int] = None
    category: Optional[str] = None
    available_modern: Optional[bool] = None
    available_1920s: Optional[bool] = None
    description: Optional[str] = None
    difficulty_levels: Optional[str] = None
    push_examples: Optional[str] = None
    push_failure_examples: Optional[str] = None
    opposing_skills: Optional[str] = None
    has_specializations: Optional[bool] = None


class SkillSpecialization(BaseModel):
    """Skill specialization schema."""

    id: int
    name: str
    name_en: str
    base_value: int

    model_config = ConfigDict(from_attributes=True)


class SkillResponse(SkillBase):
    """Schema for skill response."""

    id: int
    parent_skill_id: Optional[int] = None
    specializations: List[SkillSpecialization] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def validate_specializations(cls, data: Any) -> Any:
        """Convert specializations relationship to SkillSpecialization list."""
        if isinstance(data, dict):
            return data

        # If data is an ORM object with specializations attribute
        if hasattr(data, "specializations") and data.specializations:
            # Convert to list of SkillSpecialization
            specs = [SkillSpecialization.model_validate(spec) for spec in data.specializations]
            # Update the data dict
            if not isinstance(data, dict):
                data_dict = {}
                for field in cls.model_fields:
                    if hasattr(data, field):
                        data_dict[field] = getattr(data, field)
                data_dict["specializations"] = specs
                return data_dict
            data.specializations = specs

        return data


class SkillListResponse(BaseModel):
    """Schema for skill list response."""

    skills: List[SkillResponse]
    total: int


class SkillCategoryBase(BaseModel):
    """Base skill category schema."""

    key: str
    name: str
    name_en: str
    description: Optional[str] = None
    sort_order: int = 0


class SkillCategoryResponse(SkillCategoryBase):
    """Schema for skill category response."""

    id: int

    model_config = ConfigDict(from_attributes=True)


class SkillForAI(BaseModel):
    """Detailed skill info for AI reference."""

    id: int
    name: str
    name_en: str
    base_value: int
    category: str
    description: Optional[str] = None
    difficulty_levels: Optional[str] = None
    push_examples: Optional[str] = None
    push_failure_examples: Optional[str] = None
    opposing_skills: Optional[str] = None
    specializations: List[str] = []

    model_config = ConfigDict(from_attributes=True)
