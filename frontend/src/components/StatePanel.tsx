import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Heart, Shield, Clover, MapPin, ListTodo } from "lucide-react"
import { cn } from "@/lib/utils"

export interface CharacterState {
  hp: number
  hpMax: number
  san: number
  sanMax: number
  luck: number
  luckMax: number
  mp?: number
  mpMax?: number
}

export interface Lead {
  id: string
  text: string
  verified: boolean
}

export interface WorldState {
  currentScene: string
  location: string
  timer?: string
  leads: Lead[]
}

interface StatePanelProps {
  character: CharacterState
  world: WorldState
  className?: string
  fullWidth?: boolean
}

interface StatBarProps {
  value: number
  max: number
  label: string
  icon: React.ReactNode
  color: string
  previousValue?: number
}

function StatBar({
  value,
  max,
  label,
  icon,
  previousValue,
}: StatBarProps) {
  const percentage = Math.max(0, Math.min(100, (value / max) * 100))
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    if (previousValue !== undefined && previousValue !== value) {
      setIsAnimating(true)
      const timer = setTimeout(() => setIsAnimating(false), 500)
      return () => clearTimeout(timer)
    }
  }, [value, previousValue])

  const getChangeIndicator = () => {
    if (previousValue === undefined) return null
    const change = value - previousValue
    if (change === 0) return null
    const isPositive = change > 0
    return (
      <span
        className={cn(
          "text-xs font-bold ml-2",
          isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
        )}
      >
        {isPositive ? "+" : ""}
        {change}
      </span>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1">
          {icon}
          <span className="font-medium">{label}</span>
        </div>
        <div className="flex items-center">
          <span
            className={cn(
              "font-bold transition-colors",
              isAnimating && "scale-110",
              value <= max * 0.25 && "text-red-600 dark:text-red-400 animate-pulse",
              value <= max * 0.5 && value > max * 0.25 && "text-orange-600 dark:text-orange-400"
            )}
          >
            {value}/{max}
          </span>
          {getChangeIndicator()}
        </div>
      </div>
      <Progress
        value={percentage}
        className={cn(
          "h-2 transition-all duration-300",
          isAnimating && "scale-105"
        )}
      />
    </div>
  )
}

export function StatePanel({ character, world, className, fullWidth = false }: StatePanelProps) {
  const [previousValues, setPreviousValues] = useState<CharacterState>(character)

  useEffect(() => {
    const timer = setTimeout(() => {
      setPreviousValues(character)
    }, 500)
    return () => clearTimeout(timer)
  }, [character])

  const getHealthStatus = () => {
    const hpPercent = character.hp / character.hpMax
    if (hpPercent <= 0.25) return { text: "Critical", variant: "destructive" as const }
    if (hpPercent <= 0.5) return { text: "Wounded", variant: "warning" as const }
    return { text: "Healthy", variant: "success" as const }
  }

  const getSanityStatus = () => {
    const sanPercent = character.san / character.sanMax
    if (sanPercent <= 0.2) return { text: "Broken", variant: "destructive" as const }
    if (sanPercent <= 0.5) return { text: "Unstable", variant: "warning" as const }
    return { text: "Stable", variant: "success" as const }
  }

  const healthStatus = getHealthStatus()
  const sanityStatus = getSanityStatus()

  return (
    <Card className={cn(fullWidth ? "w-full h-fit flex flex-col" : "w-80 h-fit flex flex-col", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Status Panel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 flex-1">
        {/* Character Stats */}
        <div className="space-y-3">
          <StatBar
            value={character.hp}
            max={character.hpMax}
            label="HP"
            icon={<Heart className="h-3 w-3" />}
            color="red"
            previousValue={previousValues.hp}
          />
          <div className="flex justify-between items-center">
            <Badge variant={healthStatus.variant} className="text-xs">
              {healthStatus.text}
            </Badge>
          </div>

          <StatBar
            value={character.san}
            max={character.sanMax}
            label="SAN"
            icon={<Shield className="h-3 w-3" />}
            color="yellow"
            previousValue={previousValues.san}
          />
          <div className="flex justify-between items-center">
            <Badge variant={sanityStatus.variant} className="text-xs">
              {sanityStatus.text}
            </Badge>
          </div>

          <StatBar
            value={character.luck}
            max={character.luckMax}
            label="Luck"
            icon={<Clover className="h-3 w-3" />}
            color="green"
            previousValue={previousValues.luck}
          />

          {character.mp !== undefined && character.mpMax !== undefined && (
            <StatBar
              value={character.mp}
              max={character.mpMax}
              label="MP"
              icon={<Shield className="h-3 w-3" />}
              color="blue"
              previousValue={previousValues.mp}
            />
          )}
        </div>

        {/* World State */}
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span>Current Scene</span>
          </div>
          <div className="space-y-1">
            <div className="text-sm">{world.currentScene}</div>
            <div className="text-xs text-muted-foreground">{world.location}</div>
            {world.timer && (
              <Badge variant="outline" className="text-xs">
                ⏱️ {world.timer}
              </Badge>
            )}
          </div>
        </div>

        {/* Leads */}
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <ListTodo className="h-3 w-3" />
            <span>Active Leads</span>
            <Badge variant="secondary" className="text-xs">
              {world.leads.length}
            </Badge>
          </div>
          <ScrollArea className="h-32">
            <div className="space-y-1 pr-4">
              {world.leads.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">
                  No active leads
                </div>
              ) : (
                world.leads.map((lead) => (
                  <div
                    key={lead.id}
                    className={cn(
                      "text-xs bg-muted/50 rounded px-2 py-1.5",
                      lead.verified && "border-l-2 border-green-500"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex-1">{lead.text}</span>
                      {lead.verified && (
                        <Badge variant="success" className="text-xs shrink-0">
                          ✓
                        </Badge>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  )
}
