import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Loader2, Calendar, Clock, MapPin } from 'lucide-react'
import { NarrativeSummary } from '@/components/NarrativeSummary'
import { KeyEventsList } from '@/components/KeyEventsList'
import { StateChangesPanel } from '@/components/StateChangesPanel'
import { CluesDiscovery } from '@/components/CluesDiscovery'
import { Timeline } from '@/components/Timeline'
import { SessionStatusBadge } from '@/components/SessionStatusBadge'
import type { SessionSummary, GameSession } from '@/types/session'

// TODO: Replace with actual API imports when backend is ready
// import { sessionsApi } from '@/services/api/sessions'
// import { eventsApi } from '@/services/api/events'

interface RecapData {
  session: GameSession
  summary: SessionSummary
  events: any[] // Will be typed as GameEvent[] when event types are available
}

export function RecapPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<RecapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (sessionId) {
      fetchRecapData(sessionId)
    }
  }, [sessionId])

  const fetchRecapData = async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      // TODO: Replace with actual API calls
      // const [session, summary, events] = await Promise.all([
      //   sessionsApi.getSession(id),
      //   sessionsApi.getSessionSummary(id),
      //   eventsApi.listEvents({ session_id: id, limit: 100 }),
      // ])
      // setData({ session, summary, events })

      // Mock data for now
      setData(null)
    } catch (err) {
      console.error('Failed to fetch recap data:', err)
      setError('加载复盘数据失败')
    } finally {
      setLoading(false)
    }
  }

  const handleResume = () => {
    if (sessionId) {
      navigate(`/game?session=${sessionId}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">加载复盘数据...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground mb-4">{error || '复盘数据不存在'}</p>
            <Button onClick={() => navigate('/sessions')}>返回列表</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { session, summary, events } = data

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/sessions')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">游戏复盘</h1>
                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                  <span>{session.scenario_id || '未命名剧本'}</span>
                  <SessionStatusBadge status={session.status} />
                </div>
              </div>
            </div>
            {(session.status === 'paused' || session.status === 'active') && (
              <Button onClick={handleResume}>继续游戏</Button>
            )}
          </div>

          {/* Session Info Bar */}
          <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              <time dateTime={summary.started_at}>
                {new Date(summary.started_at).toLocaleString('zh-CN')}
              </time>
            </div>
            {summary.ended_at && (
              <div className="flex items-center gap-1.5">
                <span>结束于:</span>
                <time dateTime={summary.ended_at}>
                  {new Date(summary.ended_at).toLocaleString('zh-CN')}
                </time>
              </div>
            )}
            {summary.duration && (
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                <span>时长: {formatDuration(summary.duration)}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              <span>{session.current_scene}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="summary" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 lg:w-auto">
            <TabsTrigger value="summary">摘要</TabsTrigger>
            <TabsTrigger value="events">关键事件</TabsTrigger>
            <TabsTrigger value="state">状态变化</TabsTrigger>
            <TabsTrigger value="clues">线索</TabsTrigger>
            <TabsTrigger value="timeline">时间线</TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="space-y-6">
            <NarrativeSummary summary={summary.narrative_summary} />
            {summary.pending_promises && summary.pending_promises.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>待完成事项</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {summary.pending_promises.map((promise, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-muted-foreground">•</span>
                        <span>{promise.description}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Events Tab */}
          <TabsContent value="events">
            <KeyEventsList events={summary.key_events} />
          </TabsContent>

          {/* State Changes Tab */}
          <TabsContent value="state">
            <StateChangesPanel snapshots={summary.state_snapshots} />
          </TabsContent>

          {/* Clues Tab */}
          <TabsContent value="clues">
            <CluesDiscovery clues={summary.discovered_clues} />
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline">
            <Timeline events={events} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}小时${minutes}分钟`
}
