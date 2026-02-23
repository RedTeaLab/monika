import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dice3, Dices } from "lucide-react"
import { cn } from "@/lib/utils"

export type SuccessLevel =
  | "extreme_success"
  | "hard_success"
  | "regular_success"
  | "failure"
  | "critical"
  | "fumble"

export interface RollResult {
  value: number
  successLevel: SuccessLevel
  rawRolls?: number[]
  bonusPenalty?: string
  skill: number
}

interface DiceRollProps {
  result: RollResult
  skillName?: string
  onAnimationComplete?: () => void
  className?: string
}

export function DiceRoll({ result, skillName, onAnimationComplete, className }: DiceRollProps) {
  const [isRolling, setIsRolling] = useState(true)
  const [displayValue, setDisplayValue] = useState(0)
  const [showResult, setShowResult] = useState(false)

  useEffect(() => {
    let rollInterval: ReturnType<typeof setInterval>
    let revealTimeout: ReturnType<typeof setTimeout>

    // Rolling animation
    rollInterval = setInterval(() => {
      setDisplayValue(Math.floor(Math.random() * 100) + 1)
    }, 50)

    // Stop rolling and show result after animation
    revealTimeout = setTimeout(() => {
      clearInterval(rollInterval)
      setDisplayValue(result.value)
      setIsRolling(false)
      setShowResult(true)
      onAnimationComplete?.()
    }, 1000)

    return () => {
      clearInterval(rollInterval)
      clearTimeout(revealTimeout)
    }
  }, [result.value, onAnimationComplete])

  const getSuccessLabel = (level: SuccessLevel): string => {
    switch (level) {
      case "critical":
      case "extreme_success":
        return "Extreme Success"
      case "hard_success":
        return "Hard Success"
      case "regular_success":
        return "Success"
      case "failure":
        return "Failure"
      case "fumble":
        return "Fumble"
    }
  }

  const getSuccessVariant = (): "default" | "secondary" | "outline" | "success" | "warning" | "info" | "destructive" => {
    switch (result.successLevel) {
      case "critical":
      case "extreme_success":
        return "success"
      case "hard_success":
        return "info"
      case "regular_success":
        return "default"
      case "failure":
        return "secondary"
      case "fumble":
        return "destructive"
    }
  }

  const getSuccessColor = () => {
    switch (result.successLevel) {
      case "critical":
      case "extreme_success":
        return "text-green-600 dark:text-green-400"
      case "hard_success":
        return "text-blue-600 dark:text-blue-400"
      case "regular_success":
        return "text-gray-600 dark:text-gray-400"
      case "failure":
        return "text-orange-600 dark:text-orange-400"
      case "fumble":
        return "text-red-600 dark:text-red-400"
    }
  }

  const getDiceIcon = () => {
    if (result.rawRolls && result.rawRolls.length > 1) {
      return <Dices className="h-5 w-5" />
    }
    return <Dice3 className="h-5 w-5" />
  }

  const isSpecial = result.value === 1 || result.value === 100

  return (
    <Card
      className={cn(
        "inline-block transition-all duration-300",
        isRolling && "animate-pulse",
        showResult && !isRolling && "scale-105",
        className
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {/* Dice Icon */}
          <div
            className={cn(
              "flex items-center justify-center w-12 h-12 rounded-lg transition-colors duration-300",
              isRolling && "bg-primary/20",
              !isRolling && getSuccessColor().replace("text-", "bg-").replace("dark:text-", "dark:bg-")
            )}
          >
            {getDiceIcon()}
          </div>

          {/* Roll Info */}
          <div className="space-y-1">
            {/* Skill Name */}
            {skillName && (
              <div className="text-xs text-muted-foreground">
                Rolling <span className="font-medium">{skillName}</span> ({result.skill})
              </div>
            )}

            {/* Rolling Value */}
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-3xl font-bold tabular-nums transition-colors",
                  isRolling && "text-primary",
                  !isRolling && getSuccessColor()
                )}
              >
                {isRolling ? "?" : displayValue}
              </span>

              {/* Success Badge */}
              {showResult && (
                <Badge variant={getSuccessVariant()} className="animate-in slide-in-from-left-2">
                  {getSuccessLabel(result.successLevel)}
                </Badge>
              )}
            </div>

            {/* Bonus/Penalty */}
            {result.bonusPenalty && result.bonusPenalty !== "regular" && showResult && (
              <div className="text-xs text-muted-foreground">
                {result.bonusPenalty === "hard" && "Hard Difficulty"}
                {result.bonusPenalty === "extreme" && "Extreme Difficulty"}
                {result.bonusPenalty === "one_step_bonus" && "One Step Bonus"}
                {result.bonusPenalty === "one_step_penalty" && "One Step Penalty"}
              </div>
            )}

            {/* Raw Rolls (for bonus/penalty dice) */}
            {result.rawRolls && result.rawRolls.length > 1 && showResult && (
              <div className="text-xs text-muted-foreground">
                Rolled: {result.rawRolls.join(", ")} → took {Math.min(...result.rawRolls)}
              </div>
            )}

            {/* Special Roll Indicator */}
            {isSpecial && showResult && (
              <div className="text-xs font-semibold">
                {result.value === 1 && (
                  <span className="text-green-600 dark:text-green-400">
                    ⭐ CRITICAL SUCCESS!
                  </span>
                )}
                {result.value === 100 && (
                  <span className="text-red-600 dark:text-red-400">
                    💀 FUMBLE!
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Component for push roll confirmation
interface PushRollDialogProps {
  onConfirm: () => void
  onCancel: () => void
  skillName: string
  risk: string
}

export function PushRollDialog({ onConfirm, onCancel, skillName, risk }: PushRollDialogProps) {
  return (
    <Card className="p-4 border-yellow-500 dark:border-yellow-700" role="dialog" aria-labelledby="push-roll-title" aria-describedby="push-roll-description">
      <div className="space-y-3">
        <h3 id="push-roll-title" className="font-semibold text-sm">Push the Roll?</h3>
        <p id="push-roll-description" className="text-xs text-muted-foreground">
          You may push your <span className="font-medium">{skillName}</span> check, but if
          you fail, the consequences will be worse.
        </p>
        <div className="text-xs bg-yellow-50 dark:bg-yellow-950/30 p-2 rounded border border-yellow-200 dark:border-yellow-800">
          <span className="font-medium">Risk:</span> {risk}
        </div>
        <div className="flex gap-2" role="group" aria-label="Push roll actions">
          <button
            onClick={onConfirm}
            className="flex-1 px-3 py-1.5 text-sm bg-yellow-600 hover:bg-yellow-700 text-white rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500"
            aria-label="Push the roll"
          >
            Push It
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Accept failure without pushing"
          >
            Accept Failure
          </button>
        </div>
      </div>
    </Card>
  )
}

// Component for luck spend confirmation
interface LuckSpendDialogProps {
  onConfirm: (amount: number) => void
  onCancel: () => void
  currentLuck: number
  maxLuck: number
  eventDescription: string
}

export function LuckSpendDialog({
  onConfirm,
  onCancel,
  currentLuck,
  maxLuck,
  eventDescription,
}: LuckSpendDialogProps) {
  const [amount, setAmount] = useState(1)

  return (
    <Card className="p-4 border-green-500 dark:border-green-700" role="dialog" aria-labelledby="luck-spend-title" aria-describedby="luck-spend-description">
      <div className="space-y-3">
        <h3 id="luck-spend-title" className="font-semibold text-sm">Spend Luck?</h3>
        <p id="luck-spend-description" className="text-xs text-muted-foreground">{eventDescription}</p>

        <div className="flex items-center gap-2">
          <label htmlFor="luck-amount" className="text-xs">Amount:</label>
          <input
            id="luck-amount"
            type="number"
            min={1}
            max={currentLuck}
            value={amount}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 1
              setAmount(Math.min(Math.max(1, val), currentLuck))
            }}
            className="w-20 h-8 px-2 text-sm border rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-describedby="luck-current"
          />
          <span id="luck-current" className="text-xs text-muted-foreground">
            (Current: {currentLuck}/{maxLuck})
          </span>
        </div>

        <div className="flex gap-2" role="group" aria-label="Luck spend actions">
          <button
            onClick={() => onConfirm(amount)}
            disabled={amount > currentLuck}
            className="flex-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 disabled:focus-visible:ring-ring"
            aria-label={`Spend ${amount} luck points`}
          >
            Spend {amount} Luck
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Cancel luck spending"
          >
            Cancel
          </button>
        </div>
      </div>
    </Card>
  )
}
