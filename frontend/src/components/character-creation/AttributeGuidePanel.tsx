// frontend/src/components/character-creation/AttributeGuidePanel.tsx
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { BookOpen, Calculator, List, Info } from 'lucide-react'
import { ATTRIBUTES, calculateDifficultyValues, type AttributeId } from '@/data'

export function AttributeGuidePanel() {
  const [selectedTab, setSelectedTab] = useState<'overview' | 'formulas' | 'meanings' | 'effects'>('overview')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="w-5 h-5" />
          核心属性指南
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as any)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" asChild>
              <Button variant="ghost" size="sm">
                <List className="w-4 h-4 mr-1" />
                概览
              </Button>
            </TabsTrigger>
            <TabsTrigger value="formulas" asChild>
              <Button variant="ghost" size="sm">
                <Calculator className="w-4 h-4 mr-1" />
                公式
              </Button>
            </TabsTrigger>
            <TabsTrigger value="meanings" asChild>
              <Button variant="ghost" size="sm">
                <Info className="w-4 h-4 mr-1" />
                数值含义
              </Button>
            </TabsTrigger>
            <TabsTrigger value="effects" asChild>
              <Button variant="ghost" size="sm">
                <BookOpen className="w-4 h-4 mr-1" />
                游戏影响
              </Button>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <ScrollArea className="h-96">
              <div className="space-y-4 pr-4">
                {ATTRIBUTES.map((attr) => (
                  <div key={attr.id} className="border-l-2 border-primary pl-4">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{attr.name}</h3>
                      <Badge variant="outline" className="text-xs">{attr.nameEn}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{attr.description}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="formulas" className="mt-4">
            <ScrollArea className="h-96">
              <div className="space-y-4 pr-4">
                <div className="p-4 bg-muted/50 rounded">
                  <h4 className="font-semibold mb-3">投骰公式说明</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-mono bg-background px-2 py-1 rounded">3d6×5</span>
                      <span className="text-muted-foreground">→ 掷3枚六面骰，结果相加后乘以5</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono bg-background px-2 py-1 rounded">2d6+6×5</span>
                      <span className="text-muted-foreground">→ 掷2枚六面骰，加6后乘以5</span>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="grid gap-3">
                  {ATTRIBUTES.map((attr) => (
                    <div key={attr.id} className="flex items-center justify-between p-3 border rounded">
                      <div>
                        <div className="font-medium">{attr.name}</div>
                        <div className="text-xs text-muted-foreground">{attr.nameEn}</div>
                      </div>
                      <span className="font-mono text-lg bg-primary/10 px-3 py-1 rounded">
                        {attr.rollFormula}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="meanings" className="mt-4">
            <ScrollArea className="h-96">
              <div className="space-y-6 pr-4">
                {ATTRIBUTES.map((attr) => (
                  <div key={attr.id}>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      {attr.name} <Badge variant="outline" className="text-xs">{attr.nameEn}</Badge>
                    </h4>
                    <div className="space-y-1">
                      {attr.meanings.map((meaning) => (
                        <div
                          key={meaning.value}
                          className="flex gap-3 text-sm p-2 rounded hover:bg-muted/50"
                        >
                          <span className="font-mono font-bold w-16 text-center">
                            {meaning.value}
                          </span>
                          <span className="font-medium w-24">
                            {meaning.label}
                          </span>
                          <span className="text-muted-foreground flex-1">
                            {meaning.description}
                          </span>
                        </div>
                      ))}
                    </div>
                    <Separator className="mt-4" />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="effects" className="mt-4">
            <ScrollArea className="h-96">
              <div className="space-y-4 pr-4">
                <AttributeEffectCard
                  id="str"
                  name="力量"
                  nameEn="STR"
                  effects={[
                    '决定近战伤害输出',
                    '影响负重能力',
                    '力量降为0时无法离开床铺'
                  ]}
                />
                <AttributeEffectCard
                  id="con"
                  name="体质"
                  nameEn="CON"
                  effects={[
                    '决定生命值上限',
                    '抵抗疾病和毒药',
                    '体质降为0时死亡'
                  ]}
                />
                <AttributeEffectCard
                  id="siz"
                  name="体型"
                  nameEn="SIZ"
                  effects={[
                    '影响生命值（与体质一起）',
                    '决定伤害加值和体格',
                    '影响移动速度',
                    '体型减少通常意味着丢失肢体'
                  ]}
                />
                <AttributeEffectCard
                  id="dex"
                  name="敏捷"
                  nameEn="DEX"
                  effects={[
                    '决定战斗中的行动顺序',
                    '影响躲避攻击的成功率',
                    '敏捷降为0时无法进行物理行动'
                  ]}
                />
                <AttributeEffectCard
                  id="app"
                  name="外貌"
                  nameEn="APP"
                  effects={[
                    '影响社交互动和说服',
                    '影响第一印象',
                    '外貌降为0会引发恐惧和厌恶'
                  ]}
                />
                <AttributeEffectCard
                  id="int"
                  name="智力"
                  nameEn="INT"
                  effects={[
                    '决定能掌握的语言数量',
                    '影响快速思考和解决问题',
                    '智力降为0时如同婴儿般无法理解世界'
                  ]}
                />
                <AttributeEffectCard
                  id="pow"
                  name="意志"
                  nameEn="POW"
                  effects={[
                    '决定魔法使用能力',
                    '决定理智值上限',
                    '抵抗超自然力量的能力',
                    '意志降为0时成为行尸走肉'
                  ]}
                />
                <AttributeEffectCard
                  id="edu"
                  name="教育"
                  nameEn="EDU"
                  effects={[
                    '决定拥有的知识量',
                    '影响基于学识的技能检定',
                    '60+为高中毕业，70+为大学毕业，80+为硕士，90+为博士'
                  ]}
                />
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Difficulty Values Reference */}
        <div className="mt-4 p-4 bg-primary/5 rounded border border-primary/20">
          <h4 className="font-semibold mb-2 text-sm">检定难度参考</h4>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">常规难度：</span>
              <span className="font-mono ml-1">≤ 属性值</span>
            </div>
            <div>
              <span className="text-muted-foreground">困难难度：</span>
              <span className="font-mono ml-1">≤ 属性÷2</span>
            </div>
            <div>
              <span className="text-muted-foreground">极难难度：</span>
              <span className="font-mono ml-1">≤ 属性÷5</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function AttributeEffectCard({ id, name, nameEn, effects }: {
  id: AttributeId
  name: string
  nameEn: string
  effects: string[]
}) {
  return (
    <div className="border rounded p-4">
      <div className="flex items-center gap-2 mb-3">
        <h4 className="font-semibold">{name}</h4>
        <Badge variant="outline" className="text-xs">{nameEn}</Badge>
      </div>
      <ul className="space-y-1">
        {effects.map((effect, idx) => (
          <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>{effect}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
