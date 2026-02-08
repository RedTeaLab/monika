import { useEffect } from 'react'

export function useTouchOptimizer() {
  useEffect(() => {
    // Prevent double-tap zoom
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault()
      }
    }

    // Prevent context menu on long press (except inputs)
    const handleContextMenu = (e: Event) => {
      const target = e.target as HTMLElement
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        e.preventDefault()
      }
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: false })
    document.addEventListener('contextmenu', handleContextMenu)

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [])
}

/**
 * Haptic feedback utility
 */
export function hapticFeedback(type: 'light' | 'medium' | 'heavy' = 'light') {
  if ('vibrate' in navigator) {
    const duration = { light: 10, medium: 20, heavy: 40 }[type]
    navigator.vibrate(duration)
  }
}
