import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../store'

const TOOLS = [
  'bash', 'file_read', 'file_write', 'file_edit', 'file_list',
  'grep', 'glob', 'task_create', 'task_update', 'task_list', 'spawn_agent',
] as const

function AddRuleModal({
  onClose,
  onAdd,
}: {
  onClose: () => void
  onAdd: (tool: string, pattern: string, decision: string, source: string) => Promise<void>
}) {
  const [tool, setTool] = useState('bash')
  const [pattern, setPattern] = useState('')
  const [decision, setDecision] = useState<'allow' | 'deny'>('allow')
  const [source, setSource] = useState<'global' | 'project'>('project')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<Element | null>(null)
  const patternRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    triggerRef.current = document.activeElement
    patternRef.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
      ;(triggerRef.current as HTMLElement)?.focus()
    }
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !loading) { onClose(); return }
    if (e.key === 'Tab') {
      const cancel = cancelRef.current
      const add = addRef.current
      if (e.shiftKey) {
        if (document.activeElement === cancel) { e.preventDefault(); add?.focus() }
      } else {
        if (document.activeElement === add) { e.preventDefault(); cancel?.focus() }
      }
    }
  }, [loading, onClose])

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

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={loading ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-rule-title"
        className="bg-[var(--bg-elevated)] rounded-[var(--radius-lg)] w-[420px] p-5"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 id="add-rule-title" className="text-[14px] font-semibold text-[var(--text-primary)] m-0 mb-4">
          Add Permission Rule
        </h2>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">
              Tool
            </label>
            <select
              value={tool}
              onChange={(e) => setTool(e.target.value)}
              className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            >
              {TOOLS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">
              Pattern
            </label>
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
            <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">
              Decision
            </label>
            <select
              value={decision}
              onChange={(e) => setDecision(e.target.value as 'allow' | 'deny')}
              className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="allow">allow</option>
              <option value="deny">deny</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">
              Source
            </label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as 'global' | 'project')}
              className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="project">project</option>
              <option value="global">global</option>
            </select>
          </div>
        </div>
        {error && (
          <p className="text-[11px] text-[var(--red)] m-0 mb-3">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onClose}
            disabled={loading}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] px-3 py-1.5 text-[13px] rounded-[2px] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            ref={addRef}
            onClick={handleAdd}
            disabled={loading}
            className="bg-[var(--accent)] text-white px-3 py-1.5 text-[13px] rounded-[2px] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>
    </div>,
    document.body
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