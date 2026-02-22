import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ZoomIn, ZoomOut, RefreshCw, Filter } from 'lucide-react'
import { TimelineNode } from '@/components/TimelineNode'
import type { GameEvent } from '@/types/event'

interface TimelineProps {
  events: GameEvent[]
  className?: string
}

type ZoomLevel = 1 | 2 | 3 | 4 | 5
type FilterCategory = 'all' | 'interaction' | 'check' | 'combat' | 'sanity' | 'state' | 'system' | 'chase'

const categoryLabels: Record<FilterCategory, string> = {
  all: '全部',
  interaction: '交互',
  check: '检定',
  combat: '战斗',
  sanity: '理智',
  state: '状态',
  system: '系统',
  chase: '追逐',
}

const zoomDescriptions: Record<ZoomLevel, string> = {
  1: '紧凑',
  2: '简洁',
  3: '标准',
  4: '详细',
  5: '完整',
}

export function Timeline({ events, className = '' }: TimelineProps) {
  const [zoom, setZoom] = useState<ZoomLevel>(3)
  const [filter, setFilter] = useState<FilterCategory>('all')
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set())

  // Filter events by category
  const filteredEvents = useMemo(() => {
    if (filter === 'all') return events
    return events.filter((event) => event.type.category === filter)
  }, [events, filter])

  // Get event counts by category
  const eventCounts = useMemo(() => {
    const counts = {} as Record<string, number>
    events.forEach((event) => {
      const cat = event.type.category
      counts[cat] = (counts[cat] || 0) + 1
    })
    return counts
  }, [events])

  const toggleExpand = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev)
      if (next.has(eventId)) {
        next.delete(eventId)
      } else {
        next.add(eventId)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedEvents(new Set(filteredEvents.map((e) => e.event_id)))
  }

  const collapseAll = () => {
    setExpandedEvents(new Set())
  }

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 1, 5) as ZoomLevel)
  }

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 1, 1) as ZoomLevel)
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>事件时间线</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={expandAll}>
              展开全部
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll}>
              折叠全部
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          按时间顺序显示的所有游戏事件
        </p>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4 pt-4">
          {/* Category Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {Object.entries(categoryLabels).map(([key, label]) => {
              const count = key === 'all' ? events.length : (eventCounts[key] || 0)
              return (
                <Badge
                  key={key}
                  variant={filter === key ? 'default' : 'outline'}
                  className="cursor-pointer hover:bg-accent"
                  onClick={() => setFilter(key as FilterCategory)}
                >
                  {label}
                  <span className="ml-1 opacity-70">({count})</span>
                </Badge>
              )
            })}
          </div>

          {/* Zoom Control */}
          <div className="flex items-center gap-3 ml-auto">
            <Button variant="ghost" size="icon" onClick={handleZoomOut} disabled={zoom === 1}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <div className="flex flex-col items-center min-w-[80px]">
              <div className="text-xs text-muted-foreground mb-1">
                {zoomDescriptions[zoom]}
              </div>
              <Slider
                value={[zoom]}
                onValueChange={([value]) => setZoom(value as ZoomLevel)}
                min={1}
                max={5}
                step={1}
                className="w-20"
              />
            </div>
            <Button variant="ghost" size="icon" onClick={handleZoomIn} disabled={zoom === 5}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setZoom(3)}
              title="重置缩放"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <ScrollArea className={`h-[${400 + (zoom - 1) * 100}px]`}>
          {filteredEvents.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              {filter === 'all' ? '暂无事件记录' : '该分类下暂无事件'}
            </div>
          ) : (
            <div className="py-4">
              {filteredEvents.map((event) => (
                <TimelineNode
                  key={event.event_id}
                  event={event}
                  isExpanded={expandedEvents.has(event.event_id)}
                  onToggle={() => toggleExpand(event.event_id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
