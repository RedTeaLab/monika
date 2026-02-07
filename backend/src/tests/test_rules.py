"""Tests for rules database models."""
import pytest
import uuid
from sqlalchemy.orm import Session


class TestRuleModel:
    """Test Rule database model."""

    def test_create_rule(self, test_db: Session):
        """Test that a rule can be created and retrieved."""
        from src.models.rule import Rule

        rule = Rule(
            title="暗视",
            category="skill",
            subcategory="感知技能",
            content="暗视允许调查员在几乎完全黑暗的环境中进行检定...",
            aliases=["夜视", "Darkness adaptation"],
            tags=["感知", "修正"]
        )

        test_db.add(rule)
        test_db.commit()
        test_db.refresh(rule)

        assert rule.id is not None
        assert rule.title == "暗视"
        assert rule.category == "skill"
        assert rule.subcategory == "感知技能"
        assert rule.aliases == ["夜视", "Darkness adaptation"]
        assert rule.tags == ["感知", "修正"]

    def test_create_rule_faq(self, test_db: Session):
        """Test that a rule FAQ can be created and retrieved."""
        from src.models.rule import RuleFAQ

        faq = RuleFAQ(
            question="暗视技能如何使用?",
            answer="暗视允许调查员在几乎完全黑暗的环境中进行检定，但有惩罚骰...",
            category="skill"
        )

        test_db.add(faq)
        test_db.commit()
        test_db.refresh(faq)

        assert faq.id is not None
        assert faq.question == "暗视技能如何使用?"
        assert faq.category == "skill"

    def test_rule_to_dict(self, test_db: Session):
        """Test that Rule.to_dict() returns correct structure."""
        from src.models.rule import Rule

        rule = Rule(
            title="暗视",
            category="skill",
            subcategory="感知技能",
            content="暗视允许调查员在几乎完全黑暗的环境中进行检定...",
            example="例：在漆黑的矿井中，调查员可以使用暗视技能...",
            mechanics={"modifier": -20, "requires_light": False},
            aliases=["夜视", "Darkness adaptation"],
            tags=["感知", "修正"]
        )

        test_db.add(rule)
        test_db.commit()
        test_db.refresh(rule)

        rule_dict = rule.to_dict()

        assert "id" in rule_dict
        assert rule_dict["title"] == "暗视"
        assert rule_dict["category"] == "skill"
        assert rule_dict["subcategory"] == "感知技能"
        assert rule_dict["content"] == "暗视允许调查员在几乎完全黑暗的环境中进行检定..."
        assert rule_dict["example"] == "例：在漆黑的矿井中，调查员可以使用暗视技能..."
        assert rule_dict["mechanics"] == {"modifier": -20, "requires_light": False}
        assert rule_dict["aliases"] == ["夜视", "Darkness adaptation"]
        assert rule_dict["tags"] == ["感知", "修正"]
        assert rule_dict["related_rule_ids"] == []

    def test_rule_with_related_rules(self, test_db: Session):
        """Test that a rule can have related rule IDs."""
        from src.models.rule import Rule

        related_id = str(uuid.uuid4())

        rule = Rule(
            title="暗视",
            category="skill",
            content="暗视允许调查员在几乎完全黑暗的环境中进行检定...",
            related_rule_ids=[related_id]
        )

        test_db.add(rule)
        test_db.commit()
        test_db.refresh(rule)

        assert len(rule.related_rule_ids) == 1
        assert rule.related_rule_ids[0] == related_id

    def test_rule_with_mechanics_json(self, test_db: Session):
        """Test that mechanics can store complex JSON data."""
        from src.models.rule import Rule

        mechanics = {
            "difficulty": "hard",
            "modifier": -20,
            "prerequisites": ["侦察 30+"],
            "effects": [
                {"type": "penalty_dice", "value": 1},
                {"type": "skill_bonus", "skill": "侦察", "value": 10}
            ]
        }

        rule = Rule(
            title="黑暗环境",
            category="environment",
            content="在完全黑暗的环境中，调查员受到惩罚骰...",
            mechanics=mechanics
        )

        test_db.add(rule)
        test_db.commit()
        test_db.refresh(rule)

        assert rule.mechanics == mechanics
        assert rule.mechanics["difficulty"] == "hard"
        assert len(rule.mechanics["effects"]) == 2

    def test_rule_faq_with_related_rules(self, test_db: Session):
        """Test that FAQ can have related rule IDs."""
        from src.models.rule import RuleFAQ

        rule_id = str(uuid.uuid4())

        faq = RuleFAQ(
            question="暗视技能如何使用?",
            answer="暗视允许调查员在几乎完全黑暗的环境中进行检定...",
            related_rule_ids=[rule_id]
        )

        test_db.add(faq)
        test_db.commit()
        test_db.refresh(faq)

        assert len(faq.related_rule_ids) == 1
        assert faq.related_rule_ids[0] == rule_id
