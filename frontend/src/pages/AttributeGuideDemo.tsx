// frontend/src/pages/AttributeGuideDemo.tsx
/**
 * Attribute Guide Demo Page
 *
 * This page demonstrates the AttributeInfoCard and AttributeGuidePanel components
 * for displaying CoC 7e attribute information with formulas, meanings, and effects.
 */
import { useState } from 'react'
import { AttributeInfoCard, AttributeGuidePanel } from '@/components/character-creation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { AttributeId } from '@/data'

// Demo attribute values
const demoValues: Record<AttributeId, number> = {
  str: 65,
  con: 50,
  siz: 55,
  dex: 70,
  app: 45,
  int: 75,
  pow: 60,
  edu: 65,
}

// Demo roll results
const demoRolls: Record<AttributeId, number[]> = {
  str: [5, 4, 3],
  con: [4, 2, 5],
  siz: [4, 5, 0], // 0 indicates not rolled (2d6+6 formula)
  dex: [6, 3, 2],
  app: [2, 3, 4],
  int: [5, 4, 0], // 0 indicates not rolled (2d6+6 formula)
  pow: [3, 5, 4],
  edu: [4, 3, 0], // 0 indicates not rolled (2d6+6 formula)
}

export function AttributeGuideDemo() {
  const navigate = useNavigate()
  const [selectedAttribute, setSelectedAttribute] = useState<AttributeId | null>(null)
  const [showGuide, setShowGuide] = useState(true)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">核心属性指南演示</h1>
              <p className="text-sm text-muted-foreground">
                CoC 7e 属性计算公式与说明
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Attribute Cards Grid */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">属性详情卡片</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowGuide(!showGuide)}
              >
                {showGuide ? '隐藏指南' : '显示指南'}
              </Button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {(Object.keys(demoValues) as AttributeId[]).map((attrId) => (
                <AttributeInfoCard
                  key={attrId}
                  attributeId={attrId}
                  value={demoValues[attrId]}
                  showRolls={true}
                  rolls={demoRolls[attrId]}
                />
              ))}
            </div>
          </div>

          {/* Right: Guide Panel */}
          {showGuide && (
            <div className="lg:col-span-1">
              <div className="sticky top-4">
                <AttributeGuidePanel />
              </div>
            </div>
          )}
        </div>

        {/* Usage Example */}
        <Card className="mt-8">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4">使用示例</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">1. 单个属性卡片</h4>
                <pre className="bg-muted p-4 rounded text-sm overflow-x-auto">
{`import { AttributeInfoCard } from '@/components/character-creation'

<AttributeInfoCard
  attributeId="str"
  value={65}
  showRolls={true}
  rolls={[5, 4, 3]}
/>`}
                </pre>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2">2. 属性指南面板</h4>
                <pre className="bg-muted p-4 rounded text-sm overflow-x-auto">
{`import { AttributeGuidePanel } from '@/components/character-creation'

<AttributeGuidePanel />`}
                </pre>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2">3. 属性数据导入</h4>
                <pre className="bg-muted p-4 rounded text-sm overflow-x-auto">
{`import {
  ATTRIBUTES,
  getAttributeInfo,
  getAttributeMeaning,
  calculateDifficultyValues
} from '@/data'

// 获取属性信息
const strInfo = getAttributeInfo('str')

// 获取属性含义
const meaning = getAttributeMeaning('str', 90)

// 计算难度值
const { half, fifth } = calculateDifficultyValues(65)`}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

export default AttributeGuideDemo
