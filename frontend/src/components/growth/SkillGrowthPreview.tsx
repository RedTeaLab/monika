import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { TrendingUp, Dice5, Percent, BarChart3 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { GrowthPreview } from "./GrowthPanel"

interface SkillGrowthPreviewProps {
  preview: GrowthPreview
  className?: string
}

export function SkillGrowthPreview({ preview, className }: SkillGrowthPreviewProps) {
  const successPercentage = preview.chanceOfSuccess * 100

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-500" />
          <span>Growth Preview: {preview.skillName}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">Current Value</div>
          <div className="text-lg font-bold">{preview.currentValue}</div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Percent className="h-4 w-4" />
              <span>Success Chance</span>
            </div>
            <span className="font-bold text-blue-600">{successPercentage.toFixed(0)}%</span>
          </div>
          <Progress value={successPercentage} className="h-2" />
          <p className="text-xs text-muted-foreground">
            Roll d100 ≤ {preview.currentValue} to succeed
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-lg bg-muted/50">
            <Dice5 className="h-4 w-4 mx-auto mb-1 text-green-500" />
            <div className="text-xs text-muted-foreground">Min</div>
            <div className="font-bold text-sm">+{preview.minImprovement}</div>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <BarChart3 className="h-4 w-4 mx-auto mb-1 text-blue-500" />
            <div className="text-xs text-muted-foreground">Average</div>
            <div className="font-bold text-sm">+{preview.averageImprovement.toFixed(1)}</div>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <TrendingUp className="h-4 w-4 mx-auto mb-1 text-purple-500" />
            <div className="text-xs text-muted-foreground">Max</div>
            <div className="font-bold text-sm">+{preview.maxImprovement}</div>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <p className="text-xs text-blue-700 dark:text-blue-300">{preview.message}</p>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <span className="font-medium">Success:</span> Improve by 1d10 (1-10 points)
          </p>
          <p>
            <span className="font-medium">Critical (≤{Math.floor(preview.currentValue / 5)}):</span> Improve by 2d10 (2-20 points)
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export function SkillGrowthPreviewMini({ preview }: { preview: GrowthPreview }) {
  const successPercentage = preview.chanceOfSuccess * 100

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium">{preview.skillName}</span>
          <span className="text-sm text-muted-foreground">Value: {preview.currentValue}</span>
        </div>
        <Progress value={successPercentage} className="h-1.5" />
      </div>
      <div className="text-right">
        <div className="text-sm font-bold text-blue-600">{successPercentage.toFixed(0)}%</div>
        <div className="text-xs text-muted-foreground">chance</div>
      </div>
    </div>
  )
}
