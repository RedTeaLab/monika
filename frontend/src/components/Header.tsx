import { Button } from '@/components/ui/button'
import { LogOut, BookOpen, ListTodo, Sun, Moon, Contrast, HelpCircle } from 'lucide-react'
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
  const { theme, toggleTheme, setTheme } = useTheme()

  const handleLogout = async () => {
    await logout()
  }

  const getThemeIcon = () => {
    if (theme === 'high-contrast') return <Contrast className="w-4 h-4" />
    return theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />
  }

  const getThemeLabel = () => {
    if (theme === 'high-contrast') return 'Switch to light mode'
    if (theme === 'dark') return 'Switch to high contrast mode'
    return 'Switch to dark mode'
  }

  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-4" role="banner">
      <div className="flex items-center gap-2">
        <h1 className="font-bold text-lg">Monika</h1>
        <span className="text-muted-foreground" aria-hidden="true">|</span>
        <span className="text-sm text-muted-foreground">
          当前角色: {characterName}
        </span>
        {user && (
          <>
            <span className="text-muted-foreground" aria-hidden="true">|</span>
            <span className="text-sm text-muted-foreground">
              用户: {user.username}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2" role="group" aria-label="Header actions">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          aria-label={getThemeLabel()}
        >
          {getThemeIcon()}
        </Button>
        {onToggleRules && (
          <Button
            variant={showRules ? "default" : "ghost"}
            size="sm"
            onClick={onToggleRules}
            aria-pressed={showRules}
          >
            <BookOpen className="w-4 h-4 mr-2" aria-hidden="true" />
            规则
          </Button>
        )}
        {onToggleEvents && (
          <Button
            variant={showEvents ? "default" : "ghost"}
            size="sm"
            onClick={onToggleEvents}
            aria-pressed={showEvents}
          >
            <ListTodo className="w-4 h-4 mr-2" aria-hidden="true" />
            日志
          </Button>
        )}
        {onToggleHelp && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleHelp}
            aria-label="Open help"
          >
            <HelpCircle className="w-4 h-4 mr-2" aria-hidden="true" />
            帮助
          </Button>
        )}
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleLogout}
          aria-label="Log out"
        >
          <LogOut className="w-4 h-4 mr-2" aria-hidden="true" />
          退出
        </Button>
      </div>
    </header>
  )
}
