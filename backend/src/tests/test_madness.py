"""Tests for Madness system."""

import pytest
from unittest.mock import MagicMock

from src.schemas.madness import (
    MADNESS_SYMPTOMS,
    MadnessCategory,
    MadnessSymptom,
    MadnessTriggerRequest,
    MadnessType,
)
from src.services.madness import MadnessService, TEMPORARY_MADNESS_TYPES, INDEFINITE_MADNESS_TYPES


class TestMadnessService:
    """Test madness service functionality."""

    @pytest.fixture
    def service(self):
        """Create madness service instance."""
        mock_db = MagicMock()
        return MadnessService(mock_db)

    def test_get_random_temporary_madness(self, service):
        """Test getting random temporary madness."""
        for _ in range(100):
            madness_type = service.get_random_temporary_madness()
            assert madness_type in TEMPORARY_MADNESS_TYPES

    def test_get_random_indefinite_madness(self, service):
        """Test getting random indefinite madness."""
        for _ in range(100):
            madness_type = service.get_random_indefinite_madness()
            assert madness_type in INDEFINITE_MADNESS_TYPES

    def test_get_symptoms_for_type(self, service):
        """Test getting symptoms for madness types."""
        for madness_type in MadnessType:
            symptoms = service.get_symptoms_for_type(madness_type)
            assert isinstance(symptoms, list)

    def test_symptoms_exist_for_all_types(self):
        """Test that symptoms are defined for all madness types."""
        for madness_type in MadnessType:
            assert madness_type in MADNESS_SYMPTOMS
            symptoms = MADNESS_SYMPTOMS[madness_type]
            assert len(symptoms) > 0
            for symptom in symptoms:
                assert isinstance(symptom, MadnessSymptom)
                assert symptom.name
                assert symptom.description

    def test_calculate_duration_temporary(self, service):
        """Test duration calculation for temporary madness."""
        for _ in range(100):
            minutes, hours = service.calculate_duration(MadnessCategory.TEMPORARY)
            assert minutes is not None
            assert 1 <= minutes <= 10
            assert hours is None

    def test_calculate_duration_indefinite(self, service):
        """Test duration calculation for indefinite madness."""
        for _ in range(100):
            minutes, hours = service.calculate_duration(MadnessCategory.INDEFINITE)
            assert hours is not None
            assert 1 <= hours <= 10
            assert minutes is None

    def test_should_trigger_madness_zero_san(self, service):
        """Test madness trigger at zero SAN."""
        result = service.should_trigger_madness(5, 5, 0)
        assert result is not None
        is_indefinite, madness_type = result
        assert is_indefinite is True
        assert madness_type in INDEFINITE_MADNESS_TYPES

    def test_should_trigger_madness_5_loss(self, service):
        """Test madness trigger on 5+ SAN loss."""
        result = service.should_trigger_madness(5, 50, 45)
        assert result is not None
        is_indefinite, madness_type = result
        assert is_indefinite is False
        assert madness_type in TEMPORARY_MADNESS_TYPES

    def test_should_not_trigger_madness(self, service):
        """Test no madness trigger on small SAN loss."""
        result = service.should_trigger_madness(2, 50, 48)
        assert result is None


class TestMadnessSymptoms:
    """Test madness symptom definitions."""

    def test_temporary_madness_symptoms(self):
        """Test that temporary madness types have symptoms."""
        for madness_type in TEMPORARY_MADNESS_TYPES:
            symptoms = MADNESS_SYMPTOMS.get(madness_type, [])
            assert len(symptoms) > 0, f"No symptoms for {madness_type}"

    def test_indefinite_madness_symptoms(self):
        """Test that indefinite madness types have symptoms."""
        for madness_type in INDEFINITE_MADNESS_TYPES:
            symptoms = MADNESS_SYMPTOMS.get(madness_type, [])
            assert len(symptoms) > 0, f"No symptoms for {madness_type}"

    def test_symptom_effect_types(self):
        """Test that symptom effect types are valid."""
        valid_types = {"state", "behavior", "cognitive", "perception", "social", "communication"}
        for madness_type, symptoms in MADNESS_SYMPTOMS.items():
            for symptom in symptoms:
                assert symptom.effect_type in valid_types, (
                    f"Invalid effect type {symptom.effect_type} for {symptom.name}"
                )
