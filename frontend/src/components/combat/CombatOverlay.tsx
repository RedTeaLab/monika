import { useEffect } from "react"
import { X, Minimize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Combat, AttackRequest, HealRequest } from "@/types/combat"
import { InitiativeList } from "./InitiativeList"
import { CombatActionPanel } from "./CombatActionPanel"
import { CombatLogPanel } from "./CombatLogPanel"

interface CombatOverlayProps {
  combat: Combat
  onAttack: (request: AttackRequest) => Promise<void>
  onHeal: (request: HealRequest) => Promise<void>
  onDodge: () => Promise<void>
  onNextTurn: () => Promise<void>
  onEndCombat: () => void
  onMinimize: () => void
  isLoading?: boolean
  combatLogs?: any[] // TODO: Use proper CombatLogEntry[] type
}

/**
 * CombatOverlay - Full-screen combat interface
 *
 * Features:
 * - Semi-transparent overlay (bg-black/60)
 * - ESC key to close
 * - Three-column layout: Turn Info | Actions | Combat Log
 * - Minimize to floating card
 */
export function CombatOverlay({
  combat,
  onAttack,
  onHeal,
  onDodge,
  onNextTurn,
  onEndCombat,
  onMinimize,
  isLoading = false,
  combatLogs = [],
}: CombatOverlayProps) {
  /**
   * Handle ESC key to close overlay
   */
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onEndCombat()
      }
    }

    window.addEventListener("keydown", handleEscape)
    return () => window.removeEventListener("keydown", handleEscape)
  }, [onEndCombat])

  /**
   * Handle next turn action
   * Advances turn and updates UI
   */
  const handleNextTurn = async () => {
    await onNextTurn()
  }

  /**
   * Handle end turn (from action panel)
   * This is an alias for nextTurn
   */
  const handleEndTurn = async () => {
    await handleNextTurn()
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
        "flex items-center justify-center p-4"
      )}
    >
      {/* Main Container */}
      <div
        className={cn(
          "bg-background rounded-lg shadow-xl w-full max-w-6xl",
          "flex flex-col max-h-[90vh]"
        )}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex-1">
            {/* Combat Location/Title */}
            <h2 className="text-xl font-bold">
              {combat.location || "Combat"}
            </h2>
            {combat.description && (
              <p className="text-sm text-muted-foreground">
                {combat.description}
              </p>
            )}
          </div>

          {/* Round Indicator */}
          <div className="text-center">
            <div className="text-2xl font-bold">
              Round {combat.round}
            </div>
            {combat.current_turn && (
              <div className="text-sm text-muted-foreground">
                {combat.current_turn.name}'s turn
              </div>
            )}
          </div>

          {/* Control Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onMinimize}
              className="h-9 w-9"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onEndCombat}
              className="h-9 w-9"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Three-Column Layout */}
        <div className="flex-1 flex gap-4 p-4 overflow-hidden">
          {/* Left: Turn Info Panel (200px) */}
          <div className="w-[200px] flex-shrink-0">
            <InitiativeList
              round={combat.round}
              currentTurn={combat.current_turn || null}
              combatants={combat.combatants}
              onNextTurn={handleNextTurn}
              isLoading={isLoading}
            />
          </div>

          {/* Center: Action Panel (300px) */}
          <div className="w-[300px] flex-shrink-0">
            <CombatActionPanel
              currentTurn={combat.current_turn || null}
              combatants={combat.combatants}
              onAttack={onAttack}
              onHeal={onHeal}
              onDodge={onDodge}
              onEndTurn={handleEndTurn}
              isLoading={isLoading}
            />
          </div>

          {/* Right: Combat Log Panel (300px) */}
          <div className="w-[300px] flex-shrink-0">
            <CombatLogPanel logs={combatLogs} />
          </div>
        </div>

        {/* Footer Status */}
        <div className="px-4 py-2 border-t text-xs text-muted-foreground">
          Press <kbd className="px-1 py-0.5 rounded bg-muted">ESC</kbd> to end combat
        </div>
      </div>
    </div>
  )
}
