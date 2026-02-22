"""Item and inventory API routes."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from src.core.auth import get_current_user
from src.core.database import get_db
from src.models.character import Character
from src.models.user import User
from src.schemas.item import (
    ItemCreate,
    ItemUpdate,
    ItemResponse,
    InventoryItemCreate,
    InventoryItemUpdate,
    InventoryItemResponse,
    InventoryResponse,
    UseItemRequest,
    UseItemResponse,
    EquipItemRequest,
    LoadoutCreate,
    LoadoutResponse,
    ItemCatalogResponse,
)
from src.services.item import ItemService

router = APIRouter(prefix="/items", tags=["items"])


@router.post("/", response_model=ItemResponse)
def create_item(
    item_data: ItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ItemResponse:
    """Create a new item in the catalog."""
    service = ItemService(db)
    item = service.create_item(item_data)
    return item


@router.get("/", response_model=ItemCatalogResponse)
def list_items(
    item_type: Optional[str] = Query(None, description="Filter by item type"),
    is_equippable: Optional[bool] = Query(None, description="Filter by equippable"),
    is_template: Optional[bool] = Query(None, description="Show templates only"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ItemCatalogResponse:
    """List items with optional filters."""
    service = ItemService(db)
    items, total = service.get_items(
        item_type=item_type,
        is_equippable=is_equippable,
        is_template=is_template,
        page=page,
        page_size=page_size,
    )
    return ItemCatalogResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{item_id}", response_model=ItemResponse)
def get_item(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ItemResponse:
    """Get an item by ID."""
    service = ItemService(db)
    item = service.get_item(item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found",
        )
    return item


@router.put("/{item_id}", response_model=ItemResponse)
def update_item(
    item_id: int,
    item_data: ItemUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ItemResponse:
    """Update an item."""
    service = ItemService(db)
    item = service.update_item(item_id, item_data)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found",
        )
    return item


@router.delete("/{item_id}")
def delete_item(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Delete an item."""
    service = ItemService(db)
    if not service.delete_item(item_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found",
        )
    return {"message": "Item deleted"}


@router.post("/inventory", response_model=InventoryItemResponse)
def add_to_inventory(
    data: InventoryItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InventoryItemResponse:
    """Add an item to character's inventory."""
    character = (
        db.query(Character)
        .filter(Character.id == data.character_id, Character.owner_id == current_user.id)
        .first()
    )
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found",
        )

    service = ItemService(db)
    item = service.add_to_inventory(data)

    result = InventoryItemResponse(
        id=item.id,
        character_id=item.character_id,
        item_id=item.item_id,
        quantity=item.quantity,
        is_equipped=item.is_equipped,
        equip_slot=item.equip_slot,
        condition=item.condition,
        notes=item.notes,
        acquired_at=item.acquired_at,
        created_at=item.created_at,
        updated_at=item.updated_at,
        item=service.get_item(item.item_id),
    )
    return result


@router.get("/inventory/{character_id}", response_model=InventoryResponse)
def get_inventory(
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InventoryResponse:
    """Get character's inventory."""
    character = (
        db.query(Character)
        .filter(Character.id == character_id, Character.owner_id == current_user.id)
        .first()
    )
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found",
        )

    service = ItemService(db)
    items = service.get_inventory(character_id)
    equipped = service.get_equipped_items(character_id)
    total_weight = sum(i.item.weight * i.quantity for i in items)
    total_value = sum(i.item.cost * i.quantity for i in items)

    inventory_items = []
    for item in items:
        inventory_items.append(
            InventoryItemResponse(
                id=item.id,
                character_id=item.character_id,
                item_id=item.item_id,
                quantity=item.quantity,
                is_equipped=item.is_equipped,
                equip_slot=item.equip_slot,
                condition=item.condition,
                notes=item.notes,
                acquired_at=item.acquired_at,
                created_at=item.created_at,
                updated_at=item.updated_at,
                item=service.get_item(item.item_id),
            )
        )

    equipped_items = []
    for item in equipped:
        equipped_items.append(
            InventoryItemResponse(
                id=item.id,
                character_id=item.character_id,
                item_id=item.item_id,
                quantity=item.quantity,
                is_equipped=item.is_equipped,
                equip_slot=item.equip_slot,
                condition=item.condition,
                notes=item.notes,
                acquired_at=item.acquired_at,
                created_at=item.created_at,
                updated_at=item.updated_at,
                item=service.get_item(item.item_id),
            )
        )

    return InventoryResponse(
        character_id=character_id,
        items=inventory_items,
        total_weight=total_weight,
        total_value=total_value,
        equipped_items=equipped_items,
        capacity=100,
    )


@router.put("/inventory/{inventory_item_id}", response_model=InventoryItemResponse)
def update_inventory_item(
    inventory_item_id: int,
    data: InventoryItemUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InventoryItemResponse:
    """Update an inventory item."""
    service = ItemService(db)
    item = service.update_inventory_item(inventory_item_id, data)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventory item not found",
        )

    return InventoryItemResponse(
        id=item.id,
        character_id=item.character_id,
        item_id=item.item_id,
        quantity=item.quantity,
        is_equipped=item.is_equipped,
        equip_slot=item.equip_slot,
        condition=item.condition,
        notes=item.notes,
        acquired_at=item.acquired_at,
        created_at=item.created_at,
        updated_at=item.updated_at,
        item=service.get_item(item.item_id),
    )


@router.delete("/inventory/{inventory_item_id}")
def remove_inventory_item(
    inventory_item_id: int,
    quantity: int = Query(1, ge=1),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Remove items from inventory."""
    service = ItemService(db)
    if not service.remove_from_inventory(inventory_item_id, quantity):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventory item not found",
        )
    return {"message": f"Removed {quantity} item(s)"}


@router.post("/equip", response_model=InventoryItemResponse)
def equip_item(
    request: EquipItemRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InventoryItemResponse:
    """Equip or unequip an item."""
    character = (
        db.query(Character)
        .filter(Character.id == request.character_id, Character.owner_id == current_user.id)
        .first()
    )
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found",
        )

    service = ItemService(db)
    if request.equip:
        item = service.equip_item(request.inventory_item_id)
    else:
        item = service.unequip_item(request.inventory_item_id)

    if not item:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Item cannot be equipped or is not in inventory",
        )

    return InventoryItemResponse(
        id=item.id,
        character_id=item.character_id,
        item_id=item.item_id,
        quantity=item.quantity,
        is_equipped=item.is_equipped,
        equip_slot=item.equip_slot,
        condition=item.condition,
        notes=item.notes,
        acquired_at=item.acquired_at,
        created_at=item.created_at,
        updated_at=item.updated_at,
        item=service.get_item(item.item_id),
    )


@router.post("/use", response_model=UseItemResponse)
def use_item(
    request: UseItemRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UseItemResponse:
    """Use a consumable item."""
    character = (
        db.query(Character)
        .filter(Character.id == request.character_id, Character.owner_id == current_user.id)
        .first()
    )
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found",
        )

    service = ItemService(db)
    return service.use_item(request)


@router.get("/equipped/{character_id}")
def get_equipped_items(
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Get equipped items for a character."""
    character = (
        db.query(Character)
        .filter(Character.id == character_id, Character.owner_id == current_user.id)
        .first()
    )
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found",
        )

    service = ItemService(db)
    equipped = service.get_equipped_items(character_id)
    bonuses = service.calculate_total_bonus(character_id)

    return {
        "equipped": equipped,
        "bonuses": bonuses,
    }


@router.post("/loadouts", response_model=LoadoutResponse)
def create_loadout(
    data: LoadoutCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LoadoutResponse:
    """Create a new loadout."""
    character = (
        db.query(Character)
        .filter(Character.id == data.character_id, Character.owner_id == current_user.id)
        .first()
    )
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found",
        )

    service = ItemService(db)
    return service.create_loadout(data)


@router.get("/loadouts/{character_id}")
def get_loadouts(
    character_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[LoadoutResponse]:
    """Get all loadouts for a character."""
    character = (
        db.query(Character)
        .filter(Character.id == character_id, Character.owner_id == current_user.id)
        .first()
    )
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found",
        )

    service = ItemService(db)
    return service.get_loadouts(character_id)


@router.post("/loadouts/{loadout_id}/apply")
def apply_loadout(
    loadout_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Apply a loadout."""
    service = ItemService(db)
    if not service.apply_loadout(loadout_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Loadout not found",
        )
    return {"message": "Loadout applied"}
