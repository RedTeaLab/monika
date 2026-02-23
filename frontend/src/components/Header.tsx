import { Button } from '@/components/ui/button'
import { LogOut, BookOpen, ListTodo, Sun, Moon, HelpCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/hooks/useTheme'

interface HeaderProps {
  characterName: string
  onToggleRules?: () => void
  showRules?: boolean
  onToggleEvents?: () => void
  showEvents?: boolean
  onToggleHelp?: () => void
}

export function Header({
  characterName,
  onToggleRules,
  showRules = false,
  onToggleEvents,
  showEvents = false,
  onToggleHelp
}: HeaderProps) {
  const { logout, user } = useAuth()
  const { theme, toggleTheme } = useTheme()

  const handleLogout = async () => {
    await logout()
  }

  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-4">
      <div className="flex items-center gap-2">
        <h1 className="font-bold text-lg">Monika</h1>
        <span className="text-muted-foreground">|</span>
        <span className="text-sm text-muted-foreground">
          当前角色: {characterName}
        </span>
        {user && (
          <>
            <span className="text-muted-foreground">|</span>
            <span className="text-sm text-muted-foreground">
              用户: {user.username}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </Button>
        {onToggleRules && (
          <Button
            variant={showRules ? "default" : "ghost"}
            size="sm"
            onClick={onToggleRules}
          >
            <BookOpen className="w-4 h-4 mr-2" />
            规则
          </Button>
        )}
        {onToggleEvents && (
          <Button
            variant={showEvents ? "default" : "ghost"}
            size="sm"
            onClick={onToggleEvents}
          >
            <ListTodo className="w-4 h-4 mr-2" />
            日志
          </Button>
        )}
        {onToggleHelp && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleHelp}
          >
            <HelpCircle className="w-4 h-4 mr-2" />
            帮助
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="w-4 h-4 mr-2" />
          退出
        </Button>
      </div>
    </header>
  )
}
