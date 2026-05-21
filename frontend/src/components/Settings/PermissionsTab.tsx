import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import Modal, { ModalActions, ModalButton } from '../ui/Modal'

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
          <h3 className="text-[14px] font-semibold m-0 mb-1">Permissions</h3>
          <p className="text-[12px] text-[var(--text-dim)] m-0">
            Manage tool execution permissions and auto rules
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 text-[11px] font-medium rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
        >
          + Add Rule
        </button>
      </div>

      {showAddModal && (
        <AddRuleModal onClose={() => setShowAddModal(false)} onAdd={handleAdd} />
      )}

      {permissionRules.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-[var(--text-dim)]">
          <span className="text-[12px]">
            No permission rules yet. Click "+ Add Rule" to create one
          </span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="text-left text-[var(--text-dim)] border-b border-[var(--border)]">
                <th className="py-2 pr-4 font-medium">Tool</th>
                <th className="py-2 pr-4 font-medium">Pattern</th>
                <th className="py-2 pr-4 font-medium">Decision</th>
                <th className="py-2 pr-4 font-medium">Source</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {permissionRules.map((rule, idx) => (
                <tr
                  key={`${rule.tool}-${rule.pattern}-${rule.source}-${idx}`}
                  className="border-b border-[var(--border)] hover:bg-[var(--bg-elevated)]"
                >
                  <td className="py-2 pr-4 font-mono text-[11px]">{rule.tool}</td>
                  <td className="py-2 pr-4 font-mono text-[11px] max-w-[400px] truncate" title={rule.pattern}>
                    {rule.pattern || '—'}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                        rule.decision === 'allow'
                          ? 'bg-green-500/15 text-green-400'
                          : rule.decision === 'ask'
                          ? 'bg-yellow-500/15 text-yellow-400'
                          : 'bg-red-500/15 text-red-400'
                      }`}
                    >
                      {rule.decision}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    {rule.source === 'builtin' && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-gray-500/15 text-gray-400">builtin</span>
                    )}
                    {rule.source === 'global' && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-blue-500/15 text-blue-400">global</span>
                    )}
                    {rule.source === 'project' && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-green-500/15 text-green-400">project</span>
                    )}
                    {rule.source !== 'builtin' && rule.source !== 'global' && rule.source !== 'project' && (
                      <span className="text-[var(--text-dim)] text-[11px]">{rule.source}</span>
                    )}
                  </td>
                  <td className="py-2">
                    {rule.source !== 'builtin' && (
                      <button
                        onClick={() => handleDelete(rule.tool, rule.pattern, rule.source)}
                        className="bg-transparent border-none cursor-pointer text-[var(--text-dim)] hover:text-red-400 text-[11px] px-1"
                        title="Delete rule"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default PermissionsTab