import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SessionStatusBadge } from '@/components/SessionStatusBadge'
import { Clock, Calendar, MapPin, Eye } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { GameSession } from '@/types/session'

interface SessionCardProps {
  session: GameSession
  onView?: () => void
  onRecap?: () => void
  onResume?: () => void
  className?: string
}

export function SessionCard({
  session,
  onView,
  onRecap,
  onResume,
  className = '',
}: SessionCardProps) {
  const canResume = session.status === 'paused' || session.status === 'active'
  const hasSummary = !!session.summary

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}秒`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`
    return `${Math.floor(seconds / 3600)}小时${Math.floor((seconds % 3600) / 60)}分钟`
  }

  return (
    <Card className={`hover:shadow-md transition-shadow ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base truncate">
              {session.scenario_id || '未命名剧本'}
            </h3>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{session.current_scene}</span>
            </div>
          </div>
          <SessionStatusBadge status={session.status} />
        </div>
      </CardHeader>

      <CardContent className="pb-3 space-y-2">
        {session.summary?.narrative_summary && (
          <p className="text-sm text-muted-foreground line-clamp-3">
            {session.summary.narrative_summary}
          </p>
        )}

        {session.summary?.key_events && session.summary.key_events.length > 0 && (
          <div className="text-sm">
            <span className="font-medium">关键事件:</span>
            <span className="text-muted-foreground ml-1">
              {session.summary.key_events.length} 件
            </span>
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <time dateTime={session.created_at}>
              {formatDistanceToNow(new Date(session.created_at), {
                addSuffix: true,
                locale: zhCN,
              })}
            </time>
          </div>
          {session.summary?.duration && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{formatDuration(session.summary.duration)}</span>
            </div>
          )}
        </div>

        {session.summary?.state_snapshots && session.summary.state_snapshots.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {session.summary.state_snapshots.map((snapshot, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 bg-muted rounded"
              >
                角色 {snapshot.character_id.slice(0, 8)}
                {snapshot.hp_change !== 0 && (
                  <span className="ml-1 text-red-500">
                    HP{snapshot.hp_change > 0 ? '+' : ''}{snapshot.hp_change}
                  </span>
                )}
                {snapshot.san_change !== 0 && (
                  <span className="ml-1 text-blue-500">
                    SAN{snapshot.san_change > 0 ? '+' : ''}{snapshot.san_change}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-3 flex gap-2">
        {canResume && onResume && (
          <Button size="sm" variant="default" onClick={onResume} className="flex-1">
            继续游戏
          </Button>
        )}
        {hasSummary && onRecap && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRecap}
            className={canResume ? 'flex-1' : 'flex-1 sm:flex-none'}
          >
            <Eye className="h-4 w-4 mr-1" />
            回顾
          </Button>
        )}
        {onView && (
          <Button size="sm" variant="ghost" onClick={onView}>
            详情
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
