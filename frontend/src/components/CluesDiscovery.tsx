import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, Eye, EyeOff, Filter } from 'lucide-react'

interface CluesDiscoveryProps {
  clues: string[]
  className?: string
}

export function CluesDiscovery({ clues, className = '' }: CluesDiscoveryProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showAll, setShowAll] = useState(true)

  const filteredClues = clues.filter((clue) =>
    clue.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const clueCategories = clues.reduce((acc, clue) => {
    // Simple categorization based on keywords
    const lowerClue = clue.toLowerCase()
    let category = 'other'

    if (lowerClue.includes('地点') || lowerClue.includes('location') || lowerClue.includes('场所')) {
      category = 'location'
    } else if (lowerClue.includes('物品') || lowerClue.includes('item') || lowerClue.includes('道具')) {
      category = 'item'
    } else if (lowerClue.includes('人物') || lowerClue.includes('npc') || lowerClue.includes('角色')) {
      category = 'character'
    } else if (lowerClue.includes('背景') || lowerClue.includes('历史') || lowerClue.includes('story')) {
      category = 'story'
    }

    if (!acc[category]) acc[category] = []
    acc[category].push(clue)
    return acc
  }, {} as Record<string, string[]>)

  const categoryConfig = {
    location: { label: '地点线索', color: 'bg-blue-500' },
    item: { label: '物品线索', color: 'bg-amber-500' },
    character: { label: '人物线索', color: 'bg-green-500' },
    story: { label: '背景线索', color: 'bg-purple-500' },
    other: { label: '其他线索', color: 'bg-gray-500' },
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>发现的线索</span>
          <Badge variant="secondary">{clues.length}</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          游戏过程中收集到的所有线索
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索线索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Clues List */}
        <ScrollArea className="h-[400px]">
          {filteredClues.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              {searchQuery ? '没有找到匹配的线索' : clues.length === 0 ? '暂无线索记录' : ''}
            </div>
          ) : (
            <div className="space-y-3 pr-4">
              {Object.entries(clueCategories)
                .filter(([_, categoryClues]) =>
                  searchQuery
                    ? categoryClues.some((clue) =>
                        clue.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                    : true
                )
                .map(([category, categoryClues]) => (
                  <div key={category} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {categoryConfig[category as keyof typeof categoryConfig]?.label || '其他线索'}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {categoryClues.length}
                      </Badge>
                    </div>
                    <div className="space-y-2 pl-2">
                      {categoryClues
                        .filter((clue) =>
                          searchQuery
                            ? clue.toLowerCase().includes(searchQuery.toLowerCase())
                            : true
                        )
                        .map((clue, idx) => (
                          <div
                            key={`${category}-${idx}`}
                            className="p-3 border rounded-lg text-sm hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-start gap-2">
                              <div
                                className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                                  categoryConfig[category as keyof typeof categoryConfig]?.color ||
                                  'bg-gray-500'
                                }`}
                              />
                              <p className="flex-1">{clue}</p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
