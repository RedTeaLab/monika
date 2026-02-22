import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { campaignsApi } from '@/services/api/campaigns'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { CreateCampaignRequest, Campaign } from '@/types/campaign'

interface CreateCampaignDialogProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  campaign?: Campaign
}

export function CreateCampaignDialog({
  open,
  onClose,
  onSuccess,
  campaign,
}: CreateCampaignDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isEditMode = !!campaign

  useEffect(() => {
    if (campaign) {
      setName(campaign.name)
      setDescription(campaign.description || '')
      setMaxPlayers(campaign.max_players || 4)
    }
  }, [campaign])

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!name.trim()) {
      newErrors.name = '名称为必填项'
    } else if (name.length > 100) {
      newErrors.name = '名称不能超过100个字符'
    }

    if (description && description.length > 5000) {
      newErrors.description = '描述不能超过5000个字符'
    }

    if (maxPlayers < 1 || maxPlayers > 10) {
      newErrors.maxPlayers = '玩家数必须在1-10之间'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) {
      return
    }

    setSubmitting(true)
    try {
      const data: CreateCampaignRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        max_players: maxPlayers,
      }

      if (isEditMode && campaign) {
        await campaignsApi.updateCampaign(campaign.id, data)
      } else {
        await campaignsApi.createCampaign(data)
      }

      // Reset form
      setName('')
      setDescription('')
      setMaxPlayers(4)
      setErrors({})

      onSuccess?.()
    } catch (err: any) {
      toast.error(err.message || (isEditMode ? '更新战役失败' : '创建战役失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!submitting) {
      setName('')
      setDescription('')
      setMaxPlayers(4)
      setErrors({})
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? '编辑战役' : '创建新战役'}</DialogTitle>
          <DialogDescription>
            {isEditMode ? '修改战役信息' : '创建一个新的CoC 7e战役并邀请玩家加入'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              战役名称 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：鬼屋冒险"
              disabled={submitting}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">描述</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="战役简介、背景故事等..."
              rows={3}
              disabled={submitting}
            />
            {errors.description && (
              <p className="text-sm text-red-500">{errors.description}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxPlayers">最大玩家数</Label>
            <Input
              id="maxPlayers"
              type="number"
              min={1}
              max={10}
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(parseInt(e.target.value) || 4)}
              disabled={submitting}
            />
            {errors.maxPlayers && (
              <p className="text-sm text-red-500">{errors.maxPlayers}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={submitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (isEditMode ? '保存中...' : '创建中...') : (isEditMode ? '保存' : '创建')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
