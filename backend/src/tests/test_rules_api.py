"""Tests for Rules API endpoints."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.models.rule import Rule, RuleFAQ
from src.schemas.rule import RuleCategory, RuleCreate, FAQCreate, RuleImportData


class TestRulesAPI:
    """Test suite for Rules API endpoints."""

    def test_search_rules_with_query(self, client: TestClient, test_db: Session):
        """Test searching rules with a query string."""
        # Create test rules
        rule1 = Rule(
            title="暗视",
            category=RuleCategory.CORE.value,
            content="在黑暗环境中进行检定时，技能值减半。",
            example="侦探在没有光源的地下室中进行侦查检定",
            tags=["vision", "darkness"]
        )
        rule2 = Rule(
            title="推骰",
            category=RuleCategory.CORE.value,
            content="失败的检定可以重投，但会有后果。",
            example="玩家决定推骰锁匠检定"
        )
        test_db.add_all([rule1, rule2])
        test_db.commit()

        # Search for rules
        response = client.get("/rules/search?query=暗视&limit=10")

        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert "total" in data
        assert "query" in data
        assert data["query"] == "暗视"
        assert len(data["results"]) > 0
        # Check that暗视 is in results
        assert any(r["title"] == "暗视" for r in data["results"])

    def test_search_rules_with_category_filter(self, client: TestClient, test_db: Session):
        """Test searching rules with category filter."""
        # Create test rules in different categories
        rule1 = Rule(
            title="闪击",
            category=RuleCategory.COMBAT.value,
            content="先攻检定成功可以获得额外行动。",
        )
        rule2 = Rule(
            title="暗视",
            category=RuleCategory.CORE.value,
            content="在黑暗环境中进行检定时，技能值减半。",
        )
        test_db.add_all([rule1, rule2])
        test_db.commit()

        # Search with category filter
        response = client.get(f"/rules/search?query=检定&category={RuleCategory.CORE.value}&limit=10")

        assert response.status_code == 200
        data = response.json()
        assert len(data["results"]) > 0
        # All results should be from CORE category
        assert all(r["category"] == RuleCategory.CORE.value for r in data["results"])

    def test_search_rules_empty_query(self, client: TestClient):
        """Test searching rules with empty query returns 400."""
        response = client.get("/rules/search?query=&limit=10")

        assert response.status_code == 400
        assert "Query parameter is required" in response.json()["detail"]

    def test_search_rules_invalid_limit(self, client: TestClient):
        """Test searching rules with invalid limit returns 400."""
        response = client.get("/rules/search?query=test&limit=0")

        assert response.status_code == 400
        assert "Limit must be between 1 and 100" in response.json()["detail"]

    def test_search_rules_no_results(self, client: TestClient, test_db: Session):
        """Test searching rules that don't exist returns empty results."""
        response = client.get("/rules/search?query=nonexistent_rule_xyz&limit=10")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert len(data["results"]) == 0

    def test_get_rule_by_id(self, client: TestClient, test_db: Session):
        """Test getting a rule by ID."""
        # Create test rule
        rule = Rule(
            title="花幸运",
            category=RuleCategory.CORE.value,
            content="玩家可以花费幸运点来改变骰点结果。",
            example="玩家花费2点幸运将失败转化为成功",
            mechanics={"cost": "1-5 points", "effect": "reroll or add bonus"}
        )
        test_db.add(rule)
        test_db.commit()
        test_db.refresh(rule)

        # Get rule by ID
        response = client.get(f"/rules/{rule.id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(rule.id)
        assert data["title"] == "花幸运"
        assert data["category"] == RuleCategory.CORE.value
        assert data["content"] == "玩家可以花费幸运点来改变骰点结果。"
        assert data["example"] == "玩家花费2点幸运将失败转化为成功"
        assert data["mechanics"]["cost"] == "1-5 points"

    def test_get_rule_not_found(self, client: TestClient):
        """Test getting a non-existent rule returns 404."""
        response = client.get("/rules/00000000-0000-0000-0000-000000000000")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_rule_invalid_id(self, client: TestClient):
        """Test getting rule with empty ID returns 405 Method Not Allowed."""
        response = client.get("/rules/")

        # This should return 405 Method Not Allowed
        assert response.status_code == 405

    def test_get_categories(self, client: TestClient, test_db: Session):
        """Test getting all rule categories."""
        # Create test rules in different categories
        rule1 = Rule(
            title="暗视",
            category=RuleCategory.CORE.value,
            content="在黑暗环境中进行检定时，技能值减半。",
        )
        rule2 = Rule(
            title="闪击",
            category=RuleCategory.COMBAT.value,
            content="先攻检定成功可以获得额外行动。",
        )
        rule3 = Rule(
            title="理智检定",
            category=RuleCategory.SANITY.value,
            content="遇到恐怖事物时需要进行SAN检定。",
        )
        test_db.add_all([rule1, rule2, rule3])
        test_db.commit()

        # Get categories
        response = client.get("/rules/categories/list")

        assert response.status_code == 200
        categories = response.json()
        assert isinstance(categories, list)
        assert RuleCategory.CORE.value in categories
        assert RuleCategory.COMBAT.value in categories
        assert RuleCategory.SANITY.value in categories

    def test_get_categories_empty(self, client: TestClient, test_db: Session):
        """Test getting categories when no rules exist."""
        # Ensure no rules exist
        test_db.query(Rule).delete()
        test_db.commit()

        response = client.get("/rules/categories/list")

        assert response.status_code == 200
        categories = response.json()
        assert isinstance(categories, list)
        assert len(categories) == 0

    def test_import_rules_success(self, client: TestClient, test_db: Session):
        """Test importing rules successfully."""
        import_data = RuleImportData(
            rules=[
                RuleCreate(
                    title="暗视",
                    category=RuleCategory.CORE,
                    content="在黑暗环境中进行检定时，技能值减半。",
                    example="侦探在没有光源的地下室中进行侦查检定",
                    tags=["vision", "darkness"]
                ),
                RuleCreate(
                    title="推骰",
                    category=RuleCategory.CORE,
                    content="失败的检定可以重投，但会有后果。",
                ),
            ],
            faqs=[
                FAQCreate(
                    question="什么是推骰？",
                    answer="推骰允许玩家重投失败的检定，但KP会给予额外的负面后果。",
                    category="core"
                )
            ]
        )

        response = client.post("/rules/import", json=import_data.model_dump())

        assert response.status_code == 200
        data = response.json()
        assert data["imported"] == 3  # 2 rules + 1 FAQ
        assert data["failed"] == 0
        assert len(data["errors"]) == 0

        # Verify data was imported
        rules = test_db.query(Rule).all()
        assert len(rules) == 2
        faqs = test_db.query(RuleFAQ).all()
        assert len(faqs) == 1

    def test_import_rules_partial_failure(self, client: TestClient, test_db: Session):
        """Test importing rules with some failures."""
        import_data = {
            "rules": [
                {
                    "title": "Valid Rule",
                    "category": "core",
                    "content": "This is a valid rule.",
                },
                {
                    "title": "",  # Invalid: empty title
                    "category": "core",
                    "content": "This rule should fail.",
                },
            ],
            "faqs": []
        }

        response = client.post("/rules/import", json=import_data)

        # Should fail validation before reaching import logic
        assert response.status_code == 422

    def test_create_rule_success(self, client: TestClient, test_db: Session):
        """Test creating a single rule."""
        rule_data = RuleCreate(
            title="暗视",
            category=RuleCategory.CORE,
            content="在黑暗环境中进行检定时，技能值减半。",
            example="侦探在没有光源的地下室中进行侦查",
            mechanics={"penalty": "-50% skill"},
            aliases=["黑暗视觉"],
            tags=["vision", "darkness"]
        )

        response = client.post("/rules/", json=rule_data.model_dump())

        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "暗视"
        assert data["category"] == RuleCategory.CORE.value
        assert data["content"] == "在黑暗环境中进行检定时，技能值减半。"
        assert data["example"] == "侦探在没有光源的地下室中进行侦查"
        assert data["mechanics"]["penalty"] == "-50% skill"
        assert "黑暗视觉" in data["aliases"]
        assert "vision" in data["tags"]
        assert "id" in data

        # Verify in database
        rule = test_db.query(Rule).filter(Rule.title == "暗视").first()
        assert rule is not None

    def test_create_rule_invalid_data(self, client: TestClient):
        """Test creating a rule with invalid data."""
        rule_data = {
            "title": "",  # Empty title should fail validation
            "category": RuleCategory.CORE.value,
            "content": "Valid content"
        }

        response = client.post("/rules/", json=rule_data)

        assert response.status_code == 422  # Validation error

    def test_search_rules_related_rules(self, client: TestClient, test_db: Session):
        """Test that search results include related rules."""
        # Create related rules
        rule1 = Rule(
            title="闪击",
            category=RuleCategory.COMBAT.value,
            content="先攻检定成功可以获得额外行动。",
        )
        rule2 = Rule(
            title="先攻",
            category=RuleCategory.COMBAT.value,
            content="战斗开始时进行DEX检定决定行动顺序。",
        )
        test_db.add_all([rule1, rule2])
        test_db.commit()
        test_db.refresh(rule1)
        test_db.refresh(rule2)

        # Link rule2 as related to rule1
        rule1.related_rule_ids = [str(rule2.id)]
        test_db.commit()

        # Search should include related rules
        response = client.get("/rules/search?query=闪击&limit=10")

        assert response.status_code == 200
        data = response.json()
        assert len(data["results"]) > 0
        flash_rule = next((r for r in data["results"] if r["title"] == "闪击"), None)
        assert flash_rule is not None
        assert "related_rules" in flash_rule
