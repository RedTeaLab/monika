import { MessageSquare, HeartPulse, BookOpen } from 'lucide-react'
import type { TabId } from './TabView'

interface BottomTabBarProps {
  activeTab: TabId
  onChange: (tabId: TabId) => void
}

const tabConfig = [
  { id: 'messages' as const, label: '消息', icon: MessageSquare },
  { id: 'state' as const, label: '状态', icon: HeartPulse },
  { id: 'rules' as const, label: '规则', icon: BookOpen },
]

export function BottomTabBar({ activeTab, onChange }: BottomTabBarProps) {
  return (
    <nav className="md:lg:hidden flex border-t bg-background pb-safe-area-bottom">
      {tabConfig.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id

        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`
              flex-1 flex flex-col items-center justify-center py-3 min-h-[56px]
              transition-colors duration-200
              ${isActive ? 'text-primary bg-primary/5' : 'text-muted-foreground'}
            `}
            aria-label={tab.label}
            aria-selected={isActive}
            role="tab"
          >
            <Icon className="h-6 w-6" />
            <span className="text-xs mt-1">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
