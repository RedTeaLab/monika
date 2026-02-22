import { Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface InviteCodeDisplayProps {
  inviteCode: string
  onCopy?: () => void
}

export function InviteCodeDisplay({
  inviteCode,
  onCopy,
}: InviteCodeDisplayProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode)
      setCopied(true)
      toast.success('邀请码已复制')
      onCopy?.()

      // Reset copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      toast.error('复制失败')
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground mb-1">
            邀请码
          </p>
          <code className="text-2xl font-bold tracking-wider">{inviteCode}</code>
        </div>
        <Button
          variant={copied ? 'default' : 'outline'}
          size="sm"
          onClick={handleCopy}
          className="shrink-0"
        >
          {copied ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              已复制
            </>
          ) : (
            <>
              <Copy className="mr-2 h-4 w-4" />
              复制
            </>
          )}
        </Button>
      </div>
    </Card>
  )
}
