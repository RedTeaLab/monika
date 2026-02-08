import { Button } from '@/components/ui/button'
import { Monitor } from 'lucide-react'
import { toast } from 'sonner'
import { useCallback } from 'react'

const MOBILE_FOOTER_MESSAGES = {
  observerMode: '移动端为观察者模式',
  continueOnDesktop: '请在桌面端继续游戏',
  desktopPrompt: '请在桌面端浏览器继续游戏以获得完整体验'
} as const

/**
 * MobileFooter component displayed at the bottom of mobile views.
 * Informs mobile users they are in observer mode and should continue
 * on desktop for the full game experience.
 */
export function MobileFooter() {
  const handleDesktopPrompt = useCallback(() => {
    toast.info(MOBILE_FOOTER_MESSAGES.desktopPrompt, {
      duration: 5000,
      position: 'top-center',
    })
  }, [])

  return (
    <div className="border-t bg-muted/30 p-4 text-center">
      <p className="text-sm text-muted-foreground mb-3">
        {MOBILE_FOOTER_MESSAGES.observerMode}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={handleDesktopPrompt}
        aria-describedby="mobile-footer-description"
      >
        <Monitor className="h-4 w-4" aria-hidden="true" />
        {MOBILE_FOOTER_MESSAGES.continueOnDesktop}
      </Button>
    </div>
  )
}
