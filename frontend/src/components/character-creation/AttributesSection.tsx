// frontend/src/components/character-creation/AttributesSection.tsx
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { calculateDerivedStats } from '@/utils/characterCalculations'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Info, Dice1 } from 'lucide-react'
import type { Attributes, CharacterCreationAction } from '@/types/characterCreation'
import { ATTRIBUTES as ATTRIBUTE_DATA, getAttributeMeaning, type AttributeId } from '@/data'

const ATTRIBUTES: { key: keyof Attributes | 'luck'; label: string; attrId: AttributeId }[] = [
  { key: 'str', label: '力量', attrId: 'str' },
  { key: 'con', label: '体质', attrId: 'con' },
  { key: 'siz', label: '体型', attrId: 'siz' },
  { key: 'dex', label: '敏捷', attrId: 'dex' },
  { key: 'app', label: '外貌', attrId: 'app' },
  { key: 'int', label: '智力', attrId: 'int' },
  { key: 'pow', label: '意志', attrId: 'pow' },
  { key: 'edu', label: '教育', attrId: 'edu' },
  { key: 'luck', label: '幸运', attrId: 'str' }, // luck uses str as placeholder
]

export interface AttributesSectionProps {
  attributes: Attributes
  dispatch: (action: CharacterCreationAction) => void
}

export function AttributesSection({ attributes, dispatch }: AttributesSectionProps) {
  const derived = calculateDerivedStats(attributes)
  const [guideOpen, setGuideOpen] = useState(false)

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle>核心属性</CardTitle>
          <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 px-2">
                <Info className="w-4 h-4 mr-1" />
                属性指南
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>核心属性指南</DialogTitle>
              </DialogHeader>
              <AttributeGuideContent />
            </DialogContent>
          </Dialog>
        </div>
        <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'ROLL_ALL_ATTRIBUTES' })}>
          一键生成
        </Button>
      </CardHeader>
      <CardContent>
        {/* Core attributes grid - wider card layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ATTRIBUTES.map((attr) => {
            const attrInfo = ATTRIBUTE_DATA.find(a => a.id === attr.attrId)
            const value = attributes[attr.key] || 0
            const halfValue = Math.floor(value / 2)
            const fifthValue = Math.floor(value / 5)
            const meaning = value > 0 ? getAttributeMeaning(attr.attrId, value) : ''

            return (
              <div key={attr.key} className="border rounded-lg overflow-hidden bg-card">
                {/* Top - Attribute name */}
                <div className="bg-primary/10 px-4 py-2 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={attr.key} className="text-sm font-semibold">
                        {attr.label}
                      </Label>
                      {attrInfo && (
                        <>
                          <Badge variant="outline" className="text-xs h-5 px-1.5">{attrInfo.nameEn}</Badge>
                          <span className="text-xs text-muted-foreground font-mono">
                            {attrInfo.rollFormula}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Middle - Split into left and right */}
                <div className="p-4 grid grid-cols-2 gap-4">
                  {/* Left - Value and meaning */}
                  <div className="space-y-2">
                    <div className="text-center">
                      <div className="text-4xl font-bold">{value || '-'}</div>
                      <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                        <div>半值: <span className="font-mono">{halfValue}</span></div>
                        <div>五分之一: <span className="font-mono">{fifthValue}</span></div>
                      </div>
                    </div>
                    {value > 0 && meaning && (
                      <div className="text-xs bg-primary/5 p-2 rounded border-l-2 border-primary">
                        <div className="font-medium text-primary mb-0.5">当前含义</div>
                        <div className="text-muted-foreground leading-snug">{meaning}</div>
                      </div>
                    )}
                  </div>

                  {/* Right - Description */}
                  <div>
                    {attrInfo && (
                      <div className="text-xs text-muted-foreground leading-snug">
                        {attrInfo.description}
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom - Input and roll button */}
                <div className="px-4 pb-4 pt-2 border-t bg-muted/20">
                  <div className="flex gap-2">
                    <Input
                      id={attr.key}
                      type="number"
                      value={attributes[attr.key] || ''}
                      onChange={(e) => dispatch({
                        type: 'SET_ATTRIBUTE',
                        attribute: attr.key as any,
                        value: parseInt(e.target.value) || 0
                      })}
                      className="flex-1"
                      aria-label={attr.label}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => dispatch({ type: 'ROLL_ATTRIBUTE', attribute: attr.key as any })}
                      aria-label={`Roll ${attr.label}`}
                    >
                      🎲
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <Separator className="my-6" />

        {/* Derived stats */}
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Dice1 className="w-4 h-4" />
            衍生属性
          </h4>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            <StatDisplay label="HP" value={`${derived.hp}`} />
            <StatDisplay label="MP" value={`${derived.mp}`} />
            <StatDisplay label="SAN" value={`${derived.san}/99`} />
            <StatDisplay label="移动" value={derived.move} />
            <StatDisplay label="体格" value={derived.build} />
            <StatDisplay label="伤害加成" value={derived.damageBonus} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function StatDisplay({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center p-3 bg-muted/50 rounded">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

// Attribute guide content for dialog
function AttributeGuideContent() {
  return (
    <ScrollArea className="h-96 pr-4">
      <div className="space-y-6">
        {ATTRIBUTE_DATA.map((attr) => (
          <div key={attr.id} className="border-l-2 border-primary pl-4">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold">{attr.name}</h3>
              <Badge variant="outline" className="text-xs">{attr.nameEn}</Badge>
              <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
                {attr.rollFormula}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{attr.description}</p>

            <div className="space-y-1">
              <div className="text-xs font-medium mb-1">数值含义：</div>
              {attr.meanings.map((meaning) => (
                <div key={meaning.value} className="flex gap-3 text-sm p-1.5 rounded hover:bg-muted/50">
                  <span className="font-mono font-bold w-12 text-center">{meaning.value}</span>
                  <span className="font-medium w-20">{meaning.label}</span>
                  <span className="text-muted-foreground flex-1 text-xs">{meaning.description}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
