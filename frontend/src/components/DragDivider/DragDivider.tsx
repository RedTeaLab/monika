import { useCallback, useRef, useEffect } from 'react'

interface DragDividerProps {
  ratio: number
  onRatioChange: (ratio: number) => void
}

function DragDivider({ ratio, onRatioChange }: DragDividerProps) {
  const dragging = useRef(false)
  const startX = useRef(0)
  const startRatio = useRef(ratio)

  useEffect(() => {
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startRatio.current = ratio
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const parent = (e.target as HTMLElement).parentElement
    if (!parent) return

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const totalWidth = parent.offsetWidth - 4
      if (totalWidth <= 0) return
      const delta = ev.clientX - startX.current
      const newRatio = Math.max(0.2, Math.min(0.8, startRatio.current + delta / totalWidth))
      onRatioChange(newRatio)
    }

    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [ratio, onRatioChange])

  return (
    <div
      className="w-1 flex-shrink-0 cursor-col-resize transition-colors"
      style={{ background: 'var(--border)' }}
      onMouseDown={handleMouseDown}
      onMouseEnter={(e) => (e.target as HTMLElement).style.background = 'var(--accent)'}
      onMouseLeave={(e) => { if (!dragging.current) (e.target as HTMLElement).style.background = 'var(--border)' }}
    />
  )
}

export default DragDivider
