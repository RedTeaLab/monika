// frontend/src/components/character-creation/AttributesSection.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { calculateDerivedStats } from '@/utils/characterCalculations'
import type { Attributes, CharacterCreationAction } from '@/types/characterCreation'

const ATTRIBUTES: { key: keyof Attributes; label: string }[] = [
  { key: 'str', label: '力量 STR' },
  { key: 'con', label: '体质 CON' },
  { key: 'siz', label: '体型 SIZ' },
  { key: 'dex', label: '敏捷 DEX' },
  { key: 'app', label: '外貌 APP' },
  { key: 'int', label: '智力 INT' },
  { key: 'pow', label: '意志 POW' },
  { key: 'edu', label: '教育 EDU' },
]

export interface AttributesSectionProps {
  attributes: Attributes
  dispatch: (action: CharacterCreationAction) => void
}

export function AttributesSection({ attributes, dispatch }: AttributesSectionProps) {
  const derived = calculateDerivedStats(attributes)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>核心属性</CardTitle>
        <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'ROLL_ALL_ATTRIBUTES' })}>
          一键生成
        </Button>
      </CardHeader>
      <CardContent>
        {/* Core attributes grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {ATTRIBUTES.map((attr) => (
            <div key={attr.key} className="space-y-1">
              <Label htmlFor={attr.key} className="text-xs">{attr.label}</Label>
              <div className="flex gap-1">
                <Input
                  id={attr.key}
                  type="number"
                  value={attributes[attr.key] || ''}
                  onChange={(e) => dispatch({
                    type: 'SET_ATTRIBUTE',
                    attribute: attr.key,
                    value: parseInt(e.target.value) || 0
                  })}
                  className="w-20"
                  aria-label={attr.label}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => dispatch({ type: 'ROLL_ATTRIBUTE', attribute: attr.key })}
                  aria-label={`Roll ${attr.label}`}
                >
                  🎲
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Derived stats */}
        <div className="mt-6 pt-6 border-t">
          <h4 className="text-sm font-medium mb-3">衍生属性</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatDisplay label="HP" value={`${derived.hp}/${derived.hp}`} />
            <StatDisplay label="MP" value={`${derived.mp}/${derived.mp}`} />
            <StatDisplay label="SAN" value={`${derived.san}/99`} />
            <StatDisplay label="移动" value={derived.move} />
            <StatDisplay label="体格" value={derived.build} />
            <StatDisplay label="伤害加成" value={derived.damageBonus} />
          </div>
        </div>

        {/* Luck roll */}
        <div className="mt-6 pt-6 border-t">
          <div className="flex items-center justify-between">
            <Label htmlFor="luck">幸运 LUCK</Label>
            <Button
              variant="outline"
              size="icon"
              onClick={() => dispatch({ type: 'ROLL_ATTRIBUTE', attribute: 'luck' })}
              aria-label="Roll Luck"
            >
              🎲
            </Button>
          </div>
          <Input
            id="luck"
            type="number"
            value={attributes.luck || ''}
            onChange={(e) => dispatch({
              type: 'SET_ATTRIBUTE',
              attribute: 'luck',
              value: parseInt(e.target.value) || 0
            })}
            className="w-20 mt-2"
            aria-label="Luck"
          />
        </div>
      </CardContent>
    </Card>
  )
}

function StatDisplay({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
