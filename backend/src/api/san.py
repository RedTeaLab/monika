"""SAN (Sanity) API routes."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.core.auth import get_current_user
from src.core.database import get_db
from src.models.character import Character
from src.models.san import RealLifeRecord
from src.models.user import User
from src.schemas.san import (
    SANCheckRequest,
    SANCheckResponse,
    SANRecoverRequest,
    SANRecoverResponse,
    SANThreshold,
    PREDEFINED_SAN_THRESHOLDS,
)
from src.services.san import SANService

router = APIRouter(prefix="/san", tags=["san"])


class RealLifeStartRequest(BaseModel):
    """Request to start a Real Life recovery period."""

    character_id: int
    duration_months: int = 1


class RealLifeResponse(BaseModel):
    """Response for Real Life operations."""

    id: int
    character_id: int
    start_date: str
    end_date: Optional[str]
    initial_san: int
    expected_recovery: int
    actual_recovery: Optional[int]
    is_active: bool
    notes: Optional[str]


@router.post("/check", response_model=SANCheckResponse)
def perform_san_check(
    request: SANCheckRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SANCheckResponse:
    """Perform a SAN (Sanity) check.

    CoC 7e SAN check rules:
    - Roll d100 against current SAN value
    - Success: lose 0-N SAN
    - Failure: lose 1-N SAN
    - Critical: lose 0 SAN
    - Fumble: lose max SAN

    Args:
        request: SAN check request with trigger info and loss definition.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        SANCheckResponse with roll result and final SAN.
    """
    character = (
        db.query(Character)
        .filter(Character.id == request.character_id, Character.owner_id == current_user.id)
        .first()
    )
    if character is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found",
        )

    service = SANService(db)
    response = service.perform_san_check(
        request=request,
        current_san=character.san,
        max_san=character.max_san,
    )

    if response.final_san != character.san:
        character.san = response.final_san
        db.commit()
        db.refresh(character)

    return response


@router.post("/recover", response_model=SANRecoverResponse)
def recover_san(
    request: SANRecoverRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SANRecoverResponse:
    """Recover SAN points.

    SAN can be recovered through:
    - Psychotherapy
    - Real Life recovery (1d3 per month)
    - Special circumstances

    Args:
        request: Recovery request with amount and reason.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        SANRecoverResponse with new SAN value.
    """
    character = (
        db.query(Character)
        .filter(Character.id == request.character_id, Character.owner_id == current_user.id)
        .first()
    )
    if character is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found",
        )

    if request.amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recovery amount must be positive",
        )

    service = SANService(db)
    response = service.recover_san(
        request=request,
        current_san=character.san,
        max_san=character.max_san,
    )

    if response.current_san != character.san:
        previous_san = character.san
        character.san = response.current_san
        db.commit()
        db.refresh(character)

        service.record_san_recovery(
            character_id=character.id,
            previous_san=previous_san,
            recovered_amount=response.recovered,
            current_san=response.current_san,
            max_san=response.max_san,
            recovery_type="manual",
            reason=request.reason,
            session_id=request.session_id,
        )

    return response


@router.get("/thresholds", response_model=dict[str, SANThreshold])
def list_san_thresholds(
    current_user: User = Depends(get_current_user),
) -> dict[str, SANThreshold]:
    """List all predefined SAN thresholds.

    Returns common SAN loss scenarios with their loss values.

    Args:
        current_user: Authenticated user.

    Returns:
        Dictionary of threshold ID to SANThreshold.
    """
    return PREDEFINED_SAN_THRESHOLDS


@router.get("/thresholds/{threshold_id}", response_model=SANThreshold)
def get_san_threshold(
    threshold_id: str,
    current_user: User = Depends(get_current_user),
) -> SANThreshold:
    """Get a specific SAN threshold by ID.

    Args:
        threshold_id: ID of the threshold.
        current_user: Authenticated user.

    Returns:
        SANThreshold details.

    Raises:
        404: If threshold not found.
    """
    threshold = PREDEFINED_SAN_THRESHOLDS.get(threshold_id)
    if threshold is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Threshold not found: {threshold_id}",
        )
    return threshold


@router.get("/character/{character_id}/status")
def get_san_status(
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Get SAN status for a character.

    Returns current SAN, max SAN, and any active madness conditions.

    Args:
        character_id: Character ID.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        SAN status information.
    """
    character = (
        db.query(Character)
        .filter(Character.id == character_id, Character.owner_id == current_user.id)
        .first()
    )
    if character is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found",
        )

    service = SANService(db)
    warning_level = service.get_san_warning_level(character.san, character.max_san)

    return {
        "character_id": character.id,
        "character_name": character.name,
        "current_san": character.san,
        "max_san": character.max_san,
        "san_percentage": round(character.san / character.max_san * 100, 1)
        if character.max_san > 0
        else 0,
        "mental_illness": character.mental_illness,
        "is_insane": character.san <= 0,
        "warning_level": warning_level,
    }


@router.post("/real-life/start", response_model=RealLifeResponse)
def start_real_life(
    request: RealLifeStartRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RealLifeResponse:
    """Start a Real Life recovery period.

    Real Life allows characters to recover 1d3 SAN per month.

    Args:
        request: Real Life start request.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        RealLifeResponse with recovery details.
    """
    character = (
        db.query(Character)
        .filter(Character.id == request.character_id, Character.owner_id == current_user.id)
        .first()
    )
    if character is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found",
        )

    service = SANService(db)

    active_real_life = service.get_active_real_life(character.id)
    if active_real_life:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Character already has an active Real Life period",
        )

    record = service.start_real_life(
        character_id=character.id,
        current_san=character.san,
        max_san=character.max_san,
        duration_months=request.duration_months,
    )

    return RealLifeResponse(
        id=record.id,
        character_id=record.character_id,
        start_date=record.start_date.isoformat(),
        end_date=record.end_date.isoformat() if record.end_date else None,
        initial_san=record.initial_san,
        expected_recovery=record.expected_recovery,
        actual_recovery=record.actual_recovery,
        is_active=record.is_active,
        notes=record.notes,
    )


@router.post("/real-life/{record_id}/complete", response_model=RealLifeResponse)
def complete_real_life(
    record_id: int,
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RealLifeResponse:
    """Complete a Real Life recovery period and apply recovery.

    Args:
        record_id: Real Life record ID.
        character_id: Character ID.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        RealLifeResponse with final recovery details.
    """
    character = (
        db.query(Character)
        .filter(Character.id == character_id, Character.owner_id == current_user.id)
        .first()
    )
    if character is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found",
        )

    service = SANService(db)
    record = service.complete_real_life(
        record_id=record_id,
        character_id=character.id,
        current_san=character.san,
    )

    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active Real Life record not found",
        )

    if record.actual_recovery and record.actual_recovery > 0:
        previous_san = character.san
        character.san = min(character.max_san, character.san + record.actual_recovery)
        db.commit()
        db.refresh(character)

        service.record_san_recovery(
            character_id=character.id,
            previous_san=previous_san,
            recovered_amount=record.actual_recovery,
            current_san=character.san,
            max_san=character.max_san,
            recovery_type="real_life",
            reason=f"Real Life recovery ({record.expected_recovery} expected)",
        )

    return RealLifeResponse(
        id=record.id,
        character_id=record.character_id,
        start_date=record.start_date.isoformat(),
        end_date=record.end_date.isoformat() if record.end_date else None,
        initial_san=record.initial_san,
        expected_recovery=record.expected_recovery,
        actual_recovery=record.actual_recovery,
        is_active=record.is_active,
        notes=record.notes,
    )


@router.get("/real-life/character/{character_id}")
def get_active_real_life(
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Optional[RealLifeResponse]:
    """Get active Real Life record for a character.

    Args:
        character_id: Character ID.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        Active RealLifeResponse or None.
    """
    character = (
        db.query(Character)
        .filter(Character.id == character_id, Character.owner_id == current_user.id)
        .first()
    )
    if character is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found",
        )

    service = SANService(db)
    record = service.get_active_real_life(character.id)

    if not record:
        return None

    return RealLifeResponse(
        id=record.id,
        character_id=record.character_id,
        start_date=record.start_date.isoformat(),
        end_date=record.end_date.isoformat() if record.end_date else None,
        initial_san=record.initial_san,
        expected_recovery=record.expected_recovery,
        actual_recovery=record.actual_recovery,
        is_active=record.is_active,
        notes=record.notes,
    )


@router.get("/character/{character_id}/warning")
def get_san_warning(
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Get SAN warning information for a character.

    Returns detailed warning information including state, level,
    message, and recommendations.

    Args:
        character_id: Character ID.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        SAN warning information.
    """
    character = (
        db.query(Character)
        .filter(Character.id == character_id, Character.owner_id == current_user.id)
        .first()
    )
    if character is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found",
        )

    service = SANService(db)
    return service.get_san_warning(character.san, character.max_san)


@router.get("/character/{character_id}/state")
def get_san_state(
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Get SAN state for a character.

    Returns the current mental health state based on SAN percentage.

    Args:
        character_id: Character ID.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        SAN state information.
    """
    character = (
        db.query(Character)
        .filter(Character.id == character_id, Character.owner_id == current_user.id)
        .first()
    )
    if character is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found",
        )

    service = SANService(db)
    state = service.get_san_state(character.san, character.max_san)

    return {
        "character_id": character.id,
        "current_san": character.san,
        "max_san": character.max_san,
        "state": state,
        "san_percentage": round(character.san / character.max_san * 100, 1)
        if character.max_san > 0
        else 0,
    }
