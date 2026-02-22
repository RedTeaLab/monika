/**
 * EventLogPanel component for displaying game event log
 * Shows all game events with filtering and type-based icons
 */

import { useEffect, useRef, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Trash2,
  Dice3,
  Shield,
  Swords,
  GitFork,
  Heart,
  MessageSquare,
  Settings,
  Clock,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { EventEntry, EventCategory } from "@/types/event"
import { getEventCategory, getEventTypeLabel } from "@/types/event"
import { getEvents } from "@/services/api/events"
import { ExportButton } from "./ExportButton"

interface EventLogPanelProps {
  sessionId: string
  className?: string
}

/**
 * Get icon for event category
 */
function getCategoryIcon(category: EventCategory) {
  switch (category) {
    case "check":
      return <Dice3 className="h-4 w-4" />
    case "sanity":
      return <Shield className="h-4 w-4" />
    case "combat":
      return <Swords className="h-4 w-4" />
    case "chase":
      return <GitFork className="h-4 w-4" />
    case "state":
      return <Heart className="h-4 w-4" />
    case "interaction":
      return <MessageSquare className="h-4 w-4" />
    case "system":
      return <Settings className="h-4 w-4" />
    default:
      return <Clock className="h-4 w-4" />
  }
}

/**
 * Get badge color for event category
 */
function getCategoryBadgeColor(category: EventCategory): "default" | "secondary" | "outline" | "destructive" {
  switch (category) {
    case "check":
      return "secondary"
    case "sanity":
      return "destructive"
    case "combat":
      return "default"
    case "chase":
      return "outline"
    case "state":
      return "destructive"
    case "interaction":
      return "secondary"
    case "system":
      return "outline"
    default:
      return "outline"
  }
}

/**
 * Get category label
 */
function getCategoryLabel(category: EventCategory): string {
  const labels: Record<EventCategory, string> = {
    check: "Check",
    sanity: "Sanity",
    combat: "Combat",
    chase: "Chase",
    state: "State",
    interaction: "Interaction",
    system: "System",
  }
  return labels[category] || category
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function EventLogPanel({ sessionId, className }: EventLogPanelProps) {
  const [events, setEvents] = useState<EventEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<EventCategory | "all">("all")
  const scrollRef = useRef<HTMLDivElement>(null)

  /**
   * Fetch events from the API
   */
  const fetchEvents = useCallback(async () => {
    if (!sessionId) return

    setIsLoading(true)
    setError(null)

    try {
      const data = await getEvents(sessionId, { limit: 200 })
      setEvents(data)
    } catch (err) {
      console.error("Failed to fetch events:", err)
      setError(err instanceof Error ? err.message : "Failed to load events")
    } finally {
      setIsLoading(false)
    }
  }, [sessionId])

  /**
   * Load events on mount and when sessionId changes
   */
  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  /**
   * Auto-scroll to bottom when new events arrive
   */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events])

  /**
   * Filter events by category
   */
  const filteredEvents = events.filter((event) => {
    if (activeCategory === "all") return true
    return getEventCategory(event.event_type) === activeCategory
  })

  /**
   * Clear events (just resets local state, not database)
   */
  const handleClear = () => {
    setEvents([])
  }

  /**
   * Refresh events from server
   */
  const handleRefresh = () => {
    fetchEvents()
  }

  /**
   * Get category counts for badges
   */
  const categoryCounts: Record<EventCategory | "all", number> = {
    all: events.length,
    check: 0,
    sanity: 0,
    combat: 0,
    chase: 0,
    state: 0,
    interaction: 0,
    system: 0,
  }

  events.forEach((event) => {
    const category = getEventCategory(event.event_type)
    categoryCounts[category]++
  })

  return (
    <Card className={cn("flex flex-col h-full", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Event Log</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              className="h-8 px-2"
              title="Refresh events"
            >
              <Clock className="h-4 w-4" />
            </Button>
            <ExportButton
              events={filteredEvents}
              sessionId={sessionId}
              disabled={isLoading || filteredEvents.length === 0}
              className="h-8"
            />
            {events.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="h-8 px-2"
                title="Clear display"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Category Filter Tabs */}
        <Tabs
          value={activeCategory}
          onValueChange={(value) => setActiveCategory(value as EventCategory | "all")}
          className="w-full mt-2"
        >
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="all" className="gap-1">
              All ({categoryCounts.all})
            </TabsTrigger>
            <TabsTrigger value="check" className="gap-1">
              <Dice3 className="h-3 w-3" />
              ({categoryCounts.check})
            </TabsTrigger>
            <TabsTrigger value="sanity" className="gap-1">
              <Shield className="h-3 w-3" />
              ({categoryCounts.sanity})
            </TabsTrigger>
            <TabsTrigger value="combat" className="gap-1">
              <Swords className="h-3 w-3" />
              ({categoryCounts.combat})
            </TabsTrigger>
            <TabsTrigger value="chase" className="gap-1">
              <GitFork className="h-3 w-3" />
              ({categoryCounts.chase})
            </TabsTrigger>
            <TabsTrigger value="state" className="gap-1">
              <Heart className="h-3 w-3" />
              ({categoryCounts.state})
            </TabsTrigger>
            <TabsTrigger value="interaction" className="gap-1">
              <MessageSquare className="h-3 w-3" />
              ({categoryCounts.interaction})
            </TabsTrigger>
            <TabsTrigger value="system" className="gap-1">
              <Settings className="h-3 w-3" />
              ({categoryCounts.system})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="flex-1 p-3 pt-0 overflow-hidden">
        <ScrollArea className="h-full pr-4" ref={scrollRef}>
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Loading events...
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-2">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
              >
                Retry
              </Button>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              {events.length === 0
                ? "No events recorded yet"
                : `No ${getCategoryLabel(activeCategory as EventCategory)} events`}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEvents.map((event) => {
                const category = getEventCategory(event.event_type)
                return (
                  <div
                    key={event.id}
                    className="text-sm p-2 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      {/* Icon */}
                      <div className="mt-0.5 text-muted-foreground">
                        {getCategoryIcon(category)}
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        {/* Header: Type + Actor */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant={getCategoryBadgeColor(category)}
                            className="text-xs"
                          >
                            {getEventTypeLabel(event.event_type)}
                          </Badge>
                          <span className="text-xs text-muted-foreground capitalize">
                            {event.actor_role}
                          </span>
                          {event.character_id && (
                            <span className="text-xs text-muted-foreground">
                              • Character #{event.character_id}
                            </span>
                          )}
                        </div>

                        {/* Description */}
                        {event.description && (
                          <p className="text-xs text-foreground">
                            {event.description}
                          </p>
                        )}

                        {/* Payload preview (if description not available) */}
                        {!event.description && Object.keys(event.payload).length > 0 && (
                          <p className="text-xs text-muted-foreground truncate">
                            {JSON.stringify(event.payload)}
                          </p>
                        )}

                        {/* Timestamp */}
                        <div className="text-xs text-muted-foreground">
                          {formatTimestamp(event.timestamp)}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
