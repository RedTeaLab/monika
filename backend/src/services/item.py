"""Item and inventory service for CoC 7e."""

from typing import Optional
from sqlalchemy.orm import Session

from src.models.item import Item, InventoryItem, InventoryLoadout
from src.models.character import Character
from src.schemas.item import (
    ItemCreate,
    ItemUpdate,
    InventoryItemCreate,
    InventoryItemUpdate,
    UseItemRequest,
    UseItemResponse,
    LoadoutCreate,
)


class ItemService:
    """Service for managing items and inventory."""

    def __init__(self, db: Session):
        self.db = db

    def create_item(self, item_data: ItemCreate) -> Item:
        """Create a new item in the catalog."""
        item = Item(**item_data.model_dump())
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)
        return item

    def get_item(self, item_id: int) -> Optional[Item]:
        """Get an item by ID."""
        return self.db.query(Item).filter(Item.id == item_id).first()

    def get_items(
        self,
        item_type: Optional[str] = None,
        is_equippable: Optional[bool] = None,
        is_template: Optional[bool] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Item], int]:
        """Get items with optional filters."""
        query = self.db.query(Item)

        if item_type:
            query = query.filter(Item.item_type == item_type)
        if is_equippable is not None:
            query = query.filter(Item.is_equippable == is_equippable)
        if is_template is not None:
            query = query.filter(Item.is_template == is_template)

        total = query.count()
        items = query.offset((page - 1) * page_size).limit(page_size).all()

        return items, total

    def update_item(self, item_id: int, item_data: ItemUpdate) -> Optional[Item]:
        """Update an item."""
        item = self.get_item(item_id)
        if not item:
            return None

        update_data = item_data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)

        self.db.commit()
        self.db.refresh(item)
        return item

    def delete_item(self, item_id: int) -> bool:
        """Delete an item."""
        item = self.get_item(item_id)
        if not item:
            return False

        self.db.delete(item)
        self.db.commit()
        return True

    def add_to_inventory(self, data: InventoryItemCreate) -> InventoryItem:
        """Add an item to character's inventory."""
        existing = (
            self.db.query(InventoryItem)
            .filter(
                InventoryItem.character_id == data.character_id,
                InventoryItem.item_id == data.item_id,
                InventoryItem.is_equipped == False,
            )
            .first()
        )

        if existing and not data.is_equipped:
            existing.quantity += data.quantity
            self.db.commit()
            self.db.refresh(existing)
            return existing

        inventory_item = InventoryItem(**data.model_dump())
        self.db.add(inventory_item)
        self.db.commit()
        self.db.refresh(inventory_item)
        return inventory_item

    def get_inventory(self, character_id: int) -> list[InventoryItem]:
        """Get all items in character's inventory."""
        return self.db.query(InventoryItem).filter(InventoryItem.character_id == character_id).all()

    def get_inventory_item(self, inventory_item_id: int) -> Optional[InventoryItem]:
        """Get an inventory item by ID."""
        return self.db.query(InventoryItem).filter(InventoryItem.id == inventory_item_id).first()

    def update_inventory_item(
        self, inventory_item_id: int, data: InventoryItemUpdate
    ) -> Optional[InventoryItem]:
        """Update an inventory item."""
        item = self.get_inventory_item(inventory_item_id)
        if not item:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)

        self.db.commit()
        self.db.refresh(item)
        return item

    def remove_from_inventory(self, inventory_item_id: int, quantity: int = 1) -> bool:
        """Remove items from inventory."""
        item = self.get_inventory_item(inventory_item_id)
        if not item:
            return False

        if item.quantity > quantity:
            item.quantity -= quantity
            self.db.commit()
        else:
            self.db.delete(item)
            self.db.commit()

        return True

    def equip_item(self, inventory_item_id: int) -> Optional[InventoryItem]:
        """Equip an inventory item."""
        item = self.get_inventory_item(inventory_item_id)
        if not item or not item.item.is_equippable:
            return None

        slot = item.item.equip_slot
        if slot:
            equipped = (
                self.db.query(InventoryItem)
                .filter(
                    InventoryItem.character_id == item.character_id,
                    InventoryItem.equip_slot == slot,
                    InventoryItem.is_equipped == True,
                )
                .first()
            )
            if equipped:
                equipped.is_equipped = False

        item.is_equipped = True
        item.equip_slot = slot
        self.db.commit()
        self.db.refresh(item)
        return item

    def unequip_item(self, inventory_item_id: int) -> Optional[InventoryItem]:
        """Unequip an inventory item."""
        item = self.get_inventory_item(inventory_item_id)
        if not item:
            return None

        item.is_equipped = False
        self.db.commit()
        self.db.refresh(item)
        return item

    def use_item(self, request: UseItemRequest) -> UseItemResponse:
        """Use a consumable item."""
        item = self.get_inventory_item(request.inventory_item_id)
        if not item or not item.item.is_consumable:
            return UseItemResponse(
                success=False,
                message="Item not found or not consumable",
            )

        if item.uses is not None and item.uses <= 0:
            return UseItemResponse(
                success=False,
                message="Item has no uses remaining",
            )

        effects = item.item.effects or {}
        remaining_uses = None
        item_destroyed = False

        if item.uses is not None:
            item.uses -= 1
            remaining_uses = item.uses
            if item.uses <= 0:
                self.db.delete(item)
                item_destroyed = True
            else:
                self.db.commit()

        return UseItemResponse(
            success=True,
            message=f"Used {item.item.name}",
            effects_applied=effects,
            remaining_uses=remaining_uses,
            item_destroyed=item_destroyed,
        )

    def get_equipped_items(self, character_id: int) -> list[InventoryItem]:
        """Get all equipped items for a character."""
        return (
            self.db.query(InventoryItem)
            .filter(
                InventoryItem.character_id == character_id,
                InventoryItem.is_equipped == True,
            )
            .all()
        )

    def calculate_total_bonus(self, character_id: int) -> dict:
        """Calculate total bonuses from equipped items."""
        equipped = self.get_equipped_items(character_id)
        total_skill_bonus = {}
        total_attr_bonus = {}
        total_armor = 0

        for item in equipped:
            if item.item.skill_bonus:
                for skill, bonus in item.item.skill_bonus.items():
                    total_skill_bonus[skill] = total_skill_bonus.get(skill, 0) + bonus
            if item.item.attribute_bonus:
                for attr, bonus in item.item.attribute_bonus.items():
                    total_attr_bonus[attr] = total_attr_bonus.get(attr, 0) + bonus
            total_armor += item.item.armor_rating

        return {
            "skill_bonus": total_skill_bonus,
            "attribute_bonus": total_attr_bonus,
            "armor_rating": total_armor,
        }

    def create_loadout(self, data: LoadoutCreate) -> InventoryLoadout:
        """Create a new loadout."""
        loadout = InventoryLoadout(**data.model_dump())
        self.db.add(loadout)
        self.db.commit()
        self.db.refresh(loadout)
        return loadout

    def get_loadouts(self, character_id: int) -> list[InventoryLoadout]:
        """Get all loadouts for a character."""
        return (
            self.db.query(InventoryLoadout)
            .filter(InventoryLoadout.character_id == character_id)
            .all()
        )

    def apply_loadout(self, loadout_id: int) -> bool:
        """Apply a loadout (equip all items in it)."""
        loadout = self.db.query(InventoryLoadout).filter(InventoryLoadout.id == loadout_id).first()
        if not loadout:
            return False

        if loadout.equipped_items:
            for inv_item_id in loadout.equipped_items.values():
                self.equip_item(inv_item_id)

        self.db.query(InventoryLoadout).filter(
            InventoryLoadout.character_id == loadout.character_id
        ).update({"is_active": False})
        loadout.is_active = True
        self.db.commit()

        return True
