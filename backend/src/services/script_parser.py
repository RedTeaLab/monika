"""Script parser for JSON scenario/module files."""

import json
import hashlib
import logging
from typing import Any, Optional
from pydantic import BaseModel, Field, field_validator
from uuid import uuid4

logger = logging.getLogger(__name__)


class SceneData(BaseModel):
    """Scene data structure."""

    id: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    location: Optional[str] = None
    time_of_day: Optional[str] = None
    atmosphere: Optional[str] = None
    order_index: int = 0
    npcs: list = Field(default_factory=list)
    clues: list = Field(default_factory=list)
    handouts: list = Field(default_factory=list)
    estimated_duration_minutes: Optional[int] = None


class NPCData(BaseModel):
    """NPC data structure."""

    id: Optional[str] = None
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    occupation: Optional[str] = None
    age: Optional[int] = None
    str_stat: Optional[int] = None
    dex_stat: Optional[int] = None
    pow_stat: Optional[int] = None
    con_stat: Optional[int] = None
    app_stat: Optional[int] = None
    edu_stat: Optional[int] = None
    siz_stat: Optional[int] = None
    int_stat: Optional[int] = None
    hp: Optional[int] = None
    mp: Optional[int] = None
    san: Optional[int] = None
    skills: dict = Field(default_factory=dict)
    notes: Optional[str] = None
    is_hostile: bool = False


class ClueData(BaseModel):
    """Clue data structure."""

    id: Optional[str] = None
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    location: Optional[str] = None
    required_skill: Optional[str] = None
    difficulty: Optional[str] = None
    is_essential: bool = False
    leads_to: list = Field(default_factory=list)


class ScriptMetadata(BaseModel):
    """Script metadata structure."""

    title: str = Field(..., min_length=1, max_length=255)
    author: Optional[str] = None
    version: Optional[str] = None
    min_players: Optional[int] = Field(default=1, ge=1)
    max_players: Optional[int] = Field(default=5, le=10)
    estimated_duration_hours: Optional[float] = None
    era: Optional[str] = None
    setting: Optional[str] = None
    difficulty: Optional[str] = None
    tags: list = Field(default_factory=list)
    description: Optional[str] = None


class ScriptJSON(BaseModel):
    """Complete script JSON structure."""

    metadata: ScriptMetadata
    scenes: list[SceneData] = Field(default_factory=list)
    npcs: list[NPCData] = Field(default_factory=list)
    clues: list[ClueData] = Field(default_factory=list)
    handouts: list[dict] = Field(default_factory=list)
    intro_text: Optional[str] = None
    keeper_notes: Optional[str] = None


class ValidationResult(BaseModel):
    """Result of script validation."""

    is_valid: bool
    errors: list[dict] = Field(default_factory=list)
    warnings: list[dict] = Field(default_factory=list)
    stats: dict = Field(default_factory=dict)


class ScriptParser:
    """Parser for JSON script files."""

    def parse(self, content: str | bytes) -> tuple[Optional[ScriptJSON], Optional[str]]:
        """Parse JSON content into ScriptJSON model.

        Args:
            content: JSON string or bytes

        Returns:
            Tuple of (parsed_data, error_message)
        """
        try:
            if isinstance(content, bytes):
                content = content.decode("utf-8")

            data = json.loads(content)
            script = ScriptJSON(**data)
            return script, None

        except json.JSONDecodeError as e:
            return None, f"Invalid JSON: {str(e)}"
        except Exception as e:
            return None, f"Parse error: {str(e)}"

    def extract_metadata(self, script: ScriptJSON) -> dict:
        """Extract metadata from parsed script."""
        return {
            "title": script.metadata.title,
            "author": script.metadata.author,
            "version": script.metadata.version,
            "min_players": script.metadata.min_players,
            "max_players": script.metadata.max_players,
            "estimated_duration_hours": script.metadata.estimated_duration_hours,
            "era": script.metadata.era,
            "setting": script.metadata.setting,
            "difficulty": script.metadata.difficulty,
            "tags": script.metadata.tags,
            "description": script.metadata.description,
        }

    def extract_scenes(self, script: ScriptJSON) -> list[dict]:
        """Extract scenes from parsed script."""
        scenes = []
        for idx, scene in enumerate(script.scenes):
            scenes.append(
                {
                    "id": scene.id or str(uuid4()),
                    "name": scene.name,
                    "description": scene.description,
                    "location": scene.location,
                    "time_of_day": scene.time_of_day,
                    "atmosphere": scene.atmosphere,
                    "order_index": idx,
                    "npcs": scene.npcs,
                    "clues": scene.clues,
                    "handouts": scene.handouts,
                    "estimated_duration_minutes": scene.estimated_duration_minutes,
                }
            )
        return scenes

    def calculate_stats(self, script: ScriptJSON) -> dict:
        """Calculate script statistics."""
        return {
            "scene_count": len(script.scenes),
            "npc_count": len(script.npcs),
            "clue_count": len(script.clues),
            "handout_count": len(script.handouts),
            "total_estimated_duration_minutes": sum(
                s.estimated_duration_minutes or 0 for s in script.scenes
            ),
        }


class ScriptValidator:
    """Validator for script content."""

    REQUIRED_METADATA = ["title"]

    def validate(self, script: ScriptJSON) -> ValidationResult:
        """Validate script content.

        Args:
            script: Parsed script data

        Returns:
            ValidationResult with errors and warnings
        """
        errors = []
        warnings = []
        stats = {}

        self._validate_metadata(script.metadata, errors, warnings)
        self._validate_scenes(script.scenes, errors, warnings)
        self._validate_npcs(script.npcs, errors, warnings)
        self._validate_clues(script.clues, errors, warnings)
        self._validate_references(script, warnings)

        stats = {
            "scene_count": len(script.scenes),
            "npc_count": len(script.npcs),
            "clue_count": len(script.clues),
            "handout_count": len(script.handouts),
        }

        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            stats=stats,
        )

    def _validate_metadata(self, metadata: ScriptMetadata, errors: list, warnings: list):
        """Validate script metadata."""
        if not metadata.title or not metadata.title.strip():
            errors.append(
                {
                    "field": "metadata.title",
                    "message": "Title is required",
                    "code": "REQUIRED_FIELD",
                }
            )

        if metadata.min_players and metadata.max_players:
            if metadata.min_players > metadata.max_players:
                errors.append(
                    {
                        "field": "metadata.players",
                        "message": "min_players cannot exceed max_players",
                        "code": "INVALID_RANGE",
                    }
                )

        if not metadata.era:
            warnings.append(
                {
                    "field": "metadata.era",
                    "message": "Era not specified, defaulting to 1920s",
                    "code": "OPTIONAL_FIELD",
                }
            )

        if not metadata.estimated_duration_hours:
            warnings.append(
                {
                    "field": "metadata.estimated_duration_hours",
                    "message": "Estimated duration not provided",
                    "code": "OPTIONAL_FIELD",
                }
            )

    def _validate_scenes(self, scenes: list[SceneData], errors: list, warnings: list):
        """Validate scenes."""
        if not scenes:
            warnings.append(
                {
                    "field": "scenes",
                    "message": "No scenes defined",
                    "code": "EMPTY_LIST",
                }
            )
            return

        scene_names = set()
        for idx, scene in enumerate(scenes):
            if not scene.name or not scene.name.strip():
                errors.append(
                    {
                        "field": f"scenes[{idx}].name",
                        "message": "Scene name is required",
                        "code": "REQUIRED_FIELD",
                    }
                )

            if scene.name in scene_names:
                warnings.append(
                    {
                        "field": f"scenes[{idx}].name",
                        "message": f"Duplicate scene name: {scene.name}",
                        "code": "DUPLICATE_NAME",
                    }
                )
            scene_names.add(scene.name)

            if not scene.description:
                warnings.append(
                    {
                        "field": f"scenes[{idx}].description",
                        "message": f"Scene '{scene.name}' has no description",
                        "code": "OPTIONAL_FIELD",
                    }
                )

    def _validate_npcs(self, npcs: list[NPCData], errors: list, warnings: list):
        """Validate NPCs."""
        npc_names = set()
        for idx, npc in enumerate(npcs):
            if not npc.name or not npc.name.strip():
                errors.append(
                    {
                        "field": f"npcs[{idx}].name",
                        "message": "NPC name is required",
                        "code": "REQUIRED_FIELD",
                    }
                )

            if npc.name in npc_names:
                warnings.append(
                    {
                        "field": f"npcs[{idx}].name",
                        "message": f"Duplicate NPC name: {npc.name}",
                        "code": "DUPLICATE_NAME",
                    }
                )
            npc_names.add(npc.name)

            stats = [
                npc.str_stat,
                npc.dex_stat,
                npc.pow_stat,
                npc.con_stat,
                npc.app_stat,
                npc.edu_stat,
                npc.siz_stat,
                npc.int_stat,
            ]
            for stat_val in stats:
                if stat_val is not None and (stat_val < 1 or stat_val > 100):
                    warnings.append(
                        {
                            "field": f"npcs[{idx}].stats",
                            "message": f"NPC '{npc.name}' has unusual stat values",
                            "code": "UNUSUAL_VALUE",
                        }
                    )
                    break

    def _validate_clues(self, clues: list[ClueData], errors: list, warnings: list):
        """Validate clues."""
        clue_names = set()
        for idx, clue in enumerate(clues):
            if not clue.name or not clue.name.strip():
                errors.append(
                    {
                        "field": f"clues[{idx}].name",
                        "message": "Clue name is required",
                        "code": "REQUIRED_FIELD",
                    }
                )

            if clue.name in clue_names:
                warnings.append(
                    {
                        "field": f"clues[{idx}].name",
                        "message": f"Duplicate clue name: {clue.name}",
                        "code": "DUPLICATE_NAME",
                    }
                )
            clue_names.add(clue.name)

    def _validate_references(self, script: ScriptJSON, warnings: list):
        """Validate cross-references in script."""
        npc_ids = {npc.id for npc in script.npcs if npc.id}
        npc_names = {npc.name for npc in script.npcs}
        clue_ids = {clue.id for clue in script.clues if clue.id}

        for scene in script.scenes:
            for npc_ref in scene.npcs:
                if isinstance(npc_ref, str):
                    if npc_ref not in npc_names and npc_ref not in npc_ids:
                        warnings.append(
                            {
                                "field": f"scenes.{scene.name}.npcs",
                                "message": f"NPC reference '{npc_ref}' not found",
                                "code": "ORPHAN_REFERENCE",
                            }
                        )

            for clue_ref in scene.clues:
                if isinstance(clue_ref, str):
                    if clue_ref not in clue_ids:
                        warnings.append(
                            {
                                "field": f"scenes.{scene.name}.clues",
                                "message": f"Clue reference '{clue_ref}' not found",
                                "code": "ORPHAN_REFERENCE",
                            }
                        )

        for clue in script.clues:
            for lead_ref in clue.leads_to:
                if isinstance(lead_ref, str):
                    if lead_ref not in clue_ids:
                        warnings.append(
                            {
                                "field": f"clues.{clue.name}.leads_to",
                                "message": f"Clue reference '{lead_ref}' not found",
                                "code": "ORPHAN_REFERENCE",
                            }
                        )


def calculate_file_hash(content: bytes) -> str:
    """Calculate SHA-256 hash of file content."""
    return hashlib.sha256(content).hexdigest()


def check_injection(content: str) -> list[str]:
    """Check for potential injection attacks in content.

    Returns list of detected issues.
    """
    issues = []

    dangerous_patterns = [
        ("__import__", "Python import"),
        ("eval(", "Code evaluation"),
        ("exec(", "Code execution"),
        ("os.system", "System command"),
        ("subprocess", "Subprocess call"),
        ("<script", "HTML script tag"),
        ("javascript:", "JavaScript protocol"),
    ]

    content_lower = content.lower()
    for pattern, desc in dangerous_patterns:
        if pattern.lower() in content_lower:
            issues.append(f"Potentially dangerous content detected: {desc}")

    return issues
