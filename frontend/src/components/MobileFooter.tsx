import { Button } from '@/components/ui/button'
import { Monitor } from 'lucide-react'

export function MobileFooter() {
  return (
    <div className="border-t bg-muted/30 p-4 text-center">
      <p className="text-sm text-muted-foreground mb-3">
        移动端为观察者模式
      </p>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => {
          // Could show a modal or redirect
          alert('请在桌面端浏览器继续游戏以获得完整体验')
        }}
      >
        <Monitor className="h-4 w-4" />
        请在桌面端继续游戏
      </Button>
    </div>
  )
}
