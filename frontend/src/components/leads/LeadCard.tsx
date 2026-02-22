/**
 * LeadCard Component
 *
 * Displays an individual lead with title, description, status,
 * priority, type, and interactive status update functionality.
 */

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Archive,
  AlertTriangle,
  Calendar,
  MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Lead, LeadStatus, LeadPriority, LeadType } from '@/types/lead'

interface LeadCardProps {
  lead: Lead
  className?: string
  onStatusChange?: (leadId: string, newStatus: LeadStatus) => void
  onClick?: () => void
}

/**
 * Get icon for lead status
 */
function getStatusIcon(status: LeadStatus) {
  switch (status) {
    case 'available':
      return <AlertCircle className="h-4 w-4" />
    case 'in_progress':
      return <Clock className="h-4 w-4" />
    case 'completed':
      return <CheckCircle2 className="h-4 w-4" />
    case 'failed':
      return <XCircle className="h-4 w-4" />
    case 'expired':
      return <AlertTriangle className="h-4 w-4" />
    case 'archived':
      return <Archive className="h-4 w-4" />
    default:
      return <Clock className="h-4 w-4" />
  }
}

/**
 * Get badge variant for status
 */
function getStatusBadgeVariant(status: LeadStatus): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'available':
      return 'secondary'
    case 'in_progress':
      return 'outline'
    case 'completed':
      return 'default'
    case 'failed':
      return 'destructive'
    case 'expired':
      return 'destructive'
    case 'archived':
      return 'outline'
    default:
      return 'outline'
  }
}

/**
 * Get badge variant for priority
 */
function getPriorityBadgeVariant(priority: LeadPriority): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (priority) {
    case 'critical':
      return 'destructive'
    case 'high':
      return 'default'
    case 'medium':
      return 'secondary'
    case 'low':
      return 'outline'
    default:
      return 'outline'
  }
}

/**
 * Get status label (Chinese)
 */
function getStatusLabel(status: LeadStatus): string {
  const labels: Record<LeadStatus, string> = {
    available: '可用',
    in_progress: '进行中',
    completed: '已完成',
    failed: '失败',
    expired: '已过期',
    archived: '已归档',
  }
  return labels[status] || status
}

/**
 * Get priority label (Chinese)
 */
function getPriorityLabel(priority: LeadPriority): string {
  const labels: Record<LeadPriority, string> = {
    critical: '紧急',
    high: '高',
    medium: '中',
    low: '低',
  }
  return labels[priority] || priority
}

/**
 * Get type label (Chinese)
 */
function getTypeLabel(type: LeadType): string {
  const labels: Record<LeadType, string> = {
    investigate: '调查',
    interact: '互动',
    travel: '旅行',
    combat: '战斗',
    rest: '休息',
    custom: '自定义',
  }
  return labels[type] || type
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function LeadCard({
  lead,
  className,
  onStatusChange,
  onClick,
}: LeadCardProps) {
  const [isUpdating, setIsUpdating] = useState(false)

  /**
   * Handle status change with loading state
   */
  const handleStatusChange = async (newStatus: LeadStatus) => {
    if (!onStatusChange || isUpdating) return

    setIsUpdating(true)
    try {
      await onStatusChange(lead.id, newStatus)
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <Card
      className={cn(
        'hover:shadow-md transition-shadow cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          {/* Status Icon */}
          <div className="mt-0.5 text-muted-foreground">
            {getStatusIcon(lead.status)}
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0 space-y-1">
            {/* Header: Title + Priority + Status */}
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium text-sm truncate">{lead.title}</h4>
              <Badge
                variant={getPriorityBadgeVariant(lead.priority)}
                className="text-xs"
              >
                {getPriorityLabel(lead.priority)}
              </Badge>
              <Badge
                variant={getStatusBadgeVariant(lead.status)}
                className="text-xs"
              >
                {getStatusLabel(lead.status)}
              </Badge>
            </div>

            {/* Description */}
            {lead.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {lead.description}
              </p>
            )}

            {/* Type, timestamp, and AI indicator */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="capitalize">
                {getTypeLabel(lead.type)}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatTimestamp(lead.created_at)}
              </span>
              {lead.ai_generated && (
                <>
                  <span>•</span>
                  <Badge variant="outline" className="text-[10px] h-4">
                    AI
                  </Badge>
                </>
              )}
            </div>

            {/* Related Event Indicator */}
            {lead.source_event_id && (
              <div
                data-testid="related-event"
                className="flex items-center gap-1 text-xs text-muted-foreground"
              >
                <MessageSquare className="h-3 w-3" />
                <span>Related event</span>
              </div>
            )}

            {/* Status Update Buttons - Available */}
            {lead.status === 'available' && onStatusChange && (
              <div className="flex items-center gap-1 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleStatusChange('in_progress')
                  }}
                  disabled={isUpdating}
                >
                  Start
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleStatusChange('completed')
                  }}
                  disabled={isUpdating}
                >
                  Complete
                </Button>
              </div>
            )}

            {/* Status Update Buttons - In Progress */}
            {lead.status === 'in_progress' && onStatusChange && (
              <div className="flex items-center gap-1 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleStatusChange('completed')
                  }}
                  disabled={isUpdating}
                >
                  Complete
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleStatusChange('failed')
                  }}
                  disabled={isUpdating}
                >
                  Fail
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
