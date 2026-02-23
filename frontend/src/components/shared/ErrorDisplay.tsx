import { AlertCircle, AlertTriangle, XCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ErrorLevel = "warning" | "error" | "critical"

export interface ErrorDisplayProps {
  message: string
  level?: ErrorLevel
  onRetry?: () => void
  className?: string
}

const errorConfig = {
  warning: {
    icon: AlertTriangle,
    containerClass: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800",
    iconClass: "text-yellow-600 dark:text-yellow-500",
    title: "Warning",
  },
  error: {
    icon: AlertCircle,
    containerClass: "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800",
    iconClass: "text-red-600 dark:text-red-500",
    title: "Error",
  },
  critical: {
    icon: XCircle,
    containerClass: "bg-red-100 border-red-300 dark:bg-red-950/40 dark:border-red-900",
    iconClass: "text-red-700 dark:text-red-400",
    title: "Critical Error",
  },
}

export function ErrorDisplay({
  message,
  level = "error",
  onRetry,
  className,
}: ErrorDisplayProps) {
  const config = errorConfig[level]
  const Icon = config.icon

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-6 rounded-lg border text-center gap-3",
        config.containerClass,
        className
      )}
    >
      <Icon className={cn("h-8 w-8", config.iconClass)} />
      <div className="space-y-1">
        <p className={cn("font-semibold text-sm", config.iconClass)}>
          {config.title}
        </p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-2"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      )}
    </div>
  )
}

export function InlineError({
  message,
  level = "error",
  className,
}: {
  message: string
  level?: ErrorLevel
  className?: string
}) {
  const config = errorConfig[level]
  const Icon = config.icon

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm",
        config.iconClass,
        className
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}
