import { useEffect, useRef } from 'react'
import { useStore } from '../../store'
import { sanitizeArgs } from './sanitize'

interface ConfirmBarProps {
  sessionId: string
}

function ConfirmBar({ sessionId }: ConfirmBarProps) {
  const pendingPermission = useStore((s) => s.pendingPermission)
  const respondPermission = useStore((s) => s.respondPermission)
  const allowRef = useRef<HTMLButtonElement>(null)

  // Auto-focus the allow button on mount
  useEffect(() => {
    allowRef.current?.focus()
  }, [])

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

  const modeLabel = pendingPermission.mode === 'manual' ? '手动模式 — 确认操作' : '确认工具执行'

  return (
    <div
      className="flex flex-col gap-2 p-3 border-t-2 border-[var(--yellow)] bg-[var(--bg-elevated)] animate-slide-up"
      onKeyDown={handleKeyDown}
      role="alertdialog"
      aria-label={modeLabel}
    >
      <div className="flex items-center gap-2">
        <span className="text-[14px]" aria-hidden="true">{'⚠'}</span>
        <span className="text-[12px] font-semibold">{modeLabel}</span>
        {pendingPermission.mode === 'auto' && pendingPermission.reason && (
          <span className="text-[11px] text-[var(--text-dim)] ml-1">— {pendingPermission.reason}</span>
        )}
      </div>
      <div className="flex items-center gap-2 px-2.5 py-2 bg-[var(--bg-card)] rounded-md">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[rgba(212,168,67,0.2)] text-[var(--yellow)] font-mono">
          {pendingPermission.tool}
        </span>
        <code className="text-[12px] text-[var(--text-primary)] truncate">
          {sanitizeArgs(pendingPermission.args)}
        </code>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={() => respondPermission({ requestId: pendingPermission.requestId, decision: 'deny' })}
          className="px-3.5 py-1.5 rounded-md border border-[var(--border)] bg-transparent text-[var(--text-secondary)] text-[11px] cursor-pointer hover:bg-[var(--bg-hover)]"
        >
          拒绝 (Esc)
        </button>
        <button
          ref={allowRef}
          onClick={() => respondPermission({ requestId: pendingPermission.requestId, decision: 'allow' })}
          className="px-3.5 py-1.5 rounded-md border-none bg-[var(--accent)] text-white text-[11px] cursor-pointer font-medium hover:opacity-90"
        >
          允许 (Enter)
        </button>
        <button
          onClick={() => respondPermission({
            requestId: pendingPermission.requestId,
            decision: 'allow_always',
            rulePattern: pendingPermission.args,
          })}
          className="px-3.5 py-1.5 rounded-md border border-[var(--accent)] bg-transparent text-[var(--accent)] text-[11px] cursor-pointer hover:bg-[var(--accent-muted)]"
        >
          始终允许 (Ctrl+Enter)
        </button>
      </div>
    </div>
  )
}

export default ConfirmBar
