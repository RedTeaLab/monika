import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface ProgressIndicatorProps {
  value?: number
  max?: number
  label?: string
  showValue?: boolean
  size?: "sm" | "md" | "lg"
  className?: string
}

const sizeClasses = {
  sm: "h-1",
  md: "h-2",
  lg: "h-3",
}

export function ProgressIndicator({
  value,
  max = 100,
  label,
  showValue = false,
  size = "md",
  className,
}: ProgressIndicatorProps) {
  const percentage = max > 0 ? ((value || 0) / max) * 100 : 0

  return (
    <div className={cn("space-y-1", className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs">
          {label && <span className="text-muted-foreground">{label}</span>}
          {showValue && (
            <span className="text-muted-foreground font-medium">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}
      <Progress
        value={percentage}
        max={max}
        className={cn(sizeClasses[size])}
      />
    </div>
  )
}

export function LoadingProgress({
  message,
  value,
  max,
}: {
  message?: string
  value?: number
  max?: number
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-4">
      <ProgressIndicator
        value={value}
        max={max || 100}
        size="md"
        showValue
      />
      {message && (
        <p className="text-sm text-muted-foreground animate-pulse">
          {message}
        </p>
      )}
    </div>
  )
}
