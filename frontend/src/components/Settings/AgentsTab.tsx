import { useState, useEffect, useRef, useMemo } from 'react'
import { useStore, AgentInfo } from '../../store'
import type { ProviderInfo, ModelInfo } from '../../../bindings/monika'
import { IconBot, IconEdit, IconTrash, IconPlus, IconShield } from '../Icons'
import Modal, { ModalActions, ModalButton } from '../ui/Modal'
import ConfirmModal from '../Chat/ConfirmModal'

// ── Inline model picker ───────────────────────────────────────────────

function InlineModelPicker({
  value,
  onChange,
  providers,
  modelsByProvider,
  onLoadModels,
}: {
  value: string
  onChange: (v: string) => void
  providers: ProviderInfo[]
  modelsByProvider: Record<string, ModelInfo[]>
  onLoadModels: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [focusIdx, setFocusIdx] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    for (const p of providers) {
      if (!modelsByProvider[p.id]) onLoadModels(p.id)
    }
  }, [open, providers, modelsByProvider, onLoadModels])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open) {
      setSearch('')
      setFocusIdx(0)
      setTimeout(() => searchRef.current?.focus(), 0)
    }
  }, [open])

  type FlatItem =
    | { type: 'inherit' }
    | { type: 'provider'; provider: ProviderInfo }
    | { type: 'model'; provider: ProviderInfo; model: ModelInfo }

  const flatItems = useMemo((): FlatItem[] => {
    const items: FlatItem[] = [{ type: 'inherit' }]
    const q = search.toLowerCase()
    for (const p of providers) {
      const models = modelsByProvider[p.id] || []
      const filtered = q
        ? models.filter((m) => m.DisplayName.toLowerCase().includes(q) || m.ID.toLowerCase().includes(q))
        : models
      if (filtered.length === 0) continue
      if (providers.length > 1) items.push({ type: 'provider', provider: p })
      for (const m of filtered) items.push({ type: 'model', provider: p, model: m })
    }
    return items
  }, [providers, modelsByProvider, search])

  useEffect(() => {
    if (focusIdx >= flatItems.length) setFocusIdx(Math.max(0, flatItems.length - 1))
  }, [flatItems.length, focusIdx])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, flatItems.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flatItems[focusIdx]
      if (item?.type === 'inherit') { onChange(''); setOpen(false) }
      else if (item?.type === 'model') { onChange(`${item.provider.id}/${item.model.ID}`); setOpen(false) }
    }
  }

  let displayText = 'Inherit (use default)'
  if (value) {
    const [pid, ...rest] = value.split('/')
    const mid = rest.join('/')
    const p = providers.find((x) => x.id === pid)
    const m = p && (modelsByProvider[p.id] || []).find((x) => x.ID === mid)
    displayText = m ? `${p.display_name} / ${m.DisplayName}` : value
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-2 py-1.5 text-[12px] rounded border cursor-pointer flex items-center justify-between mb-3"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span style={{ color: value ? 'var(--text-primary)' : 'var(--text-dim)' }}>{displayText}</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polyline points="2,3 4,5 6,3" />
        </svg>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '4px',
            width: '100%',
            maxHeight: '260px',
            overflowY: 'auto',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md, 6px)',
            padding: '4px',
            zIndex: 1000,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setFocusIdx(0) }}
            onKeyDown={handleKeyDown}
            placeholder="Search models..."
            className="text-[11px] w-full px-2 py-1 rounded border mb-1 outline-none"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
          />
          {flatItems.length === 0 ? (
            <div className="text-[11px] text-[var(--text-dim)] px-2 py-1">No matches</div>
          ) : (
            flatItems.map((item, idx) => {
              if (item.type === 'inherit') {
                const active = idx === focusIdx
                return (
                  <button
                    key="__inherit"
                    type="button"
                    onClick={() => { onChange(''); setOpen(false) }}
                    onMouseEnter={() => setFocusIdx(idx)}
                    className="text-[11px] w-full text-left px-2 py-1 rounded cursor-pointer flex items-center justify-between"
                    style={{ background: active ? 'var(--bg-hover)' : 'transparent', color: !value ? 'var(--accent)' : 'var(--text-dim)', border: 'none', fontFamily: 'inherit' }}
                  >
                    <span>Inherit (use default)</span>
                    {!value && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="2,6 5,9 10,3" /></svg>
                    )}
                  </button>
                )
              }
              if (item.type === 'provider') {
                return (
                  <div key={`p-${item.provider.id}`} className="text-[10px] font-semibold uppercase tracking-[0.05em] px-2 pt-2 pb-0.5" style={{ color: 'var(--text-dim)' }}>
                    {item.provider.display_name}
                  </div>
                )
              }
              const m = item.model
              const isSelected = value === `${item.provider.id}/${m.ID}`
              const active = idx === focusIdx
              return (
                <button
                  key={`m-${item.provider.id}-${m.ID}`}
                  type="button"
                  onClick={() => { onChange(`${item.provider.id}/${m.ID}`); setOpen(false) }}
                  onMouseEnter={() => setFocusIdx(idx)}
                  className="text-[11px] w-full text-left px-2 py-1 rounded cursor-pointer flex items-center justify-between"
                  style={{
                    background: active ? 'var(--bg-hover)' : isSelected ? 'var(--accent-muted, var(--bg-hover))' : 'transparent',
                    color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                    border: 'none',
                    fontFamily: 'inherit',
                  }}
                >
                  <span>{m.DisplayName}</span>
                  {isSelected && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="2,6 5,9 10,3" /></svg>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ── AgentsTab ──────────────────────────────────────────────────────────

const badgeColors: Record<string, string> = {
  builtin: 'text-[var(--accent)] bg-[var(--accent-muted)]',
  custom: 'text-[var(--green)] bg-[var(--green)]/10',
}

const inputCls = 'w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]'
const labelCls = 'block text-[10px] font-medium text-[var(--text-dim)] mb-1'

const decisionColors: Record<string, string> = {
  allow: 'text-green-400 bg-green-400/10',
  ask: 'text-yellow-400 bg-yellow-400/10',
  deny: 'text-red-400 bg-red-400/10',
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

  useEffect(() => { loadAgents() }, [])

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
    await deleteAgent(agentName)
  }

  const addRule = () => {
    if (!newRuleTool.trim()) return
    setPermission({ ...permission, [newRuleTool.trim()]: newRuleDecision })
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold m-0 mb-1">Agents</h3>
          <p className="text-[11px] text-[var(--text-dim)] m-0">Manage built-in and custom agents</p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
        >
          <IconPlus size={12} />
          Add Agent
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-dim)]">
          <IconBot size={32} />
          <span className="text-[13px] mt-3">No agents configured.</span>
          <span className="text-[11px] mt-1">Click "Add Agent" to create a new one.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <div
              key={agent.name}
              className="rounded-lg px-4 py-3 w-full relative group/card"
              style={{ background: 'var(--bg-card)' }}
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
                {agent.source === 'custom' && (
                  <div className="opacity-0 group-hover/card:opacity-100 transition-opacity flex gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(agent)}
                      className="inline-flex items-center text-[var(--text-dim)] hover:text-[var(--text-primary)] text-[11px] px-1.5 py-0.5 cursor-pointer bg-transparent border-none rounded transition-colors"
                      aria-label={`Edit ${agent.name}`}
                    >
                      <IconEdit size={13} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(agent.name)}
                      className="inline-flex items-center text-[var(--text-dim)] hover:text-[var(--red)] text-[11px] px-1.5 py-0.5 cursor-pointer bg-transparent border-none rounded transition-colors"
                      aria-label={`Delete ${agent.name}`}
                    >
                      <IconTrash size={13} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)} loading={saving} width={520}>
          <h4 className="text-[14px] font-semibold m-0 mb-4">
            {editing ? 'Edit Agent' : 'Add Agent'}
          </h4>

          <label className={labelCls}>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={editing !== null}
            className={inputCls + ' mb-3'}
            placeholder="my-agent"
          />

          <label className={labelCls}>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputCls + ' mb-3'}
            placeholder="What this agent does"
          />

          <label className={labelCls}>Model</label>
          <InlineModelPicker
            value={model}
            onChange={setModel}
            providers={availableProviders}
            modelsByProvider={modelsByProvider}
            onLoadModels={loadModelsForProvider}
          />

          <label className={labelCls}>Temperature</label>
          <input
            type="number"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
            min={0}
            max={2}
            step={0.1}
            className="w-[80px] px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] mb-3"
          />

          <label className={labelCls}>System Prompt</label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={6}
            className={inputCls + ' mb-4 font-mono resize-vertical'}
            placeholder="Custom system prompt (empty to use default)"
          />

          <label className={labelCls}>Permission Rules</label>
          {Object.keys(permission).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {Object.entries(permission).map(([tool, decision]) => (
                <span
                  key={tool}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border border-[var(--border)]"
                  style={{ background: 'var(--bg-card)' }}
                >
                  <IconShield size={10} />
                  <span className="font-mono text-[var(--text-primary)]">{tool}</span>
                  <span className={`px-1 py-px rounded text-[10px] font-medium ${decisionColors[decision] || ''}`}>{decision}</span>
                  <button
                    onClick={() => removeRule(tool)}
                    className="ml-0.5 bg-transparent border-none cursor-pointer text-[var(--text-dim)] hover:text-[var(--red)] text-[12px] leading-none p-0"
                    aria-label={`Remove rule for ${tool}`}
                  >
                    &#10005;
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 mb-4">
            <input
              type="text"
              value={newRuleTool}
              onChange={(e) => setNewRuleTool(e.target.value)}
              className="flex-1 px-2 py-1 text-[11px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              placeholder="tool name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') addRule()
              }}
            />
            <select
              value={newRuleDecision}
              onChange={(e) => setNewRuleDecision(e.target.value as 'allow' | 'ask' | 'deny')}
              className="w-[80px] px-2 py-1 text-[11px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="allow">allow</option>
              <option value="ask">ask</option>
              <option value="deny">deny</option>
            </select>
            <button
              onClick={addRule}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-dim)] cursor-pointer hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <IconPlus size={10} />
            </button>
          </div>

          <ModalActions>
            <ModalButton onClick={() => setModalOpen(false)} disabled={saving}>Cancel</ModalButton>
            <ModalButton variant="primary" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? 'Saving...' : 'Save'}
            </ModalButton>
          </ModalActions>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Agent"
          message={`Are you sure you want to delete "${confirmDelete}"? This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={async () => { await handleDelete(confirmDelete); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

export default AgentsTab
