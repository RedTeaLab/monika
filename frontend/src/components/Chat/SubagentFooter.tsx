import { useStore } from '../../store'

export default function SubagentFooter() {
  const switchSessionTab = useStore((s) => s.switchSessionTab)
  const sessionParentId = useStore((s) => s.sessionParentId)

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 text-[11px]"
      style={{
        background: 'var(--bg-sidebar)',
        borderTop: '1px solid var(--border)',
      }}
    >
      <span className="flex items-center gap-1.5" style={{ color: '#a89cc4', fontWeight: 600 }}>
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: '#a89cc4' }} />
        subagent session
      </span>
      <span className="flex-1" />
      {sessionParentId && (
        <button
          className="text-[10px] px-2.5 py-1 rounded border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] cursor-pointer"
          onClick={() => switchSessionTab(sessionParentId)}
        >
          ← Parent (Esc)
        </button>
      )}
    </div>
  )
}
