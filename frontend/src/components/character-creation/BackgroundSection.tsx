// frontend/src/components/character-creation/BackgroundSection.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Background, CharacterCreationAction } from '@/types/characterCreation'

const BACKGROUND_FIELDS: {
  key: keyof Background
  label: string
  placeholder: string
}[] = [
  { key: 'appearance', label: '外貌描述', placeholder: '描述调查员的外貌特征、穿着打扮等' },
  { key: 'beliefs', label: '思想/信念', placeholder: '调查员的价值观、人生哲学或信仰' },
  { key: 'importantPerson', label: '重要之人', placeholder: '对调查员有重要影响的人' },
  { key: 'significantPlace', label: '意义非凡之地', placeholder: '对调查员有特殊意义的地点' },
  { key: 'treasuredItem', label: '宝贵之物', placeholder: '调查员珍视的物品' },
  { key: 'traits', label: '特质', placeholder: '调查员的性格特点、怪癖或特长' },
]

export interface BackgroundSectionProps {
  background: Background
  errors: Record<string, string>
  dispatch: (action: CharacterCreationAction) => void
}

export function BackgroundSection({
  background,
  errors,
  dispatch,
}: BackgroundSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>背景故事</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {BACKGROUND_FIELDS.map((field) => (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>{field.label}</Label>
            <Textarea
              id={field.key}
              rows={2}
              value={background[field.key]}
              onChange={(e) => dispatch({ type: 'SET_BACKGROUND', field: field.key, value: e.target.value })}
              placeholder={field.placeholder}
            />
            {errors[field.key] && (
              <p className="text-sm text-destructive">{errors[field.key]}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
