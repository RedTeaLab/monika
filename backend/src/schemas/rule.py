"""Pydantic schemas for rules validation."""
from datetime import datetime
from typing import Optional, List
from enum import Enum

from pydantic import BaseModel, ConfigDict, field_validator
import uuid


class RuleCategory(str, Enum):
    """Constants for rule categories."""

    CORE = "core"
    SKILL = "skill"
    COMBAT = "combat"
    SANITY = "sanity"
    CHASE = "chase"
    MAGIC = "magic"


class RuleBase(BaseModel):
    """Base fields for rule schemas."""

    title: str
    category: RuleCategory
    subcategory: Optional[str] = None
    content: str
    example: Optional[str] = None
    mechanics: Optional[dict] = None
    aliases: Optional[List[str]] = []
    tags: Optional[List[str]] = []
    related_rule_ids: Optional[List[str]] = []

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        """Ensure title is not empty."""
        if not v or not v.strip():
            raise ValueError("Title cannot be empty")
        return v.strip()

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str) -> str:
        """Ensure content is not empty."""
        if not v or not v.strip():
            raise ValueError("Content cannot be empty")
        return v.strip()


class RuleCreate(RuleBase):
    """Schema for creating a new rule."""

    pass


class RuleUpdate(BaseModel):
    """Schema for updating a rule (all optional)."""

    title: Optional[str] = None
    category: Optional[RuleCategory] = None
    subcategory: Optional[str] = None
    content: Optional[str] = None
    example: Optional[str] = None
    mechanics: Optional[dict] = None
    aliases: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    related_rule_ids: Optional[List[str]] = None

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: Optional[str]) -> Optional[str]:
        """Ensure title is not empty if provided."""
        if v is not None and not v.strip():
            raise ValueError("Title cannot be empty")
        return v.strip() if v else None

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: Optional[str]) -> Optional[str]:
        """Ensure content is not empty if provided."""
        if v is not None and not v.strip():
            raise ValueError("Content cannot be empty")
        return v.strip() if v else None


class RuleResponse(RuleBase):
    """Schema for rule response (includes timestamps)."""

    id: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RuleSummary(BaseModel):
    """Schema for rule summary (id, title, category, content summary)."""

    id: str
    title: str
    category: RuleCategory
    content: str

    model_config = ConfigDict(from_attributes=True)


class RuleSearchResult(BaseModel):
    """Schema for a single rule search result."""

    id: str
    title: str
    category: RuleCategory
    content: str
    relevance_score: float
    related_rules: List[RuleSummary] = []

    @field_validator("relevance_score")
    @classmethod
    def relevance_score_valid(cls, v: float) -> float:
        """Ensure relevance score is between 0 and 1."""
        if not 0 <= v <= 1:
            raise ValueError("Relevance score must be between 0 and 1")
        return v


class RuleSearchResponse(BaseModel):
    """Schema for rule search response."""

    results: List[RuleSearchResult]
    total: int
    query: str


class FAQBase(BaseModel):
    """Base fields for FAQ schemas."""

    question: str
    answer: str
    category: Optional[str] = None
    related_rule_ids: Optional[List[str]] = []

    @field_validator("question")
    @classmethod
    def question_not_empty(cls, v: str) -> str:
        """Ensure question is not empty."""
        if not v or not v.strip():
            raise ValueError("Question cannot be empty")
        return v.strip()

    @field_validator("answer")
    @classmethod
    def answer_not_empty(cls, v: str) -> str:
        """Ensure answer is not empty."""
        if not v or not v.strip():
            raise ValueError("Answer cannot be empty")
        return v.strip()


class FAQCreate(FAQBase):
    """Schema for creating a new FAQ."""

    pass


class FAQResponse(FAQBase):
    """Schema for FAQ response (includes id and timestamp)."""

    id: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RuleImportData(BaseModel):
    """Schema for bulk rule import data."""

    rules: List[RuleCreate]
    faqs: List[FAQCreate]


class RuleImportResponse(BaseModel):
    """Schema for rule import response."""

    imported: int
    failed: int
    errors: List[str] = []
