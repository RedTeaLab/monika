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
    <div
      className="flex flex-col h-full backdrop-blur-md"
      style={{ background: 'var(--glass-light)' }}
    >
      <div
        className="h-[3px] cursor-ns-resize flex-shrink-0 transition-colors"
        style={{ background: 'var(--border)' }}
        onMouseDown={handleMouseDown}
        onMouseEnter={(e) => (e.target as HTMLElement).style.background = 'var(--accent)'}
        onMouseLeave={(e) => (e.target as HTMLElement).style.background = 'var(--border)'}
      />
      <div
        className="py-1 border-b border-[var(--border)] flex items-center"
        style={{ padding: '2px 12px', background: 'var(--glass-strong)' }}
      >
        <span className="text-[10px] font-semibold text-[var(--text-dim)] tracking-[0.06em] uppercase">Console</span>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto text-[12px] text-[var(--text-dim)]"
        style={{ fontFamily: 'var(--font-mono)', padding: '8px 12px' }}
      >
        {lines.map((line, i) => (<div key={i}>{line}</div>))}
      </div>
    </div>
  )
}

export default Console
