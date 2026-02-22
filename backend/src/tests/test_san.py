"""Tests for SAN (Sanity) system."""

import pytest
from unittest.mock import MagicMock

from src.schemas.san import (
    MadnessType,
    PREDEFINED_SAN_THRESHOLDS,
    SANCategory,
    SANCheckRequest,
    SANLossDefinition,
    SANRecoverRequest,
    SANThreshold,
    SuccessLevel,
    TriggerType,
    SANTriggerInfo,
)
from src.services.san import SANService


class TestSANService:
    """Test SAN service functionality."""

    @pytest.fixture
    def service(self):
        """Create SAN service instance."""
        mock_db = MagicMock()
        return SANService(mock_db)

    def test_calculate_san_cap(self, service):
        """Test SAN cap calculation based on Cthulhu Mythos."""
        assert service.calculate_san_cap(0) == 99
        assert service.calculate_san_cap(10) == 89
        assert service.calculate_san_cap(50) == 49
        assert service.calculate_san_cap(99) == 0
        assert service.calculate_san_cap(100) == 0

    def test_roll_san_loss(self, service):
        """Test SAN loss rolling."""
        for _ in range(100):
            loss = service.roll_san_loss(1, 6)
            assert 1 <= loss <= 6

        loss = service.roll_san_loss(5, 5)
        assert loss == 5

    def test_calculate_san_loss_critical(self, service):
        """Test SAN loss calculation for critical success."""
        loss_def = SANLossDefinition(
            success_min=0,
            success_max=1,
            failure_min=1,
            failure_max=6,
            critical_loss=0,
        )
        assert service.calculate_san_loss(loss_def, SuccessLevel.CRITICAL) == 0

    def test_calculate_san_loss_success(self, service):
        """Test SAN loss calculation for success."""
        loss_def = SANLossDefinition(
            success_min=0,
            success_max=1,
            failure_min=1,
            failure_max=6,
            critical_loss=0,
        )
        for _ in range(100):
            loss = service.calculate_san_loss(loss_def, SuccessLevel.REGULAR)
            assert 0 <= loss <= 1

    def test_calculate_san_loss_failure(self, service):
        """Test SAN loss calculation for failure."""
        loss_def = SANLossDefinition(
            success_min=0,
            success_max=1,
            failure_min=1,
            failure_max=6,
            critical_loss=0,
        )
        for _ in range(100):
            loss = service.calculate_san_loss(loss_def, SuccessLevel.FAILURE)
            assert 1 <= loss <= 6

    def test_calculate_san_loss_fumble(self, service):
        """Test SAN loss calculation for fumble."""
        loss_def = SANLossDefinition(
            success_min=0,
            success_max=1,
            failure_min=1,
            failure_max=6,
            critical_loss=0,
            fumble_loss=10,
        )
        assert service.calculate_san_loss(loss_def, SuccessLevel.FUMBLE) == 10

    def test_calculate_san_loss_fumble_default(self, service):
        """Test fumble uses max failure if no fumble_loss defined."""
        loss_def = SANLossDefinition(
            success_min=0,
            success_max=1,
            failure_min=1,
            failure_max=6,
            critical_loss=0,
        )
        assert service.calculate_san_loss(loss_def, SuccessLevel.FUMBLE) == 6

    def test_determine_success_level_critical(self, service):
        """Test critical success (roll of 1)."""
        assert service.determine_success_level(1, 50) == SuccessLevel.CRITICAL

    def test_determine_success_level_fumble(self, service):
        """Test fumble (roll of 100)."""
        assert service.determine_success_level(100, 50) == SuccessLevel.FUMBLE

    def test_determine_success_level_extreme(self, service):
        """Test extreme success."""
        assert service.determine_success_level(10, 50) == SuccessLevel.EXTREME
        assert service.determine_success_level(9, 50) == SuccessLevel.EXTREME

    def test_determine_success_level_hard(self, service):
        """Test hard success."""
        assert service.determine_success_level(25, 50) == SuccessLevel.HARD
        assert service.determine_success_level(20, 50) == SuccessLevel.HARD

    def test_determine_success_level_regular(self, service):
        """Test regular success."""
        assert service.determine_success_level(50, 50) == SuccessLevel.REGULAR
        assert service.determine_success_level(30, 50) == SuccessLevel.REGULAR

    def test_determine_success_level_failure(self, service):
        """Test failure."""
        assert service.determine_success_level(51, 50) == SuccessLevel.FAILURE
        assert service.determine_success_level(99, 50) == SuccessLevel.FAILURE

    def test_check_madness_trigger_zero_san(self, service):
        """Test indefinite madness when SAN reaches 0."""
        result = service.check_madness_trigger(0, 5, 5)
        assert result is not None
        is_indefinite, madness_type = result
        assert is_indefinite is True
        assert madness_type in [
            MadnessType.INDEFINITE_AMNESIA,
            MadnessType.INDEFINITE_DELUSION,
            MadnessType.INDEFINITE_HALLUCINATION,
            MadnessType.INDEFINITE_PARANOIA,
            MadnessType.INDEFINITE_PHOBIA,
            MadnessType.INDEFINITE_MANIA,
            MadnessType.INDEFINITE_SCHIZOPHRENIA,
        ]

    def test_check_madness_trigger_temporary(self, service):
        """Test temporary madness when losing 5+ SAN."""
        result = service.check_madness_trigger(45, 5, 50)
        assert result is not None
        is_indefinite, madness_type = result
        assert is_indefinite is False
        assert madness_type in [
            MadnessType.TEMPORARY_FAINT,
            MadnessType.TEMPORARY_PANIC,
            MadnessType.TEMPORARY_FLEE,
            MadnessType.TEMPORARY_STUNNED,
            MadnessType.TEMPORARY_RAVING,
        ]

    def test_check_madness_trigger_no_madness(self, service):
        """Test no madness for small SAN loss."""
        result = service.check_madness_trigger(48, 2, 50)
        assert result is None

    def test_get_threshold(self, service):
        """Test getting predefined thresholds."""
        threshold = service.get_threshold("corpse_fresh")
        assert threshold is not None
        assert threshold.category == SANCategory.BODILY_HORROR
        assert threshold.description == "发现新鲜的尸体"

    def test_get_threshold_not_found(self, service):
        """Test getting non-existent threshold."""
        threshold = service.get_threshold("nonexistent")
        assert threshold is None

    def test_perform_san_check_success(self, service):
        """Test SAN check with forced success."""
        from src.schemas.san import SANTriggerInfo

        request = SANCheckRequest(
            character_id=1,
            trigger=SANTriggerInfo(
                type=TriggerType.SCENE,
                source_id="test_scene",
                description="Test trigger",
            ),
            loss_definition=SANLossDefinition(
                success_min=0,
                success_max=1,
                failure_min=1,
                failure_max=6,
                critical_loss=0,
            ),
            force_roll=30,
        )

        response = service.perform_san_check(request, current_san=50, max_san=99)

        assert response.previous_san == 50
        assert response.final_san <= 50
        assert response.result.passed is True

    def test_recover_san(self, service):
        """Test SAN recovery."""
        request = SANRecoverRequest(
            character_id=1,
            amount=5,
            reason="心理治疗",
        )

        response = service.recover_san(request, current_san=45, max_san=99)

        assert response.previous_san == 45
        assert response.recovered == 5
        assert response.current_san == 50
        assert response.max_san == 99

    def test_recover_san_capped_at_max(self, service):
        """Test SAN recovery is capped at max."""
        request = SANRecoverRequest(
            character_id=1,
            amount=20,
            reason="心理治疗",
        )

        response = service.recover_san(request, current_san=90, max_san=99)

        assert response.previous_san == 90
        assert response.recovered == 9
        assert response.current_san == 99


class TestSANThresholds:
    """Test predefined SAN thresholds."""

    def test_predefined_thresholds_exist(self):
        """Test that predefined thresholds are available."""
        assert "corpse_fresh" in PREDEFINED_SAN_THRESHOLDS
        assert "corpse_mutilated" in PREDEFINED_SAN_THRESHOLDS
        assert "unnatural_creature" in PREDEFINED_SAN_THRESHOLDS

    def test_threshold_structure(self):
        """Test threshold structure is correct."""
        threshold = PREDEFINED_SAN_THRESHOLDS["corpse_fresh"]
        assert threshold.id == "corpse_fresh"
        assert threshold.category == SANCategory.BODILY_HORROR
        assert threshold.loss.success_min == 0
        assert threshold.loss.failure_max == 4

    def test_once_only_threshold(self):
        """Test once_only flag on thresholds."""
        threshold = PREDEFINED_SAN_THRESHOLDS["corpse_loved_one"]
        assert threshold.once_only is True

    def test_unnatural_creature_threshold(self):
        """Test unnatural creature has high SAN loss."""
        threshold = PREDEFINED_SAN_THRESHOLDS["unnatural_creature"]
        assert threshold.category == SANCategory.UNNATURAL
        assert threshold.loss.failure_max == 20
        assert threshold.once_only is True
