import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { EventTypeIcon } from '@/components/EventTypeIcon'
import type { GameEvent } from '@/types/event'

function getActorDisplay(role: 'KP' | 'Player' | 'System', characterId: string | null): string {
  if (role === 'KP') return 'KP'
  if (role === 'System') return '系统'
  if (characterId) return `角色 ${characterId.slice(0, 8)}`
  return '未知'
}

interface TimelineNodeProps {
  event: GameEvent
  isExpanded: boolean
  onToggle: () => void
  className?: string
}

export function TimelineNode({ event, isExpanded, onToggle, className = '' }: TimelineNodeProps) {
  const eventTime = new Date(event.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  // Determine actor display name
  const actorDisplayName: string = event.actor.role === 'KP'
    ? 'KP'
    : event.actor.role === 'System'
    ? '系统'
    : event.actor.character_id
    ? `角色 ${event.actor.character_id.slice(0, 8)}`
    : '未知'

  return (
    <div className={`flex gap-3 ${className}`}>
      {/* Timeline Marker */}
      <div className="flex flex-col items-center">
        <EventTypeIcon
          category={event.type.category}
          className="h-6 w-6 flex-shrink-0"
        />
        <div className="w-0.5 flex-1 bg-border min-h-[60px]" />
      </div>

      {/* Event Card */}
      <Card className="flex-1 mb-4 overflow-hidden">
        <div className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <time className="text-xs text-muted-foreground font-mono">
                  {eventTime}
                </time>
                <span className="text-xs text-muted-foreground">
                  #{event.sequence}
                </span>
              </div>
              <p className="text-sm line-clamp-2">
                {event.narration.text}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="flex-shrink-0"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Expanded Details */}
          {isExpanded ? (
            <div className="mt-3 pt-3 border-t space-y-2">
              {/* Event Type */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">类型:</span>
                <span className="font-medium">{String(event.type.category)}</span>
                {event.type.sub_type ? (
                  <span className="text-muted-foreground">/{String(event.type.sub_type)}</span>
                ) : null}
              </div>

              {/* Actor */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">操作者:</span>
                <span className="font-medium">
                  {getActorDisplay(event.actor.role, event.actor.character_id)}
                </span>
              </div>

              {/* Input */}
              {event.input.raw_message ? (
                <div className="text-xs">
                  <span className="text-muted-foreground">输入:</span>
                  <p className="mt-1 p-2 bg-muted rounded font-mono text-xs">
                    {event.input.raw_message}
                  </p>
                </div>
              ) : null}

              {/* Result */}
              {event.result.data ? (
                <div className="text-xs">
                  <span className="text-muted-foreground">结果:</span>
                  <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
                    {JSON.stringify(event.result.data, null, 2)}
                  </pre>
                </div>
              ) : null}

              {/* State Changes */}
              {event.state_changes && event.state_changes.length > 0 ? (
                <div className="text-xs">
                  <span className="text-muted-foreground">状态变化:</span>
                  <div className="mt-1 space-y-1">
                    {event.state_changes.map((change, idx) => (
                      <div key={idx} className="p-2 bg-muted rounded text-xs">
                        <span className="font-mono">{change.path}</span>
                        <span className="ml-2 text-muted-foreground">
                          {change.type}
                        </span>
                        {change.old_value !== undefined ? (
                          <span className="ml-2">
                            {JSON.stringify(change.old_value)}
                          </span>
                        ) : null}
                        {change.new_value !== undefined ? (
                          <span className="ml-2">→ {JSON.stringify(change.new_value)}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Visibility */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">可见性:</span>
                <span className="font-medium">{event.visibility.base}</span>
              </div>

              {/* Event ID */}
              <div className="text-xs text-muted-foreground font-mono">
                ID: {event.event_id}
              </div>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
