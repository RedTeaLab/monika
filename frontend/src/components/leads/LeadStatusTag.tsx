/**
 * LeadStatusTag Component
 *
 * Displays a color-coded status badge for game leads.
 * Supports all lead statuses with visual indicators.
 */

import { Badge } from '@/components/ui/badge'
import type { LeadStatus } from '@/types/lead'

interface LeadStatusTagProps {
  status: LeadStatus
  className?: string
}

/**
 * Status configuration mapping
 * Each status has a label (Chinese) and corresponding badge styling
 */
const statusConfig: Record<LeadStatus, { label: string; className: string }> = {
  available: {
    label: '可用',
    className: 'bg-green-500 hover:bg-green-600 text-white border-green-600',
  },
  in_progress: {
    label: '进行中',
    className: 'bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-600',
  },
  completed: {
    label: '已完成',
    className: 'bg-blue-500 hover:bg-blue-600 text-white border-blue-600',
  },
  failed: {
    label: '失败',
    className: 'bg-red-500 hover:bg-red-600 text-white border-red-600',
  },
  expired: {
    label: '已过期',
    className: 'bg-gray-400 hover:bg-gray-500 text-white border-gray-500',
  },
  archived: {
    label: '已归档',
    className: 'bg-secondary hover:bg-secondary/80 text-secondary-foreground border-transparent',
  },
}

export function LeadStatusTag({ status, className }: LeadStatusTagProps) {
  const config = statusConfig[status] || statusConfig.available

  return (
    <Badge className={`${config.className} ${className || ''}`}>
      {config.label}
    </Badge>
  )
}
