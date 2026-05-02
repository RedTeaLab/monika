import { useStore } from '../../store'
import { formatTokens } from '../../lib/format'

export default function SubagentFooter() {
  const switchSessionTab = useStore((s) => s.switchSessionTab)
  const sessionParents = useStore((s) => s.sessionParents)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const openSessions = useStore((s) => s.openSessions)
  const sessionTokens = useStore((s) => s.sessionTokens)
  const tok = sessionTokens[activeSessionId]
  const parentId = sessionParents[activeSessionId] || ''

  // Find sibling subagent sessions (share same parent)
  const siblings = openSessions.filter(s => s.id.startsWith('sub_') || s.id.startsWith('call_'))
  const siblingIdx = siblings.findIndex(s => s.id === activeSessionId)
  const totalSiblings = siblings.length

  // Extract agent name from active tab title (format: "explore · description")
  const activeTab = openSessions.find(s => s.id === activeSessionId)
  const agentName = activeTab?.title?.split(' · ')[0] || 'subagent'

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 text-[11px]"
      style={{
        background: 'var(--bg-sidebar)',
        borderTop: '1px solid var(--border)',
      }}
    >
      {/* Agent label */}
      <span className="flex items-center gap-1.5" style={{ color: '#a89cc4', fontWeight: 600 }}>
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: '#a89cc4' }} />
        {agentName} agent
      </span>

      {/* Position among siblings */}
      {totalSiblings > 1 && (
        <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
          {siblingIdx + 1} of {totalSiblings}
        </span>
      )}

      {/* Token usage */}
      {tok && (
        <span className="text-[10px]" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          {formatTokens(tok.count)}
          {tok.max > 0 ? ` / ${formatTokens(tok.max)}` : ''}
        </span>
      )}

      <span className="flex-1" />

      {/* Navigation */}
      {parentId && (
        <button
          className="text-[10px] px-2.5 py-1 rounded border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] cursor-pointer"
          onClick={() => switchSessionTab(parentId)}
        >
          ← Parent
        </button>
      )}
      {siblingIdx > 0 && (
        <button
          className="text-[10px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] cursor-pointer"
          onClick={() => switchSessionTab(siblings[siblingIdx - 1].id)}
        >
          ← Prev
        </button>
      )}
      {siblingIdx < totalSiblings - 1 && (
        <button
          className="text-[10px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] cursor-pointer"
          onClick={() => switchSessionTab(siblings[siblingIdx + 1].id)}
        >
          Next →
        </button>
      )}
    </div>
  )
}
