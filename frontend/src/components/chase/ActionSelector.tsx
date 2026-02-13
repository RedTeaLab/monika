import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Zap, SkipForward, TrendingUp, TrendingDown, Wind } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ActionType } from "@/types/chase"

/**
 * Available chase actions with their metadata
 */
interface ChaseAction {
  type: ActionType
  name: string
  description: string
  icon: React.ReactNode
  variant: "default" | "outline" | "secondary" | "destructive"
  isRisky: boolean
}

const CHASE_ACTIONS: ChaseAction[] = [
  {
    type: "accelerate",
    name: "Accelerate",
    description: "Increase speed by +1. Risk of failure increases.",
    icon: <TrendingUp className="h-5 w-5" />,
    variant: "default",
    isRisky: false,
  },
  {
    type: "decelerate",
    name: "Decelerate",
    description: "Decrease speed by -1. Safer but lose distance.",
    icon: <TrendingDown className="h-5 w-5" />,
    variant: "outline",
    isRisky: false,
  },
  {
    type: "overcome_obstacle",
    name: "Overcome Obstacle",
    description: "Attempt skill check to pass current obstacle.",
    icon: <Zap className="h-5 w-5" />,
    variant: "secondary",
    isRisky: false,
  },
  {
    type: "attack",
    name: "Attack",
    description: "Attack nearby pursuer or fugitive.",
    icon: <Wind className="h-5 w-5" />,
    variant: "destructive",
    isRisky: true,
  },
]

interface ActionSelectorProps {
  availableActions?: ActionType[]
  onExecuteAction: (actionType: ActionType) => void
  onSkipTurn?: () => void
  isLoading?: boolean
  currentSpeed?: number
  className?: string
}

/**
 * ActionSelector - Display available chase actions
 *
 * Features:
 * - Action cards with icons, names, and descriptions
 * - Risk indicator for dangerous actions
 * - "Execute" button for each action
 * - "Skip Turn" button
 * - Current speed indicator
 */
export function ActionSelector({
  availableActions = CHASE_ACTIONS.map((a) => a.type),
  onExecuteAction,
  onSkipTurn,
  isLoading = false,
  currentSpeed = 0,
  className,
}: ActionSelectorProps) {
  /**
   * Filter actions based on availability
   */
  const enabledActions = CHASE_ACTIONS.filter((action) =>
    availableActions.includes(action.type)
  )

  return (
    <Card className={cn("flex flex-col h-full", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Actions</CardTitle>
          <Badge variant="outline" className="text-sm font-mono">
            Speed: {currentSpeed > 0 ? `+${currentSpeed}` : currentSpeed}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-3 p-3 pt-0 overflow-hidden">
        {/* Action Cards */}
        <div className="flex-1 space-y-2 overflow-y-auto">
          {enabledActions.map((action) => (
            <ActionCard
              key={action.type}
              action={action}
              onExecute={() => onExecuteAction(action.type)}
              isLoading={isLoading}
            />
          ))}
        </div>

        {/* Skip Turn Button */}
        {onSkipTurn && (
          <Button
            onClick={onSkipTurn}
            disabled={isLoading}
            variant="secondary"
            size="lg"
            className="w-full"
          >
            <SkipForward className="mr-2 h-4 w-4" />
            Skip Turn
          </Button>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span>Risky</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>Safe</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Individual action card component
 */
interface ActionCardProps {
  action: ChaseAction
  onExecute: () => void
  isLoading: boolean
}

function ActionCard({ action, onExecute, isLoading }: ActionCardProps) {
  return (
    <div
      className={cn(
        "p-3 rounded-lg border transition-all hover:shadow-md",
        action.isRisky && "border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-950/10",
        !action.isRisky && "border-border bg-card"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            "shrink-0 p-2 rounded-lg",
            action.variant === "default" && "bg-primary text-primary-foreground",
            action.variant === "outline" && "bg-muted",
            action.variant === "secondary" && "bg-secondary text-secondary-foreground",
            action.variant === "destructive" && "bg-destructive text-destructive-foreground"
          )}
        >
          {action.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-sm">{action.name}</h4>
            {action.isRisky && (
              <Badge variant="destructive" className="text-xs">
                Risky
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            {action.description}
          </p>
          <Button
            onClick={onExecute}
            disabled={isLoading}
            variant={action.variant}
            size="sm"
            className="w-full"
          >
            {isLoading ? (
              <>
                <div className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Executing...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-3 w-3" />
                Execute
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
