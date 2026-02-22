"""Character growth system API routes."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.core.auth import get_current_user
from src.core.database import get_db
from src.models.character import Character
from src.models.user import User
from src.schemas.growth import (
    GrowthCheckRequest,
    GrowthCheckResponse,
    GrowthHistoryRequest,
    GrowthHistoryResponse,
    MarkSkillRequest,
    MarkSkillResponse,
    SkillExperienceResponse,
    GrowthPreviewRequest,
    GrowthPreviewResponse,
)
from src.services.growth import GrowthService

router = APIRouter(prefix="/growth", tags=["growth"])


def get_skill_value(character: Character, skill_name: str) -> int:
    """Get current value of a skill from character.

    Args:
        character: Character model.
        skill_name: Name of the skill.

    Returns:
        Current skill value or 0 if not found.
    """
    skills = character.skills or {}
    return skills.get(skill_name, 0)


def update_skill_value(character: Character, skill_name: str, new_value: int) -> None:
    """Update a skill value on character.

    Args:
        character: Character model.
        skill_name: Name of the skill.
        new_value: New skill value.
    """
    skills = character.skills or {}
    skills[skill_name] = new_value
    character.skills = skills


@router.post("/mark", response_model=MarkSkillResponse)
def mark_skill_used(
    request: MarkSkillRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MarkSkillResponse:
    """Mark a skill as successfully used for growth tracking.

    In CoC 7e, skills used successfully during play can be improved
    at the end of a session through growth checks.

    Args:
        request: Mark skill request.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        MarkSkillResponse with updated tracking info.
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

    service = GrowthService(db)
    record = service.mark_skill_used(
        character_id=character.id,
        skill_name=request.skill_name,
        was_successful=True,
        session_id=request.session_id,
    )

    return MarkSkillResponse(
        character_id=character.id,
        skill_name=request.skill_name,
        times_used=record.times_used,
        is_marked_for_growth=record.is_marked_for_growth,
        message=f"Skill '{request.skill_name}' marked for growth check.",
    )


@router.post("/check", response_model=GrowthCheckResponse)
def perform_growth_check(
    request: GrowthCheckRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GrowthCheckResponse:
    """Perform a growth check for a skill.

    CoC 7e growth check rules:
    - Roll d100 against current skill value
    - Roll <= skill: success, improve by 1d10
    - Roll <= skill/5: critical success, improve by 2d10
    - Roll > skill: failure, no improvement

    Args:
        request: Growth check request.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        GrowthCheckResponse with improvement result.
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

    current_skill_value = get_skill_value(character, request.skill_name)
    if current_skill_value <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Skill '{request.skill_name}' not found or has no value",
        )

    service = GrowthService(db)
    response = service.perform_growth_check(
        request=request,
        current_skill_value=current_skill_value,
    )

    if response.improvement > 0:
        update_skill_value(character, request.skill_name, response.new_value)
        db.commit()
        db.refresh(character)

    return response


@router.get("/character/{character_id}/marked", response_model=SkillExperienceResponse)
def get_marked_skills(
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SkillExperienceResponse:
    """Get all skills marked for growth for a character.

    Args:
        character_id: Character ID.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        SkillExperienceResponse with marked skills.
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

    service = GrowthService(db)
    return service.get_all_skill_experience(character.id)


@router.get("/character/{character_id}/history", response_model=GrowthHistoryResponse)
def get_growth_history(
    character_id: int,
    limit: int = 10,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GrowthHistoryResponse:
    """Get growth history for a character.

    Args:
        character_id: Character ID.
        limit: Maximum number of records to return.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        GrowthHistoryResponse with records.
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

    service = GrowthService(db)
    request = GrowthHistoryRequest(character_id=character.id, limit=limit)
    return service.get_growth_history(request)


@router.post("/preview", response_model=GrowthPreviewResponse)
def preview_growth(
    request: GrowthPreviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GrowthPreviewResponse:
    """Preview potential growth for a skill.

    Shows the chance of success and potential improvement range.

    Args:
        request: Preview request.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        GrowthPreviewResponse with preview info.
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

    current_skill_value = get_skill_value(character, request.skill_name)
    if current_skill_value <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Skill '{request.skill_name}' not found or has no value",
        )

    service = GrowthService(db)
    return service.preview_growth(
        request=request,
        current_skill_value=current_skill_value,
    )


@router.post("/clear-marks")
def clear_all_marks(
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Clear all growth marks for a character.

    Called after performing all growth checks at end of session.

    Args:
        character_id: Character ID.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        Number of marks cleared.
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

    service = GrowthService(db)
    cleared = service.clear_all_marks(character.id)

    return {
        "character_id": character.id,
        "marks_cleared": cleared,
        "message": f"Cleared {cleared} growth marks.",
    }


@router.post("/batch-check")
def perform_batch_growth_checks(
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Perform growth checks for all marked skills.

    Convenience endpoint to process all growth checks at once.

    Args:
        character_id: Character ID.
        current_user: Authenticated user.
        db: Database session.

    Returns:
        Summary of all growth checks performed.
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

    service = GrowthService(db)
    marked_skills = service.get_marked_skills(character.id)

    if not marked_skills:
        return {
            "character_id": character.id,
            "checks_performed": 0,
            "results": [],
            "message": "No skills marked for growth.",
        }

    results = []
    total_improvement = 0

    for skill_exp in marked_skills:
        current_value = get_skill_value(character, skill_exp.skill_name)
        if current_value <= 0:
            continue

        request = GrowthCheckRequest(
            character_id=character.id,
            skill_name=skill_exp.skill_name,
        )

        response = service.perform_growth_check(
            request=request,
            current_skill_value=current_value,
        )

        if response.improvement > 0:
            update_skill_value(character, skill_exp.skill_name, response.new_value)
            total_improvement += response.improvement

        results.append(
            {
                "skill_name": skill_exp.skill_name,
                "previous_value": response.skill_value,
                "roll": response.roll,
                "result": response.result.value,
                "improvement": response.improvement,
                "new_value": response.new_value,
            }
        )

    db.commit()
    db.refresh(character)

    return {
        "character_id": character.id,
        "checks_performed": len(results),
        "total_improvement": total_improvement,
        "results": results,
        "message": f"Performed {len(results)} growth checks. Total improvement: {total_improvement}.",
    }
