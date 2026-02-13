import { useState, useCallback } from "react"
import { Dice3, Shield, Heart } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { RuleInlineCitation } from "@/components/rules"
import { RuleDetailDialog } from "@/components/rules"
import type { ToolResult } from "@/types/websocket"

export type MessageRole = "kp" | "player" | "ooc" | "system"

export interface StateChange {
  type: "hp" | "san" | "luck" | "damage" | "roll" | "generic"
  value?: string
  change?: number
  reason?: string
  eventId?: string
}

export interface Message {
  id: string
  role: MessageRole
  content: string
  timestamp: Date
  sender?: string // Player name for player messages
  stateChanges?: StateChange[]
  next?: string[] // Next actions suggestions
  toolResults?: ToolResult[]
}

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  // Rule dialog state management
  const [selectedRule, setSelectedRule] = useState<string | null>(null)
  const [showRuleDialog, setShowRuleDialog] = useState(false)

  const handleRuleClick = useCallback((ruleId: string) => {
    setSelectedRule(ruleId)
    setShowRuleDialog(true)
  }, [])

  const handleDialogClose = useCallback(() => {
    setShowRuleDialog(false)
  }, [])

  const isPlayer = message.role === "player"

  const getBubbleClass = () => {
    switch (message.role) {
      case "kp":
        return "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
      case "player":
        return "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 ml-8"
      case "ooc":
        return "bg-gray-50 dark:bg-gray-950/30 border-gray-300 dark:border-gray-700 border-dashed"
      case "system":
        return "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800"
      default:
        return ""
    }
  }

  const getRoleLabel = () => {
    switch (message.role) {
      case "kp":
        return "KP"
      case "player":
        return message.sender || "Player"
      case "ooc":
        return "OOC"
      case "system":
        return "System"
    }
  }

  const getRoleBadgeVariant = (): "default" | "secondary" | "outline" | "success" | "warning" | "info" | "destructive" => {
    switch (message.role) {
      case "kp":
        return "info"
      case "player":
        return "success"
      case "ooc":
        return "secondary"
      case "system":
        return "warning"
    }
  }

  const getStateIcon = (type: StateChange["type"]) => {
    switch (type) {
      case "hp":
      case "damage":
        return <Heart className="h-3 w-3" />
      case "san":
        return <Shield className="h-3 w-3" />
      case "roll":
        return <Dice3 className="h-3 w-3" />
      default:
        return null
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1 animate-in slide-in-from-bottom-2 duration-300",
        isPlayer && "items-end"
      )}
    >
      {/* Role badge and timestamp */}
      <div className={cn("flex items-center gap-2 text-xs", isPlayer && "flex-row-reverse")}>
        <Badge variant={getRoleBadgeVariant()} className="text-xs">
          {getRoleLabel()}
        </Badge>
        <span className="text-muted-foreground">{formatTime(message.timestamp)}</span>
      </div>

      {/* Message content */}
      <Card
        className={cn(
          "max-w-[80%] p-3 shadow-sm transition-all hover:shadow",
          getBubbleClass()
        )}
      >
        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>

        {/* State changes */}
        {message.stateChanges && message.stateChanges.length > 0 && (
          <div className="mt-3 space-y-1 border-t border-border/50 pt-2">
            <div className="text-xs font-semibold text-muted-foreground">
              [State Changes]
            </div>
            {message.stateChanges.map((change, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 text-xs bg-background/50 rounded px-2 py-1"
              >
                {getStateIcon(change.type)}
                <span className="font-medium">
                  {change.type.toUpperCase()}
                  {change.change !== undefined && ` ${change.change > 0 ? "+" : ""}${change.change}`}
                </span>
                {change.value && <span className="text-muted-foreground">→ {change.value}</span>}
                {change.reason && (
                  <span className="text-muted-foreground text-xs">
                    ({change.reason})
                  </span>
                )}
                {change.eventId && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    #{change.eventId}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Next actions */}
        {message.next && message.next.length > 0 && (
          <div className="mt-3 space-y-1 border-t border-border/50 pt-2">
            <div className="text-xs font-semibold text-muted-foreground">[Next]</div>
            <div className="space-y-1">
              {message.next.map((action, idx) => (
                <div
                  key={idx}
                  className="text-xs bg-primary/5 hover:bg-primary/10 rounded px-2 py-1 cursor-pointer transition-colors"
                >
                  {idx + 1}. {action}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rule citations */}
        {message.toolResults && message.toolResults.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-border/50 pt-2">
            {message.toolResults.map((toolResult, idx) => (
              <RuleInlineCitation
                key={`${toolResult.tool}-${idx}`}
                toolResult={toolResult}
                onRuleClick={handleRuleClick}
                compact={isPlayer}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Rule detail dialog */}
      {selectedRule && (
        <RuleDetailDialog
          ruleId={selectedRule}
          open={showRuleDialog}
          onOpenChange={handleDialogClose}
        />
      )}
    </div>
  )
}
