import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import Modal, { ModalActions, ModalButton } from '../ui/Modal'
import ConfirmModal from '../Chat/ConfirmModal'
import { IconShield, IconTrash, IconPlus } from '../Icons'

const TOOLS = [
  'bash', 'file_read', 'file_write', 'file_edit', 'file_list',
  'grep', 'glob', 'task_create', 'task_update', 'task_list', 'spawn_agent',
] as const

const DECISIONS = [
  { value: 'allow', label: 'allow' },
  { value: 'ask', label: 'ask' },
  { value: 'deny', label: 'deny' },
] as const

const SOURCES = [
  { value: 'project', label: 'project' },
  { value: 'global', label: 'global' },
] as const

function DropdownSelect<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  const [open, setOpen] = useState(false)
  const [focusIdx, setFocusIdx] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open) setFocusIdx(0)
  }, [open])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusIdx((prev) => Math.min(prev + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusIdx((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onChange(options[focusIdx].value)
      setOpen(false)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] px-2 py-0.5 rounded cursor-pointer flex items-center justify-between w-full"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          fontFamily: 'inherit',
        }}
      >
        <span>{value}</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polyline points="2,3 4,5 6,3" />
        </svg>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: '4px',
            minWidth: '100%',
            maxHeight: '240px',
            overflowY: 'auto',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md, 6px)',
            padding: '4px',
            zIndex: 1000,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
          onKeyDown={handleKeyDown}
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value
            return (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                onMouseEnter={() => setFocusIdx(idx)}
                className="text-[11px] w-full text-left px-2 py-1 rounded cursor-pointer"
                style={{
                  background:
                    idx === focusIdx
                      ? 'var(--bg-hover)'
                      : isSelected
                        ? 'var(--accent-muted)'
                        : 'transparent',
                  color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                  border: 'none',
                  fontFamily: 'inherit',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const decisionStyles: Record<string, string> = {
  allow: 'text-green-400 bg-green-400/10',
  ask: 'text-yellow-400 bg-yellow-400/10',
  deny: 'text-red-400 bg-red-400/10',
}

const sourceStyles: Record<string, { color: string; bg: string }> = {
  builtin: { color: '#9ca3af', bg: 'rgba(156,163,175,0.1)' },
  global: { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  project: { color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
}

function AddRuleModal({
  onClose,
  onAdd,
}: {
  onClose: () => void
  onAdd: (tool: string, pattern: string, decision: string, source: string) => Promise<void>
}) {
  const [tool, setTool] = useState('bash')
  const [pattern, setPattern] = useState('')
  const [decision, setDecision] = useState<'allow' | 'ask' | 'deny'>('ask')
  const [source, setSource] = useState<'global' | 'project'>('project')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const patternRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    patternRef.current?.focus()
  }, [])

  const handleAdd = async () => {
    setError('')
    setLoading(true)
    try {
      await onAdd(tool, pattern, decision, source)
      onClose()
    } catch {
      setError('Failed to add rule')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal onClose={onClose} loading={loading} width={420}>
      <h2 className="text-[14px] font-semibold text-[var(--text-primary)] m-0 mb-4">
        Add Permission Rule
      </h2>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Tool</label>
          <DropdownSelect value={tool} options={TOOLS.map((t) => ({ value: t, label: t }))} onChange={setTool} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Pattern</label>
          <input
            ref={patternRef}
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            placeholder="* wildcard, empty matches all"
            className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Decision</label>
          <DropdownSelect value={decision} options={DECISIONS} onChange={(v) => setDecision(v as 'allow' | 'ask' | 'deny')} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Source</label>
          <DropdownSelect value={source} options={SOURCES} onChange={(v) => setSource(v as 'global' | 'project')} />
        </div>
      </div>
      {error && <p className="text-[11px] text-[var(--red)] m-0 mb-3">{error}</p>}
      <ModalActions>
        <ModalButton onClick={onClose} disabled={loading}>Cancel</ModalButton>
        <ModalButton variant="primary" onClick={handleAdd} disabled={loading}>
          {loading ? 'Adding...' : 'Add'}
        </ModalButton>
      </ModalActions>
    </Modal>
  )
}

function PermissionsTab() {
  const projectPath = useStore((s) => s.projectPath)
  const permissionRules = useStore((s) => s.permissionRules)
  const loadPermissionRules = useStore((s) => s.loadPermissionRules)
  const addPermissionRule = useStore((s) => s.addPermissionRule)
  const deletePermissionRule = useStore((s) => s.deletePermissionRule)

  const [showAddModal, setShowAddModal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ tool: string; pattern: string; source: string } | null>(null)

  useEffect(() => {
    if (projectPath) {
      loadPermissionRules()
    }
  }, [projectPath])

  const handleDelete = (tool: string, pattern: string, source: string) => {
    deletePermissionRule(tool, pattern, source)
  }

  const handleAdd = async (tool: string, pattern: string, decision: string, source: string) => {
    await addPermissionRule(tool, pattern, decision, source)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold m-0 mb-1">Permissions</h3>
          <p className="text-[11px] text-[var(--text-dim)] m-0">
            Manage tool execution permissions and auto rules
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
        >
          <IconPlus size={12} />
          Add Rule
        </button>
      </div>

      {showAddModal && (
        <AddRuleModal onClose={() => setShowAddModal(false)} onAdd={handleAdd} />
      )}

      {permissionRules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-dim)]">
          <IconShield size={32} />
          <span className="text-[13px] mt-3">No permission rules configured.</span>
          <span className="text-[11px] mt-1">Click "Add Rule" to create one.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {permissionRules.map((rule, idx) => {
            const ds = decisionStyles[rule.decision] || ''
            const ss = sourceStyles[rule.source] || sourceStyles['project']
            return (
              <div
                key={`${rule.tool}-${rule.pattern}-${rule.source}-${idx}`}
                className="rounded-lg px-4 py-3 w-full relative group/card"
                style={{ background: 'var(--bg-card)' }}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0" style={{ color: 'var(--text-dim)' }}>
                    <IconShield size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[14px] font-semibold text-[var(--text-primary)]">{rule.tool}</span>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${ds}`}>
                        {rule.decision}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="font-mono text-[var(--text-dim)]">
                        {rule.pattern || <span className="italic">match all</span>}
                      </span>
                      <span
                        className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
                        style={{ color: ss.color, background: ss.bg }}
                      >
                        {rule.source}
                      </span>
                    </div>
                  </div>
                  {rule.source !== 'builtin' && (
                    <div className="opacity-0 group-hover/card:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => setConfirmDelete({ tool: rule.tool, pattern: rule.pattern, source: rule.source })}
                        className="inline-flex items-center text-[var(--text-dim)] hover:text-[var(--red)] text-[11px] px-1.5 py-0.5 cursor-pointer bg-transparent border-none rounded transition-colors"
                        aria-label={`Delete rule for ${rule.tool}`}
                      >
                        <IconTrash size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Permission Rule"
          message={`Are you sure you want to delete the rule for "${confirmDelete.tool}"?`}
          confirmLabel="Delete"
          onConfirm={async () => { await handleDelete(confirmDelete.tool, confirmDelete.pattern, confirmDelete.source); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

export default PermissionsTab
