import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Info } from 'lucide-react'
import type { Occupation } from '@/types/occupation'
import { PRESET_SKILLS } from '@/data/skills'
import {
  calculateMaxSkillPoints,
  isOccupationSkill,
  getSkillPointCost,
  formatSkillWithCost
} from '@/lib/skillPoints'

interface SkillAllocationProps {
  occupation: Occupation | null
  attributes: {
    edu: number
    age: number
  }
  skills: Record<string, number>
  availableSkillPoints: number
  maxSkillPoints: number
  onSkillsChange: (skills: Record<string, number>) => void
  onBack: () => void
  onNext: () => void
}

export function SkillAllocation({
  occupation,
  attributes,
  skills,
  availableSkillPoints,
  maxSkillPoints,
  onSkillsChange,
  onBack,
  onNext,
}: SkillAllocationProps) {
  const [localSkills, setLocalSkills] = useState<Record<string, number>>(skills)
  const [overBudget, setOverBudget] = useState(false)

  // 计算已使用点数
  const usedPoints = Object.values(localSkills).reduce((sum, val) => sum + val, 0)

  // 计算剩余点数
  const availablePoints = availableSkillPoints

  // 同步外部 skills 变化
  useEffect(() => {
    setLocalSkills(skills)
    setOverBudget(usedPoints > maxSkillPoints)
  }, [skills])

  // 计算最大技能点数（用于显示）
  const calculatedMaxPoints = calculateMaxSkillPoints(
    attributes.edu,
    attributes.age,
    occupation?.skill_bonus || 0
  )

  const handleSkillChange = (skillName: string, delta: number) => {
    const current = localSkills[skillName] || 0
    const newValue = current + delta

    if (newValue < 0) {
      // 不允许减少到 0 以下
      return
    }

    const cost = getSkillPointCost(occupation, skillName) * delta
    if (cost < 0) {
      // 增加技能点数
      const newSkills = { ...localSkills, [skillName]: newValue }
      setLocalSkills(newSkills)
      onSkillsChange(newSkills)
    } else {
      // 减少技能点数（需要检查剩余点数）
      if (usedPoints - cost < availablePoints) {
        const newSkills = { ...localSkills, [skillName]: newValue }
        setLocalSkills(newSkills)
        onSkillsChange(newSkills)
      } else {
        setOverBudget(true)
      }
    }
  }

  const handleQuickFill = (points: number) => {
    // 快速填充：将所有职业技能设为指定值
    if (!occupation) return

    const occupationSkills = occupation.occupation_skills || []
    const toFill: Record<string, number> = {}

    occupationSkills.forEach((skill) => {
      if ((localSkills[skill] || 0) >= points) {
        return
      }
      toFill[skill] = points
    })

    const newSkills = { ...localSkills, ...toFill }
    setLocalSkills(newSkills)
    onSkillsChange(newSkills)
  }

  return (
    <div className="space-y-6">
      {/* 标题和说明 */}
      <div className="mb-4">
        <h2 className="text-2xl font-bold">分配技能点数</h2>
        <p className="text-muted-foreground">
          根据你的教育({attributes.edu})、年龄({attributes.age})
          {occupation && ` 和职业(${occupation.name})`}分配技能点数。
          {(occupation?.skill_bonus ?? 0) > 0 && (
            <Badge className="ml-2">职业奖励 +{occupation?.skill_bonus ?? 0}</Badge>
          )}
        </p>
      </div>

      {/* 点数统计 */}
      <Card>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold">{maxSkillPoints}</div>
              <div className="text-sm text-muted-foreground">最大点数</div>
            </div>
            <div>
              <div className="text-3xl font-bold">{usedPoints}</div>
              <div className="text-sm text-muted-foreground">已使用</div>
            </div>
            <div>
              <div className={`text-3xl font-bold ${
                availablePoints < 0 ? 'text-red-500' : 'text-green-500'
              }`}>
                {availablePoints}
              </div>
              <div className="text-sm text-muted-foreground">剩余</div>
            </div>
          </div>

          {overBudget && (
            <Alert variant="destructive" className="mt-4">
              <Info className="h-4 w-4" />
              <AlertDescription>
                技能点数已超限！请减少一些技能点数后再继续。
              </AlertDescription>
            </Alert>
          )}

          <div className="col-span-3 border-t pt-4">
            <div className="text-sm text-muted-foreground text-center">
              <p className="mb-2">职业技能消耗 1 倍点数，其他技能消耗 2 倍点数</p>
              {occupation && (
                <Badge variant="outline">
                  职业技能: {occupation.occupation_skills?.slice(0, 3).join(', ')} 等
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 快速操作按钮 */}
      <div className="flex gap-2 mb-4">
        <Button variant="outline" onClick={() => handleQuickFill(1)}>
          一点填充（职业技能）
        </Button>
        <Button variant="outline" onClick={() => {
          setLocalSkills(PRESET_SKILLS)
          onSkillsChange(PRESET_SKILLS)
        }}>
          重置所有技能
        </Button>
      </div>

      {/* 技能列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(PRESET_SKILLS).map(([skillName, defaultValue]) => (
          <div key={skillName} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={skillName} className="text-sm font-medium">
                {skillName}
              </Label>
              <Badge variant="outline" className="text-xs">
                默认 {defaultValue}%
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSkillChange(skillName, -1)}
                disabled={!skills[skillName] || skills[skillName] <= 0}
              >
                -
              </Button>
              <Input
                id={skillName}
                type="number"
                min={0}
                max={100}
                value={skills[skillName] || 0}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0
                  const delta = val - (skills[skillName] || 0)
                  handleSkillChange(skillName, delta)
                }}
                className="w-24 h-10"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSkillChange(skillName, 1)}
                disabled={availablePoints <= 0}
              >
                +
              </Button>
              <span className="text-sm text-muted-foreground ml-4">
                {isOccupationSkill(occupation, skillName) ? '1倍' : '2倍'}
              </span>
            </div>

            {/* 显示点数消耗 */}
            {skills[skillName] > 0 && (
              <div className="text-xs text-muted-foreground">
                消耗: {formatSkillWithCost(
                  skills[skillName],
                  getSkillPointCost(occupation, skillName),
                  availablePoints
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-between mt-6 pt-4 border-t">
        <Button variant="outline" onClick={onBack} disabled={false}>
          上一步
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (overBudget) {
                alert('技能点数超限，请先调整后再继续')
                return
              }
              if (availablePoints > maxSkillPoints * 0.5) {
                alert('建议至少保留一半技能点数用于非职业技能')
                return
              }
              onNext()
            }}
            disabled={overBudget || availablePoints === maxSkillPoints}
          >
            保存并继续
          </Button>
        </div>
      </div>
    </div>
  )
}
