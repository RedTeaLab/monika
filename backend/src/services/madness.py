"""Madness system service for CoC 7e."""

import uuid
from datetime import datetime, timedelta
from random import randint
from typing import Optional

from sqlalchemy.orm import Session

from src.models.madness import MadnessEpisodeRecord
from src.schemas.madness import (
    MADNESS_SYMPTOMS,
    MadnessCategory,
    MadnessEpisode,
    MadnessRecoveryRequest,
    MadnessRecoveryResponse,
    MadnessStatusResponse,
    MadnessTriggerRequest,
    MadnessTriggerResponse,
    MadnessType,
)
from src.services.dice import roll_d100


TEMPORARY_MADNESS_TYPES = [
    MadnessType.TEMPORARY_FAINT,
    MadnessType.TEMPORARY_PANIC,
    MadnessType.TEMPORARY_FLEE,
    MadnessType.TEMPORARY_STUNNED,
    MadnessType.TEMPORARY_RAVING,
]

INDEFINITE_MADNESS_TYPES = [
    MadnessType.INDEFINITE_AMNESIA,
    MadnessType.INDEFINITE_DELUSION,
    MadnessType.INDEFINITE_HALLUCINATION,
    MadnessType.INDEFINITE_PARANOIA,
    MadnessType.INDEFINITE_PHOBIA,
    MadnessType.INDEFINITE_MANIA,
    MadnessType.INDEFINITE_SCHIZOPHRENIA,
]


class MadnessService:
    """Service for handling madness mechanics in CoC 7e."""

    def __init__(self, db: Session):
        self.db = db

    def get_random_temporary_madness(self) -> MadnessType:
        """Get a random temporary madness type."""
        return TEMPORARY_MADNESS_TYPES[randint(0, len(TEMPORARY_MADNESS_TYPES) - 1)]

    def get_random_indefinite_madness(self) -> MadnessType:
        """Get a random indefinite madness type."""
        return INDEFINITE_MADNESS_TYPES[randint(0, len(INDEFINITE_MADNESS_TYPES) - 1)]

    def get_symptoms_for_type(self, madness_type: MadnessType) -> list:
        """Get symptoms for a madness type."""
        return MADNESS_SYMPTOMS.get(madness_type, [])

    def calculate_duration(self, category: MadnessCategory) -> tuple[Optional[int], Optional[int]]:
        """Calculate madness duration.

        Temporary: 1d10 minutes
        Indefinite: 1d10 hours

        Returns:
            Tuple of (duration_minutes, duration_hours)
        """
        if category == MadnessCategory.TEMPORARY:
            return (randint(1, 10), None)
        else:
            return (None, randint(1, 10))

    def should_trigger_madness(
        self,
        san_loss: int,
        san_before: int,
        san_after: int,
    ) -> Optional[tuple[bool, MadnessType]]:
        """Check if madness should be triggered.

        CoC 7e rules:
        - If SAN drops to 0, indefinite madness
        - If lose 5+ SAN in one roll, temporary madness

        Args:
            san_loss: Amount of SAN lost.
            san_before: SAN before loss.
            san_after: SAN after loss.

        Returns:
            Tuple of (is_indefinite, madness_type) or None.
        """
        if san_after <= 0:
            return (True, self.get_random_indefinite_madness())

        if san_loss >= 5:
            return (False, self.get_random_temporary_madness())

        return None

    def trigger_madness(
        self,
        request: MadnessTriggerRequest,
    ) -> MadnessTriggerResponse:
        """Trigger a madness episode.

        Args:
            request: Madness trigger request.

        Returns:
            MadnessTriggerResponse with episode details.
        """
        if request.force_type:
            madness_type = request.force_type
            is_indefinite = request.force_type in INDEFINITE_MADNESS_TYPES
        else:
            trigger_result = self.should_trigger_madness(
                request.san_loss,
                request.san_before,
                request.san_after,
            )
            if not trigger_result:
                raise ValueError("Madness should not be triggered for this situation")

            is_indefinite, madness_type = trigger_result

        category = MadnessCategory.INDEFINITE if is_indefinite else MadnessCategory.TEMPORARY
        symptoms = self.get_symptoms_for_type(madness_type)
        duration_minutes, duration_hours = self.calculate_duration(category)

        started_at = datetime.utcnow()
        ends_at = None
        if duration_minutes:
            ends_at = started_at + timedelta(minutes=duration_minutes)
        elif duration_hours:
            ends_at = started_at + timedelta(hours=duration_hours)

        recovery_conditions = ["等待恢复"] if not is_indefinite else ["心理治疗", "休息"]

        episode = MadnessEpisode(
            id=str(uuid.uuid4()),
            character_id=request.character_id,
            madness_type=madness_type,
            category=category,
            symptoms=symptoms,
            started_at=started_at,
            ends_at=ends_at,
            duration_minutes=duration_minutes,
            duration_hours=duration_hours,
            trigger_reason=request.reason,
            trigger_san_loss=request.san_loss,
            trigger_san_before=request.san_before,
            trigger_san_after=request.san_after,
            is_active=True,
            recovery_conditions=recovery_conditions,
            recovery_roll_required=is_indefinite,
        )

        record = MadnessEpisodeRecord(
            character_id=request.character_id,
            madness_type=madness_type.value,
            category=category.value,
            symptoms=[s.model_dump() for s in symptoms],
            started_at=started_at,
            ends_at=ends_at,
            duration_minutes=duration_minutes,
            duration_hours=duration_hours,
            trigger_reason=request.reason,
            trigger_san_loss=request.san_loss,
            trigger_san_before=request.san_before,
            trigger_san_after=request.san_after,
            is_active=True,
            recovery_conditions=recovery_conditions,
            recovery_roll_required=is_indefinite,
        )

        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)

        episode.id = str(record.id)

        duration_text = ""
        if duration_minutes:
            duration_text = f"{duration_minutes} 分钟"
        elif duration_hours:
            duration_text = f"{duration_hours} 小时"

        symptoms_summary = [s.name for s in symptoms]

        return MadnessTriggerResponse(
            episode=episode,
            is_temporary=not is_indefinite,
            duration_text=duration_text,
            symptoms_summary=symptoms_summary,
        )

    def attempt_recovery(
        self,
        request: MadnessRecoveryRequest,
    ) -> MadnessRecoveryResponse:
        """Attempt to recover from madness.

        For temporary madness: automatically recovers after duration
        For indefinite madness: requires INT roll

        Args:
            request: Recovery request.

        Returns:
            MadnessRecoveryResponse with recovery result.
        """
        record = (
            self.db.query(MadnessEpisodeRecord)
            .filter(
                MadnessEpisodeRecord.id == int(request.episode_id),
                MadnessEpisodeRecord.character_id == request.character_id,
                MadnessEpisodeRecord.is_active == True,
            )
            .first()
        )

        if not record:
            return MadnessRecoveryResponse(
                episode_id=request.episode_id,
                character_id=request.character_id,
                recovered=False,
                message="No active madness episode found",
            )

        is_indefinite = record.category == MadnessCategory.INDEFINITE.value

        if is_indefinite:
            if request.force_roll is not None:
                roll = request.force_roll
            else:
                roll = roll_d100()

            success = roll <= 50

            record.recovery_roll_made = True
            record.recovery_roll_result = "success" if success else "failure"

            if success:
                record.is_active = False
                record.resolved_at = datetime.utcnow()
                self.db.commit()

                return MadnessRecoveryResponse(
                    episode_id=request.episode_id,
                    character_id=request.character_id,
                    recovered=True,
                    roll=roll,
                    success=True,
                    message=f"恢复检定成功 ({roll})，疯狂已消退",
                )
            else:
                self.db.commit()
                return MadnessRecoveryResponse(
                    episode_id=request.episode_id,
                    character_id=request.character_id,
                    recovered=False,
                    roll=roll,
                    success=False,
                    message=f"恢复检定失败 ({roll})，疯狂持续",
                )
        else:
            if record.ends_at and datetime.utcnow() >= record.ends_at:
                record.is_active = False
                record.resolved_at = datetime.utcnow()
                self.db.commit()

                return MadnessRecoveryResponse(
                    episode_id=request.episode_id,
                    character_id=request.character_id,
                    recovered=True,
                    message="临时疯狂已自然消退",
                )
            else:
                return MadnessRecoveryResponse(
                    episode_id=request.episode_id,
                    character_id=request.character_id,
                    recovered=False,
                    message="临时疯狂尚未结束",
                )

    def get_active_madness(self, character_id: int) -> list[MadnessEpisodeRecord]:
        """Get all active madness episodes for a character.

        Args:
            character_id: Character ID.

        Returns:
            List of active madness episodes.
        """
        return (
            self.db.query(MadnessEpisodeRecord)
            .filter(
                MadnessEpisodeRecord.character_id == character_id,
                MadnessEpisodeRecord.is_active == True,
            )
            .all()
        )

    def get_madness_status(self, character_id: int) -> MadnessStatusResponse:
        """Get madness status for a character.

        Args:
            character_id: Character ID.

        Returns:
            MadnessStatusResponse with status details.
        """
        active_episodes = self.get_active_madness(character_id)

        history_count = (
            self.db.query(MadnessEpisodeRecord)
            .filter(
                MadnessEpisodeRecord.character_id == character_id,
            )
            .count()
        )

        temporary_count = (
            self.db.query(MadnessEpisodeRecord)
            .filter(
                MadnessEpisodeRecord.character_id == character_id,
                MadnessEpisodeRecord.category == MadnessCategory.TEMPORARY.value,
            )
            .count()
        )

        indefinite_count = (
            self.db.query(MadnessEpisodeRecord)
            .filter(
                MadnessEpisodeRecord.character_id == character_id,
                MadnessEpisodeRecord.category == MadnessCategory.INDEFINITE.value,
            )
            .count()
        )

        current_summary = None
        if active_episodes:
            summaries = []
            for ep in active_episodes:
                madness_type = MadnessType(ep.madness_type)
                symptoms = self.get_symptoms_for_type(madness_type)
                symptom_names = [s.name for s in symptoms]
                summaries.append(f"{madness_type.value}: {', '.join(symptom_names)}")
            current_summary = "; ".join(summaries)

        return MadnessStatusResponse(
            character_id=character_id,
            has_active_madness=len(active_episodes) > 0,
            active_episodes=[],  # Would need conversion from records
            madness_history_count=history_count,
            temporary_madness_count=temporary_count,
            indefinite_madness_count=indefinite_count,
            current_madness_summary=current_summary,
        )

    def end_episode(self, episode_id: int, character_id: int) -> Optional[MadnessEpisodeRecord]:
        """End a madness episode early.

        Args:
            episode_id: Episode ID.
            character_id: Character ID.

        Returns:
            Updated episode record or None.
        """
        record = (
            self.db.query(MadnessEpisodeRecord)
            .filter(
                MadnessEpisodeRecord.id == episode_id,
                MadnessEpisodeRecord.character_id == character_id,
                MadnessEpisodeRecord.is_active == True,
            )
            .first()
        )

        if not record:
            return None

        record.is_active = False
        record.resolved_at = datetime.utcnow()
        record.resolution_notes = "Ended early by KP or player action"

        self.db.commit()
        self.db.refresh(record)

        return record
