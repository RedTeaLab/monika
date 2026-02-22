"""SAN (Sanity) system service for CoC 7e."""

import uuid
from datetime import datetime, timedelta
from random import randint
from typing import Optional

from sqlalchemy.orm import Session

from src.models.san import RealLifeRecord, SANRecoveryRecord, SANStateSnapshot
from src.schemas.san import (
    MadnessType,
    PREDEFINED_SAN_THRESHOLDS,
    SANCategory,
    SANCheckParams,
    SANCheckRequest,
    SANCheckResponse,
    SANCheckResult,
    SANLossDefinition,
    SANLossResult,
    SANRecoverRequest,
    SANRecoverResponse,
    SANThreshold,
    SuccessLevel,
    TriggerType,
)
from src.services.dice import determine_success, roll_d100


class SANService:
    """Service for handling SAN (Sanity) mechanics in CoC 7e."""

    def __init__(self, db: Session):
        self.db = db

    def calculate_san_cap(self, cthulhu_mythos: int) -> int:
        """Calculate maximum SAN cap (99 - Cthulhu Mythos score).

        Args:
            cthulhu_mythos: The character's Cthulhu Mythos skill.

        Returns:
            Maximum SAN value the character can have.
        """
        return max(0, 99 - cthulhu_mythos)

    def roll_san_loss(self, min_loss: int, max_loss: int) -> int:
        """Roll for SAN loss amount.

        Args:
            min_loss: Minimum SAN loss.
            max_loss: Maximum SAN loss.

        Returns:
            Random SAN loss between min and max.
        """
        if min_loss >= max_loss:
            return max_loss
        return randint(min_loss, max_loss)

    def calculate_san_loss(
        self,
        loss_def: SANLossDefinition,
        success_level: SuccessLevel,
    ) -> int:
        """Calculate actual SAN loss based on success level.

        Args:
            loss_def: Loss definition with min/max values.
            success_level: The result of the SAN check.

        Returns:
            Calculated SAN loss amount.
        """
        match success_level:
            case SuccessLevel.CRITICAL:
                return loss_def.critical_loss
            case SuccessLevel.EXTREME | SuccessLevel.HARD | SuccessLevel.REGULAR:
                return self.roll_san_loss(loss_def.success_min, loss_def.success_max)
            case SuccessLevel.FAILURE:
                return self.roll_san_loss(loss_def.failure_min, loss_def.failure_max)
            case SuccessLevel.FUMBLE:
                fumble_loss = loss_def.fumble_loss
                if fumble_loss is not None:
                    return fumble_loss
                return loss_def.failure_max

    def determine_success_level(self, roll: int, san_value: int) -> SuccessLevel:
        """Determine success level for a SAN check.

        SAN checks use POW*5 as the target (or current SAN if lower).

        Args:
            roll: The d100 roll.
            san_value: Current SAN value (POW-based).

        Returns:
            Success level of the check.
        """
        if roll == 1:
            return SuccessLevel.CRITICAL
        if roll == 100:
            return SuccessLevel.FUMBLE

        target = san_value

        extreme_threshold = max(1, target // 5)
        hard_threshold = target // 2

        if roll <= extreme_threshold:
            return SuccessLevel.EXTREME
        elif roll <= hard_threshold:
            return SuccessLevel.HARD
        elif roll <= target:
            return SuccessLevel.REGULAR
        else:
            return SuccessLevel.FAILURE

    def check_madness_trigger(
        self,
        current_san: int,
        san_loss: int,
        previous_san: int,
    ) -> Optional[tuple[bool, MadnessType]]:
        """Check if madness should be triggered.

        CoC 7e rules:
        - If SAN drops to 0, indefinite madness
        - If lose 5+ SAN in one roll, temporary madness
        - If lose 20%+ of SAN in one game day, indefinite madness

        Args:
            current_san: SAN after loss.
            san_loss: Amount of SAN lost.
            previous_san: SAN before loss.

        Returns:
            Tuple of (is_indefinite, madness_type) or None.
        """
        if current_san <= 0:
            return (True, self._get_random_indefinite_madness())

        if san_loss >= 5:
            return (False, self._get_random_temporary_madness())

        return None

    def _get_random_temporary_madness(self) -> MadnessType:
        """Get a random temporary madness type."""
        temporary_types = [
            MadnessType.TEMPORARY_FAINT,
            MadnessType.TEMPORARY_PANIC,
            MadnessType.TEMPORARY_FLEE,
            MadnessType.TEMPORARY_STUNNED,
            MadnessType.TEMPORARY_RAVING,
        ]
        return temporary_types[randint(0, len(temporary_types) - 1)]

    def _get_random_indefinite_madness(self) -> MadnessType:
        """Get a random indefinite madness type."""
        indefinite_types = [
            MadnessType.INDEFINITE_AMNESIA,
            MadnessType.INDEFINITE_DELUSION,
            MadnessType.INDEFINITE_HALLUCINATION,
            MadnessType.INDEFINITE_PARANOIA,
            MadnessType.INDEFINITE_PHOBIA,
            MadnessType.INDEFINITE_MANIA,
            MadnessType.INDEFINITE_SCHIZOPHRENIA,
        ]
        return indefinite_types[randint(0, len(indefinite_types) - 1)]

    def get_threshold(self, threshold_id: str) -> Optional[SANThreshold]:
        """Get a predefined SAN threshold.

        Args:
            threshold_id: ID of the threshold.

        Returns:
            SANThreshold or None if not found.
        """
        return PREDEFINED_SAN_THRESHOLDS.get(threshold_id)

    def perform_san_check(
        self,
        request: SANCheckRequest,
        current_san: int,
        max_san: int,
    ) -> SANCheckResponse:
        """Perform a SAN check.

        Args:
            request: The SAN check request.
            current_san: Character's current SAN.
            max_san: Character's maximum SAN.

        Returns:
            SANCheckResponse with results.
        """
        roll = request.force_roll if request.force_roll else roll_d100()
        success_level = self.determine_success_level(roll, current_san)

        san_loss_value = self.calculate_san_loss(request.loss_definition, success_level)

        previous_san = current_san
        final_san = max(0, current_san - san_loss_value)

        madness_info = self.check_madness_trigger(final_san, san_loss_value, previous_san)

        from src.schemas.san import MadnessTrigger, SANCheckResult, SANLossResult

        madness_triggered = None
        if madness_info:
            is_indefinite, madness_type = madness_info
            madness_triggered = MadnessTrigger(
                trigger_id=str(uuid.uuid4()),
                madness_type=madness_type,
                duration_minutes=randint(1, 10) if not is_indefinite else None,
                duration_hours=randint(1, 10) if is_indefinite else None,
                is_real_life=False,
                recovery_conditions=["心理治疗", "休息"] if is_indefinite else ["等待"],
            )

        result = SANCheckResult(
            roll=roll,
            success_level=success_level,
            passed=success_level
            in [
                SuccessLevel.CRITICAL,
                SuccessLevel.EXTREME,
                SuccessLevel.HARD,
                SuccessLevel.REGULAR,
            ],
            san_loss=SANLossResult(
                actual_loss=san_loss_value,
                reason=request.trigger.description,
                can_reduce=False,
            ),
            madness_triggered=madness_triggered,
        )

        return SANCheckResponse(
            check_id=str(uuid.uuid4()),
            session_id=request.session_id,
            timestamp=datetime.utcnow(),
            trigger=request.trigger,
            check_params=SANCheckParams(
                character_id=request.character_id,
                current_san=current_san,
                san_cap=max_san,
                difficulty="regular",
            ),
            result=result,
            previous_san=previous_san,
            final_san=final_san,
        )

    def recover_san(
        self,
        request: SANRecoverRequest,
        current_san: int,
        max_san: int,
    ) -> SANRecoverResponse:
        """Recover SAN points.

        Args:
            request: The recovery request.
            current_san: Character's current SAN.
            max_san: Character's maximum SAN.

        Returns:
            SANRecoverResponse with results.
        """
        new_san = min(max_san, current_san + request.amount)
        actual_recovery = new_san - current_san

        return SANRecoverResponse(
            character_id=request.character_id,
            previous_san=current_san,
            recovered=actual_recovery,
            current_san=new_san,
            max_san=max_san,
            reason=request.reason,
        )

    def start_real_life(
        self,
        character_id: int,
        current_san: int,
        max_san: int,
        duration_months: int = 1,
    ) -> RealLifeRecord:
        """Start a Real Life recovery period.

        CoC 7e Real Life rules:
        - Character takes time away from investigation
        - Recovers 1d3 SAN per month
        - Cannot exceed SAN cap

        Args:
            character_id: Character ID.
            current_san: Current SAN value.
            max_san: Maximum SAN.
            duration_months: Duration in months.

        Returns:
            RealLifeRecord tracking the recovery.
        """
        expected_recovery = self.roll_san_loss(1, 3) * duration_months
        actual_max_recovery = max_san - current_san
        expected_recovery = min(expected_recovery, actual_max_recovery)

        record = RealLifeRecord(
            character_id=character_id,
            start_date=datetime.utcnow(),
            end_date=datetime.utcnow() + timedelta(days=30 * duration_months),
            initial_san=current_san,
            expected_recovery=expected_recovery,
            is_active=True,
        )

        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)

        return record

    def complete_real_life(
        self,
        record_id: int,
        character_id: int,
        current_san: int,
    ) -> Optional[RealLifeRecord]:
        """Complete a Real Life recovery period.

        Args:
            record_id: Real Life record ID.
            character_id: Character ID.
            current_san: Current SAN value.

        Returns:
            Updated RealLifeRecord.
        """
        record = (
            self.db.query(RealLifeRecord)
            .filter(
                RealLifeRecord.id == record_id,
                RealLifeRecord.character_id == character_id,
                RealLifeRecord.is_active == True,
            )
            .first()
        )

        if not record:
            return None

        actual_recovery = min(record.expected_recovery, current_san - record.initial_san)
        record.actual_recovery = actual_recovery
        record.is_active = False
        record.end_date = datetime.utcnow()

        self.db.commit()
        self.db.refresh(record)

        return record

    def get_active_real_life(self, character_id: int) -> Optional[RealLifeRecord]:
        """Get active Real Life record for a character.

        Args:
            character_id: Character ID.

        Returns:
            Active RealLifeRecord or None.
        """
        return (
            self.db.query(RealLifeRecord)
            .filter(
                RealLifeRecord.character_id == character_id,
                RealLifeRecord.is_active == True,
            )
            .first()
        )

    def record_san_recovery(
        self,
        character_id: int,
        previous_san: int,
        recovered_amount: int,
        current_san: int,
        max_san: int,
        recovery_type: str,
        reason: str,
        session_id: Optional[str] = None,
    ) -> SANRecoveryRecord:
        """Record a SAN recovery event.

        Args:
            character_id: Character ID.
            previous_san: SAN before recovery.
            recovered_amount: Amount recovered.
            current_san: SAN after recovery.
            max_san: Maximum SAN.
            recovery_type: Type of recovery (therapy, real_life, special).
            reason: Reason for recovery.
            session_id: Optional session ID.

        Returns:
            SANRecoveryRecord.
        """
        record = SANRecoveryRecord(
            character_id=character_id,
            session_id=session_id,
            previous_san=previous_san,
            recovered_amount=recovered_amount,
            current_san=current_san,
            max_san=max_san,
            recovery_type=recovery_type,
            reason=reason,
        )

        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)

        return record

    def create_san_snapshot(
        self,
        character_id: int,
        san: int,
        max_san: int,
        san_cap: int,
        session_id: Optional[str] = None,
        total_san_lost: int = 0,
        total_san_recovered: int = 0,
        madness_count: int = 0,
        temporary_madness_count: int = 0,
        indefinite_madness_count: int = 0,
        is_insane: bool = False,
        current_madness_type: Optional[str] = None,
    ) -> SANStateSnapshot:
        """Create a SAN state snapshot.

        Args:
            character_id: Character ID.
            san: Current SAN.
            max_san: Maximum SAN.
            san_cap: SAN cap.
            session_id: Optional session ID.
            total_san_lost: Total SAN lost.
            total_san_recovered: Total SAN recovered.
            madness_count: Total madness episodes.
            temporary_madness_count: Temporary madness count.
            indefinite_madness_count: Indefinite madness count.
            is_insane: Whether currently insane.
            current_madness_type: Current madness type if insane.

        Returns:
            SANStateSnapshot.
        """
        snapshot = SANStateSnapshot(
            character_id=character_id,
            session_id=session_id,
            san=san,
            max_san=max_san,
            san_cap=san_cap,
            total_san_lost=total_san_lost,
            total_san_recovered=total_san_recovered,
            madness_count=madness_count,
            temporary_madness_count=temporary_madness_count,
            indefinite_madness_count=indefinite_madness_count,
            is_insane=is_insane,
            current_madness_type=current_madness_type,
        )

        self.db.add(snapshot)
        self.db.commit()
        self.db.refresh(snapshot)

        return snapshot

    def get_san_warning_level(self, current_san: int, max_san: int) -> str:
        """Get warning level based on SAN percentage.

        Args:
            current_san: Current SAN.
            max_san: Maximum SAN.

        Returns:
            Warning level: normal, warning, danger, critical.
        """
        if max_san <= 0:
            return "critical"
        percentage = (current_san / max_san) * 100
        if percentage <= 10:
            return "critical"
        elif percentage <= 25:
            return "danger"
        elif percentage <= 50:
            return "warning"
        else:
            return "normal"

    def check_san_limit(self, current_san: int, san_loss: int) -> dict:
        """Check SAN limit conditions.

        Args:
            current_san: Current SAN before loss.
            san_loss: Amount to lose.

        Returns:
            Dict with limit check results.
        """
        final_san = max(0, current_san - san_loss)

        return {
            "will_trigger_zero": final_san == 0,
            "will_trigger_5_loss": san_loss >= 5,
            "final_san": final_san,
            "is_permanently_insane": final_san == 0,
            "requires_indefinite_madness": san_loss >= 5 or final_san == 0,
        }

    def get_san_state(self, current_san: int, max_san: int) -> str:
        """Get current SAN state based on percentage.

        States:
        - STABLE: >75% SAN
        - UNSETTLED: 50-75% SAN
        - DISTURBED: 25-50% SAN
        - UNSTABLE: 10-25% SAN
        - CRITICAL: 1-10% SAN
        - INSANE: 0 SAN

        Args:
            current_san: Current SAN value.
            max_san: Maximum SAN value.

        Returns:
            SAN state string.
        """
        from src.schemas.san import SANState

        if current_san <= 0:
            return SANState.INSANE.value

        if max_san <= 0:
            return SANState.INSANE.value

        percentage = (current_san / max_san) * 100

        if percentage > 75:
            return SANState.STABLE.value
        elif percentage > 50:
            return SANState.UNSETTLED.value
        elif percentage > 25:
            return SANState.DISTURBED.value
        elif percentage > 10:
            return SANState.UNSTABLE.value
        else:
            return SANState.CRITICAL.value

    def get_san_warning(self, current_san: int, max_san: int) -> dict:
        """Get SAN warning information.

        Args:
            current_san: Current SAN value.
            max_san: Maximum SAN value.

        Returns:
            Dict with warning information.
        """
        from src.schemas.san import SANState, SANWarningLevel

        state = self.get_san_state(current_san, max_san)
        level = self.get_san_warning_level(current_san, max_san)

        warning_messages = {
            SANWarningLevel.NORMAL.value: "SAN 状态正常",
            SANWarningLevel.WARNING.value: "SAN 值偏低，请注意心理健康",
            SANWarningLevel.DANGER.value: "SAN 值危险，建议寻求帮助",
            SANWarningLevel.CRITICAL.value: "SAN 值危急，随时可能陷入疯狂",
        }

        recommendations = {
            SANWarningLevel.NORMAL.value: [],
            SANWarningLevel.WARNING.value: ["休息", "与信任的人交谈"],
            SANWarningLevel.DANGER.value: ["寻求心理治疗", "远离恐怖场景", "休息"],
            SANWarningLevel.CRITICAL.value: ["立即寻求专业帮助", "远离一切压力源"],
        }

        return {
            "state": state,
            "level": level,
            "message": warning_messages.get(level, ""),
            "recommendations": recommendations.get(level, []),
            "san_percentage": round(current_san / max_san * 100, 1) if max_san > 0 else 0,
            "is_insane": current_san <= 0,
        }

    def log_san_change(
        self,
        character_id: int,
        change_type: str,
        previous_value: int,
        new_value: int,
        reason: str,
        session_id: Optional[str] = None,
    ) -> dict:
        """Log a SAN change event.

        Args:
            character_id: Character ID.
            change_type: Type of change (loss, recovery, real_life).
            previous_value: SAN before change.
            new_value: SAN after change.
            reason: Reason for change.
            session_id: Optional session ID.

        Returns:
            Dict with change event information.
        """
        from src.schemas.san import SANState

        delta = new_value - previous_value

        return {
            "character_id": character_id,
            "session_id": session_id,
            "change_type": change_type,
            "previous_san": previous_value,
            "new_san": new_value,
            "delta": delta,
            "reason": reason,
            "state_before": self.get_san_state(previous_value, 99),
            "state_after": self.get_san_state(new_value, 99),
            "timestamp": datetime.utcnow().isoformat(),
        }


from src.services.dice import determine_success, roll_d100


class SANService:
    """Service for handling SAN (Sanity) mechanics in CoC 7e."""

    def __init__(self, db: Session):
        self.db = db

    def calculate_san_cap(self, cthulhu_mythos: int) -> int:
        """Calculate maximum SAN cap (99 - Cthulhu Mythos score).

        Args:
            cthulhu_mythos: The character's Cthulhu Mythos skill.

        Returns:
            Maximum SAN value the character can have.
        """
        return max(0, 99 - cthulhu_mythos)

    def roll_san_loss(self, min_loss: int, max_loss: int) -> int:
        """Roll for SAN loss amount.

        Args:
            min_loss: Minimum SAN loss.
            max_loss: Maximum SAN loss.

        Returns:
            Random SAN loss between min and max.
        """
        if min_loss >= max_loss:
            return max_loss
        return randint(min_loss, max_loss)

    def calculate_san_loss(
        self,
        loss_def: SANLossDefinition,
        success_level: SuccessLevel,
    ) -> int:
        """Calculate actual SAN loss based on success level.

        Args:
            loss_def: Loss definition with min/max values.
            success_level: The result of the SAN check.

        Returns:
            Calculated SAN loss amount.
        """
        match success_level:
            case SuccessLevel.CRITICAL:
                return loss_def.critical_loss
            case SuccessLevel.EXTREME | SuccessLevel.HARD | SuccessLevel.REGULAR:
                return self.roll_san_loss(loss_def.success_min, loss_def.success_max)
            case SuccessLevel.FAILURE:
                return self.roll_san_loss(loss_def.failure_min, loss_def.failure_max)
            case SuccessLevel.FUMBLE:
                fumble_loss = loss_def.fumble_loss
                if fumble_loss is not None:
                    return fumble_loss
                return loss_def.failure_max

    def determine_success_level(self, roll: int, san_value: int) -> SuccessLevel:
        """Determine success level for a SAN check.

        SAN checks use POW*5 as the target (or current SAN if lower).

        Args:
            roll: The d100 roll.
            san_value: Current SAN value (POW-based).

        Returns:
            Success level of the check.
        """
        if roll == 1:
            return SuccessLevel.CRITICAL
        if roll == 100:
            return SuccessLevel.FUMBLE

        target = san_value

        extreme_threshold = max(1, target // 5)
        hard_threshold = target // 2

        if roll <= extreme_threshold:
            return SuccessLevel.EXTREME
        elif roll <= hard_threshold:
            return SuccessLevel.HARD
        elif roll <= target:
            return SuccessLevel.REGULAR
        else:
            return SuccessLevel.FAILURE

    def check_madness_trigger(
        self,
        current_san: int,
        san_loss: int,
        previous_san: int,
    ) -> Optional[tuple[bool, MadnessType]]:
        """Check if madness should be triggered.

        CoC 7e rules:
        - If SAN drops to 0, indefinite madness
        - If lose 5+ SAN in one roll, temporary madness
        - If lose 20%+ of SAN in one game day, indefinite madness

        Args:
            current_san: SAN after loss.
            san_loss: Amount of SAN lost.
            previous_san: SAN before loss.

        Returns:
            Tuple of (is_indefinite, madness_type) or None.
        """
        if current_san <= 0:
            return (True, self._get_random_indefinite_madness())

        if san_loss >= 5:
            return (False, self._get_random_temporary_madness())

        return None

    def _get_random_temporary_madness(self) -> MadnessType:
        """Get a random temporary madness type."""
        temporary_types = [
            MadnessType.TEMPORARY_FAINT,
            MadnessType.TEMPORARY_PANIC,
            MadnessType.TEMPORARY_FLEE,
            MadnessType.TEMPORARY_STUNNED,
            MadnessType.TEMPORARY_RAVING,
        ]
        return temporary_types[randint(0, len(temporary_types) - 1)]

    def _get_random_indefinite_madness(self) -> MadnessType:
        """Get a random indefinite madness type."""
        indefinite_types = [
            MadnessType.INDEFINITE_AMNESIA,
            MadnessType.INDEFINITE_DELUSION,
            MadnessType.INDEFINITE_HALLUCINATION,
            MadnessType.INDEFINITE_PARANOIA,
            MadnessType.INDEFINITE_PHOBIA,
            MadnessType.INDEFINITE_MANIA,
            MadnessType.INDEFINITE_SCHIZOPHRENIA,
        ]
        return indefinite_types[randint(0, len(indefinite_types) - 1)]

    def get_threshold(self, threshold_id: str) -> Optional[SANThreshold]:
        """Get a predefined SAN threshold.

        Args:
            threshold_id: ID of the threshold.

        Returns:
            SANThreshold or None if not found.
        """
        return PREDEFINED_SAN_THRESHOLDS.get(threshold_id)

    def perform_san_check(
        self,
        request: SANCheckRequest,
        current_san: int,
        max_san: int,
    ) -> SANCheckResponse:
        """Perform a SAN check.

        Args:
            request: The SAN check request.
            current_san: Character's current SAN.
            max_san: Character's maximum SAN.

        Returns:
            SANCheckResponse with results.
        """
        roll = request.force_roll if request.force_roll else roll_d100()
        success_level = self.determine_success_level(roll, current_san)

        san_loss_value = self.calculate_san_loss(request.loss_definition, success_level)

        previous_san = current_san
        final_san = max(0, current_san - san_loss_value)

        madness_info = self.check_madness_trigger(final_san, san_loss_value, previous_san)

        from src.schemas.san import MadnessTrigger, SANCheckResult, SANLossResult

        madness_triggered = None
        if madness_info:
            is_indefinite, madness_type = madness_info
            madness_triggered = MadnessTrigger(
                trigger_id=str(uuid.uuid4()),
                madness_type=madness_type,
                duration_minutes=randint(1, 10) if not is_indefinite else None,
                duration_hours=randint(1, 10) if is_indefinite else None,
                is_real_life=False,
                recovery_conditions=["心理治疗", "休息"] if is_indefinite else ["等待"],
            )

        result = SANCheckResult(
            roll=roll,
            success_level=success_level,
            passed=success_level
            in [
                SuccessLevel.CRITICAL,
                SuccessLevel.EXTREME,
                SuccessLevel.HARD,
                SuccessLevel.REGULAR,
            ],
            san_loss=SANLossResult(
                actual_loss=san_loss_value,
                reason=request.trigger.description,
                can_reduce=False,
            ),
            madness_triggered=madness_triggered,
        )

        return SANCheckResponse(
            check_id=str(uuid.uuid4()),
            session_id=request.session_id,
            timestamp=datetime.utcnow(),
            trigger=request.trigger,
            check_params=SANCheckParams(
                character_id=request.character_id,
                current_san=current_san,
                san_cap=max_san,
                difficulty="regular",
            ),
            result=result,
            previous_san=previous_san,
            final_san=final_san,
        )

    def recover_san(
        self,
        request: SANRecoverRequest,
        current_san: int,
        max_san: int,
    ) -> SANRecoverResponse:
        """Recover SAN points.

        Args:
            request: The recovery request.
            current_san: Character's current SAN.
            max_san: Character's maximum SAN.

        Returns:
            SANRecoverResponse with results.
        """
        new_san = min(max_san, current_san + request.amount)
        actual_recovery = new_san - current_san

        return SANRecoverResponse(
            character_id=request.character_id,
            previous_san=current_san,
            recovered=actual_recovery,
            current_san=new_san,
            max_san=max_san,
            reason=request.reason,
        )
