import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"

export function MessageListSkeleton() {
  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-12 ml-auto" />
            </div>
            <Skeleton className="h-16 w-full" />
            {i % 2 === 0 && <Skeleton className="h-12 w-3/4" />}
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

export function MessageBubbleSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-20 w-full" />
    </div>
  )
}
