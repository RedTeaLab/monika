import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { AlertTriangle, Zap } from "lucide-react"
import { cn } from "@/lib/utils"

interface PressureBarProps {
  pressure: number
  className?: string
}

/**
 * PressureBar - Visual pressure indicator for chase system
 *
 * Pressure ranges from 0-100:
 * - 0-50%: Green (safe zone)
 * - 50-80%: Yellow (warning zone)
 * - 80-100%: Red with animation (critical zone - auto-fail)
 *
 * High pressure increases chance of automatic failure on obstacle checks
 */
export function PressureBar({ pressure, className }: PressureBarProps) {
  /**
   * Get pressure level classification
   */
  const getPressureLevel = (): "safe" | "warning" | "critical" => {
    if (pressure < 50) return "safe"
    if (pressure < 80) return "warning"
    return "critical"
  }

  /**
   * Get badge variant based on pressure level
   */
  const getBadgeVariant = (): "default" | "secondary" | "outline" | "destructive" => {
    const level = getPressureLevel()
    switch (level) {
      case "safe":
        return "secondary" // Green
      case "warning":
        return "outline" // Yellow
      case "critical":
        return "destructive" // Red
    }
  }

  /**
   * Get pressure label
   */
  const getPressureLabel = (): string => {
    const level = getPressureLevel()
    switch (level) {
      case "safe":
        return "Safe"
      case "warning":
        return "Warning"
      case "critical":
        return "Critical"
    }
  }

  /**
   * Get pressure description
   */
  const getPressureDescription = (): string => {
    const level = getPressureLevel()
    switch (level) {
      case "safe":
        return "No penalty on obstacle checks"
      case "warning":
        return "Increased difficulty on obstacle checks"
      case "critical":
        return "Automatic failure on obstacle checks!"
    }
  }

  const pressureLevel = getPressureLevel()

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Pressure</CardTitle>
            {pressureLevel === "critical" && (
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 animate-pulse" />
            )}
            {pressureLevel === "warning" && (
              <Zap className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={getBadgeVariant()} className="text-sm">
              {getPressureLabel()}
            </Badge>
            <Badge variant="outline" className="text-sm font-mono">
              {pressure}%
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="relative">
            <Progress
              value={pressure}
              className={cn(
                "h-3 transition-all duration-300",
                pressureLevel === "critical" && "border-2 border-red-500"
              )}
            />
            {/* Critical zone indicator */}
            {pressureLevel === "critical" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold text-white drop-shadow-lg animate-pulse">
                  CRITICAL
                </span>
              </div>
            )}
          </div>

          {/* Pressure Scale Markers */}
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>0%</span>
            <span>50%</span>
            <span>80%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Description */}
        <div className={cn(
          "text-sm p-3 rounded-lg",
          pressureLevel === "safe" && "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200",
          pressureLevel === "warning" && "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200",
          pressureLevel === "critical" && "bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 animate-pulse"
        )}>
          <div className="flex items-start gap-2">
            {pressureLevel === "critical" && (
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            {pressureLevel === "warning" && (
              <Zap className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            <span className="font-medium">
              {getPressureDescription()}
            </span>
          </div>
        </div>

        {/* Zone Indicators */}
        <div className="flex items-center gap-1 text-xs">
          <div className="flex-1 h-2 bg-green-600 dark:bg-green-400 rounded-l-sm" title="Safe Zone (0-50%)" />
          <div className="flex-1 h-2 bg-yellow-600 dark:bg-yellow-400" title="Warning Zone (50-80%)" />
          <div className="flex-1 h-2 bg-red-600 dark:bg-red-400 rounded-r-sm" title="Critical Zone (80-100%)" />
        </div>
      </CardContent>
    </Card>
  )
}
