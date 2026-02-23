import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export function LeadsPanelSkeleton() {
  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>

        <div className="relative mt-2">
          <Skeleton className="h-9 w-full" />
        </div>

        <div className="flex gap-2 mt-2 overflow-x-auto">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-md" />
          ))}
        </div>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-3 pt-0 overflow-hidden">
        <div className="space-y-2 h-full overflow-y-auto">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-3 rounded-lg border space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-12 rounded-full" />
                <Skeleton className="h-4 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
