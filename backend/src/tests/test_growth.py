"""Tests for character growth system."""

import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime

from src.schemas.growth import (
    GrowthCheckRequest,
    GrowthCheckResult,
    GrowthHistoryRequest,
    MarkSkillRequest,
    GrowthPreviewRequest,
)
from src.services.growth import GrowthService, SkillExperienceRecord, GrowthRecordModel


class TestGrowthService:
    """Test growth service functionality."""

    @pytest.fixture
    def service(self):
        """Create growth service instance."""
        mock_db = MagicMock()
        return GrowthService(mock_db)

    @pytest.fixture
    def mock_experience_record(self):
        """Create a mock experience record."""
        record = MagicMock(spec=SkillExperienceRecord)
        record.id = 1
        record.character_id = 1
        record.skill_name = "Spot Hidden"
        record.times_used = 3
        record.last_used_at = datetime.utcnow()
        record.is_marked_for_growth = True
        return record

    @pytest.fixture
    def mock_growth_record(self):
        """Create a mock growth record."""
        record = MagicMock(spec=GrowthRecordModel)
        record.id = 1
        record.character_id = 1
        record.skill_name = "Spot Hidden"
        record.previous_value = 50
        record.new_value = 58
        record.improvement = 8
        record.check_roll = 30
        record.check_result = "success"
        record.session_id = None
        record.created_at = datetime.utcnow()
        return record

    def test_mark_skill_used_new_record(self, service):
        """Test marking a skill used for the first time."""
        service.db.query.return_value.filter.return_value.first.return_value = None
        service.db.add = MagicMock()
        service.db.commit = MagicMock()
        service.db.refresh = MagicMock()

        result = service.mark_skill_used(1, "Spot Hidden", True)

        assert result is not None
        service.db.add.assert_called_once()

    def test_mark_skill_used_existing_record(self, service, mock_experience_record):
        """Test marking an already-tracked skill."""
        service.db.query.return_value.filter.return_value.first.return_value = (
            mock_experience_record
        )
        service.db.commit = MagicMock()
        service.db.refresh = MagicMock()

        result = service.mark_skill_used(1, "Spot Hidden", True)

        assert result.times_used == 4
        assert result.is_marked_for_growth == True

    def test_mark_skill_used_unsuccessful(self, service, mock_experience_record):
        """Test marking an unsuccessful skill use doesn't mark for growth."""
        service.db.query.return_value.filter.return_value.first.return_value = (
            mock_experience_record
        )
        service.db.commit = MagicMock()
        service.db.refresh = MagicMock()

        result = service.mark_skill_used(1, "Spot Hidden", False)

        assert result.times_used == 4
        assert result.is_marked_for_growth == True

    def test_perform_growth_check_success(self, service):
        """Test growth check with success."""
        request = GrowthCheckRequest(character_id=1, skill_name="Spot Hidden")

        with patch("src.services.growth.roll_d100", return_value=40):
            with patch("src.services.growth.randint", return_value=8):
                service.db.add = MagicMock()
                service.db.commit = MagicMock()

                response = service.perform_growth_check(request, 50)

                assert response.result == GrowthCheckResult.SUCCESS
                assert response.improvement == 8
                assert response.new_value == 58

    def test_perform_growth_check_critical_success(self, service):
        """Test growth check with critical success."""
        request = GrowthCheckRequest(character_id=1, skill_name="Spot Hidden")

        with patch("src.services.growth.roll_d100", return_value=5):
            with patch("src.services.growth.randint", side_effect=[6, 7]):
                service.db.add = MagicMock()
                service.db.commit = MagicMock()

                response = service.perform_growth_check(request, 50)

                assert response.result == GrowthCheckResult.CRITICAL_SUCCESS
                assert response.improvement == 13
                assert response.new_value == 63

    def test_perform_growth_check_failure(self, service):
        """Test growth check with failure."""
        request = GrowthCheckRequest(character_id=1, skill_name="Spot Hidden")

        with patch("src.services.growth.roll_d100", return_value=80):
            service.db.add = MagicMock()
            service.db.commit = MagicMock()

            response = service.perform_growth_check(request, 50)

            assert response.result == GrowthCheckResult.FAILURE
            assert response.improvement == 0
            assert response.new_value == 50

    def test_perform_growth_check_forced_roll(self, service):
        """Test growth check with forced roll value."""
        request = GrowthCheckRequest(character_id=1, skill_name="Spot Hidden", force_roll=25)

        with patch("src.services.growth.randint", return_value=5):
            service.db.add = MagicMock()
            service.db.commit = MagicMock()

            response = service.perform_growth_check(request, 50)

            assert response.roll == 25
            assert response.result == GrowthCheckResult.SUCCESS

    def test_get_marked_skills(self, service, mock_experience_record):
        """Test getting skills marked for growth."""
        service.db.query.return_value.filter.return_value.all.return_value = [
            mock_experience_record
        ]

        skills = service.get_marked_skills(1)

        assert len(skills) == 1
        assert skills[0].skill_name == "Spot Hidden"
        assert skills[0].is_marked_for_growth == True

    def test_get_marked_skills_empty(self, service):
        """Test getting marked skills when none exist."""
        service.db.query.return_value.filter.return_value.all.return_value = []

        skills = service.get_marked_skills(1)

        assert len(skills) == 0

    def test_get_skill_experience(self, service, mock_experience_record):
        """Test getting experience for a specific skill."""
        service.db.query.return_value.filter.return_value.first.return_value = (
            mock_experience_record
        )

        exp = service.get_skill_experience(1, "Spot Hidden")

        assert exp is not None
        assert exp.skill_name == "Spot Hidden"
        assert exp.times_used == 3

    def test_get_skill_experience_not_found(self, service):
        """Test getting experience for non-existent skill."""
        service.db.query.return_value.filter.return_value.first.return_value = None

        exp = service.get_skill_experience(1, "NonExistent")

        assert exp is None

    def test_get_all_skill_experience(self, service, mock_experience_record):
        """Test getting all skill experience for a character."""
        service.db.query.return_value.filter.return_value.all.return_value = [
            mock_experience_record
        ]

        response = service.get_all_skill_experience(1)

        assert response.character_id == 1
        assert len(response.skills) == 1
        assert response.marked_count == 1
        assert response.can_perform_growth == True

    def test_get_all_skill_experience_no_marks(self, service, mock_experience_record):
        """Test getting skill experience when nothing is marked."""
        mock_experience_record.is_marked_for_growth = False
        service.db.query.return_value.filter.return_value.all.return_value = [
            mock_experience_record
        ]

        response = service.get_all_skill_experience(1)

        assert response.marked_count == 0
        assert response.can_perform_growth == False

    def test_get_growth_history(self, service, mock_growth_record):
        """Test getting growth history."""
        service.db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [
            mock_growth_record
        ]
        service.db.query.return_value.filter.return_value.count.return_value = 1

        request = GrowthHistoryRequest(character_id=1, limit=10)
        response = service.get_growth_history(request)

        assert response.character_id == 1
        assert response.total_improvements == 1
        assert len(response.records) == 1
        assert response.records[0].skill_name == "Spot Hidden"
        assert response.records[0].improvement == 8

    def test_preview_growth(self, service):
        """Test growth preview."""
        request = GrowthPreviewRequest(character_id=1, skill_name="Spot Hidden")

        response = service.preview_growth(request, 50)

        assert response.skill_name == "Spot Hidden"
        assert response.current_value == 50
        assert response.min_improvement == 1
        assert response.max_improvement == 20
        assert response.chance_of_success == 0.5

    def test_preview_growth_high_skill(self, service):
        """Test growth preview with high skill value."""
        request = GrowthPreviewRequest(character_id=1, skill_name="Spot Hidden")

        response = service.preview_growth(request, 90)

        assert response.chance_of_success == 0.9

    def test_preview_growth_low_skill(self, service):
        """Test growth preview with low skill value."""
        request = GrowthPreviewRequest(character_id=1, skill_name="Spot Hidden")

        response = service.preview_growth(request, 10)

        assert response.chance_of_success == 0.1

    def test_clear_all_marks(self, service):
        """Test clearing all growth marks."""
        service.db.query.return_value.filter.return_value.update.return_value = 5
        service.db.commit = MagicMock()

        cleared = service.clear_all_marks(1)

        assert cleared == 5

    def test_clear_all_marks_none(self, service):
        """Test clearing marks when none exist."""
        service.db.query.return_value.filter.return_value.update.return_value = 0
        service.db.commit = MagicMock()

        cleared = service.clear_all_marks(1)

        assert cleared == 0

    def test_growth_check_thresholds(self, service):
        """Test that growth check respects skill thresholds."""
        request = GrowthCheckRequest(character_id=1, skill_name="Spot Hidden")

        with patch("src.services.growth.roll_d100", return_value=10):
            with patch("src.services.growth.randint", side_effect=[5, 5]):
                service.db.add = MagicMock()
                service.db.commit = MagicMock()

                response = service.perform_growth_check(request, 50)

                assert response.result == GrowthCheckResult.CRITICAL_SUCCESS

    def test_growth_check_low_skill_critical_threshold(self, service):
        """Test critical success threshold for very low skills."""
        request = GrowthCheckRequest(character_id=1, skill_name="Spot Hidden")

        with patch("src.services.growth.roll_d100", return_value=1):
            with patch("src.services.growth.randint", side_effect=[5, 5]):
                service.db.add = MagicMock()
                service.db.commit = MagicMock()

                response = service.perform_growth_check(request, 5)

                assert response.result == GrowthCheckResult.CRITICAL_SUCCESS
