"""Item and inventory database models for CoC 7e."""

from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Boolean, Text
from sqlalchemy.sql import func
from src.core.database import Base


class Item(Base):
    """Item catalog model - defines all available items in the game."""

    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, index=True)
    description = Column(Text, nullable=True)
    item_type = Column(String(50), nullable=False, index=True)
    sub_type = Column(String(50), nullable=True)
    rarity = Column(String(20), default="common")
    cost = Column(Integer, default=0)
    weight = Column(Integer, default=0)
    damage = Column(String(50), nullable=True)
    armor_rating = Column(Integer, default=0)
    skill_bonus = Column(JSON, nullable=True)
    attribute_bonus = Column(JSON, nullable=True)
    effects = Column(JSON, nullable=True)
    is_equippable = Column(Boolean, default=False)
    equip_slot = Column(String(50), nullable=True)
    is_consumable = Column(Boolean, default=False)
    uses = Column(Integer, nullable=True)
    image_url = Column(String(512), nullable=True)
    source = Column(String(100), nullable=True)
    is_template = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class InventoryItem(Base):
    """Inventory item - items owned by a character."""

    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    quantity = Column(Integer, default=1)
    is_equipped = Column(Boolean, default=False)
    equip_slot = Column(String(50), nullable=True)
    condition = Column(Integer, default=100)
    notes = Column(Text, nullable=True)
    acquired_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class InventoryLoadout(Base):
    """Named equipment loadouts for quick switching."""

    __tablename__ = "inventory_loadouts"

    id = Column(Integer, primary_key=True, index=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    equipped_items = Column(JSON, nullable=True)
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
