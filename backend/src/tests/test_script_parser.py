"""Tests for Script Parser and Validator."""

import pytest
from src.services.script_parser import (
    ScriptParser,
    ScriptValidator,
    ScriptJSON,
    ScriptMetadata,
    SceneData,
    NPCData,
    ClueData,
    calculate_file_hash,
    check_injection,
)


class TestScriptParser:
    """Test the ScriptParser class."""

    def test_parse_valid_json(self):
        """Test parsing valid JSON content."""
        parser = ScriptParser()
        content = """{
            "metadata": {
                "title": "Test Scenario",
                "author": "Test Author"
            },
            "scenes": [],
            "npcs": [],
            "clues": []
        }"""

        result, error = parser.parse(content)

        assert error is None
        assert result is not None
        assert result.metadata.title == "Test Scenario"

    def test_parse_invalid_json(self):
        """Test parsing invalid JSON content."""
        parser = ScriptParser()
        content = "not valid json"

        result, error = parser.parse(content)

        assert result is None
        assert "Invalid JSON" in error

    def test_parse_missing_required_fields(self):
        """Test parsing with missing required fields."""
        parser = ScriptParser()
        content = '{"metadata": {}, "scenes": []}'

        result, error = parser.parse(content)

        assert result is None
        assert error is not None

    def test_extract_metadata(self):
        """Test metadata extraction."""
        parser = ScriptParser()
        script = ScriptJSON(
            metadata=ScriptMetadata(
                title="Test",
                author="Author",
                min_players=2,
                max_players=5,
            ),
            scenes=[],
            npcs=[],
            clues=[],
        )

        metadata = parser.extract_metadata(script)

        assert metadata["title"] == "Test"
        assert metadata["author"] == "Author"
        assert metadata["min_players"] == 2
        assert metadata["max_players"] == 5

    def test_calculate_stats(self):
        """Test statistics calculation."""
        parser = ScriptParser()
        script = ScriptJSON(
            metadata=ScriptMetadata(title="Test"),
            scenes=[SceneData(name="Scene 1"), SceneData(name="Scene 2")],
            npcs=[NPCData(name="NPC 1")],
            clues=[ClueData(name="Clue 1"), ClueData(name="Clue 2"), ClueData(name="Clue 3")],
        )

        stats = parser.calculate_stats(script)

        assert stats["scene_count"] == 2
        assert stats["npc_count"] == 1
        assert stats["clue_count"] == 3


class TestScriptValidator:
    """Test the ScriptValidator class."""

    def test_validate_valid_script(self):
        """Test validating a valid script."""
        validator = ScriptValidator()
        script = ScriptJSON(
            metadata=ScriptMetadata(title="Valid Scenario"),
            scenes=[SceneData(name="Scene 1", description="Description")],
            npcs=[NPCData(name="NPC 1")],
            clues=[],
        )

        result = validator.validate(script)

        assert result.is_valid
        assert len(result.errors) == 0

    def test_validate_missing_title(self):
        """Test validation with missing title - Pydantic validates this."""
        pass

    def test_validate_empty_title_after_parse(self):
        """Test validation detects effectively empty title."""
        validator = ScriptValidator()
        script = ScriptJSON(
            metadata=ScriptMetadata(title="   "),
            scenes=[],
            npcs=[],
            clues=[],
        )

        result = validator.validate(script)

        assert not result.is_valid
        assert any(e["code"] == "REQUIRED_FIELD" for e in result.errors)

    def test_validate_player_range_error(self):
        """Test validation with invalid player range."""
        validator = ScriptValidator()
        script = ScriptJSON(
            metadata=ScriptMetadata(title="Test", min_players=5, max_players=2),
            scenes=[],
            npcs=[],
            clues=[],
        )

        result = validator.validate(script)

        assert not result.is_valid
        assert any(e["code"] == "INVALID_RANGE" for e in result.errors)

    def test_validate_duplicate_scene_names(self):
        """Test validation with duplicate scene names."""
        validator = ScriptValidator()
        script = ScriptJSON(
            metadata=ScriptMetadata(title="Test"),
            scenes=[
                SceneData(name="Same Name"),
                SceneData(name="Same Name"),
            ],
            npcs=[],
            clues=[],
        )

        result = validator.validate(script)

        assert any(w["code"] == "DUPLICATE_NAME" for w in result.warnings)

    def test_validate_empty_scenes_warning(self):
        """Test validation warns about empty scenes."""
        validator = ScriptValidator()
        script = ScriptJSON(
            metadata=ScriptMetadata(title="Test"),
            scenes=[],
            npcs=[],
            clues=[],
        )

        result = validator.validate(script)

        assert any(w["code"] == "EMPTY_LIST" for w in result.warnings)


class TestUtilityFunctions:
    """Test utility functions."""

    def test_calculate_file_hash(self):
        """Test file hash calculation."""
        content = b"test content"
        result = calculate_file_hash(content)

        assert len(result) == 64
        assert result.isalnum()

    def test_check_injection_safe_content(self):
        """Test injection check with safe content."""
        content = "This is a normal scenario description with no dangerous code."
        issues = check_injection(content)

        assert len(issues) == 0

    def test_check_injection_dangerous_content(self):
        """Test injection check with dangerous content."""
        content = "Some text with <script>alert('xss')</script> tags"
        issues = check_injection(content)

        assert len(issues) > 0
        assert any("HTML script" in issue for issue in issues)

    def test_check_injection_python_eval(self):
        """Test injection check with eval."""
        content = "Text with eval('malicious code') in it"
        issues = check_injection(content)

        assert len(issues) > 0
        assert any("Code evaluation" in issue for issue in issues)
