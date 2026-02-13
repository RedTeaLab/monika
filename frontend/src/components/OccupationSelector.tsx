import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { characterApi } from '@/lib/api'
import type { Occupation } from '@/types/occupation'

interface OccupationSelectorProps {
  onSelect: (occupation: Occupation) => void
  selectedId?: string  // 已选择的职业 ID
}

export function OccupationSelector({ onSelect, selectedId }: OccupationSelectorProps) {
  const [occupations, setOccupations] = useState<Occupation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    // 从 API 加载职业列表
    const fetchOccupations = async () => {
      try {
        setLoading(true)
        const data = await characterApi.getOccupations()
        setOccupations(data)
      } catch (err) {
        console.error('Failed to fetch occupations:', err)
        setError(err instanceof Error ? err.message : '获取职业列表失败')
      } finally {
        setLoading(false)
      }
    }

    fetchOccupations()
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary border-t-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">加载职业列表...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex justify-center py-8">
        <div className="text-center text-destructive">
          <p>{error}</p>
          <Button onClick={() => window.location.reload()} variant="outline" className="mt-4">
            重新加载
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">选择职业</h2>
      <p className="text-muted-foreground mb-6">职业决定你的调查员的背景和特长</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {occupations.map((occupation) => {
          const isSelected = selectedId === occupation.id
          return (
            <Card
              key={occupation.id}
              className={`cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 ${
                isSelected ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() => onSelect(occupation)}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-bold">{occupation.name}</h3>
                  {isSelected && (
                    <Badge variant="default" className="ml-2">
                      已选择
                    </Badge>
                  )}
                </div>

                <p className="text-sm text-muted-foreground mb-4 min-h-[60px]">
                  {occupation.description}
                </p>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">信用评级</span>
                    <Badge variant="outline">{occupation.credit_rating}</Badge>
                  </div>

                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">推荐属性</span>
                    <div className="flex flex-wrap gap-1">
                      {occupation.suggested_attrs.map((attr) => (
                        <Badge key={attr} variant="secondary" className="text-xs">
                          {attr.toUpperCase()}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">职业特长技能</span>
                    <div className="flex flex-wrap gap-1">
                      {occupation.occupation_skills.slice(0, 3).map((skill) => (
                        <Badge key={skill} variant="secondary" className="text-xs">
                          {skill}
                        </Badge>
                      ))}
                      {occupation.occupation_skills.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{occupation.occupation_skills.length - 3}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {occupation.skill_bonus > 0 && (
                    <div className="mt-2 pt-2 border-t">
                      <Badge variant="default" className="text-xs">
                        技能点数奖励: +{occupation.skill_bonus}
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {selectedId && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => onSelect(null as any)}
            className="mt-6"
          >
            取消选择
          </Button>
        </div>
      )}
    </div>
  )
}
