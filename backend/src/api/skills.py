"""Skill API endpoints."""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_

from src.core.database import get_db
from src.models.skill import Skill, SkillCategory
from src.schemas.skill import (
    SkillCreate,
    SkillUpdate,
    SkillResponse,
    SkillListResponse,
    SkillCategoryResponse,
    SkillForAI,
)

router = APIRouter(prefix="/skills", tags=["skills"])


@router.get("", response_model=SkillListResponse)
def list_skills(
    era: Optional[str] = Query(None, description="Filter by era: 'modern' or '1920s'"),
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search by name"),
    include_specializations: bool = Query(False, description="Include specialization skills"),
    db: Session = Depends(get_db),
):
    """List all skills with optional filters."""
    import logging

    logger = logging.getLogger(__name__)
    logger.info(
        f"list_skills called: era={era}, category={category}, search={search}, include_specializations={include_specializations}"
    )

    try:
        query = db.query(Skill).options(joinedload(Skill.specializations))

        # Only show base skills (not specializations) by default
        if not include_specializations:
            query = query.filter(Skill.parent_skill_id == None)

        # Era filter
        if era == "modern":
            query = query.filter(Skill.available_modern == True)
        elif era == "1920s":
            query = query.filter(Skill.available_1920s == True)

        # Category filter
        if category:
            query = query.filter(Skill.category == category)

        # Search
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(Skill.name.ilike(search_term), Skill.name_en.ilike(search_term))
            )

        # Order by category, then name
        query = query.order_by(Skill.category, Skill.name)

        skills = query.all()
        total = len(skills)

        logger.info(f"Found {total} skills")

        return SkillListResponse(
            skills=[SkillResponse.model_validate(skill) for skill in skills], total=total
        )
    except Exception as e:
        logger.error(f"Error in list_skills: {e}", exc_info=True)
        raise


@router.get("/categories", response_model=List[SkillCategoryResponse])
def list_categories(db: Session = Depends(get_db)):
    """List all skill categories."""
    categories = db.query(SkillCategory).order_by(SkillCategory.sort_order).all()
    return [SkillCategoryResponse.model_validate(cat) for cat in categories]


@router.get("/name/{skill_name}", response_model=SkillResponse)
def get_skill_by_name(skill_name: str, db: Session = Depends(get_db)):
    """Get a skill by name (matches both Chinese and English names)."""
    skill = (
        db.query(Skill)
        .options(joinedload(Skill.specializations))
        .filter(or_(Skill.name == skill_name, Skill.name_en == skill_name))
        .first()
    )
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return SkillResponse.model_validate(skill)


@router.get("/ai-reference/{skill_name}", response_model=SkillForAI)
def get_skill_for_ai(skill_name: str, db: Session = Depends(get_db)):
    """Get detailed skill info for AI reference (matches both Chinese and English names)."""
    skill = (
        db.query(Skill).filter(or_(Skill.name == skill_name, Skill.name_en == skill_name)).first()
    )
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    # Get specialization names
    spec_names = [s.name for s in skill.specializations]

    return SkillForAI(
        id=skill.id,
        name=skill.name,
        name_en=skill.name_en,
        base_value=skill.base_value,
        category=skill.category,
        description=skill.description,
        difficulty_levels=skill.difficulty_levels,
        push_examples=skill.push_examples,
        push_failure_examples=skill.push_failure_examples,
        opposing_skills=skill.opposing_skills,
        specializations=spec_names,
    )


@router.get("/{skill_id}", response_model=SkillResponse)
def get_skill(skill_id: int, db: Session = Depends(get_db)):
    """Get a single skill by ID."""
    skill = (
        db.query(Skill)
        .options(joinedload(Skill.specializations))
        .filter(Skill.id == skill_id)
        .first()
    )
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return SkillResponse.model_validate(skill)


@router.post("", response_model=SkillResponse)
def create_skill(skill_data: SkillCreate, db: Session = Depends(get_db)):
    """Create a new skill."""
    # Check if skill already exists
    existing = db.query(Skill).filter(Skill.name == skill_data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Skill already exists")

    skill = Skill(**skill_data.model_dump())
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return SkillResponse.model_validate(skill)


@router.put("/{skill_id}", response_model=SkillResponse)
def update_skill(skill_id: int, skill_data: SkillUpdate, db: Session = Depends(get_db)):
    """Update a skill."""
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    update_data = skill_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(skill, key, value)

    db.commit()
    db.refresh(skill)
    return SkillResponse.model_validate(skill)


@router.delete("/{skill_id}")
def delete_skill(skill_id: int, db: Session = Depends(get_db)):
    """Delete a skill."""
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    db.delete(skill)
    db.commit()
    return {"message": "Skill deleted successfully"}
