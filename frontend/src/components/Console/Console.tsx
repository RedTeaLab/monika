import { useState, useCallback } from 'react'

function Console({ onResize }: { onResize: (h: number) => void }) {
  const [lines] = useState<string[]>(['$ ready'])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    let startY = e.clientY
    let startHeight = (e.target as HTMLElement).parentElement?.offsetHeight || 200
    let resizing = true
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: MouseEvent) => {
      if (!resizing) return
      const newH = Math.max(80, Math.min(500, startHeight + (startY - ev.clientY)))
      onResize(newH)
    }
    const onUp = () => {
      resizing = false; document.body.style.cursor = ''; document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [onResize])

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-secondary)]">
      <div className="h-1 cursor-ns-resize hover:bg-[var(--color-accent)] flex-shrink-0" onMouseDown={handleMouseDown} />
      <div className="px-3 py-1 border-b border-[var(--color-border)]">
        <span className="text-xs font-semibold text-[var(--color-text-dim)]">CONSOLE</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-1 font-mono text-xs text-[var(--color-text-dim)]">
        {lines.map((line, i) => (<div key={i}>{line}</div>))}
      </div>
    </div>
  )
}

export default Console
