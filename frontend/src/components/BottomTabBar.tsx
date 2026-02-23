import { MessageSquare, HeartPulse, BookOpen, ListTodo } from 'lucide-react'
import type { TabId } from './TabView'
import { hapticFeedback } from '@/hooks/useTouchOptimizer'

interface BottomTabBarProps {
  activeTab: TabId
  onChange: (tabId: TabId) => void
}

const tabConfig = [
  { id: 'messages' as const, label: '消息', icon: MessageSquare, ariaLabel: 'Messages tab' },
  { id: 'state' as const, label: '状态', icon: HeartPulse, ariaLabel: 'Character state tab' },
  { id: 'rules' as const, label: '规则', icon: BookOpen, ariaLabel: 'Rules tab' },
  { id: 'events' as const, label: '日志', icon: ListTodo, ariaLabel: 'Event log tab' },
]

export function BottomTabBar({ activeTab, onChange }: BottomTabBarProps) {
  const handleTabChange = (tabId: TabId) => {
    hapticFeedback('light')
    onChange(tabId)
  }

  return (
    <nav className="lg:hidden flex border-t bg-background pb-safe-area-bottom" aria-label="Main navigation">
      {tabConfig.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id

        return (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`
              flex-1 flex flex-col items-center justify-center py-3 min-h-[56px]
              transition-colors duration-200
              ${isActive ? 'text-primary bg-primary/5' : 'text-muted-foreground'}
            `}
            aria-label={tab.ariaLabel}
            aria-selected={isActive}
            role="tab"
          >
            <Icon className="h-6 w-6" aria-hidden="true" />
            <span className="text-xs mt-1">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
