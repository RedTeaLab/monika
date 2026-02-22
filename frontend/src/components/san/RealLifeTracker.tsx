import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Clock, Calendar, Heart, CheckCircle, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export interface RealLifeStatus {
  id: number
  characterId: number
  startDate: string
  endDate?: string
  initialSan: number
  expectedRecovery: number
  actualRecovery?: number
  isActive: boolean
  notes?: string
}

interface RealLifeTrackerProps {
  status: RealLifeStatus | null
  currentSan: number
  maxSan: number
  onStart: (durationMonths: number) => void
  onComplete: () => void
  onCancel?: () => void
  className?: string
}

export function RealLifeTracker({
  status,
  currentSan,
  maxSan,
  onStart,
  onComplete,
  onCancel,
  className,
}: RealLifeTrackerProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>("")
  const [progress, setProgress] = useState<number>(0)

  useEffect(() => {
    if (!status || !status.isActive || !status.endDate) {
      setTimeRemaining("")
      setProgress(0)
      return
    }

    const updateTimer = () => {
      const end = new Date(status.endDate!).getTime()
      const start = new Date(status.startDate).getTime()
      const now = Date.now()

      const totalDuration = end - start
      const elapsed = now - start
      const remaining = end - now

      if (remaining <= 0) {
        setTimeRemaining("Ready to complete")
        setProgress(100)
        return
      }

      const days = Math.floor(remaining / (1000 * 60 * 60 * 24))
      const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

      setTimeRemaining(`${days}d ${hours}h remaining`)
      setProgress(Math.min(100, (elapsed / totalDuration) * 100))
    }

    updateTimer()
    const interval = setInterval(updateTimer, 60000)
    return () => clearInterval(interval)
  }, [status])

  if (!status) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>Real Life Recovery</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Take time away from investigation to recover your sanity.
            Real Life recovery provides 1d3 SAN per month.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStart(1)}
              className="flex-1"
            >
              1 Month
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStart(3)}
              className="flex-1"
            >
              3 Months
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const recoveryPercent = status.expectedRecovery > 0
    ? Math.min(100, ((status.actualRecovery || 0) / status.expectedRecovery) * 100)
    : 0

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>Real Life Recovery</span>
          </div>
          <Badge variant={status.isActive ? "default" : "secondary"}>
            {status.isActive ? "Active" : "Completed"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Initial SAN</div>
            <div className="font-bold">{status.initialSan}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Expected Recovery</div>
            <div className="font-bold text-green-600">+{status.expectedRecovery}</div>
          </div>
        </div>

        {status.isActive && status.endDate && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {timeRemaining}
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {!status.isActive && status.actualRecovery !== undefined && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Actual Recovery</span>
              <span className="font-bold text-green-600">+{status.actualRecovery}</span>
            </div>
            <Progress value={recoveryPercent} className="h-2" />
          </div>
        )}

        {status.notes && (
          <div className="text-xs text-muted-foreground italic">
            {status.notes}
          </div>
        )}

        <div className="flex gap-2">
          {status.isActive && progress >= 100 && (
            <Button
              variant="default"
              size="sm"
              onClick={onComplete}
              className="flex-1"
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              Complete Recovery
            </Button>
          )}
          {status.isActive && onCancel && progress < 100 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="flex-1"
            >
              <AlertCircle className="h-3 w-3 mr-1" />
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function RealLifeMini({ status }: { status: RealLifeStatus | null }) {
  if (!status || !status.isActive) {
    return null
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20">
      <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      <span className="text-xs text-blue-700 dark:text-blue-300">
        Real Life Recovery Active
      </span>
      <Badge variant="secondary" className="text-xs">
        +{status.expectedRecovery} SAN expected
      </Badge>
    </div>
  )
}
