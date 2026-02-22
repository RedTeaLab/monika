/**
 * LeadsPanel component for displaying game leads and clues
 * Shows leads with filtering, sorting, and status management
 */

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  RefreshCw,
  Search,
  Filter,
  SortAsc,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Archive,
  AlertTriangle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Lead, LeadStatus, LeadPriority, LeadType, LeadFilter } from "@/types/lead"
import { getLeads, updateLeadStatus } from "@/services/api/leads"

interface LeadsPanelProps {
  sessionId: string
  className?: string
  onStatusChange?: (leadId: string, newStatus: LeadStatus) => void
}

/**
 * Get icon for lead status
 */
function getStatusIcon(status: LeadStatus) {
  switch (status) {
    case "available":
      return <AlertCircle className="h-4 w-4" />
    case "in_progress":
      return <Clock className="h-4 w-4" />
    case "completed":
      return <CheckCircle2 className="h-4 w-4" />
    case "failed":
      return <XCircle className="h-4 w-4" />
    case "expired":
      return <AlertTriangle className="h-4 w-4" />
    case "archived":
      return <Archive className="h-4 w-4" />
    default:
      return <Clock className="h-4 w-4" />
  }
}

/**
 * Get badge variant for status
 */
function getStatusBadgeVariant(status: LeadStatus): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "available":
      return "secondary"
    case "in_progress":
      return "outline"
    case "completed":
      return "default"
    case "failed":
      return "destructive"
    case "expired":
      return "destructive"
    case "archived":
      return "outline"
    default:
      return "outline"
  }
}

/**
 * Get badge variant for priority
 */
function getPriorityBadgeVariant(priority: LeadPriority): "default" | "secondary" | "outline" | "destructive" {
  switch (priority) {
    case "critical":
      return "destructive"
    case "high":
      return "default"
    case "medium":
      return "secondary"
    case "low":
      return "outline"
    default:
      return "outline"
  }
}

/**
 * Get status label
 */
function getStatusLabel(status: LeadStatus): string {
  const labels: Record<LeadStatus, string> = {
    available: "Available",
    in_progress: "In Progress",
    completed: "Completed",
    failed: "Failed",
    expired: "Expired",
    archived: "Archived",
  }
  return labels[status] || status
}

/**
 * Get priority label
 */
function getPriorityLabel(priority: LeadPriority): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1)
}

/**
 * Get type label
 */
function getTypeLabel(type: LeadType): string {
  const labels: Record<LeadType, string> = {
    investigate: "Investigate",
    interact: "Interact",
    travel: "Travel",
    combat: "Combat",
    rest: "Rest",
    custom: "Custom",
  }
  return labels[type] || type
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Status counts for tabs
 */
interface StatusCounts {
  all: number
  available: number
  in_progress: number
  completed: number
  failed: number
  expired: number
  archived: number
}

/**
 * Sort options
 */
type SortOption = "priority" | "created" | "updated" | "title"
type SortDirection = "asc" | "desc"

export function LeadsPanel({ sessionId, className, onStatusChange }: LeadsPanelProps) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeStatus, setActiveStatus] = useState<LeadStatus | "all">("all")
  const [priorityFilter, setPriorityFilter] = useState<LeadPriority | "all">("all")
  const [typeFilter, setTypeFilter] = useState<LeadType | "all">("all")
  const [sortBy, setSortBy] = useState<SortOption>("priority")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [searchQuery, setSearchQuery] = useState("")

  /**
   * Fetch leads from the API
   */
  const fetchLeads = useCallback(async () => {
    if (!sessionId) return

    setIsLoading(true)
    setError(null)

    try {
      const data = await getLeads(sessionId)
      setLeads(data)
    } catch (err) {
      console.error("Failed to fetch leads:", err)
      setError(err instanceof Error ? err.message : "Failed to load leads")
    } finally {
      setIsLoading(false)
    }
  }, [sessionId])

  /**
   * Load leads on mount and when sessionId changes
   */
  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  /**
   * Calculate status counts
   */
  const statusCounts: StatusCounts = {
    all: leads.length,
    available: 0,
    in_progress: 0,
    completed: 0,
    failed: 0,
    expired: 0,
    archived: 0,
  }

  leads.forEach((lead) => {
    if (lead.status in statusCounts) {
      statusCounts[lead.status as keyof StatusCounts]++
    }
  })

  /**
   * Filter leads by status
   */
  const filteredLeads = leads.filter((lead) => {
    if (activeStatus !== "all" && lead.status !== activeStatus) return false
    if (priorityFilter !== "all" && lead.priority !== priorityFilter) return false
    if (typeFilter !== "all" && lead.type !== typeFilter) return false
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        lead.title.toLowerCase().includes(query) ||
        lead.description.toLowerCase().includes(query)
      )
    }
    return true
  })

  /**
   * Sort leads
   */
  const sortedLeads = [...filteredLeads].sort((a, b) => {
    let comparison = 0

    switch (sortBy) {
      case "priority": {
        const priorityOrder: Record<LeadPriority, number> = {
          critical: 4,
          high: 3,
          medium: 2,
          low: 1,
        }
        comparison = priorityOrder[b.priority] - priorityOrder[a.priority]
        break
      }
      case "created":
        comparison = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        break
      case "updated":
        comparison = new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        break
      case "title":
        comparison = a.title.localeCompare(b.title)
        break
    }

    return sortDirection === "asc" ? -comparison : comparison
  })

  /**
   * Handle refresh
   */
  const handleRefresh = () => {
    fetchLeads()
  }

  /**
   * Handle sort change
   */
  const handleSortChange = (newSort: SortOption) => {
    if (sortBy === newSort) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
    } else {
      setSortBy(newSort)
      setSortDirection("desc")
    }
  }

  /**
   * Handle status change
   */
  const handleStatusChange = async (leadId: string, newStatus: LeadStatus) => {
    try {
      const updated = await updateLeadStatus(leadId, { status: newStatus })
      setLeads((prev) =>
        prev.map((lead) => (lead.id === leadId ? updated : lead))
      )
      onStatusChange?.(leadId, newStatus)
    } catch (err) {
      console.error("Failed to update lead status:", err)
    }
  }

  return (
    <Card className={cn("flex flex-col h-full", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            Leads
            <Badge variant="secondary" className="ml-2">
              {leads.length}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              className="h-8 px-2"
              title="Refresh leads"
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search leads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-4 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Status Filter Tabs */}
        <Tabs
          value={activeStatus}
          onValueChange={(value) => setActiveStatus(value as LeadStatus | "all")}
          className="w-full mt-2"
        >
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="all" className="gap-1" aria-label="All">
              All ({statusCounts.all})
            </TabsTrigger>
            <TabsTrigger value="available" className="gap-1" aria-label="Available">
              <AlertCircle className="h-3 w-3" />
              Available ({statusCounts.available})
            </TabsTrigger>
            <TabsTrigger value="in_progress" className="gap-1" aria-label="In Progress">
              <Clock className="h-3 w-3" />
              In Progress ({statusCounts.in_progress})
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-1" aria-label="Completed">
              <CheckCircle2 className="h-3 w-3" />
              Completed ({statusCounts.completed})
            </TabsTrigger>
            <TabsTrigger value="failed" className="gap-1" aria-label="Failed">
              <XCircle className="h-3 w-3" />
              Failed ({statusCounts.failed})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters Row */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as LeadPriority | "all")}
              className="h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-2 focus:ring-ring"
              role="combobox"
              aria-label="All Priorities"
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as LeadType | "all")}
            className="h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-2 focus:ring-ring"
            role="combobox"
            aria-label="All Types"
          >
            <option value="all">All Types</option>
            <option value="investigate">Investigate</option>
            <option value="interact">Interact</option>
            <option value="travel">Travel</option>
            <option value="combat">Combat</option>
            <option value="rest">Rest</option>
            <option value="custom">Custom</option>
          </select>

          <div className="flex items-center gap-1">
            <SortAsc className="h-4 w-4 text-muted-foreground" />
            <select
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value as SortOption)}
              className="h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-2 focus:ring-ring"
              role="combobox"
              aria-label="Priority"
            >
              <option value="priority">Priority</option>
              <option value="created">Created</option>
              <option value="updated">Updated</option>
              <option value="title">Title</option>
            </select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-3 pt-0 overflow-hidden">
        <ScrollArea className="h-full pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Loading leads...
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-2">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
              >
                Retry
              </Button>
            </div>
          ) : sortedLeads.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              {leads.length === 0
                ? "No leads available"
                : `No ${getStatusLabel(activeStatus as LeadStatus)} leads`}
            </div>
          ) : (
            <div className="space-y-2">
              {sortedLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="text-sm p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 text-muted-foreground">
                      {getStatusIcon(lead.status)}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Header: Title + Priority */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium text-sm truncate">
                          {lead.title}
                        </h4>
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

                      {/* Type and timestamp */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="capitalize">
                          {getTypeLabel(lead.type)}
                        </span>
                        <span>•</span>
                        <span>{formatTimestamp(lead.created_at)}</span>
                        {lead.ai_generated && (
                          <>
                            <span>•</span>
                            <Badge variant="outline" className="text-[10px] h-4">
                              AI
                            </Badge>
                          </>
                        )}
                      </div>

                      {/* Status change buttons for available leads */}
                      {lead.status === "available" && onStatusChange && (
                        <div className="flex items-center gap-1 mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => handleStatusChange(lead.id, "in_progress")}
                          >
                            Start
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => handleStatusChange(lead.id, "completed")}
                          >
                            Complete
                          </Button>
                        </div>
                      )}

                      {/* Status change buttons for in_progress leads */}
                      {lead.status === "in_progress" && onStatusChange && (
                        <div className="flex items-center gap-1 mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => handleStatusChange(lead.id, "completed")}
                          >
                            Complete
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => handleStatusChange(lead.id, "failed")}
                          >
                            Fail
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
