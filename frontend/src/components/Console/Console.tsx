import { useRef, useEffect } from 'react'
import { IDockviewPanelProps } from 'dockview'
import { useStore } from '../../store'

function Console(_props: IDockviewPanelProps) {
  const lines = useStore((s) => s.consoleLines)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines])

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: '#080a10' }}
    >
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
