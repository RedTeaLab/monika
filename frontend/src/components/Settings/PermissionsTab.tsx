import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal'
import { Button, IconButton, Input, Select, AlertDialog } from '../ui'
import { IconShield, IconTrash, IconPlus } from '../Icons'
import {
  SettingsTabHeader,
  SettingsScopeToggle,
  SettingsCardList,
  SettingsCard,
  SettingsEmptyState,
} from './shared'

const TOOLS = [
  'bash', 'file_read', 'file_write', 'file_edit', 'file_list',
  'grep', 'glob', 'task_create', 'task_update', 'task_list', 'spawn_agent',
] as const

const DECISIONS = [
  { value: 'allow', label: 'allow' },
  { value: 'ask', label: 'ask' },
  { value: 'deny', label: 'deny' },
] as const

// Decision badge: text + tinted background via CSS variables (no hardcoded Tailwind colors).
const decisionStyles: Record<string, string> = {
  allow: 'text-[var(--color-success)] bg-[rgba(0,255,136,0.10)]',
  ask: 'text-[var(--color-warning)] bg-[rgba(255,179,71,0.10)]',
  deny: 'text-[var(--color-error)] bg-[rgba(255,71,87,0.10)]',
}

// Source badge: text + tinted background via CSS variables.
const sourceStyles: Record<string, { color: string; bg: string }> = {
  builtin: { color: 'var(--text-dim)', bg: 'rgba(156,163,175,0.1)' },
  global: { color: 'var(--accent)', bg: 'rgba(0,180,255,0.1)' },
  project: { color: 'var(--color-success)', bg: 'rgba(0,255,136,0.1)' },
}

const labelCls = 'block text-[11px] font-medium text-[var(--text-secondary)] mb-1.5'

interface PermissionRule {
  tool: string
  pattern: string
  decision: string
  source: string
  createdAt: string
}

function AddRuleModal({
  scope,
  onClose,
  onAdd,
}: {
  scope: 'project' | 'global'
  onClose: () => void
  onAdd: (tool: string, pattern: string, decision: string, source: string) => Promise<void>
}) {
  const [tool, setTool] = useState('bash')
  const [pattern, setPattern] = useState('')
  const [decision, setDecision] = useState<'allow' | 'ask' | 'deny'>('ask')
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
      await onAdd(tool, pattern, decision, scope)
      onClose()
    } catch {
      setError('Failed to add rule')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal onClose={onClose} loading={loading} width={540}>
      <ModalHeader icon={<IconShield size={15} />}>
        <h2 className="text-[14px] font-semibold m-0">Add Permission Rule</h2>
      </ModalHeader>
      <ModalBody>
        <p className="text-[11px] text-[var(--text-dim)] m-0 mb-4">
          Adding to <span className="font-mono">{scope}</span> scope
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Tool</label>
            <Select value={tool} onChange={(e) => setTool(e.target.value)}>
              {TOOLS.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          <div>
            <label className={labelCls}>Pattern</label>
            <Input
              ref={patternRef}
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              placeholder="* wildcard, empty matches all"
            />
          </div>
          <div>
            <label className={labelCls}>Decision</label>
            <Select value={decision} onChange={(e) => setDecision(e.target.value as 'allow' | 'ask' | 'deny')}>
              {DECISIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </Select>
          </div>
        </div>
        {error && <p className="text-[11px] text-[var(--red)] m-0 mt-4">{error}</p>}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={handleAdd} disabled={loading} loading={loading}>
          {loading ? 'Adding...' : 'Add Rule'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

function PermissionsTab() {
  const projectPath = useStore((s) => s.projectPath)
  const scope = useStore((s) => s.settingsScope)
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

  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const handleDelete = async (tool: string, pattern: string, source: string) => {
    setDeleteLoading(true)
    setDeleteError('')
    try {
      await deletePermissionRule(tool, pattern, source)
      setConfirmDelete(null)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete rule')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleAdd = async (tool: string, pattern: string, decision: string, source: string) => {
    await addPermissionRule(tool, pattern, decision, source)
  }

  return (
    <div>
      <SettingsTabHeader
        title="Permissions"
        description="Manage tool execution permissions and auto rules"
        actions={
          <>
            <SettingsScopeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddModal(true)}
            >
              <IconPlus size={12} />
              Add
            </Button>
          </>
        }
      />

      {showAddModal && (
        <AddRuleModal scope={scope} onClose={() => setShowAddModal(false)} onAdd={handleAdd} />
      )}

      <SettingsCardList>
        {permissionRules.length === 0 ? (
          <SettingsEmptyState
            icon={<IconShield size={32} />}
            title="No permission rules configured."
            description={`No rules in ${scope} scope. Click "Add" to create one.`}
          />
        ) : (
          permissionRules.map((rule: PermissionRule, idx) => {
            const ds = decisionStyles[rule.decision] || ''
            const ss = sourceStyles[rule.source] || sourceStyles['project']
            return (
              <SettingsCard
                key={`${rule.tool}-${rule.pattern}-${rule.source}-${idx}`}
                hoverActions={
                  rule.source !== 'builtin' ? (
                    <IconButton
                      size="sm"
                      label={`Delete rule for ${rule.tool}`}
                      onClick={() => setConfirmDelete({ tool: rule.tool, pattern: rule.pattern, source: rule.source })}
                      className="hover:text-[var(--color-error)]"
                    >
                      <IconTrash size={13} />
                    </IconButton>
                  ) : undefined
                }
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
                </div>
              </SettingsCard>
            )
          })
        )}
      </SettingsCardList>

      <AlertDialog
        open={!!confirmDelete}
        title="Delete Permission Rule"
        description={confirmDelete ? `Are you sure you want to delete the rule for "${confirmDelete.tool}"?` : ''}
        confirmLabel="Delete"
        icon={<IconTrash size={15} />}
        variant="destructive"
        loading={deleteLoading}
        error={deleteError}
        onConfirm={() => { if (confirmDelete) handleDelete(confirmDelete.tool, confirmDelete.pattern, confirmDelete.source) }}
        onCancel={() => { setConfirmDelete(null); setDeleteError('') }}
      />
    </div>
  )
}

export default PermissionsTab
