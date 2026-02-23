"""Tests for OutputConfig schema (M6-025)."""

import pytest
from src.schemas.output_config import OutputConfig, OutputFormat


def test_output_config_default_values():
    """Test OutputConfig has correct default values."""
    config = OutputConfig()
    assert config.format == OutputFormat.NORMAL
    assert config.max_length is None
    assert config.include_state_changes is True
    assert config.include_leads is True
    assert config.include_hints is True


def test_output_config_brief_format():
    """Test OutputConfig with brief format."""
    config = OutputConfig(format=OutputFormat.BRIEF)
    assert config.format == OutputFormat.BRIEF


def test_output_config_detailed_format():
    """Test OutputConfig with detailed format."""
    config = OutputConfig(format=OutputFormat.DETAILED)
    assert config.format == OutputFormat.DETAILED


def test_output_config_max_length():
    """Test OutputConfig with max_length."""
    config = OutputConfig(max_length={"narrative": 500, "description": 200})
    assert config.max_length["narrative"] == 500
    assert config.max_length["description"] == 200


def test_output_config_include_flags():
    """Test OutputConfig include flags."""
    config = OutputConfig(include_state_changes=False, include_leads=False, include_hints=False)
    assert config.include_state_changes is False
    assert config.include_leads is False
    assert config.include_hints is False
