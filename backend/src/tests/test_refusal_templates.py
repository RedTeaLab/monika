"""Tests for the Refusal Templates Service."""

import pytest

from src.services.refusal_templates import (
    RefusalService,
    RefusalType,
    RefusalTemplate,
)


class TestRefusalService:
    """Test RefusalService functionality."""

    def test_classify_out_of_bounds_modern_topic(self):
        """Test classification of out-of-bounds modern topic."""
        service = RefusalService()

        result = service.classify_input("我想使用手机查找信息")

        assert result == RefusalType.OUT_OF_BOUNDS

    def test_classify_out_of_bounds_2020s_topic(self):
        """Test classification of out-of-bounds 2020s topic."""
        service = RefusalService()

        result = service.classify_input("我想了解2025年的股市行情")

        assert result == RefusalType.OUT_OF_BOUNDS

    def test_classify_cannot_understand(self):
        """Test classification of incomprehensible input."""
        service = RefusalService()

        result = service.classify_input("asdfghjkl qwerty")

        assert result == RefusalType.VALID

    def test_classify_valid_input(self):
        """Test that normal game input is classified as valid."""
        service = RefusalService()

        result = service.classify_input("我调查这个地点")

        assert result == RefusalType.VALID

    def test_classify_cannot_understand_empty(self):
        """Test classification of empty input."""
        service = RefusalService()

        result = service.classify_input("")

        assert result == RefusalType.CANNOT_UNDERSTAND

    def test_classify_check_not_available_inactive_combat(self):
        """Test classification of check not available when combat not active."""
        service = RefusalService()

        result = service.classify_input("我使用手枪射击")

        assert result == RefusalType.CHECK_NOT_AVAILABLE

    def test_classify_check_not_available_no_target(self):
        """Test classification when no target for action."""
        service = RefusalService()

        result = service.classify_input("我攻击")

        assert result == RefusalType.CHECK_NOT_AVAILABLE


class TestRefusalTemplates:
    """Test refusal templates content."""

    def test_out_of_bounds_template_has_message(self):
        """Test OUT_OF_BOUNDS template has message."""
        service = RefusalService()

        refusal = service.get_refusal(RefusalType.OUT_OF_BOUNDS)

        assert refusal.message is not None
        assert len(refusal.message) > 0

    def test_out_of_bounds_template_has_alternatives(self):
        """Test OUT_OF_BOUNDS template has alternatives."""
        service = RefusalService()

        refusal = service.get_refusal(RefusalType.OUT_OF_BOUNDS)

        assert refusal.alternatives is not None
        assert len(refusal.alternatives) > 0

    def test_out_of_bounds_template_has_next_suggestions(self):
        """Test OUT_OF_BOUNDS template has next suggestions."""
        service = RefusalService()

        refusal = service.get_refusal(RefusalType.OUT_OF_BOUNDS)

        assert refusal.next_suggestions is not None
        assert len(refusal.next_suggestions) > 0

    def test_cannot_understand_template_has_message(self):
        """Test CANNOT_UNDERSTAND template has message."""
        service = RefusalService()

        refusal = service.get_refusal(RefusalType.CANNOT_UNDERSTAND)

        assert refusal.message is not None
        assert len(refusal.message) > 0

    def test_cannot_understand_template_has_alternatives(self):
        """Test CANNOT_UNDERSTAND template has alternatives."""
        service = RefusalService()

        refusal = service.get_refusal(RefusalType.CANNOT_UNDERSTAND)

        assert refusal.alternatives is not None
        assert len(refusal.alternatives) > 0

    def test_check_not_available_template_has_message(self):
        """Test CHECK_NOT_AVAILABLE template has message."""
        service = RefusalService()

        refusal = service.get_refusal(RefusalType.CHECK_NOT_AVAILABLE)

        assert refusal.message is not None
        assert len(refusal.message) > 0

    def test_check_not_available_template_has_alternatives(self):
        """Test CHECK_NOT_AVAILABLE template has alternatives."""
        service = RefusalService()

        refusal = service.get_refusal(RefusalType.CHECK_NOT_AVAILABLE)

        assert refusal.alternatives is not None
        assert len(refusal.alternatives) > 0


class TestRefusalTemplate:
    """Test RefusalTemplate dataclass."""

    def test_template_to_dict(self):
        """Test template conversion to dictionary."""
        template = RefusalTemplate(
            message="Test message",
            alternatives=["alt1", "alt2"],
            next_suggestions=["next1"],
        )

        result = template.to_dict()

        assert result["message"] == "Test message"
        assert result["alternatives"] == ["alt1", "alt2"]
        assert result["next_suggestions"] == ["next1"]

    def test_template_to_dict_with_context(self):
        """Test template conversion with context variables."""
        template = RefusalTemplate(
            message="{character} 已经失去意识",
            alternatives=["等待救援", "尝试恢复"],
            next_suggestions=["/status"],
        )

        result = template.to_dict(context={"character": "张三"})

        assert result["message"] == "张三 已经失去意识"
        assert result["alternatives"] == ["等待救援", "尝试恢复"]
        assert result["next_suggestions"] == ["/status"]
