import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { SessionCard } from '@/components/SessionCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search, Filter, Plus, Loader2 } from 'lucide-react'
import type { GameSession, SessionStatus, SessionListQuery } from '@/types/session'

// TODO: Replace with actual API import when backend is ready
// import { sessionsApi } from '@/services/api/sessions'

// Mock data for development - will be replaced with API calls
const mockSessions: GameSession[] = []

interface FilterState {
  search: string
  status: SessionStatus | 'all'
}

export function SessionsPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<GameSession[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    status: 'all',
  })

  useEffect(() => {
    fetchSessions()
  }, [filters])

  const fetchSessions = async () => {
    setLoading(true)
    try {
      // TODO: Replace with actual API call
      // const query: SessionListQuery = {
      //   search: filters.search || undefined,
      //   status: filters.status === 'all' ? undefined : [filters.status],
      // }
      // const response = await sessionsApi.listSessions(query)
      // setSessions(response.sessions)

      // Mock data for now
      setSessions(mockSessions)
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleResume = (sessionId: string) => {
    // Navigate to game console with session
    navigate(`/game?session=${sessionId}`)
  }

  const handleRecap = (sessionId: string) => {
    // Navigate to recap page
    navigate(`/recap/${sessionId}`)
  }

  const handleViewDetails = (sessionId: string) => {
    // Could open a dialog or navigate to details page
    navigate(`/sessions/${sessionId}`)
  }

  const filteredSessions = sessions.filter((session) => {
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      const matchesSearch =
        (session.scenario_id || '').toLowerCase().includes(searchLower) ||
        session.current_scene.toLowerCase().includes(searchLower) ||
        session.id.toLowerCase().includes(searchLower)
      if (!matchesSearch) return false
    }
    if (filters.status !== 'all' && session.status !== filters.status) {
      return false
    }
    return true
  })

  const sessionCounts = {
    all: sessions.length,
    active: sessions.filter((s) => s.status === 'active').length,
    paused: sessions.filter((s) => s.status === 'paused').length,
    completed: sessions.filter((s) => s.status === 'completed').length,
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">游戏记录</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                查看和管理你的游戏会话
              </p>
            </div>
            <Button onClick={() => navigate('/select-character')}>
              <Plus className="h-4 w-4 mr-2" />
              新游戏
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Search and Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索剧本、场景或会话ID..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="pl-9"
                />
              </div>
              <Tabs
                value={filters.status}
                onValueChange={(value) =>
                  setFilters({ ...filters, status: value as FilterState['status'] })
                }
                className="w-full sm:w-auto"
              >
                <TabsList>
                  <TabsTrigger value="all">
                    全部 <Badge variant="secondary" className="ml-1">{sessionCounts.all}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="active">
                    进行中 <Badge variant="secondary" className="ml-1">{sessionCounts.active}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="paused">
                    已暂停 <Badge variant="secondary" className="ml-1">{sessionCounts.paused}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="completed">
                    已完成 <Badge variant="secondary" className="ml-1">{sessionCounts.completed}</Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardContent>
        </Card>

        {/* Sessions Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredSessions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Filter className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {filters.search || filters.status !== 'all'
                  ? '没有找到匹配的游戏记录'
                  : '还没有游戏记录'}
              </h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-md">
                {filters.search || filters.status !== 'all'
                  ? '尝试调整搜索条件或筛选器'
                  : '开始一场新的冒险，你的游戏记录将显示在这里'}
              </p>
              {!filters.search && filters.status === 'all' && (
                <Button onClick={() => navigate('/select-character')}>
                  <Plus className="h-4 w-4 mr-2" />
                  开始新游戏
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onResume={() => handleResume(session.id)}
                onRecap={session.summary ? () => handleRecap(session.id) : undefined}
                onView={() => handleViewDetails(session.id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
