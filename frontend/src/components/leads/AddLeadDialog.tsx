/**
 * AddLeadDialog Component
 *
 * Dialog for creating new leads in a game session.
 */

import { useState, useEffect, useRef } from 'react'
import { createLead } from '@/services/api/leads'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { LeadPriority, LeadType, CreateLeadRequest } from '@/types/lead'

interface AddLeadDialogProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  sessionId: string
}

const PRIORITY_OPTIONS: { value: LeadPriority; label: string }[] = [
  { value: 'critical', label: '关键' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
]

const TYPE_OPTIONS: { value: LeadType; label: string }[] = [
  { value: 'investigate', label: '调查' },
  { value: 'interact', label: '互动' },
  { value: 'travel', label: '旅行' },
  { value: 'combat', label: '战斗' },
  { value: 'rest', label: '休息' },
  { value: 'custom', label: '自定义' },
]

export function AddLeadDialog({
  open,
  onClose,
  onSuccess,
  sessionId,
}: AddLeadDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<LeadPriority>('medium')
  const [type, setType] = useState<LeadType>('investigate')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const prevOpenRef = useRef<boolean>(open)

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setTitle('')
      setDescription('')
      setPriority('medium')
      setType('investigate')
      setErrors({})
    }
    prevOpenRef.current = open
  }, [open])

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!title.trim()) {
      newErrors.title = '标题为必填项'
    } else if (title.length > 200) {
      newErrors.title = '标题不能超过200个字符'
    }

    if (!description.trim()) {
      newErrors.description = '描述为必填项'
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
      const leadData: CreateLeadRequest = {
        title: title.trim(),
        description: description.trim(),
        priority,
        type,
      }

      await createLead(sessionId, leadData)

      // Reset form
      setTitle('')
      setDescription('')
      setPriority('medium')
      setType('investigate')
      setErrors({})

      toast.success('线索添加成功')
      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '添加线索失败'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!submitting) {
      setTitle('')
      setDescription('')
      setPriority('medium')
      setType('investigate')
      setErrors({})
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>添加线索</DialogTitle>
          <DialogDescription>
            为当前剧本添加新的线索或任务
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">
              标题 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：调查废弃小屋"
              disabled={submitting}
              maxLength={200}
            />
            {errors.title && (
              <p className="text-sm text-red-500">{errors.title}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">
              描述 <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="线索的详细描述..."
              rows={4}
              disabled={submitting}
            />
            {errors.description && (
              <p className="text-sm text-red-500">{errors.description}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">优先级</Label>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value as LeadPriority)}
                disabled={submitting}
              >
                <SelectTrigger id="priority">
                  <SelectValue placeholder="选择优先级" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">类型</Label>
              <Select
                value={type}
                onValueChange={(value) => setType(value as LeadType)}
                disabled={submitting}
              >
                <SelectTrigger id="type">
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              {submitting ? '添加中...' : '添加'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
