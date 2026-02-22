"""Character API routes."""

from typing import List, Dict, Any, Optional
import json
import secrets
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from src.core.auth import get_current_user
from src.core.database import get_db
from src.models.character import Character
from src.models.occupation import Occupation
from src.models.user import User
from src.schemas.character import CharacterCreate, CharacterUpdate
from src.services.character_generator import CharacterGenerator, CharacterGenerationRequest

router = APIRouter(prefix="/characters", tags=["characters"])


def character_to_dict(character: Character) -> Dict[str, Any]:
    """Convert Character ORM object to dict."""
    return {
        "id": character.id,
        "owner_id": character.owner_id,
        "name": character.name,
        "age": character.age,
        "gender": character.gender,
        "occupation": character.occupation,
        "mental_illness": character.mental_illness,
        "backstory": character.backstory,
        "str": character.str,
        "con": character.con,
        "dex": character.dex,
        "app": character.app,
        "pow": character.pow,
        "int": character.int,
        "siz": character.siz,
        "edu": character.edu,
        "hp": character.hp,
        "mp": character.mp,
        "san": character.san,
        "max_san": character.max_san,
        "luck": character.luck,
        "is_favorite": character.is_favorite,
        "is_template": character.is_template,
        "is_public": character.is_public,
        "share_code": character.share_code,
        "portrait_url": character.portrait_url,
        "tags": character.tags or [],
        "created_at": character.created_at.isoformat() if character.created_at else None,
        "updated_at": character.updated_at.isoformat() if character.updated_at else None,
    }


@router.post("")
def create_character(
    character_data: CharacterCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new character."""
    character = Character(
        owner_id=current_user.id,
        name=character_data.name,
        age=character_data.age,
        gender=character_data.gender,
        occupation=character_data.occupation,
        mental_illness=character_data.mental_illness,
        backstory=character_data.backstory,
        str=character_data.str,
        con=character_data.con,
        dex=character_data.dex,
        app=character_data.app,
        pow=character_data.pow,
        int=character_data.intelligence,  # Map intelligence to int
        siz=character_data.siz,
        edu=character_data.edu,
        hp=character_data.hp,
        mp=character_data.mp,
        san=character_data.san,
        max_san=character_data.max_san,
        luck=character_data.luck,
    )
    db.add(character)
    db.commit()
    db.refresh(character)
    return character_to_dict(character)


@router.get("")
def list_characters(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all characters for the current user."""
    characters = db.query(Character).filter(Character.owner_id == current_user.id).all()
    return [character_to_dict(c) for c in characters]


@router.get("/{character_id}")
def get_character(
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific character."""
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
    return character_to_dict(character)


@router.put("/{character_id}")
def update_character(
    character_id: int,
    character_data: CharacterUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a character."""
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

    # Update fields
    update_data = character_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        # Map intelligence to int
        if field == "intelligence":
            field = "int"
        setattr(character, field, value)

    db.commit()
    db.refresh(character)
    return character_to_dict(character)


@router.delete("/{character_id}")
def delete_character(
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a character."""
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

    db.delete(character)
    db.commit()
    return {"message": "Character deleted successfully"}


@router.get("/{character_id}")
def validate_character(
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Validate character against CoC 7e rules."""
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

    # 规则验证结果
    errors = []
    warnings = []

    # 1. 检查属性范围
    for attr in ["str", "con", "dex", "app", "pow", "int", "siz", "edu"]:
        value = getattr(character, attr, 0)
        if value < 0 or value > 100:
            errors.append({"field": attr, "message": f"{attr} 必须在 0-100 之间"})

    # 2. 检查技能点数
    if character.skills:
        total_points = sum(character.skills.values())
        max_points = (character.edu * 20) + 50  # 基础 EDU × 20
        if total_points > max_points:
            errors.append(
                {"field": "skills", "message": f"技能点数 {total_points} 超过最大值 {max_points}"}
            )

    # 3. 年龄修正检查
    if character.age < 15:
        warnings.append({"field": "age", "message": "年龄 15 岁以下会获得 -5 点数修正"})
    elif character.age > 40:
        errors.append({"field": "age", "message": "年龄 40 岁上会失去 -5 点数修正"})

    # 4. 职业设置检查
    if not character.occupation and character.skills:
        warnings.append({"field": "occupation", "message": "角色没有选择职业"})

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "can_start_game": len(errors) == 0 and len(warnings) == 0,
    }


@router.post("/{character_id}/favorite")
def toggle_favorite(
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Toggle character favorite status."""
    character = db.scalar(
        select(Character).where(Character.id == character_id, Character.owner_id == current_user.id)
    )
    if not character:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")

    character.is_favorite = not character.is_favorite
    db.commit()
    db.refresh(character)

    return {"is_favorite": character.is_favorite}


@router.post("/{character_id}/share")
def create_share_link(
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a share link for character."""
    character = db.scalar(
        select(Character).where(Character.id == character_id, Character.owner_id == current_user.id)
    )
    if not character:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")

    if not character.share_code:
        character.share_code = secrets.token_urlsafe(8)
        character.is_public = True
        db.commit()
        db.refresh(character)

    return {
        "share_code": character.share_code,
        "share_url": f"/shared/character/{character.share_code}",
    }


@router.get("/shared/{share_code}")
def get_shared_character(
    share_code: str,
    db: Session = Depends(get_db),
):
    """Get a shared character by share code."""
    character = db.scalar(
        select(Character).where(Character.share_code == share_code, Character.is_public == True)
    )
    if not character:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")

    return character_to_dict(character)


@router.post("/shared/{share_code}/copy")
def copy_shared_character(
    share_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Copy a shared character to user's library."""
    original = db.scalar(
        select(Character).where(Character.share_code == share_code, Character.is_public == True)
    )
    if not original:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")

    new_char = Character(
        owner_id=current_user.id,
        name=original.name,
        age=original.age,
        gender=original.gender,
        occupation=original.occupation,
        mental_illness=original.mental_illness,
        backstory=original.backstory,
        str=original.str,
        con=original.con,
        dex=original.dex,
        app=original.app,
        pow=original.pow,
        int=original.int,
        siz=original.siz,
        edu=original.edu,
        hp=original.hp,
        mp=original.mp,
        san=original.san,
        max_san=original.max_san,
        luck=original.luck,
        skills=original.skills,
        template_source_id=original.id,
    )
    db.add(new_char)
    db.commit()
    db.refresh(new_char)

    return character_to_dict(new_char)


@router.get("/templates")
def list_templates(
    db: Session = Depends(get_db),
):
    """List all public character templates."""
    templates = db.scalars(
        select(Character).where(Character.is_template == True, Character.is_public == True)
    ).all()
    return [character_to_dict(t) for t in templates]


@router.post("/{character_id}/template")
def set_as_template(
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Set character as a template."""
    character = db.scalar(
        select(Character).where(Character.id == character_id, Character.owner_id == current_user.id)
    )
    if not character:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")

    character.is_template = True
    character.is_public = True
    db.commit()

    return {"is_template": True}


@router.post("/generate")
async def generate_character(
    request: CharacterGenerationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a new character with AI assistance."""
    from src.core.config import settings
    from src.services.llm.openai import OpenAIProvider

    llm_provider = None
    try:
        if hasattr(settings, "OPENAI_API_KEY") and settings.OPENAI_API_KEY:
            llm_provider = OpenAIProvider(
                api_key=settings.OPENAI_API_KEY,
                model=getattr(settings, "OPENAI_MODEL", "gpt-4o-mini"),
                base_url=getattr(settings, "OPENAI_BASE_URL", None),
            )
    except Exception as e:
        pass

    generator = CharacterGenerator(llm_provider)

    if request.backstory:
        generated = await generator.generate_with_ai(request, llm_provider)
    else:
        generated = generator.generate_quick(request.occupation)

    character = Character(
        owner_id=current_user.id,
        name=generated.name,
        age=generated.age,
        gender=generated.gender,
        occupation=generated.occupation,
        backstory=generated.backstory,
        str=generated.str_stat,
        con=generated.con_stat,
        dex=generated.dex_stat,
        app=generated.app_stat,
        pow=generated.pow_stat,
        int=generated.int_stat,
        siz=generated.siz_stat,
        edu=generated.edu_stat,
        hp=generated.hp,
        mp=generated.mp,
        san=generated.san,
        max_san=99,
        luck=generated.luck,
        skills=generated.skills,
        interests=generated.interests,
        languages=generated.languages,
    )
    db.add(character)
    db.commit()
    db.refresh(character)

    return {
        "character": character_to_dict(character),
        "personality_traits": generated.personality_traits,
        "motivations": generated.motivations,
    }


@router.post("/generate/preview")
async def preview_generation(
    request: CharacterGenerationRequest,
):
    """Preview a generated character without saving."""
    from src.core.config import settings
    from src.services.llm.openai import OpenAIProvider

    llm_provider = None
    try:
        if hasattr(settings, "OPENAI_API_KEY") and settings.OPENAI_API_KEY:
            llm_provider = OpenAIProvider(
                api_key=settings.OPENAI_API_KEY,
                model=getattr(settings, "OPENAI_MODEL", "gpt-4o-mini"),
                base_url=getattr(settings, "OPENAI_BASE_URL", None),
            )
    except Exception:
        pass

    generator = CharacterGenerator(llm_provider)

    if request.backstory:
        generated = await generator.generate_with_ai(request, llm_provider)
    else:
        generated = generator.generate_quick(request.occupation)

    return generated.model_dump()
