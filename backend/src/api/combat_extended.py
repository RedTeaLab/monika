"""Extended combat API routes."""

from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.core.auth import get_current_user
from src.core.database import get_db
from src.models.user import User
from src.services.combat_extended import ExtendedCombatService, ArmorType

router = APIRouter(prefix="/combat/extended", tags=["combat-extended"])


class DodgeAttackRequest(BaseModel):
    """Request to resolve attack with dodge."""

    combat_id: str
    attacker_id: str
    target_id: str
    attack_skill: int
    target_dodge_skill: int
    attack_roll: Optional[int] = None
    dodge_roll: Optional[int] = None
    damage_roll: Optional[int] = None
    damage_bonus: int = 0


class BlockAttackRequest(BaseModel):
    """Request to resolve attack with block."""

    combat_id: str
    attacker_id: str
    target_id: str
    attack_skill: int
    target_fighting_skill: int
    attack_roll: Optional[int] = None
    block_roll: Optional[int] = None
    damage_roll: Optional[int] = None
    damage_bonus: int = 0


class ArmorAttackRequest(BaseModel):
    """Request to resolve attack with armor."""

    combat_id: str
    attacker_id: str
    target_id: str
    attack_skill: int
    armor: str = "none"
    attack_roll: Optional[int] = None
    damage_roll: Optional[int] = None
    damage_bonus: int = 0


class AOEAttackRequest(BaseModel):
    """Request to resolve AoE attack."""

    combat_id: str
    attacker_id: str
    target_ids: List[str]
    attack_skill: int
    damage_dice: str = "1d6"
    damage_bonus: int = 0
    attack_roll: Optional[int] = None


@router.post("/dodge")
def resolve_attack_with_dodge(
    request: DodgeAttackRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Resolve an attack with dodge opportunity."""
    import uuid

    service = ExtendedCombatService(db)
    try:
        return service.resolve_attack_with_dodge(
            combat_id=uuid.UUID(request.combat_id),
            attacker_id=uuid.UUID(request.attacker_id),
            target_id=uuid.UUID(request.target_id),
            attack_skill=request.attack_skill,
            target_dodge_skill=request.target_dodge_skill,
            attack_roll=request.attack_roll,
            dodge_roll=request.dodge_roll,
            damage_roll=request.damage_roll,
            damage_bonus=request.damage_bonus,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/block")
def resolve_attack_with_block(
    request: BlockAttackRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Resolve an attack with block/counter attack."""
    import uuid

    service = ExtendedCombatService(db)
    try:
        return service.resolve_attack_with_block(
            combat_id=uuid.UUID(request.combat_id),
            attacker_id=uuid.UUID(request.attacker_id),
            target_id=uuid.UUID(request.target_id),
            attack_skill=request.attack_skill,
            target_fighting_skill=request.target_fighting_skill,
            attack_roll=request.attack_roll,
            block_roll=request.block_roll,
            damage_roll=request.damage_roll,
            damage_bonus=request.damage_bonus,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/armor")
def resolve_attack_with_armor(
    request: ArmorAttackRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Resolve an attack with armor damage reduction."""
    import uuid

    service = ExtendedCombatService(db)
    try:
        armor_type = ArmorType(request.armor)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid armor type: {request.armor}"
        )

    try:
        return service.resolve_attack_with_armor(
            combat_id=uuid.UUID(request.combat_id),
            attacker_id=uuid.UUID(request.attacker_id),
            target_id=uuid.UUID(request.target_id),
            attack_skill=request.attack_skill,
            armor=armor_type,
            attack_roll=request.attack_roll,
            damage_roll=request.damage_roll,
            damage_bonus=request.damage_bonus,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/aoe")
def resolve_aoe_attack(
    request: AOEAttackRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Resolve an area of effect attack."""
    import uuid

    service = ExtendedCombatService(db)
    try:
        return service.resolve_aoe_attack(
            combat_id=uuid.UUID(request.combat_id),
            attacker_id=uuid.UUID(request.attacker_id),
            target_ids=[uuid.UUID(tid) for tid in request.target_ids],
            attack_skill=request.attack_skill,
            damage_dice=request.damage_dice,
            damage_bonus=request.damage_bonus,
            attack_roll=request.attack_roll,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{combat_id}/check-end")
def check_combat_end(
    combat_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check if combat should end."""
    import uuid

    service = ExtendedCombatService(db)
    try:
        return service.check_combat_end(uuid.UUID(combat_id))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{combat_id}/report")
def generate_combat_report(
    combat_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a detailed combat report."""
    import uuid

    service = ExtendedCombatService(db)
    try:
        return service.generate_combat_report(uuid.UUID(combat_id))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/armor-types")
def list_armor_types():
    """List all armor types with their damage reduction values."""
    from src.services.combat_extended import ARMOR_VALUES

    return {
        armor_type.value: {
            "name": armor_type.value.title(),
            "damage_reduction": value,
        }
        for armor_type, value in ARMOR_VALUES.items()
    }
