import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Heart, Brain, Clover, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { StateSnapshot } from '@/types/session'

interface StateChangesPanelProps {
  snapshots: StateSnapshot[]
  className?: string
}

interface StateChangeItem {
  characterId: string
  hpChange: number
  sanChange: number
  luckChange: number
}

export function StateChangesPanel({ snapshots, className = '' }: StateChangesPanelProps) {
  const formatChange = (value: number) => {
    if (value === 0) return null
    const sign = value > 0 ? '+' : ''
    return `${sign}${value}`
  }

  const getChangeIcon = (value: number) => {
    if (value > 0) return <TrendingUp className="h-3 w-3" />
    if (value < 0) return <TrendingDown className="h-3 w-3" />
    return <Minus className="h-3 w-3" />
  }

  const getChangeColor = (value: number, isNegativeBad: boolean = true) => {
    if (value === 0) return 'text-muted-foreground'
    if (value > 0) return isNegativeBad ? 'text-green-500' : 'text-red-500'
    return isNegativeBad ? 'text-red-500' : 'text-green-500'
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>状态变化</CardTitle>
        <p className="text-sm text-muted-foreground">
          游戏过程中的角色状态变化
        </p>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          {snapshots.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              暂无状态变化记录
            </div>
          ) : (
            <div className="space-y-3 pr-4">
              {snapshots.map((snapshot, idx) => (
                <div
                  key={`${snapshot.character_id}-${idx}`}
                  className="p-4 border rounded-lg space-y-3"
                >
                  {/* Character ID */}
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">
                      角色ID: {snapshot.character_id.slice(0, 12)}...
                    </span>
                  </div>

                  {/* HP Change */}
                  {snapshot.hp_change !== 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Heart className="h-4 w-4 text-red-500" />
                        <span>生命值</span>
                      </div>
                      <Badge variant="outline" className={`flex items-center gap-1 ${getChangeColor(snapshot.hp_change)}`}>
                        {getChangeIcon(snapshot.hp_change)}
                        {formatChange(snapshot.hp_change)}
                      </Badge>
                    </div>
                  )}

                  {/* SAN Change */}
                  {snapshot.san_change !== 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Brain className="h-4 w-4 text-purple-500" />
                        <span>理智值</span>
                      </div>
                      <Badge variant="outline" className={`flex items-center gap-1 ${getChangeColor(snapshot.san_change)}`}>
                        {getChangeIcon(snapshot.san_change)}
                        {formatChange(snapshot.san_change)}
                      </Badge>
                    </div>
                  )}

                  {/* Luck Change */}
                  {snapshot.luck_change !== 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Clover className="h-4 w-4 text-green-500" />
                        <span>幸运值</span>
                      </div>
                      <Badge variant="outline" className={`flex items-center gap-1 ${getChangeColor(snapshot.luck_change, false)}`}>
                        {getChangeIcon(snapshot.luck_change)}
                        {formatChange(snapshot.luck_change)}
                      </Badge>
                    </div>
                  )}

                  {/* No changes */}
                  {snapshot.hp_change === 0 &&
                    snapshot.san_change === 0 &&
                    snapshot.luck_change === 0 && (
                    <p className="text-sm text-muted-foreground">无状态变化</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
