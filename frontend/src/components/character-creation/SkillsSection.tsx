// frontend/src/components/character-creation/SkillsSection.tsx
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Occupation } from '@/types/occupation'
import type { CharacterCreationAction } from '@/types/characterCreation'

export interface SkillsSectionProps {
  occupation: Occupation | null
  attributes: { edu: number; int: number }
  skills: Record<string, number>
  occupationalPointsRemaining: number
  interestPointsRemaining: number
  dispatch: (action: CharacterCreationAction) => void
}

export function SkillsSection({
  occupation,
  attributes,
  skills,
  occupationalPointsRemaining,
  interestPointsRemaining,
  dispatch,
}: SkillsSectionProps) {
  const [customSkillName, setCustomSkillName] = useState('')

  const addCustomSkill = () => {
    if (customSkillName.trim()) {
      dispatch({ type: 'ADD_INTEREST_SKILL', skill: customSkillName.trim() })
      setCustomSkillName('')
    }
  }

  const isOccupationSkill = (skill: string): boolean => {
    return occupation?.occupation_skills?.includes(skill) ?? false
  }

  const getPointCost = (skill: string): number => {
    return isOccupationSkill(skill) ? 1 : 2
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>技能分配</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Point summary */}
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className={`text-2xl font-bold ${occupationalPointsRemaining < 0 ? 'text-destructive' : ''}`}>
              {occupationalPointsRemaining}
            </div>
            <div className="text-sm text-muted-foreground">职业技能点</div>
          </div>
          <div>
            <div className={`text-2xl font-bold ${interestPointsRemaining < 0 ? 'text-destructive' : ''}`}>
              {interestPointsRemaining}
            </div>
            <div className="text-sm text-muted-foreground">兴趣技能点</div>
          </div>
        </div>

        {/* Occupation skills */}
        {occupation && occupation.occupation_skills && occupation.occupation_skills.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-3">职业技能</h4>
            <div className="space-y-2">
              {occupation.occupation_skills.map((skill) => (
                <SkillRow
                  key={skill}
                  name={skill}
                  baseValue={0}
                  currentValue={skills[skill] || 0}
                  pointsCost={1}
                  pointsRemaining={occupationalPointsRemaining}
                  onIncrease={(delta) => dispatch({ type: 'CHANGE_SKILL', skill, delta })}
                />
              ))}
            </div>
          </div>
        )}

        {/* Interest skills */}
        <div>
          <h4 className="text-sm font-medium mb-3">兴趣技能</h4>
          <div className="flex gap-2 mb-3">
            <Input
              placeholder="搜索技能..."
              value={customSkillName}
              onChange={(e) => setCustomSkillName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addCustomSkill()}
            />
            <Button onClick={addCustomSkill}>添加</Button>
          </div>
          <div className="space-y-2">
            {Object.entries(skills)
              .filter(([skill]) => !isOccupationSkill(skill))
              .map(([skill, value]) => (
                <SkillRow
                  key={skill}
                  name={skill}
                  baseValue={0}
                  currentValue={value}
                  pointsCost={2}
                  pointsRemaining={interestPointsRemaining}
                  onIncrease={(delta) => dispatch({ type: 'CHANGE_SKILL', skill, delta })}
                />
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SkillRow({
  name,
  baseValue,
  currentValue,
  pointsCost,
  pointsRemaining,
  onIncrease,
}: {
  name: string
  baseValue: number
  currentValue: number
  pointsCost: number
  pointsRemaining: number
  onIncrease: (delta: number) => void
}) {
  const canIncrease = pointsRemaining >= pointsCost
  const canDecrease = currentValue > baseValue

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-32 truncate">{name}</span>
      <span className="text-xs text-muted-foreground">基础 {baseValue}</span>

      <Button
        variant="outline"
        size="sm"
        onClick={() => onIncrease(-5)}
        disabled={!canDecrease}
      >
        -
      </Button>

      <Input type="number" value={currentValue} readOnly className="w-16 h-8" />

      <Button
        variant="outline"
        size="sm"
        onClick={() => onIncrease(5)}
        disabled={!canIncrease}
      >
        +5
      </Button>

      <span className="text-xs text-muted-foreground">消耗 {pointsCost}倍</span>
    </div>
  )
}
