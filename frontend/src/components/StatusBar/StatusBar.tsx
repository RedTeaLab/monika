import { useStore } from '../../store'

function StatusBar() {
  const generating = useStore((s) => s.generatingSessionId !== '')
  const tokenCount = useStore((s) => s.tokenCount)
  const tokenMax = useStore((s) => s.tokenMax)
  const branch = useStore((s) => s.branch)

  return (
    <div
      className="flex items-center h-[28px] text-[11px] select-none border-t border-[var(--border)]"
      style={{ background: 'var(--bg-elevated)', padding: '0 14px' }}
    >
      <div className="flex items-center gap-2">
        <span
          className="block rounded-full"
          style={{
            width: 7, height: 7,
            background: generating ? 'var(--yellow)' : 'var(--green)',
            boxShadow: generating ? '0 0 6px rgba(212,168,67,0.5)' : '0 0 6px rgba(84,192,138,0.5)',
            animation: generating ? 'pulse 1.2s ease-in-out infinite' : undefined,
          }}
        />
        <span className="text-[var(--text-secondary)]">
          {generating ? 'generating...' : 'ready'}
        </span>
        {branch && (
          <>
            <span className="text-[var(--border)] select-none">|</span>
            <span className="text-[var(--text-dim)]">{branch}</span>
          </>
        )}
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        {tokenMax > 0 && (
          <span className="text-[var(--text-dim)]">
            {Math.round(tokenCount / 1000)}k / {Math.round(tokenMax / 1000)}k tokens
          </span>
        )}
      </div>
    </div>
  )
}

export default StatusBar
