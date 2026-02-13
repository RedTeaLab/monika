// frontend/src/components/character-creation/BasicInfoSection.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Occupation } from '@/types/characterCreation'
import type { CharacterCreationAction } from '@/types/characterCreation'

export interface BasicInfoSectionProps {
  name: string
  age: number
  gender: 'male' | 'female' | 'other'
  occupation: Occupation | null
  errors: Record<string, string>
  dispatch: (action: CharacterCreationAction) => void
  onOccupationClick: () => void
}

export function BasicInfoSection({
  name,
  age,
  gender,
  occupation,
  errors,
  dispatch,
  onOccupationClick,
}: BasicInfoSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>基本信息</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Name and Age */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">姓名 *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => dispatch({ type: 'SET_NAME', value: e.target.value })}
              placeholder="输入调查员姓名"
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="age">年龄 *</Label>
            <Input
              id="age"
              type="number"
              min={15}
              max={90}
              value={age || ''}
              onChange={(e) => dispatch({ type: 'SET_AGE', value: parseInt(e.target.value) || 0 })}
              placeholder="15-90"
            />
            {errors.age && <p className="text-sm text-destructive">{errors.age}</p>}
          </div>
        </div>

        {/* Gender - using native radio buttons */}
        <div className="space-y-2">
          <Label>性别</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="gender"
                value="male"
                checked={gender === 'male'}
                onChange={() => dispatch({ type: 'SET_GENDER', value: 'male' })}
              />
              <span>男</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="gender"
                value="female"
                checked={gender === 'female'}
                onChange={() => dispatch({ type: 'SET_GENDER', value: 'female' })}
              />
              <span>女</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="gender"
                value="other"
                checked={gender === 'other'}
                onChange={() => dispatch({ type: 'SET_GENDER', value: 'other' })}
              />
              <span>其他</span>
            </label>
          </div>
        </div>

        {/* Occupation */}
        <div className="space-y-2">
          <Label>职业 *</Label>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={onOccupationClick}
          >
            {occupation ? occupation.name : '选择职业 →'}
          </Button>
          {errors.occupation && <p className="text-sm text-destructive">{errors.occupation}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
