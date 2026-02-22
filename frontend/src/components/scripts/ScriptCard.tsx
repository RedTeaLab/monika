import { FileJson, Trash2, Eye, Clock, Users, MapPin } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useNavigate } from 'react-router-dom'
import type { ScriptResponse } from '@/types/script'

interface ScriptCardProps {
  script: ScriptResponse
  onDelete: (id: string) => void
}

const statusColors: Record<string, string> = {
  valid: 'bg-green-500/10 text-green-500',
  invalid: 'bg-red-500/10 text-red-500',
  draft: 'bg-gray-500/10 text-gray-500',
  validating: 'bg-yellow-500/10 text-yellow-500',
  published: 'bg-blue-500/10 text-blue-500',
}

const statusLabels: Record<string, string> = {
  valid: '有效',
  invalid: '无效',
  draft: '草稿',
  validating: '校验中',
  published: '已发布',
}

export function ScriptCard({ script, onDelete }: ScriptCardProps) {
  const navigate = useNavigate()

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('确定要删除这个脚本吗？')) {
      onDelete(script.id)
    }
  }

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/scripts/${script.id}`)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <FileJson className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base line-clamp-1">{script.name}</CardTitle>
          </div>
          <Badge className={statusColors[script.status] || statusColors.draft}>
            {statusLabels[script.status] || script.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
          {script.description || '暂无描述'}
        </p>

        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
          {script.scene_count > 0 && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {script.scene_count} 场景
            </span>
          )}
          {script.npc_count > 0 && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {script.npc_count} NPC
            </span>
          )}
        </div>

        {script.tags && script.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {script.tags.slice(0, 3).map((tag, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {script.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{script.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {script.validation_errors && script.validation_errors.length > 0 && (
          <div className="text-xs text-red-500 mb-2">
            {script.validation_errors.length} 个错误
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(script.updated_at || '').toLocaleDateString('zh-CN')}
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/scripts/${script.id}`) }}>
              <Eye className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" className="text-red-500" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
