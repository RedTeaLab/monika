// frontend/src/components/character-creation/EquipmentSection.tsx
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Occupation } from '@/types/occupation'
import type { Equipment, CharacterCreationAction } from '@/types/characterCreation'

export interface EquipmentSectionProps {
  occupation: Occupation | null
  equipment: Equipment
  dispatch: (action: CharacterCreationAction) => void
}

export function EquipmentSection({
  occupation,
  equipment,
  dispatch,
}: EquipmentSectionProps) {
  const [customItemName, setCustomItemName] = useState('')

  const addCustomItem = () => {
    if (customItemName.trim()) {
      dispatch({ type: 'ADD_EQUIPMENT', item: customItemName.trim(), category: 'custom' })
      setCustomItemName('')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>装备物品</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Occupation default gear */}
        <div>
          <h4 className="text-sm font-medium mb-3">职业基础装备</h4>
          {equipment.occupationItems.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              {occupation ? '该职业无预设装备' : '请先选择职业'}
            </p>
          ) : (
            <ul className="space-y-1">
              {equipment.occupationItems.map((item) => (
                <li key={item} className="flex items-center justify-between">
                  <span className="text-sm">{item}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dispatch({ type: 'REMOVE_EQUIPMENT', item, category: 'occupation' })}
                  >
                    删除
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Custom items */}
        <div>
          <h4 className="text-sm font-medium mb-3">自定义物品</h4>
          <ul className="space-y-1 mb-3">
            {equipment.customItems.map((item) => (
              <li key={item} className="flex items-center justify-between">
                <span className="text-sm">{item}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dispatch({ type: 'REMOVE_EQUIPMENT', item, category: 'custom' })}
                >
                  删除
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input
              placeholder="物品名称..."
              value={customItemName}
              onChange={(e) => setCustomItemName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addCustomItem()}
            />
            <Button onClick={addCustomItem}>添加</Button>
          </div>
        </div>

        {/* Money */}
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium mb-3">资产</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cash">现金 ($)</Label>
              <Input
                id="cash"
                type="number"
                value={equipment.cash || ''}
                onChange={(e) => dispatch({ type: 'SET_CASH', value: parseInt(e.target.value) || 0 })}
                placeholder="根据职业信用评级"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assets">资产 ($)</Label>
              <Input
                id="assets"
                type="number"
                value={equipment.assets || ''}
                onChange={(e) => dispatch({ type: 'SET_ASSETS', value: parseInt(e.target.value) || 0 })}
                placeholder="房产、投资等"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
