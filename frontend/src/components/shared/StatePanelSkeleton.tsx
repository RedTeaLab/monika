import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

export function StatePanelSkeleton({ fullWidth = false }: { fullWidth?: boolean }) {
  return (
    <Card className={fullWidth ? "w-full h-fit flex flex-col" : "w-80 h-fit flex flex-col"}>
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-24" />
      </CardHeader>
      <CardContent className="space-y-4 flex-1">
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1">
                <Skeleton className="h-3 w-3" />
                <Skeleton className="h-4 w-8" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-2 w-full" />
          </div>

          <Skeleton className="h-4 w-20" />

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1">
                <Skeleton className="h-3 w-3" />
                <Skeleton className="h-4 w-8" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-2 w-full" />
          </div>

          <Skeleton className="h-4 w-20" />

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1">
                <Skeleton className="h-3 w-3" />
                <Skeleton className="h-4 w-10" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-2 w-full" />
          </div>
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-8" />
          </div>
          <div className="space-y-1">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
