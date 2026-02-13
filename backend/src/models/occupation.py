"""Occupation template model for CoC 7e."""
from sqlalchemy import Column, String, JSON, Integer

from src.core.database import Base


class Occupation(Base):
    """CoC 7e 职业模板模型"""
    __tablename__ = "occupations"

    id = Column(String(50), primary_key=True)  # 职业代码
    name = Column(String(100), nullable=False)  # 职业名称
    name_en = Column(String(100))  # 英文名称
    description = Column(String(500))  # 职业描述
    credit_rating = Column(String(20))  # 信用评级范围，如 "30-80"
    suggested_attrs = Column(JSON)  # 推荐属性 ["dex", "int", "edu"]
    occupation_skills = Column(JSON)  # 职业特长技能 ["Spot Hidden", "Psychology"]
    skill_bonus = Column(Integer, default=0)  # 技能点数奖励
