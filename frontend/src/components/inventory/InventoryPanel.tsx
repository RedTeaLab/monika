import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Package,
  Sword,
  Shield,
  FlaskRound,
  Hammer,
  Shirt,
  FileText,
  MoreHorizontal,
  Plus,
  Minus,
  Zap,
  Heart,
  Weight,
  DollarSign,
} from "lucide-react"
import { cn } from "@/lib/utils"

export type ItemType = "weapon" | "armor" | "consumable" | "tool" | "clothing" | "document" | "misc"
export type ItemRarity = "common" | "uncommon" | "rare" | "very_rare" | "legendary"
export type EquipSlot = "main_hand" | "off_hand" | "head" | "body" | "hands" | "feet" | "accessory"

export interface Item {
  id: number
  name: string
  description?: string
  itemType: ItemType
  subType?: string
  rarity: ItemRarity
  cost: number
  weight: number
  damage?: string
  armorRating: number
  skillBonus?: Record<string, number>
  attributeBonus?: Record<string, number>
  effects?: Record<string, unknown>
  isEquippable: boolean
  equipSlot?: EquipSlot
  isConsumable: boolean
  uses?: number
  imageUrl?: string
}

export interface InventoryItem {
  id: number
  characterId: number
  itemId: number
  quantity: number
  isEquipped: boolean
  equipSlot?: EquipSlot
  condition: number
  notes?: string
  item: Item
}

export interface InventoryResponse {
  characterId: number
  items: InventoryItem[]
  totalWeight: number
  totalValue: number
  equippedItems: InventoryItem[]
  capacity: number
}

interface InventoryPanelProps {
  inventory?: InventoryResponse
  onUseItem?: (itemId: number) => Promise<void>
  onEquipItem?: (itemId: number, equip: boolean) => Promise<void>
  onRemoveItem?: (itemId: number, quantity: number) => Promise<void>
  onAddItem?: () => void
  className?: string
  isLoading?: boolean
}

const ITEM_ICONS: Record<ItemType, React.ElementType> = {
  weapon: Sword,
  armor: Shield,
  consumable: FlaskRound,
  tool: Hammer,
  clothing: Shirt,
  document: FileText,
  misc: Package,
}

const RARITY_COLORS: Record<ItemRarity, string> = {
  common: "text-gray-600 dark:text-gray-400",
  uncommon: "text-green-600 dark:text-green-400",
  rare: "text-blue-600 dark:text-blue-400",
  very_rare: "text-purple-600 dark:text-purple-400",
  legendary: "text-orange-600 dark:text-orange-400",
}

const SLOT_LABELS: Record<EquipSlot, string> = {
  main_hand: "Main Hand",
  off_hand: "Off Hand",
  head: "Head",
  body: "Body",
  hands: "Hands",
  feet: "Feet",
  accessory: "Accessory",
}

export function InventoryPanel({
  inventory,
  onUseItem,
  onEquipItem,
  onRemoveItem,
  onAddItem,
  className,
  isLoading = false,
}: InventoryPanelProps) {
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [showItemDialog, setShowItemDialog] = useState(false)

  if (!inventory) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Package className="h-4 w-4" />
            Inventory
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground text-center py-4">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No inventory data</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const handleItemClick = (item: InventoryItem) => {
    setSelectedItem(item)
    setShowItemDialog(true)
  }

  const handleUse = async () => {
    if (selectedItem && onUseItem) {
      await onUseItem(selectedItem.id)
      setShowItemDialog(false)
    }
  }

  const handleEquip = async () => {
    if (selectedItem && onEquipItem) {
      await onEquipItem(selectedItem.id, !selectedItem.isEquipped)
      setShowItemDialog(false)
    }
  }

  const handleRemove = async () => {
    if (selectedItem && onRemoveItem) {
      await onRemoveItem(selectedItem.id, 1)
      setShowItemDialog(false)
    }
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            <span>Inventory</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              <Weight className="h-3 w-3 mr-1" />
              {inventory.totalWeight}/{inventory.capacity}
            </Badge>
            <Badge variant="outline" className="text-xs">
              <DollarSign className="h-3 w-3 mr-1" />
              {inventory.totalValue}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="all">All ({inventory.items.length})</TabsTrigger>
            <TabsTrigger value="equipped">Equipped ({inventory.equippedItems.length})</TabsTrigger>
            <TabsTrigger value="consumables">
              Consumables ({inventory.items.filter((i) => i.item.isConsumable).length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-2">
            <ScrollArea style={{ height: "300px" }}>
              <ItemGrid
                items={inventory.items}
                onItemClick={handleItemClick}
              />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="equipped" className="mt-2">
            <ScrollArea style={{ height: "300px" }}>
              <ItemGrid
                items={inventory.equippedItems}
                onItemClick={handleItemClick}
                emptyMessage="No items equipped"
              />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="consumables" className="mt-2">
            <ScrollArea style={{ height: "300px" }}>
              <ItemGrid
                items={inventory.items.filter((i) => i.item.isConsumable)}
                onItemClick={handleItemClick}
                emptyMessage="No consumables"
              />
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {onAddItem && (
          <Button variant="outline" size="sm" className="w-full mt-2" onClick={onAddItem}>
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        )}
      </CardContent>

      <Dialog open={showItemDialog} onOpenChange={setShowItemDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedItem && (
                <>
                  {(() => {
                    const Icon = ITEM_ICONS[selectedItem.item.itemType]
                    return <Icon className="h-5 w-5" />
                  })()}
                  {selectedItem.item.name}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedItem?.item.description || "No description"}
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-3 py-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{selectedItem.item.itemType}</Badge>
                <Badge variant="outline" className={RARITY_COLORS[selectedItem.item.rarity]}>
                  {selectedItem.item.rarity}
                </Badge>
                {selectedItem.isEquipped && (
                  <Badge variant="default">Equipped</Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                {selectedItem.item.damage && (
                  <div className="flex items-center gap-1">
                    <Sword className="h-4 w-4 text-red-500" />
                    <span>Damage: {selectedItem.item.damage}</span>
                  </div>
                )}
                {selectedItem.item.armorRating > 0 && (
                  <div className="flex items-center gap-1">
                    <Shield className="h-4 w-4 text-blue-500" />
                    <span>Armor: {selectedItem.item.armorRating}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Weight className="h-4 w-4" />
                  <span>Weight: {selectedItem.item.weight}</span>
                </div>
                <div className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4" />
                  <span>Value: ${selectedItem.item.cost}</span>
                </div>
                {selectedItem.item.uses !== undefined && (
                  <div className="flex items-center gap-1">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    <span>Uses: {selectedItem.item.uses}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Package className="h-4 w-4" />
                  <span>Qty: {selectedItem.quantity}</span>
                </div>
              </div>

              {selectedItem.item.skillBonus && Object.keys(selectedItem.item.skillBonus).length > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Skill Bonuses:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(selectedItem.item.skillBonus).map(([skill, bonus]) => (
                      <Badge key={skill} variant="secondary">
                        {skill}: +{bonus}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedItem.item.attributeBonus && Object.keys(selectedItem.item.attributeBonus).length > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Attribute Bonuses:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(selectedItem.item.attributeBonus).map(([attr, bonus]) => (
                      <Badge key={attr} variant="secondary">
                        {attr}: +{bonus}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedItem.condition < 100 && (
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 text-red-500" />
                  <span className="text-sm">Condition: {selectedItem.condition}%</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="sm:justify-between">
            {selectedItem && onRemoveItem && (
              <Button variant="destructive" size="sm" onClick={handleRemove}>
                <Minus className="h-4 w-4 mr-1" />
                Remove
              </Button>
            )}
            <div className="flex gap-2">
              {selectedItem?.item.isConsumable && onUseItem && (
                <Button variant="default" size="sm" onClick={handleUse}>
                  <Zap className="h-4 w-4 mr-1" />
                  Use
                </Button>
              )}
              {selectedItem?.item.isEquippable && onEquipItem && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleEquip}
                >
                  {selectedItem.isEquipped ? "Unequip" : "Equip"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function ItemGrid({
  items,
  onItemClick,
  emptyMessage = "No items",
}: {
  items: InventoryItem[]
  onItemClick: (item: InventoryItem) => void
  emptyMessage?: string
}) {
  if (items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((invItem) => {
        const Icon = ITEM_ICONS[invItem.item.itemType]
        return (
          <div
            key={invItem.id}
            className={cn(
              "p-2 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50",
              invItem.isEquipped && "border-primary bg-primary/5"
            )}
            onClick={() => onItemClick(invItem)}
          >
            <div className="flex items-start gap-2">
              <div className="p-1.5 rounded bg-muted">
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium truncate">{invItem.item.name}</span>
                  {invItem.quantity > 1 && (
                    <Badge variant="outline" className="text-xs">
                      x{invItem.quantity}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {invItem.item.damage && <span className="text-red-500">{invItem.item.damage}</span>}
                  {invItem.item.armorRating > 0 && (
                    <span className="text-blue-500">+{invItem.item.armorRating} AR</span>
                  )}
                  {invItem.isEquipped && <Badge className="text-xs">E</Badge>}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function InventoryPanelMini({
  inventory,
  onClick,
  className,
}: {
  inventory?: InventoryResponse
  onClick?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 p-2 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors",
        className
      )}
      onClick={onClick}
    >
      <Package className="h-5 w-5" />
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Inventory</span>
          <span className="text-sm font-bold">{inventory?.items.length || 0} items</span>
        </div>
      </div>
    </div>
  )
}
