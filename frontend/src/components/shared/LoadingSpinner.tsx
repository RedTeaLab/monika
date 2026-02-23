import { Loader2, Send } from "lucide-react"
import { cn } from "@/lib/utils"

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg"
  className?: string
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
}

export function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
  return (
    <Loader2
      className={cn("animate-spin", sizeClasses[size], className)}
    />
  )
}

export function LoadingOverlay({
  message,
  className,
}: {
  message?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 p-8",
        className
      )}
    >
      <LoadingSpinner size="lg" />
      {message && (
        <p className="text-sm text-muted-foreground animate-pulse">
          {message}
        </p>
      )}
    </div>
  )
}

export function LoadingButton({
  isLoading,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { isLoading?: boolean }) {
  return (
    <button
      className={cn("relative", className)}
      disabled={isLoading}
      {...props}
    >
      {isLoading && (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      )}
      {children}
    </button>
  )
}

export function SendingIndicator({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm text-muted-foreground",
        className
      )}
    >
      <Send className="h-3 w-3 animate-pulse" />
      <span>Sending...</span>
    </div>
  )
}
