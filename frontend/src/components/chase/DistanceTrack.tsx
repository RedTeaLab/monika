import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Chase } from "@/types/chase"

interface DistanceTrackProps {
  chase: Chase
  className?: string
}

/**
 * DistanceTrack - Horizontal distance visualization between fugitive and pursuer
 *
 * Visual representation:
 * - Green dot (●) for fugitive (runner)
 * - Red dot (●) for pursuer (chaser)
 * - Horizontal track (━) showing distance levels
 * - Location indicator showing current position name
 *
 * Distance levels: 0 = caught, 4 = escaped
 * Format: "逃跑者 ●━━━━━● 追逐者"
 */
export function DistanceTrack({ chase, className }: DistanceTrackProps) {
  /**
   * Get fugitive and pursuer from participants
   * Fugitive is the one with role='fugitive'
   * Pursuer is the one with role='pursuer'
   */
  const fugitives = chase.participants.filter((p) => p.role === "fugitive" && p.is_active)
  const pursuers = chase.participants.filter((p) => p.role === "pursuer" && p.is_active)

  /**
   * Parse location to get distance level
   * Location format is expected to be a string representing distance
   * Backend stores this as a string, we interpret it
   */
  const getDistanceLevel = (): number => {
    // Try to parse as number first
    const parsed = parseInt(chase.location, 10)
    if (!isNaN(parsed)) {
      return Math.max(0, Math.min(4, parsed)) // Clamp between 0-4
    }
    // Default to middle if cannot parse
    return 2
  }

  const distanceLevel = getDistanceLevel()

  /**
   * Calculate track segments based on distance level
   * Level 0: caught (no gap)
   * Level 1: very close
   * Level 2: moderate gap
   * Level 3: far apart
   * Level 4: escaped (maximum gap)
   */
  const renderTrack = () => {
    const trackLength = 20 // Total track characters
    const segmentsPerLevel = trackLength / 4

    // Calculate gap based on distance level
    const gap = Math.floor(distanceLevel * segmentsPerLevel)
    const before = Math.max(0, Math.floor((trackLength - gap) / 2))
    const after = trackLength - before - gap

    // Build track string
    const trackBefore = "━".repeat(before)
    const trackGap = "━".repeat(Math.max(0, gap))
    const trackAfter = "━".repeat(after)

    return (
      <div className="flex items-center gap-1 text-sm font-mono">
        {/* Fugitive Label */}
        <span className="text-green-600 dark:text-green-400 font-medium">
          逃跑者
        </span>
        {/* Fugitive Marker */}
        <span className="text-green-600 dark:text-green-400">●</span>
        {/* Track Before */}
        <span className="text-muted-foreground">{trackBefore}</span>
        {/* Track Gap (distance) */}
        <span className={cn(
          "font-medium",
          distanceLevel === 0 && "text-red-600 dark:text-red-400",
          distanceLevel === 4 && "text-green-600 dark:text-green-400",
          distanceLevel > 0 && distanceLevel < 4 && "text-yellow-600 dark:text-yellow-400"
        )}>
          {trackGap || "•"}
        </span>
        {/* Track After */}
        <span className="text-muted-foreground">{trackAfter}</span>
        {/* Pursuer Marker */}
        <span className="text-red-600 dark:text-red-400">●</span>
        {/* Pursuer Label */}
        <span className="text-red-600 dark:text-red-400 font-medium">
          追逐者
        </span>
      </div>
    )
  }

  /**
   * Get distance level badge variant
   */
  const getDistanceBadgeVariant = (): "default" | "secondary" | "outline" | "destructive" => {
    if (distanceLevel === 0) return "destructive" // Caught
    if (distanceLevel === 4) return "default" // Escaped
    if (distanceLevel >= 3) return "secondary" // Far ahead
    return "outline" // Close
  }

  /**
   * Get distance level label
   */
  const getDistanceLabel = (): string => {
    switch (distanceLevel) {
      case 0:
        return "Caught!"
      case 1:
        return "Very Close"
      case 2:
        return "Moderate"
      case 3:
        return "Far Ahead"
      case 4:
        return "Escaped!"
      default:
        return "Unknown"
    }
  }

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Distance</CardTitle>
          <Badge variant={getDistanceBadgeVariant()} className="text-sm">
            Level {distanceLevel}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Distance Track */}
        <div className="flex items-center justify-center p-3 bg-muted/30 rounded-lg">
          {renderTrack()}
        </div>

        {/* Distance Label */}
        <div className="text-center">
          <div className="text-sm text-muted-foreground">
            Current Distance
          </div>
          <div className={cn(
            "text-lg font-semibold",
            distanceLevel === 0 && "text-red-600 dark:text-red-400",
            distanceLevel === 4 && "text-green-600 dark:text-green-400",
            distanceLevel > 0 && distanceLevel < 4 && "text-yellow-600 dark:text-yellow-400"
          )}>
            {getDistanceLabel()}
          </div>
        </div>

        {/* Participants Summary */}
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-1">
            <span className="text-green-600 dark:text-green-400">●</span>
            <span>{fugitives.length} Fugitive{fugitives.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-red-600 dark:text-red-400">●</span>
            <span>{pursuers.length} Pursuer{pursuers.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
