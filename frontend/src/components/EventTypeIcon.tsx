import { MessageSquare, Swords, Ghost, Eye, Heart, Settings, AlertCircle } from 'lucide-react'
import type { EventCategory } from '@/types/event'
import { cn } from '@/lib/utils'

interface EventTypeIconProps {
  category: EventCategory
  className?: string
}

const categoryConfig = {
  interaction: {
    icon: MessageSquare,
    color: 'bg-blue-500',
    label: '交互',
  },
  check: {
    icon: Eye,
    color: 'bg-green-500',
    label: '检定',
  },
  combat: {
    icon: Swords,
    color: 'bg-red-500',
    label: '战斗',
  },
  sanity: {
    icon: Ghost,
    color: 'bg-purple-500',
    label: '理智',
  },
  state: {
    icon: Heart,
    color: 'bg-pink-500',
    label: '状态',
  },
  system: {
    icon: Settings,
    color: 'bg-gray-500',
    label: '系统',
  },
  chase: {
    icon: AlertCircle,
    color: 'bg-amber-500',
    label: '追逐',
  },
}

export function EventTypeIcon({ category, className = '' }: EventTypeIconProps) {
  const config = categoryConfig[category] || categoryConfig.system
  const Icon = config.icon

  return (
    <div className={cn('relative', className)}>
      <div className={`w-6 h-6 rounded-full ${config.color} flex items-center justify-center`}>
        <Icon className="h-3.5 w-3.5 text-white" />
      </div>
    </div>
  )
}

export { categoryConfig as eventTypeConfig }
