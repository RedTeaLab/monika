// frontend/src/components/character-creation/OccupationSelectModal.tsx
import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { Occupation } from '@/types/occupation'

export interface OccupationSelectModalProps {
  open: boolean
  onClose: () => void
  onSelect: (occupation: Occupation) => void
  selectedId?: string
}

// Mock occupations data - this will be replaced with API call later
const MOCK_OCCUPATIONS: Occupation[] = [
  {
    id: '1',
    name: '侦探',
    description: '调查犯罪和谜团的专家',
    suggested_attrs: ['力量', '敏捷', '智力'],
    occupation_skills: ['侦查', '心理学'],
    occupation_items: ['手枪', '笔记本'],
  },
  {
    id: '2',
    name: '医生',
    description: '医疗专家，能够治疗伤势',
    suggested_attrs: ['智力', '教育', '敏捷'],
    occupation_skills: ['急救', '医学'],
    occupation_items: ['医疗包', '手术刀'],
  },
]

export function OccupationSelectModal({
  open,
  onClose,
  onSelect,
  selectedId,
}: OccupationSelectModalProps) {
  const [search, setSearch] = useState('')
  const [occupations, setOccupations] = useState<Occupation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    const fetchOccupations = async () => {
      try {
        setLoading(true)
        // TODO: Replace with actual API call
        // const data = await characterApi.getOccupations()
        const data = MOCK_OCCUPATIONS
        setOccupations(Array.isArray(data) ? data : Object.values(data))
      } catch (err) {
        console.error('Failed to fetch occupations:', err)
        setOccupations(MOCK_OCCUPATIONS)
      } finally {
        setLoading(false)
      }
    }
    fetchOccupations()
  }, [open])

  const filtered = occupations.filter(occ =>
    occ.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>选择职业</DialogTitle>
        </DialogHeader>

        <Input
          placeholder="搜索职业..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4"
        />

        {loading ? (
          <div className="text-center py-8">加载中...</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((occ) => (
              <div
                key={occ.id}
                className={`p-4 border rounded cursor-pointer hover:bg-accent ${
                  selectedId === occ.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => onSelect(occ)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium">{occ.name}</h4>
                    {occ.description && (
                      <p className="text-sm text-muted-foreground mt-1">{occ.description}</p>
                    )}
                  </div>
                  {selectedId === occ.id && <Badge>已选择</Badge>}
                </div>

                {occ.suggested_attrs && occ.suggested_attrs.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {occ.suggested_attrs.map((attr) => (
                      <Badge key={attr} variant="outline" className="text-xs">
                        {attr}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
