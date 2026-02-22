import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Sword, Eye, Heart, Ghost, CheckCircle, BookOpen } from 'lucide-react'
import type { KeyEvent } from '@/types/session'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

interface KeyEventsListProps {
  events: KeyEvent[]
  className?: string
}

type EventCategory = 'combat' | 'sanity' | 'discovery' | 'check' | 'story' | 'other'

interface EventCategoryConfig {
  icon: React.ReactNode
  label: string
  color: string
}

const getEventCategory = (eventType: string): EventCategory => {
  const lowerType = eventType.toLowerCase()
  if (lowerType.includes('combat') || lowerType.includes('attack') || lowerType.includes('damage')) {
    return 'combat'
  }
  if (lowerType.includes('san') || lowerType.includes('madness')) {
    return 'sanity'
  }
  if (lowerType.includes('discover') || lowerType.includes('clue') || lowerType.includes('find')) {
    return 'discovery'
  }
  if (lowerType.includes('roll') || lowerType.includes('check') || lowerType.includes('skill')) {
    return 'check'
  }
  if (lowerType.includes('scene') || lowerType.includes('message') || lowerType.includes('narrative')) {
    return 'story'
  }
  return 'other'
}

const categoryConfig: Record<EventCategory, EventCategoryConfig> = {
  combat: {
    icon: <Sword className="h-4 w-4" />,
    label: '战斗',
    color: 'text-red-500 bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800',
  },
  sanity: {
    icon: <Ghost className="h-4 w-4" />,
    label: '理智',
    color: 'text-purple-500 bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-800',
  },
  discovery: {
    icon: <Eye className="h-4 w-4" />,
    label: '发现',
    color: 'text-blue-500 bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800',
  },
  check: {
    icon: <CheckCircle className="h-4 w-4" />,
    label: '检定',
    color: 'text-green-500 bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800',
  },
  story: {
    icon: <BookOpen className="h-4 w-4" />,
    label: '剧情',
    color: 'text-amber-500 bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800',
  },
  other: {
    icon: <AlertCircle className="h-4 w-4" />,
    label: '其他',
    color: 'text-gray-500 bg-gray-50 border-gray-200 dark:bg-gray-950 dark:border-gray-800',
  },
}

export function KeyEventsList({ events, className = '' }: KeyEventsListProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>关键事件</CardTitle>
        <p className="text-sm text-muted-foreground">
          本次游戏中的重要时刻
        </p>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          {events.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              暂无关键事件记录
            </div>
          ) : (
            <div className="space-y-3 pr-4">
              {events.map((event, idx) => {
                const category = getEventCategory(event.event_type)
                const config = categoryConfig[category]

                return (
                  <div
                    key={event.event_id || idx}
                    className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className={`mt-0.5 ${config.color.split(' ')[0]}`}>
                      {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={config.color}>
                          {config.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {event.event_type}
                        </span>
                      </div>
                      <p className="text-sm">{event.description}</p>
                      {event.timestamp && (
                        <time
                          className="text-xs text-muted-foreground mt-1 block"
                          dateTime={event.timestamp}
                        >
                          {formatDistanceToNow(new Date(event.timestamp), {
                            addSuffix: true,
                            locale: zhCN,
                          })}
                        </time>
                      )}
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
