"""Test skills API endpoints.

Comprehensive tests for all skill API endpoints including:
- Listing skills with various filters
- Getting skills by ID and name (Chinese/English)
- AI reference endpoint
- Category listing
- CRUD operations (create, update, delete)
- Error handling (404, 400)
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.main import app
from src.core.database import get_db
from src.models.skill import Skill, SkillCategory


@pytest.fixture
def setup_skill_data(_db: Session):
    """Create test skill categories and skills in the database.

    Returns a dict with created test data references.
    """
    # Create skill categories
    categories = [
        SkillCategory(
            key="combat",
            name="\u6218\u6597\u6280\u80fd",
            name_en="Combat Skills",
            description="Combat and fighting related skills",
            sort_order=1,
        ),
        SkillCategory(
            key="social",
            name="\u793e\u4ea4\u6280\u80fd",
            name_en="Social Skills",
            description="Social interaction skills",
            sort_order=2,
        ),
        SkillCategory(
            key="knowledge",
            name="\u77e5\u8bc6\u6280\u80fd",
            name_en="Knowledge Skills",
            description="Academic and knowledge skills",
            sort_order=3,
        ),
    ]
    for cat in categories:
        _db.add(cat)
    _db.commit()

    # Create test skills
    skills = [
        Skill(
            id=1,
            name="\u4f1a\u8ba1\u5b66",
            name_en="Accounting",
            base_value=5,
            category="knowledge",
            available_modern=True,
            available_1920s=True,
            description="Ability to understand and manage financial records.",
            difficulty_levels="Regular: 5+, Hard: 10+, Extreme: 20+",
            push_examples="Rechecking the books with more time",
            push_failure_examples="Making errors in calculation under pressure",
            opposing_skills=None,
            has_specializations=False,
        ),
        Skill(
            id=2,
            name="\u683c\u6597",
            name_en="Fighting",
            base_value=25,
            category="combat",
            available_modern=True,
            available_1920s=True,
            description="Ability to fight in close combat.",
            difficulty_levels="Regular: 25+, Hard: 50+, Extreme: 100+",
            push_examples="Fighting with desperate fury",
            push_failure_examples="Leaving an opening for the opponent",
            opposing_skills="Dodge",
            has_specializations=True,
        ),
        Skill(
            id=3,
            name="\u683c\u6597\uff08\u624b\u67aa\uff09",
            name_en="Fighting (Brawl)",
            base_value=25,
            category="combat",
            available_modern=True,
            available_1920s=True,
            description="Unarmed combat and brawling.",
            has_specializations=False,
            parent_skill_id=2,
        ),
        Skill(
            id=4,
            name="\u8ba1\u7b97\u673a\u4f7f\u7528",
            name_en="Computer Use",
            base_value=5,
            category="technical",
            available_modern=True,
            available_1920s=False,
            description="Ability to use computers effectively.",
            has_specializations=False,
        ),
        Skill(
            id=5,
            name="\u8c08\u5224",
            name_en="Fast Talk",
            base_value=5,
            category="social",
            available_modern=True,
            available_1920s=True,
            description="Ability to convince someone quickly.",
            has_specializations=False,
        ),
        Skill(
            id=6,
            name="\u9a7e\u9a76\u6c7d\u8f66",
            name_en="Drive Auto",
            base_value=20,
            category="technical",
            available_modern=True,
            available_1920s=False,
            description="Ability to drive automobiles.",
            has_specializations=False,
        ),
        Skill(
            id=7,
            name="\u5c04\u51fb",
            name_en="Firearms",
            base_value=25,
            category="combat",
            available_modern=True,
            available_1920s=True,
            description="Ability to use firearms effectively.",
            has_specializations=True,
        ),
        Skill(
            id=8,
            name="\u5c04\u51fb\uff08\u624b\u67aa\uff09",
            name_en="Firearms (Handgun)",
            base_value=25,
            category="combat",
            available_modern=True,
            available_1920s=True,
            description="Handgun and pistol proficiency.",
            has_specializations=False,
            parent_skill_id=7,
        ),
    ]
    for skill in skills:
        _db.add(skill)
    _db.commit()

    # Refresh to ensure relationships are loaded
    for skill in skills:
        _db.refresh(skill)

    return {
        "categories": categories,
        "skills": skills,
    }


class TestListSkills:
    """Test skill listing endpoint."""

    def test_list_skills_basic(self, client, setup_skill_data):
        """Should list all skills with default parameters."""
        response = client.get("/api/skills")
        assert response.status_code == 200

        data = response.json()
        assert "skills" in data
        assert "total" in data
        assert isinstance(data["skills"], list)
        assert data["total"] == len(data["skills"])
        # Should only return base skills (no specializations) by default
        for skill in data["skills"]:
            assert skill["parent_skill_id"] is None

    def test_list_skills_with_era_filter_modern(self, client, setup_skill_data):
        """Should filter skills by modern era availability."""
        response = client.get("/api/skills?era=modern")
        assert response.status_code == 200

        data = response.json()
        assert data["total"] > 0
        for skill in data["skills"]:
            assert skill["available_modern"] is True

    def test_list_skills_with_era_filter_1920s(self, client, setup_skill_data):
        """Should filter skills by 1920s era availability."""
        response = client.get("/api/skills?era=1920s")
        assert response.status_code == 200

        data = response.json()
        assert data["total"] > 0
        # Computer Use should not appear in 1920s
        skill_names = [s["name_en"] for s in data["skills"]]
        assert "Computer Use" not in skill_names

    def test_list_skills_with_category_filter(self, client, setup_skill_data):
        """Should filter skills by category."""
        response = client.get("/api/skills?category=combat")
        assert response.status_code == 200

        data = response.json()
        assert data["total"] > 0
        for skill in data["skills"]:
            assert skill["category"] == "combat"

    def test_list_skills_with_category_filter_social(self, client, setup_skill_data):
        """Should filter skills by social category."""
        response = client.get("/api/skills?category=social")
        assert response.status_code == 200

        data = response.json()
        assert data["total"] >= 1
        for skill in data["skills"]:
            assert skill["category"] == "social"

    def test_list_skills_search_chinese_name(self, client, setup_skill_data):
        """Should search skills by Chinese name."""
        response = client.get("/api/skills?search=\u4f1a\u8ba1")
        assert response.status_code == 200

        data = response.json()
        assert data["total"] >= 1
        # Should find Accounting skill
        found = any("\u4f1a\u8ba1" in s["name"] for s in data["skills"])
        assert found

    def test_list_skills_search_english_name(self, client, setup_skill_data):
        """Should search skills by English name."""
        response = client.get("/api/skills?search=Account")
        assert response.status_code == 200

        data = response.json()
        assert data["total"] >= 1
        found = any("Account" in s["name_en"] for s in data["skills"])
        assert found

    def test_list_skills_search_partial_match(self, client, setup_skill_data):
        """Should find skills with partial name match."""
        response = client.get("/api/skills?search=Fight")
        assert response.status_code == 200

        data = response.json()
        assert data["total"] >= 1
        found = any("Fight" in s["name_en"] for s in data["skills"])
        assert found

    def test_list_skills_include_specializations(self, client, setup_skill_data):
        """Should include specialization skills when flag is set."""
        # Without specializations
        response_base = client.get("/api/skills?include_specializations=false")
        base_data = response_base.json()

        # With specializations
        response_all = client.get("/api/skills?include_specializations=true")
        all_data = response_all.json()

        # Should have more skills when including specializations
        assert all_data["total"] > base_data["total"]

        # Should include skills with parent_skill_id
        has_specializations = any(
            s["parent_skill_id"] is not None for s in all_data["skills"]
        )
        assert has_specializations

    def test_list_skills_combined_filters(self, client, setup_skill_data):
        """Should combine multiple filters correctly."""
        response = client.get("/api/skills?era=modern&category=combat")
        assert response.status_code == 200

        data = response.json()
        for skill in data["skills"]:
            assert skill["available_modern"] is True
            assert skill["category"] == "combat"

    def test_list_skills_empty_result(self, client, setup_skill_data):
        """Should return empty list when no skills match."""
        response = client.get("/api/skills?category=nonexistent")
        assert response.status_code == 200

        data = response.json()
        assert data["total"] == 0
        assert data["skills"] == []


class TestGetSkillById:
    """Test get skill by ID endpoint."""

    def test_get_skill_by_id_success(self, client, setup_skill_data):
        """Should return skill by ID."""
        response = client.get("/api/skills/1")
        assert response.status_code == 200

        data = response.json()
        assert data["id"] == 1
        assert data["name_en"] == "Accounting"
        assert data["name"] == "\u4f1a\u8ba1\u5b66"
        assert data["base_value"] == 5
        assert data["category"] == "knowledge"

    def test_get_skill_by_id_with_specializations(self, client, setup_skill_data):
        """Should include specializations when skill has them."""
        response = client.get("/api/skills/2")
        assert response.status_code == 200

        data = response.json()
        assert data["id"] == 2
        assert data["has_specializations"] is True
        assert "specializations" in data
        assert len(data["specializations"]) > 0

    def test_get_skill_by_id_not_found(self, client, setup_skill_data):
        """Should return 404 for non-existent skill ID."""
        response = client.get("/api/skills/99999")
        assert response.status_code == 404
        assert response.json()["detail"] == "Skill not found"


class TestGetSkillByName:
    """Test get skill by name endpoint."""

    def test_get_skill_by_name_english(self, client, setup_skill_data):
        """Should find skill by English name."""
        response = client.get("/api/skills/name/Accounting")
        assert response.status_code == 200

        data = response.json()
        assert data["name_en"] == "Accounting"
        assert data["name"] == "\u4f1a\u8ba1\u5b66"

    def test_get_skill_by_name_chinese(self, client, setup_skill_data):
        """Should find skill by Chinese name."""
        response = client.get("/api/skills/name/\u4f1a\u8ba1\u5b66")
        assert response.status_code == 200

        data = response.json()
        assert data["name_en"] == "Accounting"
        assert data["name"] == "\u4f1a\u8ba1\u5b66"

    def test_get_skill_by_name_case_sensitive(self, client, setup_skill_data):
        """Should require exact case match for name lookup.

        Note: The name lookup endpoint uses exact matching (not ilike).
        For case-insensitive search, use the search query parameter instead.
        """
        # Exact match should work
        response = client.get("/api/skills/name/Accounting")
        assert response.status_code == 200
        data = response.json()
        assert data["name_en"] == "Accounting"

        # Wrong case should not find the skill
        response_lower = client.get("/api/skills/name/accounting")
        assert response_lower.status_code == 404

    def test_get_skill_by_name_with_specializations(self, client, setup_skill_data):
        """Should include specializations in response."""
        response = client.get("/api/skills/name/Fighting")
        assert response.status_code == 200

        data = response.json()
        assert data["has_specializations"] is True
        assert len(data["specializations"]) > 0
        # Check specialization structure
        spec = data["specializations"][0]
        assert "id" in spec
        assert "name" in spec
        assert "name_en" in spec
        assert "base_value" in spec

    def test_get_skill_by_name_not_found(self, client, setup_skill_data):
        """Should return 404 for non-existent skill name."""
        response = client.get("/api/skills/name/NonexistentSkill")
        assert response.status_code == 404
        assert response.json()["detail"] == "Skill not found"

    def test_get_skill_by_name_firearms(self, client, setup_skill_data):
        """Should find Firearms skill by English name."""
        response = client.get("/api/skills/name/Firearms")
        assert response.status_code == 200

        data = response.json()
        assert data["name_en"] == "Firearms"
        assert data["category"] == "combat"


class TestGetSkillForAI:
    """Test AI reference endpoint."""

    def test_get_skill_ai_reference_success(self, client, setup_skill_data):
        """Should return detailed skill info for AI reference."""
        response = client.get("/api/skills/ai-reference/Accounting")
        assert response.status_code == 200

        data = response.json()
        assert data["name_en"] == "Accounting"
        assert data["name"] == "\u4f1a\u8ba1\u5b66"
        assert data["base_value"] == 5
        assert data["category"] == "knowledge"
        assert "description" in data
        assert data["description"] is not None
        assert "difficulty_levels" in data
        assert "push_examples" in data
        assert "push_failure_examples" in data

    def test_get_skill_ai_reference_chinese_name(self, client, setup_skill_data):
        """Should find skill by Chinese name for AI reference."""
        response = client.get("/api/skills/ai-reference/\u8c08\u5224")
        assert response.status_code == 200

        data = response.json()
        assert data["name_en"] == "Fast Talk"
        assert data["category"] == "social"

    def test_get_skill_ai_reference_with_specializations(self, client, setup_skill_data):
        """Should include specialization names for AI reference."""
        response = client.get("/api/skills/ai-reference/Fighting")
        assert response.status_code == 200

        data = response.json()
        assert "specializations" in data
        assert isinstance(data["specializations"], list)
        # Specializations should be string names, not objects
        for spec in data["specializations"]:
            assert isinstance(spec, str)

    def test_get_skill_ai_reference_not_found(self, client, setup_skill_data):
        """Should return 404 for non-existent skill in AI reference."""
        response = client.get("/api/skills/ai-reference/UnknownSkill")
        assert response.status_code == 404
        assert response.json()["detail"] == "Skill not found"

    def test_get_skill_ai_reference_response_structure(self, client, setup_skill_data):
        """Should match SkillForAI schema structure."""
        response = client.get("/api/skills/ai-reference/Firearms")
        assert response.status_code == 200

        data = response.json()
        required_fields = [
            "id",
            "name",
            "name_en",
            "base_value",
            "category",
            "description",
            "difficulty_levels",
            "push_examples",
            "push_failure_examples",
            "opposing_skills",
            "specializations",
        ]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"


class TestListCategories:
    """Test category listing endpoint."""

    def test_list_categories_success(self, client, setup_skill_data):
        """Should list all skill categories."""
        response = client.get("/api/skills/categories")
        assert response.status_code == 200

        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3

    def test_list_categories_structure(self, client, setup_skill_data):
        """Should return categories with correct structure."""
        response = client.get("/api/skills/categories")
        assert response.status_code == 200

        data = response.json()
        for cat in data:
            assert "id" in cat
            assert "key" in cat
            assert "name" in cat
            assert "name_en" in cat

    def test_list_categories_sorted_by_order(self, client, setup_skill_data):
        """Should return categories sorted by sort_order."""
        response = client.get("/api/skills/categories")
        assert response.status_code == 200

        data = response.json()
        if len(data) > 1:
            # First category should be combat (sort_order=1)
            assert data[0]["key"] == "combat"

    def test_list_categories_includes_descriptions(self, client, setup_skill_data):
        """Should include category descriptions."""
        response = client.get("/api/skills/categories")
        assert response.status_code == 200

        data = response.json()
        combat_cat = next((c for c in data if c["key"] == "combat"), None)
        assert combat_cat is not None
        assert "description" in combat_cat


class TestCreateSkill:
    """Test skill creation endpoint."""

    def test_create_skill_success(self, client, setup_skill_data):
        """Should create a new skill successfully."""
        new_skill = {
            "name": "\u6d4b\u8bd5\u6280\u80fd",
            "name_en": "Test Skill",
            "base_value": 10,
            "category": "knowledge",
            "available_modern": True,
            "available_1920s": True,
            "description": "A test skill for unit testing",
            "has_specializations": False,
        }
        response = client.post("/api/skills", json=new_skill)
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "\u6d4b\u8bd5\u6280\u80fd"
        assert data["name_en"] == "Test Skill"
        assert data["base_value"] == 10
        assert data["category"] == "knowledge"
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data

    def test_create_skill_with_all_fields(self, client, setup_skill_data):
        """Should create skill with all optional fields."""
        new_skill = {
            "name": "\u5b8c\u6574\u6280\u80fd",
            "name_en": "Complete Skill",
            "base_value": 15,
            "category": "social",
            "available_modern": True,
            "available_1920s": False,
            "description": "A complete skill with all fields",
            "difficulty_levels": "Regular: 15+, Hard: 30+",
            "push_examples": "Push example text",
            "push_failure_examples": "Failure example text",
            "opposing_skills": "None",
            "has_specializations": False,
        }
        response = client.post("/api/skills", json=new_skill)
        assert response.status_code == 200

        data = response.json()
        assert data["difficulty_levels"] == "Regular: 15+, Hard: 30+"
        assert data["push_examples"] == "Push example text"

    def test_create_skill_duplicate_name(self, client, setup_skill_data):
        """Should fail when creating skill with duplicate name."""
        duplicate_skill = {
            "name": "\u4f1a\u8ba1\u5b66",  # Already exists
            "name_en": "Different English Name",
            "base_value": 10,
            "category": "knowledge",
        }
        response = client.post("/api/skills", json=duplicate_skill)
        assert response.status_code == 400
        assert "already exists" in response.json()["detail"].lower()

    def test_create_skill_with_parent(self, client, setup_skill_data):
        """Should create skill specialization with parent reference."""
        new_skill = {
            "name": "\u683c\u6597\uff08\u5251\uff09",
            "name_en": "Fighting (Sword)",
            "base_value": 25,
            "category": "combat",
            "parent_skill_id": 2,  # Fighting skill
            "has_specializations": False,
        }
        response = client.post("/api/skills", json=new_skill)
        assert response.status_code == 200

        data = response.json()
        assert data["parent_skill_id"] == 2

    def test_create_skill_minimal(self, client, setup_skill_data):
        """Should create skill with only required fields."""
        minimal_skill = {
            "name": "\u6700\u5c0f\u6280\u80fd",
            "name_en": "Minimal Skill",
            "base_value": 5,
            "category": "knowledge",
        }
        response = client.post("/api/skills", json=minimal_skill)
        assert response.status_code == 200

        data = response.json()
        assert data["available_modern"] is True  # Default value
        assert data["available_1920s"] is True  # Default value
        assert data["has_specializations"] is False  # Default value


class TestUpdateSkill:
    """Test skill update endpoint."""

    def test_update_skill_success(self, client, setup_skill_data):
        """Should update skill successfully."""
        update_data = {
            "name": "\u4f1a\u8ba1\u5b66\u66f4\u65b0",
            "name_en": "Accounting Updated",
            "base_value": 10,
        }
        response = client.put("/api/skills/1", json=update_data)
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "\u4f1a\u8ba1\u5b66\u66f4\u65b0"
        assert data["name_en"] == "Accounting Updated"
        assert data["base_value"] == 10

    def test_update_skill_partial(self, client, setup_skill_data):
        """Should allow partial updates."""
        update_data = {
            "base_value": 15,
        }
        response = client.put("/api/skills/1", json=update_data)
        assert response.status_code == 200

        data = response.json()
        assert data["base_value"] == 15
        # Other fields should remain unchanged
        assert data["name"] == "\u4f1a\u8ba1\u5b66"
        assert data["name_en"] == "Accounting"

    def test_update_skill_category(self, client, setup_skill_data):
        """Should update skill category."""
        update_data = {
            "category": "technical",
        }
        response = client.put("/api/skills/5", json=update_data)
        assert response.status_code == 200

        data = response.json()
        assert data["category"] == "technical"

    def test_update_skill_era_availability(self, client, setup_skill_data):
        """Should update era availability flags."""
        update_data = {
            "available_modern": False,
            "available_1920s": True,
        }
        response = client.put("/api/skills/1", json=update_data)
        assert response.status_code == 200

        data = response.json()
        assert data["available_modern"] is False
        assert data["available_1920s"] is True

    def test_update_skill_not_found(self, client, setup_skill_data):
        """Should return 404 when updating non-existent skill."""
        update_data = {"base_value": 20}
        response = client.put("/api/skills/99999", json=update_data)
        assert response.status_code == 404
        assert response.json()["detail"] == "Skill not found"

    def test_update_skill_description_fields(self, client, setup_skill_data):
        """Should update AI-related description fields."""
        update_data = {
            "description": "Updated description",
            "difficulty_levels": "Updated difficulty",
            "push_examples": "Updated push examples",
            "push_failure_examples": "Updated failure examples",
        }
        response = client.put("/api/skills/1", json=update_data)
        assert response.status_code == 200

        data = response.json()
        assert data["description"] == "Updated description"
        assert data["difficulty_levels"] == "Updated difficulty"


class TestDeleteSkill:
    """Test skill deletion endpoint."""

    def test_delete_skill_success(self, client, setup_skill_data):
        """Should delete skill successfully."""
        # First verify skill exists
        get_response = client.get("/api/skills/5")
        assert get_response.status_code == 200

        # Delete the skill
        delete_response = client.delete("/api/skills/5")
        assert delete_response.status_code == 200
        assert "message" in delete_response.json()

        # Verify skill is deleted
        verify_response = client.get("/api/skills/5")
        assert verify_response.status_code == 404

    def test_delete_skill_not_found(self, client, setup_skill_data):
        """Should return 404 when deleting non-existent skill."""
        response = client.delete("/api/skills/99999")
        assert response.status_code == 404
        assert response.json()["detail"] == "Skill not found"

    def test_delete_skill_response_message(self, client, setup_skill_data):
        """Should return success message after deletion."""
        response = client.delete("/api/skills/6")
        assert response.status_code == 200

        data = response.json()
        assert "message" in data
        assert "deleted" in data["message"].lower()


class TestSkillResponseSchema:
    """Test that responses match the expected schema."""

    def test_skill_response_fields(self, client, setup_skill_data):
        """Should include all required fields in skill response."""
        response = client.get("/api/skills/1")
        assert response.status_code == 200

        data = response.json()
        required_fields = [
            "id",
            "name",
            "name_en",
            "base_value",
            "category",
            "available_modern",
            "available_1920s",
            "has_specializations",
            "specializations",
            "created_at",
            "updated_at",
        ]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"

    def test_skill_list_response_fields(self, client, setup_skill_data):
        """Should include skills array and total in list response."""
        response = client.get("/api/skills")
        assert response.status_code == 200

        data = response.json()
        assert "skills" in data
        assert "total" in data
        assert isinstance(data["skills"], list)
        assert isinstance(data["total"], int)

    def test_specialization_structure(self, client, setup_skill_data):
        """Should have correct specialization object structure."""
        response = client.get("/api/skills/2")
        assert response.status_code == 200

        data = response.json()
        if data["has_specializations"] and len(data["specializations"]) > 0:
            spec = data["specializations"][0]
            assert "id" in spec
            assert "name" in spec
            assert "name_en" in spec
            assert "base_value" in spec


class TestSearchSkills:
    """Test skill search functionality."""

    def test_search_exact_match(self, client, setup_skill_data):
        """Should find skill with exact name match."""
        response = client.get("/api/skills?search=Accounting")
        assert response.status_code == 200

        data = response.json()
        assert any(s["name_en"] == "Accounting" for s in data["skills"])

    def test_search_partial_match_beginning(self, client, setup_skill_data):
        """Should find skill with partial match at beginning."""
        response = client.get("/api/skills?search=Acc")
        assert response.status_code == 200

        data = response.json()
        assert any("Acc" in s["name_en"] for s in data["skills"])

    def test_search_partial_match_middle(self, client, setup_skill_data):
        """Should find skill with partial match in middle."""
        response = client.get("/api/skills?search=count")
        assert response.status_code == 200

        data = response.json()
        assert any("count" in s["name_en"].lower() for s in data["skills"])

    def test_search_case_insensitive(self, client, setup_skill_data):
        """Should be case insensitive in search."""
        response = client.get("/api/skills?search=ACCOUNTING")
        assert response.status_code == 200

        data = response.json()
        assert any(s["name_en"] == "Accounting" for s in data["skills"])

    def test_search_chinese_characters(self, client, setup_skill_data):
        """Should search Chinese characters."""
        response = client.get("/api/skills?search=\u683c\u6597")
        assert response.status_code == 200

        data = response.json()
        assert data["total"] >= 1
        assert any("\u683c\u6597" in s["name"] for s in data["skills"])

    def test_search_no_results(self, client, setup_skill_data):
        """Should return empty list for no matches."""
        response = client.get("/api/skills?search=zzzzzzznotfound")
        assert response.status_code == 200

        data = response.json()
        assert data["total"] == 0
        assert data["skills"] == []


class TestIncludeSpecializations:
    """Test include_specializations parameter."""

    def test_exclude_specializations_default(self, client, setup_skill_data):
        """Should exclude specializations by default."""
        response = client.get("/api/skills")
        assert response.status_code == 200

        data = response.json()
        for skill in data["skills"]:
            assert skill["parent_skill_id"] is None

    def test_include_specializations_true(self, client, setup_skill_data):
        """Should include specializations when flag is true."""
        response = client.get("/api/skills?include_specializations=true")
        assert response.status_code == 200

        data = response.json()
        has_specializations = any(
            s["parent_skill_id"] is not None for s in data["skills"]
        )
        assert has_specializations

    def test_include_specializations_false(self, client, setup_skill_data):
        """Should exclude specializations when flag is false."""
        response = client.get("/api/skills?include_specializations=false")
        assert response.status_code == 200

        data = response.json()
        for skill in data["skills"]:
            assert skill["parent_skill_id"] is None

    def test_specializations_count(self, client, setup_skill_data):
        """Should have more total skills when including specializations."""
        base_response = client.get("/api/skills?include_specializations=false")
        all_response = client.get("/api/skills?include_specializations=true")

        base_count = base_response.json()["total"]
        all_count = all_response.json()["total"]

        assert all_count > base_count


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_invalid_era_value(self, client, setup_skill_data):
        """Should handle invalid era filter gracefully."""
        # Invalid era should be ignored (no filtering applied for era)
        response = client.get("/api/skills?era=invalid")
        assert response.status_code == 200

    def test_empty_search_string(self, client, setup_skill_data):
        """Should return all skills for empty search."""
        response = client.get("/api/skills?search=")
        assert response.status_code == 200

        data = response.json()
        assert data["total"] > 0

    def test_skill_with_null_optional_fields(self, client, setup_skill_data):
        """Should handle skills with null optional fields."""
        response = client.get("/api/skills/3")  # Brawl specialization
        assert response.status_code == 200

        data = response.json()
        # Optional fields may be None
        assert data["description"] is None or isinstance(data["description"], str)

    def test_multiple_filters_interaction(self, client, setup_skill_data):
        """Should correctly apply multiple filters together."""
        response = client.get(
            "/api/skills?era=1920s&category=combat&search=Fire"
        )
        assert response.status_code == 200

        data = response.json()
        for skill in data["skills"]:
            assert skill["available_1920s"] is True
            assert skill["category"] == "combat"
            assert "Fire" in skill["name_en"] or "Fire" in skill["name"]
