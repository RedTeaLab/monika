import { Badge } from '@/components/ui/badge'
import type { SessionStatus } from '@/types/session'

interface SessionStatusBadgeProps {
  status: SessionStatus
  className?: string
}

const statusConfig = {
  active: {
    label: '进行中',
    variant: 'default' as const,
    className: 'bg-green-500 hover:bg-green-600 text-white border-green-600',
  },
  paused: {
    label: '已暂停',
    variant: 'secondary' as const,
    className: 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800 border-yellow-300 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-700',
  },
  completed: {
    label: '已完成',
    variant: 'outline' as const,
    className: 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  },
  abandoned: {
    label: '已放弃',
    variant: 'outline' as const,
    className: 'bg-gray-100 hover:bg-gray-200 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
  },
}

export function SessionStatusBadge({ status, className }: SessionStatusBadgeProps) {
  const config = statusConfig[status]

  return (
    <Badge variant={config.variant} className={`${config.className} ${className || ''}`}>
      {config.label}
    </Badge>
  )
}
