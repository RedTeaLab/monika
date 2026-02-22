import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TrendingUp, CheckCircle, XCircle, Sparkles, Loader2, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export type GrowthCheckResult = "success" | "failure" | "critical_success"

export interface SkillExperience {
  skillName: string
  timesUsed: number
  lastUsedAt?: string
  isMarkedForGrowth: boolean
}

export interface GrowthRecord {
  id: string
  characterId: number
  skillName: string
  previousValue: number
  newValue: number
  improvement: number
  checkRoll: number
  checkResult: GrowthCheckResult
  sessionId?: string
  createdAt: string
}

export interface SkillExperienceResponse {
  characterId: number
  skills: SkillExperience[]
  markedCount: number
  canPerformGrowth: boolean
}

export interface GrowthCheckResponse {
  characterId: number
  skillName: string
  skillValue: number
  roll: number
  result: GrowthCheckResult
  improvement: number
  newValue: number
  message: string
}

export interface GrowthPreview {
  skillName: string
  currentValue: number
  minImprovement: number
  maxImprovement: number
  averageImprovement: number
  chanceOfSuccess: number
  message: string
}

interface GrowthPanelProps {
  characterId: number
  skills: SkillExperienceResponse
  onMarkSkill?: (skillName: string) => Promise<void>
  onPerformGrowthCheck?: (skillName: string) => Promise<GrowthCheckResponse>
  onBatchGrowthCheck?: () => Promise<{ results: GrowthCheckResponse[] }>
  onViewHistory?: () => void
  className?: string
  isLoading?: boolean
}

const RESULT_VARIANTS: Record<GrowthCheckResult, "default" | "secondary" | "destructive" | "outline"> = {
  success: "default",
  critical_success: "default",
  failure: "secondary",
}

const RESULT_COLORS: Record<GrowthCheckResult, string> = {
  success: "text-green-600 dark:text-green-400",
  critical_success: "text-purple-600 dark:text-purple-400",
  failure: "text-red-600 dark:text-red-400",
}

const RESULT_BG: Record<GrowthCheckResult, string> = {
  success: "bg-green-500",
  critical_success: "bg-purple-500",
  failure: "bg-red-500",
}

export function GrowthPanel({
  characterId,
  skills,
  onMarkSkill,
  onPerformGrowthCheck,
  onBatchGrowthCheck,
  onViewHistory,
  className,
  isLoading = false,
}: GrowthPanelProps) {
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const [showCheckDialog, setShowCheckDialog] = useState(false)
  const [checkResult, setCheckResult] = useState<GrowthCheckResponse | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [showResultAnimation, setShowResultAnimation] = useState(false)

  const markedSkills = skills.skills.filter((s) => s.isMarkedForGrowth)

  const handleGrowthCheck = async (skillName: string) => {
    if (!onPerformGrowthCheck) return

    setIsChecking(true)
    setSelectedSkill(skillName)
    setShowCheckDialog(true)
    setCheckResult(null)

    try {
      const result = await onPerformGrowthCheck(skillName)
      setCheckResult(result)
      setShowResultAnimation(true)
      setTimeout(() => setShowResultAnimation(false), 1000)
    } catch (error) {
      console.error("Growth check failed:", error)
    } finally {
      setIsChecking(false)
    }
  }

  const handleBatchCheck = async () => {
    if (!onBatchGrowthCheck) return

    setIsChecking(true)
    try {
      const result = await onBatchGrowthCheck()
      if (result.results.length > 0) {
        setCheckResult(result.results[result.results.length - 1])
        setShowCheckDialog(true)
      }
    } catch (error) {
      console.error("Batch growth check failed:", error)
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            <span>Character Growth</span>
          </div>
          {skills.markedCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {skills.markedCount} marked
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {markedSkills.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No skills marked for growth.</p>
            <p className="text-xs mt-1">Successfully use skills to mark them for improvement.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {markedSkills.map((skill) => (
                <div
                  key={skill.skillName}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors cursor-pointer"
                  onClick={() => handleGrowthCheck(skill.skillName)}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm font-medium">{skill.skillName}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              {onBatchGrowthCheck && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleBatchCheck}
                  disabled={isLoading || isChecking || markedSkills.length === 0}
                  className="flex-1"
                >
                  {isChecking ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <TrendingUp className="h-3 w-3 mr-1" />
                  )}
                  All Checks ({markedSkills.length})
                </Button>
              )}
              {onViewHistory && (
                <Button variant="outline" size="sm" onClick={onViewHistory}>
                  History
                </Button>
              )}
            </div>
          </>
        )}

        <Dialog open={showCheckDialog} onOpenChange={setShowCheckDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Growth Check
              </DialogTitle>
              <DialogDescription>
                {isChecking
                  ? `Rolling for ${selectedSkill}...`
                  : checkResult
                  ? checkResult.message
                  : "Perform a growth check to improve your skill."}
              </DialogDescription>
            </DialogHeader>

            {isChecking ? (
              <div className="flex flex-col items-center py-8">
                <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
                <p className="mt-4 text-sm text-muted-foreground">Rolling d100...</p>
              </div>
            ) : checkResult ? (
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-center gap-4">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Roll</p>
                    <p
                      className={cn(
                        "text-2xl font-bold transition-all duration-500",
                        showResultAnimation && "scale-125",
                        RESULT_COLORS[checkResult.result]
                      )}
                    >
                      {checkResult.roll}
                    </p>
                  </div>
                  <div className="text-4xl text-muted-foreground">vs</div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Skill</p>
                    <p className="text-2xl font-bold">{checkResult.skillValue}</p>
                  </div>
                </div>

                <div className="flex justify-center">
                  <Badge
                    variant={RESULT_VARIANTS[checkResult.result]}
                    className={cn(
                      "text-base px-4 py-1 transition-all duration-500",
                      showResultAnimation && "scale-110"
                    )}
                  >
                    {checkResult.result === "success" && (
                      <>
                        <CheckCircle className="h-4 w-4 mr-1" /> SUCCESS
                      </>
                    )}
                    {checkResult.result === "critical_success" && (
                      <>
                        <Sparkles className="h-4 w-4 mr-1" /> CRITICAL!
                      </>
                    )}
                    {checkResult.result === "failure" && (
                      <>
                        <XCircle className="h-4 w-4 mr-1" /> FAILURE
                      </>
                    )}
                  </Badge>
                </div>

                {checkResult.improvement > 0 && (
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-sm text-muted-foreground">{checkResult.skillName}</span>
                      <span className="text-lg font-bold">{checkResult.skillValue}</span>
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      <span className="text-lg font-bold text-green-500">+{checkResult.improvement}</span>
                      <span className="text-lg font-bold">= {checkResult.newValue}</span>
                    </div>
                    <Progress
                      value={(checkResult.improvement / 20) * 100}
                      className="h-2 mt-2 max-w-[200px] mx-auto"
                    />
                  </div>
                )}
              </div>
            ) : null}

            <DialogFooter>
              <Button variant="secondary" onClick={() => setShowCheckDialog(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

export function GrowthPanelMini({
  skills,
  onClick,
  className,
}: {
  skills: SkillExperienceResponse
  onClick?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 p-2 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors",
        className
      )}
      onClick={onClick}
    >
      <TrendingUp className="h-5 w-5 text-blue-500" />
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Growth</span>
          <span className="text-sm font-bold">{skills.markedCount} marked</span>
        </div>
        {skills.markedCount > 0 && (
          <Progress value={(skills.markedCount / 10) * 100} className="h-1.5 mt-1" />
        )}
      </div>
    </div>
  )
}
