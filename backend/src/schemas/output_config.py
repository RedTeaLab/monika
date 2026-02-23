"""Output configuration schema (M6-025)."""

from pydantic import BaseModel
from typing import Optional
from enum import Enum


class OutputFormat(str, Enum):
    BRIEF = "brief"
    NORMAL = "normal"
    DETAILED = "detailed"


class OutputConfig(BaseModel):
    format: OutputFormat = OutputFormat.NORMAL
    max_length: Optional[dict] = None
    include_state_changes: bool = True
    include_leads: bool = True
    include_hints: bool = True

    class Config:
        use_enum_values = True
