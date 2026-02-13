import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skull, AlertTriangle, UserX } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Combatant, CombatantRole } from "@/types/combat"

/**
 * Helper function to get badge variant based on combatant role
 */
function getRoleBadgeVariant(
  role: CombatantRole
): "default" | "secondary" | "outline" | "destructive" {
  switch (role) {
    case "pc":
      return "default"
    case "npc":
      return "destructive"
    case "ally":
      return "secondary"
  }
}

/**
 * Helper function to get role label
 */
function getRoleLabel(role: CombatantRole): string {
  switch (role) {
    case "pc":
      return "PC"
    case "npc":
      return "Enemy"
    case "ally":
      return "Ally"
  }
}

/**
 * Helper function to get HP color based on HP percentage
 */
function getHpColor(currentHp: number, maxHp: number): string {
  const percentage = (currentHp / maxHp) * 100
  if (percentage <= 25) {
    return "text-red-600 dark:text-red-400"
  }
  if (percentage <= 50) {
    return "text-orange-600 dark:text-orange-400"
  }
  return "text-green-600 dark:text-green-400"
}

interface CombatantCardProps {
  combatant: Combatant
  isCurrentTurn?: boolean
  isSelected?: boolean
  onSelect?: () => void
  showHpChange?: boolean
  previousHp?: number
  className?: string
  /** Damage value to animate (negative for damage, positive for healing) */
  damageAnim?: number
}

export function CombatantCard({
  combatant,
  isCurrentTurn = false,
  isSelected = false,
  onSelect,
  showHpChange = false,
  previousHp,
  className,
  damageAnim,
}: CombatantCardProps) {
  const [showDamageFloat, setShowDamageFloat] = useState(false)
  const [shake, setShake] = useState(false)

  const hpPercentage = combatant.hp_max > 0
    ? (combatant.hp / combatant.hp_max) * 100
    : 0
  const hpChange = showHpChange && previousHp !== undefined ? combatant.hp - previousHp : 0

  /**
   * Trigger damage animation when damageAnim prop changes
   */
  useEffect(() => {
    if (damageAnim !== undefined && damageAnim !== 0) {
      // Trigger shake animation
      setShake(true)
      // Trigger floating damage number
      setShowDamageFloat(true)

      // Reset animations after they complete
      const shakeTimer = setTimeout(() => setShake(false), 500)
      const floatTimer = setTimeout(() => setShowDamageFloat(false), 1000)

      return () => {
        clearTimeout(shakeTimer)
        clearTimeout(floatTimer)
      }
    }
  }, [damageAnim])

  return (
    <Card
      onClick={onSelect}
      className={cn(
        "transition-all duration-200 cursor-pointer relative",
        isCurrentTurn && "ring-2 ring-green-500",
        isSelected && "ring-2 ring-blue-500",
        !combatant.is_active && "opacity-50",
        shake && "animate-shake",
        className
      )}
    >
      {/* Floating Damage/Healing Number */}
      {showDamageFloat && damageAnim !== undefined && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <span
            className={cn(
              "text-2xl font-bold animate-float-up-fade-out",
              damageAnim < 0
                ? "text-red-600 dark:text-red-400"
                : "text-green-600 dark:text-green-400"
            )}
          >
            {damageAnim > 0 && "+"}
            {damageAnim}
          </span>
        </div>
      )}

      <CardContent className="p-3 space-y-2">
        {/* Name and Role Badge */}
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm truncate">{combatant.name}</span>
          <Badge variant={getRoleBadgeVariant(combatant.role)} className="text-xs">
            {getRoleLabel(combatant.role)}
          </Badge>
        </div>

        {/* Status Icons */}
        <div className="flex items-center gap-2 text-xs">
          {combatant.is_dying && (
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
              <Skull className="h-3 w-3" />
              Dying
            </span>
          )}
          {combatant.has_major_wound && (
            <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
              <AlertTriangle className="h-3 w-3" />
              Major Wound
            </span>
          )}
          {combatant.is_unconscious && (
            <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <UserX className="h-3 w-3" />
              Unconscious
            </span>
          )}
        </div>

        {/* Stats: Initiative and DEX */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Init: {combatant.initiative}</span>
          <span>DEX: {combatant.dex}</span>
        </div>

        {/* HP Bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className={getHpColor(combatant.hp, combatant.hp_max)}>
              HP: {combatant.hp}/{combatant.hp_max}
            </span>
            {showHpChange && hpChange !== 0 && (
              <span
                className={cn(
                  "font-semibold",
                  hpChange < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-green-600 dark:text-green-400"
                )}
              >
                {hpChange > 0 && "+"}
                {hpChange}
              </span>
            )}
          </div>
          <Progress
            value={hpPercentage}
            className="h-2"
            style={{
              backgroundColor: hpPercentage <= 25 ? '#dc2626' : hpPercentage <= 50 ? '#ea580c' : '#16a34a'
            }}
          />
        </div>
      </CardContent>
    </Card>
  )
}
