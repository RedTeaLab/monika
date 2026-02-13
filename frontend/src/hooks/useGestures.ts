import { useDrag } from '@use-gesture/react'
import { useRef } from 'react'

export function usePullToRefresh(onRefresh: () => void) {
  const ref = useRef<HTMLDivElement>(null)

  const bind = useDrag(({ down, movement: [, my] }) => {
    if (!ref.current) return

    const threshold = 80

    if (!down) {
      ref.current.style.transform = ''
      if (my > threshold) {
        onRefresh()
      }
      return
    }

    // Visual feedback with resistance
    const translateY = Math.min(my * 0.5, 120)
    ref.current.style.transform = `translateY(${translateY}px)`
  })

  return { ref, bind }
}

export function useSwipeToSwipe(onSwipe: (direction: 'left' | 'right') => void) {
  const bind = useDrag(({ swipe: [swipeX] }) => {
    if (swipeX < 0) {
      onSwipe('left')
    } else if (swipeX > 0) {
      onSwipe('right')
    }
  })

  return bind
}
