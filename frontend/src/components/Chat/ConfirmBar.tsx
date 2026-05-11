import { useStore } from '../../store'
import { sanitizeArgs } from './sanitize'

interface ConfirmBarProps {
  sessionId: string
}

function ConfirmBar({ sessionId }: ConfirmBarProps) {
  const pendingPermission = useStore((s) => s.pendingPermission)
  const respondPermission = useStore((s) => s.respondPermission)

  if (!pendingPermission || pendingPermission.sessionId !== sessionId) return null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      respondPermission({ requestId: pendingPermission.requestId, decision: 'deny' })
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      respondPermission({
        requestId: pendingPermission.requestId,
        decision: 'allow_always',
        rulePattern: pendingPermission.args,
      })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      respondPermission({ requestId: pendingPermission.requestId, decision: 'allow' })
    }
  }

  return (
    <div
      className="border-t px-4 py-2.5 flex flex-col gap-2"
      style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
      onKeyDown={handleKeyDown}
      role="alertdialog"
      aria-label="Confirm tool execution"
    >
      <span className="text-[11px] font-semibold" style={{ color: 'var(--accent)' }}>
        Confirm
      </span>

      <div className="flex items-center gap-2 min-w-0">
        <span
          className="px-1.5 py-0.5 rounded-sm text-[10px] font-semibold font-mono shrink-0"
          style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
        >
          {pendingPermission.tool}
        </span>
        <code className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
          {sanitizeArgs(pendingPermission.args)}
        </code>
        {pendingPermission.reason && (
          <span className="text-[10px] shrink-0" style={{ color: 'var(--text-dim)' }}>
            {pendingPermission.reason}
          </span>
        )}
      </div>

      <div className="flex justify-end gap-1.5">
        <button
          onClick={() => respondPermission({ requestId: pendingPermission.requestId, decision: 'deny' })}
          className="text-[11px] px-2.5 py-1 rounded-sm cursor-pointer outline-none"
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text-dim)',
            fontFamily: 'inherit',
          }}
        >
          Deny
        </button>
        <button
          onClick={() => respondPermission({
            requestId: pendingPermission.requestId,
            decision: 'allow_always',
            rulePattern: pendingPermission.args,
          })}
          className="text-[11px] px-2.5 py-1 rounded-sm cursor-pointer outline-none"
          style={{
            background: 'transparent',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-secondary)',
            fontFamily: 'inherit',
          }}
        >
          Always
        </button>
        <button
          onClick={() => respondPermission({ requestId: pendingPermission.requestId, decision: 'allow' })}
          className="text-[11px] px-2.5 py-1 rounded-sm cursor-pointer font-medium outline-none"
          style={{
            background: 'var(--accent)',
            border: 'none',
            color: '#fff',
            fontFamily: 'inherit',
          }}
        >
          Allow
        </button>
      </div>
    </div>
  )
}

export default ConfirmBar
