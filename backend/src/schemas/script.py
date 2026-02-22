"""Script schemas for API validation."""

from datetime import datetime
from typing import List, Optional, Any
from pydantic import BaseModel, Field


class ScriptCreate(BaseModel):
    """Schema for creating a new script."""

    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    script_type: str = "scenario"
    tags: Optional[List[str]] = None
    metadata: Optional[dict] = None


class ScriptUpdate(BaseModel):
    """Schema for updating a script."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    is_public: Optional[bool] = None


class ScriptResponse(BaseModel):
    """Script response schema."""

    id: str
    owner_id: int
    name: str
    description: Optional[str] = None
    script_type: str
    status: str
    metadata: Optional[dict] = None
    cover_image_url: Optional[str] = None
    tags: List[str] = []
    scene_count: int = 0
    npc_count: int = 0
    clue_count: int = 0
    current_version: int = 1
    validation_errors: Optional[List[dict]] = None
    validation_warnings: Optional[List[dict]] = None
    is_public: bool = False
    download_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ScriptSceneResponse(BaseModel):
    """Script scene response schema."""

    id: str
    script_id: str
    name: str
    order_index: int
    description: Optional[str] = None
    location: Optional[str] = None
    time_of_day: Optional[str] = None
    atmosphere: Optional[str] = None
    npcs: List[Any] = []
    clues: List[Any] = []
    handouts: List[Any] = []
    estimated_duration_minutes: Optional[int] = None


class ScriptVersionResponse(BaseModel):
    """Script version response schema."""

    id: str
    script_id: str
    version_number: int
    change_notes: Optional[str] = None
    file_size_bytes: Optional[int] = None
    file_hash: Optional[str] = None
    validation_status: Optional[str] = None
    validation_errors: Optional[List[dict]] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ScriptListResponse(BaseModel):
    """Script list response with pagination."""

    scripts: List[ScriptResponse]
    total: int
    page: int
    page_size: int


class ScriptDetailResponse(BaseModel):
    """Script detail response with scenes and versions."""

    script: ScriptResponse
    scenes: List[dict]
    versions: List[dict]


class ValidationErrorItem(BaseModel):
    """Validation error item."""

    field: str
    message: str
    code: str


class ValidationWarningItem(BaseModel):
    """Validation warning item."""

    field: str
    message: str
    code: str


class ValidationResultResponse(BaseModel):
    """Validation result response."""

    is_valid: bool
    errors: List[dict] = []
    warnings: List[dict] = []
    stats: dict = {}


class UploadResponse(BaseModel):
    """Upload response schema."""

    success: bool
    message: str
    validation_result: Optional[ValidationResultResponse] = None
    script_id: Optional[str] = None
