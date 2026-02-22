import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Target, Users, Skull, Heart, Shield } from "lucide-react"
import { cn } from "@/lib/utils"

export interface TargetInfo {
  id: string
  name: string
  role: "pc" | "npc" | "ally"
  hp: number
  hp_max: number
  is_active: boolean
  is_dying: boolean
  initiative: number
  armor?: "none" | "light" | "medium" | "heavy"
  position?: { x: number; y: number }
}

interface TargetSelectorProps {
  targets: TargetInfo[]
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  maxSelections?: number
  allowMultiSelect?: boolean
  filterRole?: ("pc" | "npc" | "ally")[]
  filterActive?: boolean
  showHP?: boolean
  className?: string
}

export function TargetSelector({
  targets,
  selectedIds,
  onSelectionChange,
  maxSelections = 1,
  allowMultiSelect = false,
  filterRole,
  filterActive = true,
  showHP = true,
  className,
}: TargetSelectorProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const filteredTargets = targets.filter((t) => {
    if (filterRole && !filterRole.includes(t.role)) return false
    if (filterActive && !t.is_active) return false
    return true
  })

  const handleTargetClick = (targetId: string) => {
    if (allowMultiSelect) {
      if (selectedIds.includes(targetId)) {
        onSelectionChange(selectedIds.filter((id) => id !== targetId))
      } else if (selectedIds.length < maxSelections) {
        onSelectionChange([...selectedIds, targetId])
      }
    } else {
      onSelectionChange(selectedIds.includes(targetId) ? [] : [targetId])
    }
  }

  const getHPColor = (hp: number, hpMax: number) => {
    const percent = hp / hpMax
    if (percent <= 0.25) return "text-red-500"
    if (percent <= 0.5) return "text-yellow-500"
    return "text-green-500"
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "pc":
        return <Users className="h-3 w-3" />
      case "ally":
        return <Shield className="h-3 w-3" />
      default:
        return <Skull className="h-3 w-3" />
    }
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4" />
            Select Target
            {allowMultiSelect && maxSelections > 1 && (
              <span className="text-xs text-muted-foreground">
                ({selectedIds.length}/{maxSelections})
              </span>
            )}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        <ScrollArea className="h-64">
          <div className="space-y-1 pr-2">
            {filteredTargets.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                No valid targets available
              </div>
            ) : (
              filteredTargets.map((target) => {
                const isSelected = selectedIds.includes(target.id)
                const isHovered = hoveredId === target.id

                return (
                  <div
                    key={target.id}
                    onClick={() => handleTargetClick(target.id)}
                    onMouseEnter={() => setHoveredId(target.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={cn(
                      "p-2 rounded-lg border-2 cursor-pointer transition-all duration-200",
                      "hover:shadow-md",
                      isSelected
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-transparent bg-muted/50 hover:bg-muted",
                      !target.is_active && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center",
                            target.role === "pc" && "bg-blue-500/20 text-blue-600",
                            target.role === "npc" && "bg-red-500/20 text-red-600",
                            target.role === "ally" && "bg-green-500/20 text-green-600"
                          )}
                        >
                          {getRoleIcon(target.role)}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{target.name}</div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs">
                              {target.role.toUpperCase()}
                            </Badge>
                            {target.armor && target.armor !== "none" && (
                              <Badge variant="secondary" className="text-xs">
                                {target.armor}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        {showHP && (
                          <div
                            className={cn(
                              "flex items-center gap-1 text-sm font-bold",
                              getHPColor(target.hp, target.hp_max)
                            )}
                          >
                            <Heart className="h-3 w-3" />
                            <span>
                              {target.hp}/{target.hp_max}
                            </span>
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          INIT: {target.initiative}
                        </div>
                      </div>
                    </div>

                    {target.is_dying && (
                      <div className="mt-2 text-xs text-red-500 font-bold animate-pulse">
                        DYING
                      </div>
                    )}

                    {(isSelected || isHovered) && (
                      <div
                        className={cn(
                          "mt-2 h-1 rounded-full bg-muted overflow-hidden"
                        )}
                      >
                        <div
                          className={cn(
                            "h-full transition-all duration-300",
                            target.hp / target.hp_max <= 0.25 && "bg-red-500",
                            target.hp / target.hp_max > 0.25 &&
                              target.hp / target.hp_max <= 0.5 &&
                              "bg-yellow-500",
                            target.hp / target.hp_max > 0.5 && "bg-green-500"
                          )}
                          style={{
                            width: `${(target.hp / target.hp_max) * 100}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
