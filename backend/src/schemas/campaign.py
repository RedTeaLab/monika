"""Campaign Pydantic schemas for request/response validation."""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Dict, Any


class CampaignCreate(BaseModel):
    """Schema for creating a new campaign."""
    name: str = Field(..., min_length=1, max_length=100, description="Campaign name")
    description: Optional[str] = Field(None, max_length=5000, description="Campaign description")
    max_players: Optional[int] = Field(4, ge=1, le=10, description="Maximum number of players")
    scenario_id: Optional[str] = Field(None, description="Associated scenario ID")
    settings: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Campaign settings")


class CampaignUpdate(BaseModel):
    """Schema for updating a campaign."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=5000)
    max_players: Optional[int] = Field(None, ge=1, le=10)
    scenario_id: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(active|paused|ended|archived)$")
    settings: Optional[Dict[str, Any]] = None


class CampaignJoin(BaseModel):
    """Schema for joining a campaign with invite code."""
    invite_code: str = Field(..., min_length=8, max_length=8, description="Invite code")
    character_id: Optional[int] = Field(None, description="Character ID to use")


class MemberRoleUpdate(BaseModel):
    """Schema for updating member role."""
    role: str = Field(..., pattern="^(keeper|co-keeper|player|observer)$")


class MemberAdd(BaseModel):
    """Schema for adding a member directly (keeper only)."""
    user_id: int = Field(..., description="User ID to add")
    role: str = Field(default="player", pattern="^(keeper|co-keeper|player|observer)$")
    character_id: Optional[int] = Field(None, description="Character ID")
