import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skull } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Chase, ChaseParticipant, ChaseParticipantRole } from "@/types/chase"

interface ParticipantListProps {
  chase: Chase
  currentParticipantId?: string | null
  className?: string
}

/**
 * ParticipantList - Display chase participants with their status
 *
 * Features:
 * - Icons: 🏃 for players, 🧟 for NPCs
 * - Role badges: Fugitive (green) / Pursuer (red)
 * - Speed badges: +1, 0, -1 showing speed modifier
 * - Active participant highlighting (blue background)
 * - Exhausted status indicator
 * - Position index showing order
 */
export function ParticipantList({
  chase,
  currentParticipantId,
  className,
}: ParticipantListProps) {
  /**
   * Get icon for participant type
   */
  const getParticipantIcon = (participant: ChaseParticipant): string => {
    if (participant.is_exhausted) {
      return "💀"
    }
    if (participant.is_player) {
      return "🏃"
    }
    return "🧟"
  }

  /**
   * Get speed badge content
   * Shows +1, 0, or -1 based on speed penalty
   */
  const getSpeedBadge = (participant: ChaseParticipant): { label: string; variant: "default" | "secondary" | "outline" | "destructive" } => {
    const penalty = participant.speed_penalty

    if (penalty > 0) {
      return { label: `-${penalty}`, variant: "destructive" }
    }
    if (penalty < 0) {
      return { label: `+${Math.abs(penalty)}`, variant: "default" }
    }
    return { label: "0", variant: "secondary" }
  }

  /**
   * Get role badge variant
   */
  const getRoleBadgeVariant = (role: ChaseParticipantRole): "default" | "secondary" | "outline" | "destructive" => {
    return role === "fugitive" ? "default" : "destructive"
  }

  /**
   * Sort participants by:
   * 1. Active status first
   * 2. Role (fugitive first)
   * 3. Position index
   */
  const sortedParticipants = [...chase.participants].sort((a, b) => {
    // Inactive participants last
    if (a.is_active !== b.is_active) {
      return a.is_active ? -1 : 1
    }
    // Fugitives first
    if (a.role !== b.role) {
      return a.role === "fugitive" ? -1 : 1
    }
    // Then by position
    return a.position_index - b.position_index
  })

  /**
   * Group participants by role
   */
  const fugitives = sortedParticipants.filter((p) => p.role === "fugitive" && p.is_active)
  const pursuers = sortedParticipants.filter((p) => p.role === "pursuer" && p.is_active)
  const inactive = sortedParticipants.filter((p) => !p.is_active)

  return (
    <Card className={cn("flex flex-col h-full", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Participants</CardTitle>
          <Badge variant="outline" className="text-sm">
            {chase.participants.length} Total
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-3 pt-0 overflow-hidden">
        <ScrollArea className="h-full pr-4">
          <div className="space-y-4">
            {/* Fugitives Section */}
            {fugitives.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground sticky top-0 bg-background/95 backdrop-blur py-1">
                  <div className="w-2 h-2 rounded-full bg-green-600 dark:bg-green-400" />
                  <span className="font-medium">Fugitives</span>
                  <Badge variant="outline" className="text-xs">
                    {fugitives.length}
                  </Badge>
                </div>
                {fugitives.map((participant) => (
                  <ParticipantCard
                    key={participant.id}
                    participant={participant}
                    isActive={participant.id === currentParticipantId}
                    getIcon={getParticipantIcon}
                    getSpeedBadge={getSpeedBadge}
                    getRoleBadgeVariant={getRoleBadgeVariant}
                  />
                ))}
              </div>
            )}

            {/* Pursuers Section */}
            {pursuers.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground sticky top-0 bg-background/95 backdrop-blur py-1">
                  <div className="w-2 h-2 rounded-full bg-red-600 dark:bg-red-400" />
                  <span className="font-medium">Pursuers</span>
                  <Badge variant="outline" className="text-xs">
                    {pursuers.length}
                  </Badge>
                </div>
                {pursuers.map((participant) => (
                  <ParticipantCard
                    key={participant.id}
                    participant={participant}
                    isActive={participant.id === currentParticipantId}
                    getIcon={getParticipantIcon}
                    getSpeedBadge={getSpeedBadge}
                    getRoleBadgeVariant={getRoleBadgeVariant}
                  />
                ))}
              </div>
            )}

            {/* Inactive Section */}
            {inactive.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground sticky top-0 bg-background/95 backdrop-blur py-1">
                  <Skull className="h-4 w-4" />
                  <span className="font-medium">Inactive</span>
                  <Badge variant="outline" className="text-xs">
                    {inactive.length}
                  </Badge>
                </div>
                {inactive.map((participant) => (
                  <ParticipantCard
                    key={participant.id}
                    participant={participant}
                    isActive={false}
                    getIcon={getParticipantIcon}
                    getSpeedBadge={getSpeedBadge}
                    getRoleBadgeVariant={getRoleBadgeVariant}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

/**
 * Individual participant card component
 */
interface ParticipantCardProps {
  participant: ChaseParticipant
  isActive: boolean
  getIcon: (participant: ChaseParticipant) => string
  getSpeedBadge: (participant: ChaseParticipant) => { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
  getRoleBadgeVariant: (role: ChaseParticipantRole) => "default" | "secondary" | "outline" | "destructive"
}

function ParticipantCard({
  participant,
  isActive,
  getIcon,
  getSpeedBadge,
  getRoleBadgeVariant,
}: ParticipantCardProps) {
  const speedBadge = getSpeedBadge(participant)

  return (
    <div
      className={cn(
        "flex items-center gap-2 p-2 rounded-lg border bg-card transition-colors",
        isActive && "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/30",
        !participant.is_active && "opacity-50",
        participant.is_exhausted && "border-red-500/30"
      )}
    >
      {/* Icon */}
      <div className="text-xl shrink-0">
        {getIcon(participant)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            "font-medium text-sm truncate",
            isActive && "text-blue-700 dark:text-blue-300"
          )}>
            {participant.name}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {/* Role Badge */}
            <Badge variant={getRoleBadgeVariant(participant.role)} className="text-xs px-1.5">
              {participant.role === "fugitive" ? "Run" : "Chase"}
            </Badge>
            {/* Speed Badge */}
            {participant.is_active && (
              <Badge variant={speedBadge.variant} className="text-xs px-1.5">
                {speedBadge.label}
              </Badge>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
          <span>Move: {participant.move_rate}</span>
          <span>Speed: {participant.current_speed}</span>
          {participant.failed_obstacle_count > 0 && (
            <span className="text-red-600 dark:text-red-400">
              Fails: {participant.failed_obstacle_count}
            </span>
          )}
          {participant.consecutive_failures > 0 && (
            <span className="text-orange-600 dark:text-orange-400">
              Streak: {participant.consecutive_failures}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
