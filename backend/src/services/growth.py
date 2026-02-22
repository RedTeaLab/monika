"""Character growth system service for CoC 7e."""

import uuid
from datetime import datetime, timedelta
from random import randint
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, JSON, Text
from sqlalchemy.sql import func

from src.core.database import Base
from src.schemas.growth import (
    GrowthCheckRequest,
    GrowthCheckResponse,
    GrowthCheckResult,
    GrowthRecord,
    GrowthHistoryRequest,
    GrowthHistoryResponse,
    MarkSkillRequest,
    MarkSkillResponse,
    SkillExperience,
    SkillExperienceResponse,
    GrowthPreviewRequest,
    GrowthPreviewResponse,
)
from src.services.dice import roll_d100


class SkillExperienceRecord(Base):
    """Database model for skill experience tracking."""

    __tablename__ = "skill_experiences"

    id = Column(Integer, primary_key=True, index=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=False, index=True)
    skill_name = Column(String(100), nullable=False, index=True)
    times_used = Column(Integer, default=0)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    is_marked_for_growth = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class GrowthRecordModel(Base):
    """Database model for growth records."""

    __tablename__ = "growth_records"

    id = Column(Integer, primary_key=True, index=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=False, index=True)
    session_id = Column(String(36), ForeignKey("game_sessions.id"), nullable=True)
    skill_name = Column(String(100), nullable=False)
    previous_value = Column(Integer, nullable=False)
    new_value = Column(Integer, nullable=False)
    improvement = Column(Integer, nullable=False)
    check_roll = Column(Integer, nullable=False)
    check_result = Column(String(20), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class GrowthService:
    """Service for handling character growth mechanics in CoC 7e.

    CoC 7e Growth Rules:
    - Mark skills used successfully during play
    - At end of session, perform growth checks
    - Roll d100 against current skill value
    - Success: skill improves by 1d10
    - Critical success: skill improves by 2d10
    """

    def __init__(self, db: Session):
        self.db = db

    def mark_skill_used(
        self,
        character_id: int,
        skill_name: str,
        was_successful: bool = True,
        session_id: Optional[str] = None,
    ) -> SkillExperienceRecord:
        """Mark a skill as used.

        Args:
            character_id: Character ID.
            skill_name: Name of the skill used.
            was_successful: Whether the use was successful.
            session_id: Optional session ID.

        Returns:
            Updated or created experience record.
        """
        record = (
            self.db.query(SkillExperienceRecord)
            .filter(
                SkillExperienceRecord.character_id == character_id,
                SkillExperienceRecord.skill_name == skill_name,
            )
            .first()
        )

        if record:
            record.times_used += 1
            record.last_used_at = datetime.utcnow()
            if was_successful:
                record.is_marked_for_growth = True
        else:
            record = SkillExperienceRecord(
                character_id=character_id,
                skill_name=skill_name,
                times_used=1,
                last_used_at=datetime.utcnow(),
                is_marked_for_growth=was_successful,
            )
            self.db.add(record)

        self.db.commit()
        self.db.refresh(record)
        return record

    def perform_growth_check(
        self,
        request: GrowthCheckRequest,
        current_skill_value: int,
    ) -> GrowthCheckResponse:
        """Perform a growth check for a skill.

        CoC 7e rules:
        - Roll d100 against current skill value
        - Roll <= skill: success, improve by 1d10
        - Roll <= skill/5: critical success, improve by 2d10
        - Roll > skill: failure, no improvement

        Args:
            request: Growth check request.
            current_skill_value: Current value of the skill.

        Returns:
            GrowthCheckResponse with results.
        """
        roll = request.force_roll if request.force_roll else roll_d100()

        threshold = current_skill_value
        critical_threshold = max(1, current_skill_value // 5)

        if roll <= critical_threshold:
            result = GrowthCheckResult.CRITICAL_SUCCESS
            improvement = randint(1, 10) + randint(1, 10)
        elif roll <= threshold:
            result = GrowthCheckResult.SUCCESS
            improvement = randint(1, 10)
        else:
            result = GrowthCheckResult.FAILURE
            improvement = 0

        new_value = current_skill_value + improvement

        record = GrowthRecordModel(
            character_id=request.character_id,
            session_id=request.session_id,
            skill_name=request.skill_name,
            previous_value=current_skill_value,
            new_value=new_value,
            improvement=improvement,
            check_roll=roll,
            check_result=result.value,
        )
        self.db.add(record)

        exp_record = (
            self.db.query(SkillExperienceRecord)
            .filter(
                SkillExperienceRecord.character_id == request.character_id,
                SkillExperienceRecord.skill_name == request.skill_name,
            )
            .first()
        )
        if exp_record:
            exp_record.is_marked_for_growth = False

        self.db.commit()

        messages = {
            GrowthCheckResult.CRITICAL_SUCCESS: f"Critical success! {request.skill_name} improves by {improvement} points!",
            GrowthCheckResult.SUCCESS: f"Success! {request.skill_name} improves by {improvement} points!",
            GrowthCheckResult.FAILURE: f"Failed. {request.skill_name} does not improve.",
        }

        return GrowthCheckResponse(
            character_id=request.character_id,
            skill_name=request.skill_name,
            skill_value=current_skill_value,
            roll=roll,
            result=result,
            improvement=improvement,
            new_value=new_value,
            message=messages[result],
        )

    def get_marked_skills(self, character_id: int) -> list[SkillExperience]:
        """Get all skills marked for growth.

        Args:
            character_id: Character ID.

        Returns:
            List of marked skills.
        """
        records = (
            self.db.query(SkillExperienceRecord)
            .filter(
                SkillExperienceRecord.character_id == character_id,
                SkillExperienceRecord.is_marked_for_growth == True,
            )
            .all()
        )

        return [
            SkillExperience(
                skill_name=r.skill_name,
                times_used=r.times_used,
                last_used_at=r.last_used_at,
                is_marked_for_growth=r.is_marked_for_growth,
            )
            for r in records
        ]

    def get_skill_experience(
        self,
        character_id: int,
        skill_name: str,
    ) -> Optional[SkillExperience]:
        """Get experience for a specific skill.

        Args:
            character_id: Character ID.
            skill_name: Skill name.

        Returns:
            SkillExperience or None.
        """
        record = (
            self.db.query(SkillExperienceRecord)
            .filter(
                SkillExperienceRecord.character_id == character_id,
                SkillExperienceRecord.skill_name == skill_name,
            )
            .first()
        )

        if not record:
            return None

        return SkillExperience(
            skill_name=record.skill_name,
            times_used=record.times_used,
            last_used_at=record.last_used_at,
            is_marked_for_growth=record.is_marked_for_growth,
        )

    def get_all_skill_experience(self, character_id: int) -> SkillExperienceResponse:
        """Get all skill experience for a character.

        Args:
            character_id: Character ID.

        Returns:
            SkillExperienceResponse with all skills.
        """
        records = (
            self.db.query(SkillExperienceRecord)
            .filter(
                SkillExperienceRecord.character_id == character_id,
            )
            .all()
        )

        skills = [
            SkillExperience(
                skill_name=r.skill_name,
                times_used=r.times_used,
                last_used_at=r.last_used_at,
                is_marked_for_growth=r.is_marked_for_growth,
            )
            for r in records
        ]

        marked_count = sum(1 for s in skills if s.is_marked_for_growth)

        return SkillExperienceResponse(
            character_id=character_id,
            skills=skills,
            marked_count=marked_count,
            can_perform_growth=marked_count > 0,
        )

    def get_growth_history(
        self,
        request: GrowthHistoryRequest,
    ) -> GrowthHistoryResponse:
        """Get growth history for a character.

        Args:
            request: Growth history request.

        Returns:
            GrowthHistoryResponse with records.
        """
        records = (
            self.db.query(GrowthRecordModel)
            .filter(GrowthRecordModel.character_id == request.character_id)
            .order_by(GrowthRecordModel.created_at.desc())
            .limit(request.limit)
            .all()
        )

        total = (
            self.db.query(GrowthRecordModel)
            .filter(GrowthRecordModel.character_id == request.character_id)
            .count()
        )

        growth_records = [
            GrowthRecord(
                id=str(r.id),
                character_id=r.character_id,
                skill_name=r.skill_name,
                previous_value=r.previous_value,
                new_value=r.new_value,
                improvement=r.improvement,
                check_roll=r.check_roll,
                check_result=GrowthCheckResult(r.check_result),
                session_id=r.session_id,
                created_at=r.created_at,
            )
            for r in records
        ]

        return GrowthHistoryResponse(
            character_id=request.character_id,
            total_improvements=total,
            records=growth_records,
        )

    def preview_growth(
        self,
        request: GrowthPreviewRequest,
        current_skill_value: int,
    ) -> GrowthPreviewResponse:
        """Preview potential growth for a skill.

        Args:
            request: Preview request.
            current_skill_value: Current skill value.

        Returns:
            GrowthPreviewResponse with preview info.
        """
        chance_of_success = current_skill_value / 100.0

        return GrowthPreviewResponse(
            skill_name=request.skill_name,
            current_value=current_skill_value,
            min_improvement=1,
            max_improvement=20,
            average_improvement=5.5 * (1 + chance_of_success),
            chance_of_success=chance_of_success,
            message=f"Roll d100 against {current_skill_value}. {chance_of_success * 100:.0f}% chance of success.",
        )

    def clear_all_marks(self, character_id: int) -> int:
        """Clear all growth marks for a character.

        Called after performing all growth checks.

        Args:
            character_id: Character ID.

        Returns:
            Number of marks cleared.
        """
        result = (
            self.db.query(SkillExperienceRecord)
            .filter(
                SkillExperienceRecord.character_id == character_id,
                SkillExperienceRecord.is_marked_for_growth == True,
            )
            .update({"is_marked_for_growth": False})
        )

        self.db.commit()
        return result
