// frontend/src/components/character-creation/BasicInfoSection.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import type { Era, CharacterCreationAction } from '@/types/characterCreation'

export interface BasicInfoSectionProps {
  name: string
  age: number
  gender: 'male' | 'female'
  era: Era
  errors: Record<string, string>
  dispatch: (action: CharacterCreationAction) => void
}

export function BasicInfoSection({
  name,
  age,
  gender,
  era,
  errors,
  dispatch,
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

        {/* Gender */}
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
          </div>
        </div>

        {/* Era */}
        <div className="space-y-2">
          <Label>年代</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="era"
                value="modern"
                checked={era === 'modern'}
                onChange={() => dispatch({ type: 'SET_ERA', value: 'modern' })}
              />
              <span>现代</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="era"
                value="1920s"
                checked={era === '1920s'}
                onChange={() => dispatch({ type: 'SET_ERA', value: '1920s' })}
              />
              <span>1920s</span>
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
