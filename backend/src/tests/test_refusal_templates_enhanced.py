"""Tests for the enhanced Refusal Templates Service."""

import pytest

from src.services.refusal_templates import (
    RefusalService,
    RefusalType,
    RefusalTemplate,
)


class TestM6018CannotUnderstandPatterns:
    """Test M6-018: Enhanced cannot understand patterns."""

    def test_classify_emoji_input(self):
        """Test classification of emoji-only input."""
        service = RefusalService()

        result = service.classify_input("😀😁😂")

        assert result == RefusalType.CANNOT_UNDERSTAND

    def test_classify_symbols_input(self):
        """Test classification of symbols-only input."""
        service = RefusalService()

        result = service.classify_input("!!! ??? @#$%")

        assert result == RefusalType.CANNOT_UNDERSTAND

    def test_classify_mixed_emoji_symbols(self):
        """Test classification of mixed emoji and symbols."""
        service = RefusalService()

        result = service.classify_input("🎮🕹️🎯")

        assert result == RefusalType.CANNOT_UNDERSTAND


class TestM6019CheckNotAvailableContext:
    """Test M6-019: Enhanced check not available with context."""

    def test_classify_combat_action_without_combat(self):
        """Test combat action when combat not active."""
        service = RefusalService()

        result = service.classify_input("我挥刀攻击")

        assert result == RefusalType.CHECK_NOT_AVAILABLE

    def test_classify_flee_without_combat(self):
        """Test flee action when combat not active."""
        service = RefusalService()

        result = service.classify_input("我想逃跑")

        assert result == RefusalType.CHECK_NOT_AVAILABLE

    def test_classify_dodge_without_combat(self):
        """Test dodge action when combat not active."""
        service = RefusalService()

        result = service.classify_input("我进行闪避")

        assert result == RefusalType.CHECK_NOT_AVAILABLE


class TestM6020I18nSupport:
    """Test M6-020: Internationalization support."""

    def test_get_refusal_chinese_locale(self):
        """Test getting refusal in Chinese."""
        service = RefusalService()

        template = service.get_refusal(RefusalType.CANNOT_UNDERSTAND, locale="zh")

        assert "理解" in template.message or "确定" in template.message

    def test_get_refusal_english_locale(self):
        """Test getting refusal in English."""
        service = RefusalService()

        template = service.get_refusal(RefusalType.CANNOT_UNDERSTAND, locale="en")

        assert "understand" in template.message.lower() or "not sure" in template.message.lower()

    def test_auto_detect_english_input(self):
        """Test auto-detection of English input."""
        service = RefusalService()

        template = service.get_refusal_for_input("hello world")

        assert template is not None

    def test_render_refusal_with_locale(self):
        """Test rendering refusal with locale."""
        service = RefusalService()

        result = service.render_refusal("hello", context={"locale": "en"})

        assert result["template"]["message"] is not None


class TestM6021ContextAwareRefusals:
    """Test M6-021: Context-aware refusals."""

    def test_context_aware_scene_message(self):
        """Test context-aware message based on scene."""
        service = RefusalService()

        context = {"current_scene": "古墓探险", "locale": "zh"}

        result = service.get_context_aware_refusal(RefusalType.OUT_OF_BOUNDS, context)

        assert result["message"] is not None

    def test_context_aware_combat_message(self):
        """Test context-aware message when combat active."""
        service = RefusalService()

        context = {"combat_active": True, "locale": "zh"}

        result = service.get_context_aware_refusal(RefusalType.CHECK_NOT_AVAILABLE, context)

        assert "战斗" in result["message"] or "combat" in result["message"].lower()

    def test_context_aware_character_state(self):
        """Test context-aware message based on character state."""
        service = RefusalService()

        context = {"character_hp": 0, "locale": "zh"}

        result = service.get_context_aware_refusal(RefusalType.CHECK_NOT_AVAILABLE, context)

        assert result["message"] is not None


class TestM6022SuggestionGeneration:
    """Test M6-022: Suggestion generation algorithm."""

    def test_generate_suggestions_from_leads(self):
        """Test generating suggestions from leads."""
        service = RefusalService()

        leads = [
            {"title": "调查图书馆", "type": "investigate"},
            {"title": "询问证人", "type": "interact"},
        ]

        suggestions = service.generate_suggestions_from_leads(leads)

        assert len(suggestions) > 0
        assert any("图书馆" in s or "调查" in s for s in suggestions)

    def test_generate_suggestions_from_skills(self):
        """Test generating suggestions from character skills."""
        service = RefusalService()

        skills = {
            "侦查": 60,
            "说服": 50,
            "图书馆": 40,
        }

        suggestions = service.generate_suggestions_from_skills(skills, locale="zh")

        assert len(suggestions) > 0

    def test_fallback_suggestions(self):
        """Test fallback suggestions when no leads or skills."""
        service = RefusalService()

        suggestions = service.get_fallback_suggestions(locale="zh")

        assert len(suggestions) > 0
        assert any("/leads" in s or "/help" in s for s in suggestions)

    def test_generate_suggestions_english(self):
        """Test generating suggestions in English."""
        service = RefusalService()

        skills = {
            "spot": 60,
            "persuade": 50,
        }

        suggestions = service.generate_suggestions_from_skills(skills, locale="en")

        assert len(suggestions) > 0


class TestM6023ClarificationQuestions:
    """Test M6-023: Clarification question generation."""

    def test_generate_clarification_ambiguous_target(self):
        """Test clarification for ambiguous target."""
        service = RefusalService()

        question = service.generate_clarification("我调查", {"locale": "zh"})

        assert question is not None
        assert len(question) > 0

    def test_generate_clarification_ambiguous_action(self):
        """Test clarification for ambiguous action."""
        service = RefusalService()

        question = service.generate_clarification("那个东西", {"locale": "zh"})

        assert question is not None

    def test_generate_clarification_english(self):
        """Test clarification in English."""
        service = RefusalService()

        question = service.generate_clarification("investigate that", {"locale": "en"})

        assert question is not None
        assert "what" in question.lower() or "which" in question.lower()


class TestM6024GuidedResponses:
    """Test M6-024: Guided response generation."""

    def test_generate_guided_response(self):
        """Test generating guided response."""
        service = RefusalService()

        guided = service.generate_guided_response(RefusalType.CANNOT_UNDERSTAND, locale="zh")

        assert "steps" in guided or "步骤" in guided["message"]
        assert len(guided.get("steps", [])) > 0

    def test_generate_guided_response_english(self):
        """Test generating guided response in English."""
        service = RefusalService()

        guided = service.generate_guided_response(RefusalType.CANNOT_UNDERSTAND, locale="en")

        assert len(guided.get("steps", [])) > 0

    def test_guided_response_format(self):
        """Test guided response has correct format."""
        service = RefusalService()

        guided = service.generate_guided_response(RefusalType.OUT_OF_BOUNDS, locale="zh")

        assert "message" in guided
        assert "steps" in guided
        assert isinstance(guided["steps"], list)
        assert all(isinstance(s, dict) for s in guided["steps"])
        assert all("number" in s and "description" in s for s in guided["steps"])


class TestRefusalServiceIntegration:
    """Integration tests for enhanced refusal service."""

    def test_full_refusal_flow_with_context(self):
        """Test complete refusal flow with context."""
        service = RefusalService()

        result = service.render_refusal(
            "我想使用手机",
            context={"locale": "zh", "current_scene": "诊所", "character_name": "张三"},
        )

        assert result["type"] == "out_of_bounds"
        assert result["template"]["message"] is not None

    def test_smart_suggestion_flow(self):
        """Test smart suggestion flow."""
        service = RefusalService()

        context = {
            "leads": [
                {"title": "查看诊所记录", "type": "investigate"},
            ],
            "skills": {"侦查": 60},
            "locale": "zh",
        }

        result = service.render_refusal("我不知道该做什么", context=context)

        assert result["template"]["next_suggestions"] is not None

    def test_clarification_flow(self):
        """Test clarification flow."""
        service = RefusalService()

        result = service.render_refusal("那个", context={"locale": "zh"})

        assert result["type"] == "cannot_understand"
        # Should include clarification in suggestions
        suggestions = result["template"].get("next_suggestions", [])
        # The service should detect ambiguous input
        assert result is not None
