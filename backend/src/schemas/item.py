"""Item and inventory schemas for CoC 7e."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class ItemType(str, Enum):
    """Types of items."""

    WEAPON = "weapon"
    ARMOR = "armor"
    CONSUMABLE = "consumable"
    TOOL = "tool"
    CLOTHING = "clothing"
    DOCUMENT = "document"
    MISC = "misc"


class ItemRarity(str, Enum):
    """Item rarity levels."""

    COMMON = "common"
    UNCOMMON = "uncommon"
    RARE = "rare"
    VERY_RARE = "very_rare"
    LEGENDARY = "legendary"


class EquipSlot(str, Enum):
    """Equipment slots."""

    MAIN_HAND = "main_hand"
    OFF_HAND = "off_hand"
    HEAD = "head"
    BODY = "body"
    HANDS = "hands"
    FEET = "feet"
    ACCESSORY = "accessory"


class ItemBase(BaseModel):
    """Base item schema."""

    name: str
    description: Optional[str] = None
    item_type: ItemType
    sub_type: Optional[str] = None
    rarity: ItemRarity = ItemRarity.COMMON
    cost: int = 0
    weight: int = 0
    damage: Optional[str] = None
    armor_rating: int = 0
    skill_bonus: Optional[dict] = None
    attribute_bonus: Optional[dict] = None
    effects: Optional[dict] = None
    is_equippable: bool = False
    equip_slot: Optional[EquipSlot] = None
    is_consumable: bool = False
    uses: Optional[int] = None
    image_url: Optional[str] = None
    source: Optional[str] = None


class ItemCreate(ItemBase):
    """Schema for creating an item."""

    is_template: bool = False


class ItemUpdate(BaseModel):
    """Schema for updating an item."""

    name: Optional[str] = None
    description: Optional[str] = None
    item_type: Optional[ItemType] = None
    sub_type: Optional[str] = None
    rarity: Optional[ItemRarity] = None
    cost: Optional[int] = None
    weight: Optional[int] = None
    damage: Optional[str] = None
    armor_rating: Optional[int] = None
    skill_bonus: Optional[dict] = None
    attribute_bonus: Optional[dict] = None
    effects: Optional[dict] = None
    is_equippable: Optional[bool] = None
    equip_slot: Optional[EquipSlot] = None
    is_consumable: Optional[bool] = None
    uses: Optional[int] = None
    image_url: Optional[str] = None
    source: Optional[str] = None


class ItemResponse(ItemBase):
    """Item response schema."""

    id: int
    is_template: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class InventoryItemBase(BaseModel):
    """Base inventory item schema."""

    item_id: int
    quantity: int = 1
    is_equipped: bool = False
    equip_slot: Optional[EquipSlot] = None
    condition: int = 100
    notes: Optional[str] = None


class InventoryItemCreate(InventoryItemBase):
    """Schema for adding item to inventory."""

    character_id: int


class InventoryItemUpdate(BaseModel):
    """Schema for updating inventory item."""

    quantity: Optional[int] = None
    is_equipped: Optional[bool] = None
    equip_slot: Optional[EquipSlot] = None
    condition: Optional[int] = None
    notes: Optional[str] = None


class InventoryItemResponse(InventoryItemBase):
    """Inventory item response schema."""

    id: int
    character_id: int
    acquired_at: datetime
    created_at: datetime
    updated_at: datetime
    item: Optional[ItemResponse] = None

    class Config:
        from_attributes = True


class InventoryResponse(BaseModel):
    """Character inventory response."""

    character_id: int
    items: list[InventoryItemResponse]
    total_weight: int
    total_value: int
    equipped_items: list[InventoryItemResponse]
    capacity: int


class UseItemRequest(BaseModel):
    """Request to use an item."""

    character_id: int
    inventory_item_id: int
    target_id: Optional[int] = None
    notes: Optional[str] = None


class UseItemResponse(BaseModel):
    """Response from using an item."""

    success: bool
    message: str
    effects_applied: Optional[dict] = None
    remaining_uses: Optional[int] = None
    item_destroyed: bool = False


class EquipItemRequest(BaseModel):
    """Request to equip/unequip an item."""

    character_id: int
    inventory_item_id: int
    equip: bool = True


class LoadoutCreate(BaseModel):
    """Schema for creating a loadout."""

    character_id: int
    name: str
    equipped_items: Optional[dict] = None


class LoadoutResponse(BaseModel):
    """Loadout response schema."""

    id: int
    character_id: int
    name: str
    equipped_items: Optional[dict]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ItemCatalogResponse(BaseModel):
    """Response for item catalog."""

    items: list[ItemResponse]
    total: int
    page: int
    page_size: int
