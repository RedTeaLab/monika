import { useState } from 'react'
import { LogIn } from 'lucide-react'
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
import type { JoinCampaignRequest } from '@/types/campaign'

interface JoinCampaignDialogProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  campaignId?: string
}

export function JoinCampaignDialog({
  open,
  onClose,
  onSuccess,
  campaignId,
}: JoinCampaignDialogProps) {
  const [inviteCode, setInviteCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!inviteCode.trim()) {
      newErrors.inviteCode = '请输入邀请码'
    } else if (inviteCode.length !== 8) {
      newErrors.inviteCode = '邀请码必须是8位字符'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) {
      return
    }

    if (!campaignId) {
      toast.error('战役ID未提供')
      return
    }

    setSubmitting(true)
    try {
      const data: JoinCampaignRequest = {
        invite_code: inviteCode.trim().toUpperCase(),
      }

      await campaignsApi.joinCampaign(campaignId, data)

      // Reset form
      setInviteCode('')
      setErrors({})

      onSuccess?.()
    } catch (err: any) {
      toast.error(err.message || '加入战役失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!submitting) {
      setInviteCode('')
      setErrors({})
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>加入战役</DialogTitle>
          <DialogDescription>
            输入战役邀请码以加入现有战役
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inviteCode">
              邀请码 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="inviteCode"
              value={inviteCode}
              onChange={(e) => {
                // Auto-uppercase and limit to 8 characters
                const value = e.target.value.toUpperCase().slice(0, 8)
                setInviteCode(value)
              }}
              placeholder="输入8位邀请码"
              maxLength={8}
              disabled={submitting}
              className="text-center text-lg font-mono tracking-wider"
            />
            {errors.inviteCode && (
              <p className="text-sm text-red-500">{errors.inviteCode}</p>
            )}
            <p className="text-xs text-muted-foreground">
              请向战役主持人索取8位邀请码
            </p>
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
              {submitting ? (
                '加入中...'
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  加入战役
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
