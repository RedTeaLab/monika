import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { User, Users, ScrollText, Mail, BarChart3, Swords, LogOut, Plus } from 'lucide-react'
import { characterApi } from '@/lib/api'

interface StatCard {
  title: string
  value: string | number
  icon: React.ReactNode
  description?: string
}

function StatCard({ title, value, icon, description }: StatCard) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          <div className="text-muted-foreground">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState({
    characters: 0,
    parties: 0,
    sessions: 0,
    unreadMessages: 0,
  })

  useEffect(() => {
    // 从 API 获取角色统计数据
    const fetchStats = async () => {
      try {
        const characters = await characterApi.list()
        setStats(prev => ({
          ...prev,
          characters: characters.length,
        }))
      } catch (err) {
        console.error('Failed to fetch character count:', err)
      }
    }

    fetchStats()
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const quickActions = [
    {
      title: '创建角色',
      icon: <Plus className="h-5 w-5" />,
      description: '创建新的调查员角色',
      onClick: () => navigate('/character/new'),
    },
    {
      title: '管理角色',
      icon: <Users className="h-5 w-5" />,
      description: '查看和编辑你的角色',
      onClick: () => navigate('/character/list'),
    },
    {
      title: '开始游戏',
      icon: <Swords className="h-5 w-5" />,
      description: '选择角色开始游戏',
      onClick: () => navigate('/select-character'),
    },
  ]

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Monika</h1>
            <p className="text-sm text-muted-foreground">
              欢迎, {user.username}
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            退出登录
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="角色数"
            value={stats.characters}
            icon={<User className="h-5 w-5" />}
            description="已创建的调查员"
          />
          <StatCard
            title="团"
            value={stats.parties}
            icon={<Users className="h-5 w-5" />}
            description="参与的游戏团"
          />
          <StatCard
            title="游戏场次"
            value={stats.sessions}
            icon={<ScrollText className="h-5 w-5" />}
            description="总游戏次数"
          />
          <StatCard
            title="未读消息"
            value={stats.unreadMessages}
            icon={<Mail className="h-5 w-5" />}
            description="站内信通知"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 快捷操作 */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>快捷操作</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {quickActions.map((action) => (
                  <button
                    key={action.title}
                    onClick={action.onClick}
                    className="p-4 border rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      {action.icon}
                      <span className="font-medium">{action.title}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {action.description}
                    </p>
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* 最近活动 */}
            <Card>
              <CardHeader>
                <CardTitle>最近活动</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  暂无活动记录
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 侧边栏 */}
          <div className="space-y-6">
            {/* 系统公告 */}
            <Card>
              <CardHeader>
                <CardTitle>系统公告</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-4 text-muted-foreground">
                  暂无公告
                </div>
              </CardContent>
            </Card>

            {/* 数据统计图表 */}
            <Card>
              <CardHeader>
                <CardTitle>统计</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center py-4">
                  <BarChart3 className="h-16 w-16 text-muted-foreground" />
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  详细统计数据即将上线
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
