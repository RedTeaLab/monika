"""Occupation API routes."""
from typing import List
from fastapi import APIRouter, Depends

from src.core.database import get_db
from src.models.occupation import Occupation
from sqlalchemy.orm import Session

router = APIRouter(prefix="/occupations")


@router.get("/")
def get_occupations(db: Session = Depends(get_db)) -> List[dict]:
    """获取所有职业模板（公开端点）"""
    occupations = db.query(Occupation).all()

    # 转换为字典列表格式
    result = []
    for occ in occupations:
        result.append({
            "id": occ.id,
            "name": occ.name,
            "name_en": occ.name_en,
            "description": occ.description,
            "credit_rating": occ.credit_rating,
            "suggested_attrs": occ.suggested_attrs,
            "occupation_skills": occ.occupation_skills,
            "skill_bonus": occ.skill_bonus,
        })

    return result
