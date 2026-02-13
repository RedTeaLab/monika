// frontend/src/components/character-creation/AttributeInfoCard.tsx
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChevronDown, ChevronUp, Dice1 } from 'lucide-react'
import {
  ATTRIBUTES,
  getAttributeInfo,
  getAttributeMeaning,
  calculateDifficultyValues,
  type AttributeId,
  type AttributeInfo,
} from '@/data'

interface AttributeInfoCardProps {
  attributeId: AttributeId
  value?: number
  showRolls?: boolean
  rolls?: number[]
}

export function AttributeInfoCard({ attributeId, value, showRolls = false, rolls }: AttributeInfoCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const attrInfo = getAttributeInfo(attributeId)

  if (!attrInfo) return null

  const halfValue = value !== undefined ? calculateDifficultyValues(value).half : '-'
  const fifthValue = value !== undefined ? calculateDifficultyValues(value).fifth : '-'
  const meaning = value !== undefined ? getAttributeMeaning(attributeId, value) : ''

  return (
    <Card className={`
      transition-all duration-300
      ${isExpanded ? 'ring-2 ring-primary' : ''}
      ${value ? 'opacity-100' : 'opacity-70'}
    `}>
      <CardContent className="p-4">
        {/* Header - Always Visible */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold">{attrInfo.name}</h3>
              <Badge variant="outline" className="text-xs">{attrInfo.nameEn}</Badge>
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              <span className="font-mono bg-muted px-2 py-0.5 rounded">{attrInfo.rollFormula}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{value || '---'}</div>
            {value && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                <div>半值: {halfValue}</div>
                <div>五分之一: {fifthValue}</div>
              </div>
            )}
          </div>
        </div>

        {/* Roll Info (if available) */}
        {showRolls && rolls && rolls.length > 0 && (
          <div className="mb-3 p-2 bg-muted/50 rounded">
            <div className="text-xs text-muted-foreground mb-1">投骰记录</div>
            <div className="flex gap-1">
              {rolls.filter(r => r !== 0).map((roll, idx) => (
                <span key={idx} className="inline-flex items-center justify-center w-8 h-8 bg-background border rounded text-sm font-mono">
                  {roll}
                </span>
              ))}
              <span className="inline-flex items-center px-2 text-sm text-muted-foreground">
                = {rolls.reduce((a, b) => a + b, 0)}
              </span>
            </div>
          </div>
        )}

        {/* Current Meaning (if value set) */}
        {value && meaning && (
          <div className="mb-3 p-3 bg-primary/5 border-l-4 border-primary rounded-r">
            <div className="text-xs text-muted-foreground mb-1">当前含义</div>
            <div className="text-sm">{meaning}</div>
          </div>
        )}

        {/* Expand Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full mb-2"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-4 h-4 mr-1" />
              收起详情
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4 mr-1" />
              展开详情
            </>
          )}
        </Button>

        {/* Expanded Content */}
        {isExpanded && (
          <ScrollArea className="h-64 pr-4">
            <div className="space-y-4">
              {/* Description */}
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Dice1 className="w-4 h-4" />
                  属性说明
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {attrInfo.description}
                </p>
              </div>

              {/* Value Meanings Table */}
              <div>
                <h4 className="text-sm font-semibold mb-2">数值含义对照</h4>
                <div className="space-y-1">
                  {attrInfo.meanings.map((meaning) => (
                    <div
                      key={meaning.value}
                      className={`flex gap-3 text-sm p-2 rounded transition-colors ${
                        value !== undefined && value >= meaning.value
                          ? 'bg-primary/10'
                          : 'bg-muted/30'
                      }`}
                    >
                      <span className="font-mono font-bold w-16 text-center">
                        {meaning.value}
                      </span>
                      <span className="font-medium w-20">
                        {meaning.label}
                      </span>
                      <span className="text-muted-foreground flex-1">
                        {meaning.description}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Formula Explanation */}
              <div className="p-3 bg-muted/50 rounded">
                <h4 className="text-sm font-semibold mb-2">计算公式说明</h4>
                <div className="text-sm space-y-2">
                  <div>
                    <span className="font-mono bg-background px-2 py-1 rounded">{attrInfo.rollFormula}</span>
                    <span className="ml-2 text-muted-foreground">→ 骰子计算方式</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    例如：{attrInfo.rollFormula === '3d6×5'
                      ? '掷3枚六面骰，将结果相加后乘以5'
                      : attrInfo.rollFormula === '2d6+6×5'
                      ? '掷2枚六面骰，加6后乘以5'
                      : attrInfo.rollFormula
                    }
                  </div>
                  {value && (
                    <div className="pt-2 border-t">
                      <div className="text-xs">
                        <span className="text-muted-foreground">常规检定：</span>
                        <span className="font-mono">≤ {value}</span>
                        <span className="text-muted-foreground ml-2">成功</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground">困难检定：</span>
                        <span className="font-mono">≤ {halfValue}</span>
                        <span className="text-muted-foreground ml-2">成功</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground">极难检定：</span>
                        <span className="font-mono">≤ {fifthValue}</span>
                        <span className="text-muted-foreground ml-2">成功</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Game Effects */}
              {getAttributeEffects(attributeId) && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">游戏影响</h4>
                  <div className="text-sm text-muted-foreground leading-relaxed">
                    {getAttributeEffects(attributeId)}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

// Helper function to get game effects for each attribute
function getAttributeEffects(attributeId: AttributeId): string | null {
  const effects: Record<AttributeId, string> = {
    str: '力量影响近战伤害、负重能力和体力相关检定。力量降为0时，调查员无法离开床铺。',
    con: '体质决定生命值上限、抵抗疾病和毒药的能力。体质降为0时，调查员死亡。',
    siz: '体型影响生命值、伤害加值、体格和移动速度。体型的减少通常意味着丢失肢体。',
    dex: '敏捷决定战斗中的行动顺序、躲避攻击的能力和精细动作的成功率。敏捷降为0时，调查员无法进行物理行动。',
    app: '外貌影响社交互动、说服和恐吓检定。外貌降为0的调查员会引发他人的恐惧和厌恶。',
    int: '智力决定语言数量、快速思考能力和其他基于智力的技能。智力降为0的调查员如同婴儿般无法理解世界。',
    pow: '意志影响魔法使用、理智值上限和抵抗超自然力量的能力。意志降为0的调查员成为行尸走肉。',
    edu: '教育决定调查员拥有的知识量，影响各种基于学识的技能检定。',
  }
  return effects[attributeId] || null
}
