import { useRef, useEffect } from 'react'
import { IDockviewPanelProps } from 'dockview'
import { useStore, ConsoleEntry } from '../../store'

// ── tool color per name ──

function toolColor(name: string): string {
  const key = name.toLowerCase()
  if (key.includes('bash')) return 'var(--yellow)'
  if (key.includes('read') || key.includes('glob') || key.includes('grep')) return 'var(--blue)'
  if (key.includes('write') || key.includes('edit')) return 'var(--orange)'
  if (key.includes('web')) return 'var(--green)'
  if (key.includes('agent') || key.includes('task')) return 'var(--purple)'
  return 'var(--accent)'
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}

// ── per-entry renderers ──

function ToolEntry({ entry }: { entry: ConsoleEntry }) {
  const color = toolColor(entry.text)
  const statusColor = entry.status === 'done' ? 'var(--green)' : entry.status === 'error' ? 'var(--red)' : 'var(--yellow)'
  const statusBg = entry.status === 'done' ? 'rgba(84,192,138,0.12)' : entry.status === 'error' ? 'rgba(224,96,96,0.12)' : 'rgba(212,168,67,0.12)'

  return (
    <div className="text-[12px]" style={{ fontFamily: 'var(--font-mono)', lineHeight: 1.65 }}>
      <div className="flex items-center min-h-[20px]" style={{ padding: '0 12px 0 10px' }}>
        <span style={{ color }}>{entry.text}</span>
        {entry.meta && (
          <span style={{ color: 'var(--text-dim)', marginLeft: 6 }}>
            {truncate(entry.meta, 100)}
          </span>
        )}
        <span className="flex-1" />
        {entry.status && (
          <span
            className="inline-block rounded-[3px] text-[10px] leading-[1.4] flex-shrink-0"
            style={{ padding: '0 5px', background: statusBg, color: statusColor }}
          >
            {entry.status}
          </span>
        )}
      </div>
      {entry.output && (
        <div
          style={{
            padding: '0 12px 2px 18px',
            color: 'var(--text-dim)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            lineHeight: 1.55,
            borderLeft: '1px solid var(--border)',
            marginLeft: 14,
            marginRight: 8,
          }}
        >
          {entry.output}
        </div>
      )}
    </div>
  )
}

function SystemEntry({ entry }: { entry: ConsoleEntry }) {
  return (
    <div
      className="text-[12px] min-h-[20px]"
      style={{ fontFamily: 'var(--font-mono)', lineHeight: 1.65, padding: '0 12px 0 10px', color: 'var(--text-dim)' }}
    >
      {entry.text}
    </div>
  )
}

function ErrorEntry({ entry }: { entry: ConsoleEntry }) {
  return (
    <div
      className="text-[12px] min-h-[20px]"
      style={{ fontFamily: 'var(--font-mono)', lineHeight: 1.65, padding: '0 12px 0 10px', color: 'var(--red)' }}
    >
      {entry.text}
    </div>
  )
}

function FileEntry({ entry }: { entry: ConsoleEntry }) {
  return (
    <div
      className="flex items-start text-[12px] min-h-[20px]"
      style={{ fontFamily: 'var(--font-mono)', lineHeight: 1.65, padding: '0 12px 0 10px' }}
    >
      <span style={{ color: 'var(--text-secondary)' }}>{entry.text}</span>
      {entry.meta && (
        <span
          className="ml-1.5 inline-block rounded-[3px] text-[10px] leading-[1.4]"
          style={{ padding: '0 5px', background: 'rgba(107,158,230,0.12)', color: 'var(--blue)' }}
        >
          {entry.meta}
        </span>
      )}
    </div>
  )
}

// ── main ──

const RENDERER: Record<string, React.FC<{ entry: ConsoleEntry }>> = {
  tool: ToolEntry,
  system: SystemEntry,
  error: ErrorEntry,
  file: FileEntry,
}

function Console(_props: IDockviewPanelProps) {
  const entries = useStore((s) => s.consoleEntries)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries])

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-console)' }}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ padding: '6px 0' }}>
        {entries.map((entry, i) => {
          const C = RENDERER[entry.type]
          return C ? <C key={i} entry={entry} /> : null
        })}
      </div>
    </div>
  )
}

export default Console
