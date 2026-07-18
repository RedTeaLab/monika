import { useState, useEffect } from 'react'
import { useStore, AgentInfo } from '../../store'
import { Button, IconButton, Input, Textarea, Combobox, AlertDialog } from '../ui'
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal'
import { IconBot, IconEdit, IconTrash, IconPlus, IconShield, IconClose } from '../Icons'
import { SettingsTabHeader, SettingsCardList, SettingsCard, SettingsEmptyState } from './shared'

// ── AgentsTab ──────────────────────────────────────────────────────────

const badgeColors: Record<string, string> = {
  builtin: 'text-[var(--accent)] bg-[var(--accent-muted)]',
  custom: 'text-[var(--green)] bg-[var(--green)]/10',
}

const labelCls = 'block text-[11px] font-medium text-[var(--text-secondary)] mb-1.5'

const decisionColors: Record<string, string> = {
  allow: 'text-[var(--green)] bg-[var(--green)]/10',
  ask: 'text-[var(--yellow)] bg-[var(--yellow)]/10',
  deny: 'text-[var(--red)] bg-[var(--red)]/10',
}

function AgentsTab() {
  const agents = useStore((s) => s.agents)
  const loadAgents = useStore((s) => s.loadAgents)
  const saveAgent = useStore((s) => s.saveAgent)
  const deleteAgent = useStore((s) => s.deleteAgent)
  const availableProviders = useStore((s) => s.availableProviders)
  const modelsByProvider = useStore((s) => s.modelsByProvider)
  const loadModelsForProvider = useStore((s) => s.loadModelsForProvider)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AgentInfo | null>(null)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [model, setModel] = useState('')
  const [temperature, setTemperature] = useState<number | undefined>(undefined)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [permission, setPermission] = useState<Record<string, string>>({})
  const [newRuleTool, setNewRuleTool] = useState('')
  const [newRuleDecision, setNewRuleDecision] = useState<'allow' | 'ask' | 'deny'>('ask')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  useEffect(() => { loadAgents() }, [])
  useEffect(() => {
    if (!modalOpen) return
    for (const p of availableProviders) {
      if (!modelsByProvider[p.id]) loadModelsForProvider(p.id)
    }
  }, [modalOpen, availableProviders, modelsByProvider, loadModelsForProvider])

  const openAdd = () => {
    setEditing(null)
    setName('')
    setDescription('')
    setModel('')
    setTemperature(0)
    setSystemPrompt('')
    setPermission({})
    setNewRuleTool('')
    setNewRuleDecision('ask')
    setModalOpen(true)
  }

  const openEdit = (agent: AgentInfo) => {
    setEditing(agent)
    setName(agent.name)
    setDescription(agent.description)
    setModel(agent.model)
    setTemperature(agent.temperature)
    setSystemPrompt(agent.systemPrompt)
    setPermission({...agent.permission})
    setNewRuleTool('')
    setNewRuleDecision('ask')
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await saveAgent({
        name: name.trim(),
        description: description.trim(),
        model: model.trim(),
        provider: editing ? editing.provider : '',
        temperature,
        systemPrompt,
        hidden: editing ? editing.hidden : false,
        disabled: editing ? editing.disabled : false,
        isCustom: editing ? editing.isCustom : true,
        source: editing ? editing.source : 'custom',
        permission,
      })
      setModalOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (agentName: string) => {
    setDeleteError(''); setDeleteLoading(true)
    try {
      await deleteAgent(agentName)
      setConfirmDelete(null)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete agent')
    } finally {
      setDeleteLoading(false)
    }
  }

  const addRule = () => {
    if (!newRuleTool.trim()) return
    setPermission((prev) => ({ ...prev, [newRuleTool.trim()]: newRuleDecision }))
    setNewRuleTool('')
    setNewRuleDecision('ask')
  }

  const removeRule = (tool: string) => {
    const next = { ...permission }
    delete next[tool]
    setPermission(next)
  }

  return (
    <div>
      <SettingsTabHeader
        title="Agents"
        description="Manage built-in and custom agents"
        actions={
          <Button variant="outline" size="sm" onClick={openAdd}>
            <IconPlus size={12} />
            Add
          </Button>
        }
      />

      {agents.filter(a => !a.disabled).length === 0 ? (
        <SettingsEmptyState
          icon={<IconBot size={32} />}
          title="No agents configured."
          description='Click "Add" to create a new one.'
        />
      ) : (
        <SettingsCardList>
          {agents.filter(a => !a.disabled).map((agent) => (
            <SettingsCard
              key={agent.name}
              hoverActions={agent.source === 'custom' ? (
                <>
                  <IconButton label={`Edit ${agent.name}`} size="sm" variant="ghost" onClick={() => openEdit(agent)}><IconEdit size={13} /></IconButton>
                  <IconButton label={`Delete ${agent.name}`} size="sm" variant="ghost" onClick={() => setConfirmDelete(agent.name)} className="hover:text-[var(--red)]"><IconTrash size={13} /></IconButton>
                </>
              ) : undefined}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0" style={{ color: 'var(--text-dim)' }}>
                  <IconBot size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[14px] font-semibold text-[var(--text-primary)]">{agent.name}</span>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${badgeColors[agent.source] || badgeColors.custom}`}>
                      {agent.source}
                    </span>
                  </div>
                  {agent.description && (
                    <p className="text-[11px] text-[var(--text-secondary)] m-0 mb-1 leading-snug">{agent.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-dim)]">
                    <span className="font-mono">
                      {agent.model || <span className="italic">inherit</span>}
                    </span>
                    {agent.temperature !== undefined && agent.temperature !== null && (
                      <span>Temp: {agent.temperature}</span>
                    )}
                    {agent.systemPrompt && (
                      <span className="truncate max-w-[300px]">Prompt: {agent.systemPrompt.slice(0, 60)}{agent.systemPrompt.length > 60 ? '...' : ''}</span>
                    )}
                  </div>
                </div>
              </div>
            </SettingsCard>
          ))}
        </SettingsCardList>
      )}

      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)} loading={saving} width={540}>
          <ModalHeader icon={<IconBot size={15} />}>
            <h4 className="text-[14px] font-semibold m-0">
              {editing ? 'Edit Agent' : 'Create Agent'}
            </h4>
          </ModalHeader>

          <ModalBody>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Name</label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={editing !== null}
                  placeholder="my-agent"
                />
              </div>

              <div>
                <label className={labelCls}>Description</label>
                <Input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this agent does"
                />
              </div>

              <div>
                <label className={labelCls}>Model</label>
                <Combobox
                  value={model || null}
                  options={[
                    { value: '', label: 'Inherit (use default)' },
                    ...availableProviders.flatMap(p =>
                      (modelsByProvider[p.id] || []).map(m => ({
                        value: `${p.id}/${m.ID}`,
                        label: m.DisplayName,
                        description: p.display_name,
                      }))
                    ),
                  ]}
                  onChange={(v) => setModel(v)}
                  placeholder="Inherit (use default)"
                  searchable={true}
                  searchPlaceholder="Search models..."
                />
              </div>

              <div>
                <label className={labelCls}>Temperature</label>
                <Input
                  type="number"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
                  min={0}
                  max={2}
                  step={0.1}
                  className="w-[100px]"
                />
              </div>

              <div>
                <label className={labelCls}>System Prompt</label>
                <Textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={5}
                  className="font-mono"
                  placeholder="Custom system prompt (empty to use default)"
                />
              </div>

              <div className="border-t border-[var(--border)] pt-4">
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-2.5">
                  <span className="inline-flex items-center gap-1.5"><IconShield size={11} /> Permission Rules</span>
                </label>
                {Object.keys(permission).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {Object.entries(permission).map(([tool, decision]) => (
                      <span
                        key={tool}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border border-[var(--border)]"
                        style={{ background: 'var(--bg-card)' }}
                      >
                        <span className="font-mono text-[var(--text-primary)]">{tool}</span>
                        <span className={`px-1 py-px rounded text-[10px] font-medium ${decisionColors[decision] || ''}`}>{decision}</span>
                        <IconButton
                          label={`Remove rule for ${tool}`}
                          size="sm"
                          variant="ghost"
                          onClick={() => removeRule(tool)}
                          className="ml-0.5 hover:text-[var(--red)]"
                        >
                          <IconClose size={12} />
                        </IconButton>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  <Input
                    type="text"
                    value={newRuleTool}
                    onChange={(e) => setNewRuleTool(e.target.value)}
                    className="flex-[2]"
                    placeholder="tool name (e.g. bash)"
                    inputSize="sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newRuleTool.trim()) addRule()
                    }}
                  />
                  <Combobox
                    value={newRuleDecision}
                    options={[
                      { value: 'allow', label: 'Allow', description: 'Grant without asking' },
                      { value: 'ask', label: 'Ask', description: 'Prompt user each time' },
                      { value: 'deny', label: 'Deny', description: 'Block outright' },
                    ]}
                    onChange={(v) => setNewRuleDecision(v as 'allow' | 'ask' | 'deny')}
                    searchable={false}
                    className="!w-auto min-w-[72px] [&>button]:!text-[11px] [&>button]:!h-7 [&>button]:!py-0.5 [&>button]:!px-2"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addRule}
                    disabled={!newRuleTool.trim()}
                  >
                    <IconPlus size={10} />
                  </Button>
                </div>
              </div>
            </div>
          </ModalBody>

          <ModalFooter>
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? 'Saving...' : 'Save Agent'}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      <AlertDialog
        open={!!confirmDelete}
        title="Delete Agent"
        description={`Are you sure you want to delete "${confirmDelete}"? This action cannot be undone.`}
        confirmLabel="Delete"
        icon={<IconTrash size={15} />}
        loading={deleteLoading}
        error={deleteError}
        onConfirm={() => { if (confirmDelete) handleDelete(confirmDelete) }}
        onCancel={() => { setConfirmDelete(null); setDeleteError('') }}
      />
    </div>
  )
}

export default AgentsTab
