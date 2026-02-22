import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Brain, AlertTriangle, Heart, Clock, TrendingDown, TrendingUp, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

export type SANState = "stable" | "unsettled" | "disturbed" | "unstable" | "critical" | "insane"
export type SANWarningLevel = "normal" | "warning" | "danger" | "critical"

export interface SANStatus {
  characterId: number
  characterName: string
  currentSan: number
  maxSan: number
  sanPercentage: number
  mentalIllness?: string
  isInsane: boolean
  warningLevel: SANWarningLevel
  state?: SANState
  message?: string
  recommendations?: string[]
}

interface SANMeterProps {
  status: SANStatus
  previousSan?: number
  onRecover?: () => void
  onCheckSan?: () => void
  className?: string
  compact?: boolean
}

const STATE_COLORS: Record<SANState, string> = {
  stable: "text-green-600 dark:text-green-400",
  unsettled: "text-blue-600 dark:text-blue-400",
  disturbed: "text-yellow-600 dark:text-yellow-400",
  unstable: "text-orange-600 dark:text-orange-400",
  critical: "text-red-600 dark:text-red-400",
  insane: "text-purple-600 dark:text-purple-400",
}

const STATE_BG_COLORS: Record<SANState, string> = {
  stable: "bg-green-500",
  unsettled: "bg-blue-500",
  disturbed: "bg-yellow-500",
  unstable: "bg-orange-500",
  critical: "bg-red-500",
  insane: "bg-purple-500",
}

const WARNING_VARIANTS: Record<SANWarningLevel, "default" | "secondary" | "destructive" | "outline"> = {
  normal: "default",
  warning: "secondary",
  danger: "destructive",
  critical: "destructive",
}

function getSANState(percentage: number): SANState {
  if (percentage <= 0) return "insane"
  if (percentage <= 10) return "critical"
  if (percentage <= 25) return "unstable"
  if (percentage <= 50) return "disturbed"
  if (percentage <= 75) return "unsettled"
  return "stable"
}

function getSANChange(current: number, previous?: number): { delta: number; direction: "up" | "down" | "neutral" } {
  if (previous === undefined) return { delta: 0, direction: "neutral" }
  const delta = current - previous
  if (delta > 0) return { delta, direction: "up" }
  if (delta < 0) return { delta, direction: "down" }
  return { delta: 0, direction: "neutral" }
}

export function SANMeter({
  status,
  previousSan,
  onRecover,
  onCheckSan,
  className,
  compact = false,
}: SANMeterProps) {
  const [isAnimating, setIsAnimating] = useState(false)
  const [displaySan, setDisplaySan] = useState(status.currentSan)

  const state = status.state || getSANState(status.sanPercentage)
  const change = getSANChange(status.currentSan, previousSan)

  useEffect(() => {
    if (previousSan !== undefined && previousSan !== status.currentSan) {
      setIsAnimating(true)
      const duration = Math.abs(status.currentSan - previousSan) * 50
      const step = status.currentSan > previousSan ? 1 : -1
      let current = previousSan
      
      const interval = setInterval(() => {
        current += step
        setDisplaySan(current)
        if (current === status.currentSan) {
          clearInterval(interval)
        }
      }, 50)

      const timer = setTimeout(() => setIsAnimating(false), duration + 300)
      return () => {
        clearInterval(interval)
        clearTimeout(timer)
      }
    }
  }, [status.currentSan, previousSan])

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Brain className={cn("h-4 w-4", STATE_COLORS[state])} />
        <span className={cn("font-bold text-sm", STATE_COLORS[state])}>
          {displaySan}/{status.maxSan}
        </span>
        {change.direction !== "neutral" && (
          <span
            className={cn(
              "text-xs font-bold",
              change.direction === "up" ? "text-green-600" : "text-red-600"
            )}
          >
            {change.direction === "up" ? "+" : ""}{change.delta}
          </span>
        )}
      </div>
    )
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className={cn("h-4 w-4", STATE_COLORS[state])} />
            <span>SAN (Sanity)</span>
          </div>
          <Badge variant={WARNING_VARIANTS[status.warningLevel]} className="text-xs">
            {state.toUpperCase()}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Mental Health</span>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "font-bold transition-all duration-300",
                  STATE_COLORS[state],
                  isAnimating && "scale-110"
                )}
              >
                {displaySan}/{status.maxSan}
              </span>
              {change.direction !== "neutral" && (
                <span
                  className={cn(
                    "text-xs font-bold flex items-center gap-0.5",
                    change.direction === "up" ? "text-green-600" : "text-red-600"
                  )}
                >
                  {change.direction === "up" ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {change.direction === "up" ? "+" : ""}{change.delta}
                </span>
              )}
            </div>
          </div>
          <div className="relative">
            <Progress
              value={status.sanPercentage}
              className={cn(
                "h-3 transition-all duration-300",
                isAnimating && "scale-105"
              )}
            />
            <div
              className={cn(
                "absolute top-0 left-0 h-full rounded-full transition-all duration-300 opacity-30",
                STATE_BG_COLORS[state]
              )}
              style={{ width: `${status.sanPercentage}%` }}
            />
          </div>
        </div>

        {status.mentalIllness && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3 w-3 text-orange-500" />
            <span>{status.mentalIllness}</span>
          </div>
        )}

        {status.message && status.warningLevel !== "normal" && (
          <div
            className={cn(
              "text-xs p-2 rounded",
              status.warningLevel === "critical" && "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300",
              status.warningLevel === "danger" && "bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300",
              status.warningLevel === "warning" && "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300"
            )}
          >
            {status.message}
          </div>
        )}

        {status.recommendations && status.recommendations.length > 0 && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">Recommendations:</span>
            <ul className="mt-1 space-y-0.5">
              {status.recommendations.map((rec, i) => (
                <li key={i} className="flex items-center gap-1">
                  <Minus className="h-2 w-2" />
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          {onCheckSan && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCheckSan}
              className="flex-1"
            >
              <Brain className="h-3 w-3 mr-1" />
              SAN Check
            </Button>
          )}
          {onRecover && !status.isInsane && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRecover}
              className="flex-1"
            >
              <Heart className="h-3 w-3 mr-1" />
              Recover
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function SANMeterMini({ status, className }: { status: SANStatus; className?: string }) {
  const state = status.state || getSANState(status.sanPercentage)

  return (
    <div className={cn("flex items-center gap-2 p-2 rounded-lg bg-muted/50", className)}>
      <Brain className={cn("h-5 w-5", STATE_COLORS[state])} />
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">SAN</span>
          <span className={cn("font-bold text-sm", STATE_COLORS[state])}>
            {status.currentSan}/{status.maxSan}
          </span>
        </div>
        <Progress value={status.sanPercentage} className="h-1.5 mt-1" />
      </div>
    </div>
  )
}
