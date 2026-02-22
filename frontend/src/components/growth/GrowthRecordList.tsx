import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TrendingUp, Calendar, CheckCircle, Sparkles, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { GrowthRecord, GrowthCheckResult } from "./GrowthPanel"

interface GrowthRecordListProps {
  records: GrowthRecord[]
  totalImprovements: number
  className?: string
  maxHeight?: string
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

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function GrowthRecordList({
  records,
  totalImprovements,
  className,
  maxHeight = "300px",
}: GrowthRecordListProps) {
  if (records.length === 0) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            Growth History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground text-center py-4">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No growth records yet.</p>
            <p className="text-xs mt-1">Successfully use skills and perform growth checks to see history.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            <span>Growth History</span>
          </div>
          <Badge variant="outline" className="text-xs">
            {totalImprovements} total
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea style={{ height: maxHeight }}>
          <div className="space-y-2">
            {records.map((record) => (
              <div
                key={record.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{record.skillName}</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(record.createdAt)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {record.improvement > 0 ? (
                    <>
                      <span className="text-sm text-muted-foreground">
                        {record.previousValue}
                      </span>
                      <TrendingUp className={cn("h-4 w-4", RESULT_COLORS[record.checkResult])} />
                      <span className={cn("text-sm font-bold", RESULT_COLORS[record.checkResult])}>
                        +{record.improvement}
                      </span>
                      <span className="text-sm font-bold">= {record.newValue}</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">No change</span>
                  )}
                  <Badge variant={RESULT_VARIANTS[record.checkResult]} className="text-xs ml-2">
                    {record.checkResult === "success" && <CheckCircle className="h-3 w-3 mr-1" />}
                    {record.checkResult === "critical_success" && <Sparkles className="h-3 w-3 mr-1" />}
                    {record.checkResult === "failure" && <XCircle className="h-3 w-3 mr-1" />}
                    {record.checkResult === "success" && "Success"}
                    {record.checkResult === "critical_success" && "Critical"}
                    {record.checkResult === "failure" && "Failed"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

export function GrowthRecordItem({ record }: { record: GrowthRecord }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center",
            record.improvement > 0 ? "bg-green-100 dark:bg-green-900/30" : "bg-muted"
          )}
        >
          {record.improvement > 0 ? (
            <TrendingUp className="h-4 w-4 text-green-600" />
          ) : (
            <XCircle className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{record.skillName}</span>
            <Badge variant={RESULT_VARIANTS[record.checkResult]} className="text-xs">
              Roll: {record.checkRoll}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            {formatDate(record.createdAt)}
          </span>
        </div>
      </div>
      <div className="text-right">
        {record.improvement > 0 ? (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">{record.previousValue}</span>
            <span className={RESULT_COLORS[record.checkResult]}>
              <TrendingUp className="h-4 w-4" />
            </span>
            <span className={cn("font-bold", RESULT_COLORS[record.checkResult])}>
              +{record.improvement}
            </span>
            <span className="font-bold">= {record.newValue}</span>
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">No improvement</span>
        )}
      </div>
    </div>
  )
}
