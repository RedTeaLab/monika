import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Brain, Heart, Clock, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SANWarningLevel, SANState } from "./SANMeter"

interface SANWarningDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sanLoss: number
  previousSan: number
  currentSan: number
  maxSan: number
  state: SANState
  warningLevel: SANWarningLevel
  message?: string
  recommendations?: string[]
  madnessTriggered?: {
    type: string
    duration?: string
    symptoms?: string[]
  }
  onAcknowledge: () => void
}

const WARNING_ICONS: Record<SANWarningLevel, React.ReactNode> = {
  normal: <Brain className="h-6 w-6 text-green-500" />,
  warning: <AlertTriangle className="h-6 w-6 text-yellow-500" />,
  danger: <AlertTriangle className="h-6 w-6 text-orange-500" />,
  critical: <AlertCircle className="h-6 w-6 text-red-500" />,
}

export function SANWarningDialog({
  open,
  onOpenChange,
  sanLoss,
  previousSan,
  currentSan,
  maxSan,
  state,
  warningLevel,
  message,
  recommendations,
  madnessTriggered,
  onAcknowledge,
}: SANWarningDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false)

  const handleAcknowledge = () => {
    setAcknowledged(true)
    onAcknowledge()
    onOpenChange(false)
  }

  const isMadness = madnessTriggered !== undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isMadness ? (
              <Brain className="h-6 w-6 text-purple-500 animate-pulse" />
            ) : (
              WARNING_ICONS[warningLevel]
            )}
            <span>
              {isMadness ? "Madness Triggered!" : "SAN Loss Warning"}
            </span>
          </DialogTitle>
          <DialogDescription>
            {isMadness
              ? "Your sanity has been overwhelmed by cosmic horror."
              : "Your mental stability has been affected."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-center gap-4">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Before</div>
              <div className="text-2xl font-bold">{previousSan}</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="text-red-500 font-bold text-xl">
                -{sanLoss}
              </div>
              <div className="text-xs text-muted-foreground">SAN</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground">After</div>
              <div
                className={cn(
                  "text-2xl font-bold",
                  currentSan <= 0 && "text-purple-500",
                  currentSan > 0 && currentSan <= maxSan * 0.25 && "text-red-500"
                )}
              >
                {currentSan}
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <Badge
              variant={warningLevel === "normal" ? "secondary" : "destructive"}
              className="text-sm px-4 py-1"
            >
              {state.toUpperCase()}
            </Badge>
          </div>

          {isMadness && madnessTriggered && (
            <div className="bg-purple-100 dark:bg-purple-900/20 rounded-lg p-4 space-y-2">
              <div className="font-semibold text-purple-700 dark:text-purple-300">
                {madnessTriggered.type}
              </div>
              {madnessTriggered.duration && (
                <div className="flex items-center gap-1 text-sm text-purple-600 dark:text-purple-400">
                  <Clock className="h-3 w-3" />
                  <span>Duration: {madnessTriggered.duration}</span>
                </div>
              )}
              {madnessTriggered.symptoms && madnessTriggered.symptoms.length > 0 && (
                <div className="text-sm text-purple-600 dark:text-purple-400">
                  <div className="font-medium">Symptoms:</div>
                  <ul className="mt-1 space-y-1">
                    {madnessTriggered.symptoms.map((symptom, i) => (
                      <li key={i} className="flex items-center gap-1">
                        <span className="w-1 h-1 bg-purple-500 rounded-full" />
                        {symptom}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {!isMadness && message && (
            <div
              className={cn(
                "text-sm p-3 rounded-lg",
                warningLevel === "critical" && "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300",
                warningLevel === "danger" && "bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300",
                warningLevel === "warning" && "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300"
              )}
            >
              {message}
            </div>
          )}

          {!isMadness && recommendations && recommendations.length > 0 && (
            <div className="text-sm">
              <div className="font-medium text-muted-foreground mb-2">
                Recommendations:
              </div>
              <ul className="space-y-1">
                {recommendations.map((rec, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Heart className="h-3 w-3 text-pink-500" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleAcknowledge} className="w-full">
            {isMadness ? "Accept Fate" : "I Understand"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
