import { useCallback, useRef, useEffect } from 'react'
import { useStore } from '../../store'

function Console({ onResize }: { onResize: (h: number) => void }) {
  const lines = useStore((s) => s.consoleLines)
  const scrollRef = useRef<HTMLDivElement>(null)
  const resizeRef = useRef<{ onMove: (ev: MouseEvent) => void; onUp: () => void } | null>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines])

  useEffect(() => {
    return () => {
      if (resizeRef.current) {
        document.removeEventListener('mousemove', resizeRef.current.onMove)
        document.removeEventListener('mouseup', resizeRef.current.onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const startY = e.clientY
    const startHeight = (e.target as HTMLElement).parentElement?.offsetHeight || 200
    let resizing = true
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      if (!resizing) return
      const newH = Math.max(80, Math.min(500, startHeight + (startY - ev.clientY)))
      onResize(newH)
    }
    const onUp = () => {
      resizing = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      resizeRef.current = null
    }
    resizeRef.current = { onMove, onUp }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [onResize])

  return (
    <div className="flex flex-col h-full bg-[var(--bg-panel)]">
      <div className="h-1 cursor-ns-resize hover:bg-[var(--accent)] flex-shrink-0" onMouseDown={handleMouseDown} />
      <div className="py-[3px] bg-[var(--bg-sidebar)] border-b border-[var(--border)] flex items-center gap-2" style={{ padding: '3px 10px' }}>
        <span className="text-[11px] font-semibold text-[var(--text-secondary)] tracking-[0.05em] uppercase">Console</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-2 text-[12px] text-[var(--text-dim)]" style={{ fontFamily: 'var(--font-mono)', padding: '8px 10px' }}>
        {lines.map((line, i) => (<div key={i}>{line}</div>))}
      </div>
    </div>
  )

}

export default Console
