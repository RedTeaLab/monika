"""Madness system API routes."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.core.auth import get_current_user
from src.core.database import get_db
from src.models.character import Character
from src.models.user import User
from src.schemas.madness import (
    MadnessEpisode,
    MadnessRecoveryRequest,
    MadnessRecoveryResponse,
    MadnessStatusResponse,
    MadnessTriggerRequest,
    MadnessTriggerResponse,
    MadnessType,
)
from src.services.madness import MadnessService

router = APIRouter(prefix="/madness", tags=["madness"])


@router.post("/trigger", response_model=MadnessTriggerResponse)
def trigger_madness(
    request: MadnessTriggerRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MadnessTriggerResponse:
    """Trigger a madness episode.

    Madness is triggered when:
    - SAN drops to 0 (indefinite madness)
    - 5+ SAN lost in one roll (temporary madness)

    Args:
        request: Madness trigger request.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        MadnessTriggerResponse with episode details.
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

    service = MadnessService(db)
    try:
        response = service.trigger_madness(request)
        return response
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/recover", response_model=MadnessRecoveryResponse)
def attempt_recovery(
    request: MadnessRecoveryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MadnessRecoveryResponse:
    """Attempt to recover from madness.

    For temporary madness: recovers after duration expires
    For indefinite madness: requires INT roll (target 50)

    Args:
        request: Recovery request.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        MadnessRecoveryResponse with result.
    """
    service = MadnessService(db)
    response = service.attempt_recovery(request)
    return response


@router.get("/character/{character_id}/status", response_model=MadnessStatusResponse)
def get_madness_status(
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MadnessStatusResponse:
    """Get madness status for a character.

    Args:
        character_id: Character ID.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        MadnessStatusResponse with status details.
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

    service = MadnessService(db)
    return service.get_madness_status(character_id)


@router.get("/character/{character_id}/active")
def get_active_madness(
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Get active madness episodes for a character.

    Args:
        character_id: Character ID.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        List of active madness episodes.
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

    service = MadnessService(db)
    episodes = service.get_active_madness(character_id)

    return [
        {
            "id": ep.id,
            "madness_type": ep.madness_type,
            "category": ep.category,
            "started_at": ep.started_at.isoformat(),
            "ends_at": ep.ends_at.isoformat() if ep.ends_at else None,
            "duration_minutes": ep.duration_minutes,
            "duration_hours": ep.duration_hours,
            "is_active": ep.is_active,
            "recovery_conditions": ep.recovery_conditions,
        }
        for ep in episodes
    ]


@router.post("/episode/{episode_id}/end")
def end_madness_episode(
    episode_id: int,
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """End a madness episode early.

    This is typically used by the Keeper.

    Args:
        episode_id: Episode ID.
        character_id: Character ID.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        Success message.
    """
    service = MadnessService(db)
    record = service.end_episode(episode_id, character_id)

    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active madness episode not found",
        )

    return {
        "success": True,
        "episode_id": episode_id,
        "message": "Madness episode ended",
    }


@router.get("/types")
def list_madness_types() -> dict:
    """List all madness types with descriptions.

    Returns:
        Dictionary of madness types.
    """
    return {
        "temporary": [
            {"type": "faint", "name": "昏厥", "description": "失去意识"},
            {"type": "panic", "name": "恐慌", "description": "因恐惧而逃离"},
            {"type": "flee", "name": "奔跑", "description": "漫无目的奔跑"},
            {"type": "stunned", "name": "惊呆", "description": "无法行动"},
            {"type": "raving", "name": "谵妄", "description": "胡言乱语"},
        ],
        "indefinite": [
            {"type": "amnesia", "name": "记忆丧失", "description": "忘记重要的人和事"},
            {"type": "delusion", "name": "妄想", "description": "持有错误的信念"},
            {"type": "hallucination", "name": "幻觉", "description": "看到或听到不存在的事物"},
            {"type": "paranoia", "name": "偏执", "description": "怀疑所有人的动机"},
            {"type": "phobia", "name": "恐惧症", "description": "对特定事物产生强烈恐惧"},
            {"type": "mania", "name": "躁狂", "description": "对某事物产生过度痴迷"},
            {"type": "schizophrenia", "name": "精神分裂", "description": "与现实脱节"},
        ],
    }
