import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useStore, AgentInfo } from '../../store'

function AgentsTab() {
  const agents = useStore((s) => s.agents)
  const loadAgents = useStore((s) => s.loadAgents)
  const saveAgent = useStore((s) => s.saveAgent)
  const deleteAgent = useStore((s) => s.deleteAgent)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AgentInfo | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [model, setModel] = useState('')
  const [temperature, setTemperature] = useState<number | undefined>(undefined)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [permission, setPermission] = useState<Record<string, string>>({})
  const [newRuleTool, setNewRuleTool] = useState('')
  const [newRuleDecision, setNewRuleDecision] = useState<'allow' | 'ask' | 'deny'>('ask')

  useEffect(() => {
    loadAgents()
  }, [])

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

  const badgeColors: Record<string, string> = {
    builtin: 'text-[var(--accent)] bg-[var(--accent-muted)]',
    custom: 'text-[var(--green)] bg-[var(--green)]/10',
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold m-0 mb-1">Agents</h3>
          <p className="text-[11px] text-[var(--text-dim)] m-0">Manage built-in and custom agents</p>
        </div>
        <button
          onClick={openAdd}
          className="px-3 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
        >
          + Add Agent
        </button>
      </div>

      {/* Empty state */}
      {agents.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-[var(--text-dim)]">
          <span className="text-[24px] mb-2">🤖</span>
          <span className="text-[13px]">No agents. Click "+ Add Agent" to create one</span>
        </div>
      )}

      {/* Table */}
      {agents.length > 0 && (
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr>
              <th className="text-left text-[var(--text-dim)] border-b border-[var(--border)] px-2 py-1.5 font-normal w-[120px]">
                Name
              </th>
              <th className="text-left text-[var(--text-dim)] border-b border-[var(--border)] px-2 py-1.5 font-normal">
                Description
              </th>
              <th className="text-left text-[var(--text-dim)] border-b border-[var(--border)] px-2 py-1.5 font-normal w-[160px]">
                Model
              </th>
              <th className="text-left text-[var(--text-dim)] border-b border-[var(--border)] px-2 py-1.5 font-normal w-[80px]">
                Source
              </th>
              <th className="text-left text-[var(--text-dim)] border-b border-[var(--border)] px-2 py-1.5 font-normal w-[80px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.name} className="border-b border-[var(--border)] hover:bg-[var(--bg-hover)]">
                <td className="px-2 py-1.5 font-mono text-[var(--text-primary)]">
                  {agent.name}
                </td>
                <td className="px-2 py-1.5 text-[var(--text-secondary)] max-w-[300px] truncate">
                  {agent.description}
                </td>
                <td className="px-2 py-1.5 text-[var(--text-dim)]">
                  {agent.model || (
                    <span className="italic text-[var(--text-dim)]">inherit</span>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${badgeColors[agent.source] || badgeColors.custom}`}>
                    {agent.source}
                  </span>
                </td>
                <td className="px-2 py-1.5">
                  {agent.source === 'custom' ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(agent)}
                        className="px-1.5 py-0.5 text-[11px] rounded border border-[var(--border)] bg-transparent text-[var(--text-dim)] cursor-pointer hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(agent.name)}
                        className="px-1.5 py-0.5 text-[11px] rounded border border-transparent bg-transparent text-[var(--text-dim)] cursor-pointer hover:text-[var(--red)] hover:bg-[var(--red)]/10 transition-colors"
                      >
                        Del
                      </button>
                    </div>
                  ) : (
                    <span className="text-[var(--text-dim)] text-[11px]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Add / Edit Modal */}
      {modalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setModalOpen(false)
            }}
          >
            <div className="bg-[var(--bg-elevated)] rounded-[var(--radius-lg)] w-[520px] p-5 max-h-[80vh] overflow-y-auto">
              <h4 className="text-[14px] font-semibold m-0 mb-4">
                {editing ? 'Edit Agent' : 'Add Agent'}
              </h4>

              {/* Name */}
              <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={editing !== null}
                className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] mb-3"
                placeholder="my-agent"
              />

              {/* Description */}
              <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] mb-3"
                placeholder="What this agent does"
              />

              {/* Model */}
              <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">
                Model
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] mb-3"
                placeholder="provider/model or empty to inherit"
              />

              {/* Temperature */}
              <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">
                Temperature
              </label>
              <input
                type="number"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
                min={0}
                max={2}
                step={0.1}
                className="w-[80px] px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] mb-3"
              />

              {/* System Prompt */}
              <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">
                System Prompt
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={6}
                className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] mb-4 font-mono resize-vertical"
                placeholder="Custom system prompt (empty to use default)"
              />

              {/* Permission Rules */}
              <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">
                Permission Rules
              </label>
              {Object.keys(permission).length > 0 && (
                <table className="w-full text-[12px] border-collapse mb-2">
                  <thead>
                    <tr>
                      <th className="text-left text-[var(--text-dim)] border-b border-[var(--border)] px-2 py-1 font-normal">Tool</th>
                      <th className="text-left text-[var(--text-dim)] border-b border-[var(--border)] px-2 py-1 font-normal w-[100px]">Decision</th>
                      <th className="text-left text-[var(--text-dim)] border-b border-[var(--border)] px-2 py-1 font-normal w-[40px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(permission).map(([tool, decision]) => (
                      <tr key={tool} className="border-b border-[var(--border)]">
                        <td className="px-2 py-1 font-mono text-[var(--text-primary)]">{tool}</td>
                        <td className="px-2 py-1">
                          <select
                            value={decision}
                            onChange={(e) => setPermission({ ...permission, [tool]: e.target.value })}
                            className="w-full px-2 py-1 text-[11px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                          >
                            <option value="allow">allow</option>
                            <option value="ask">ask</option>
                            <option value="deny">deny</option>
                          </select>
                        </td>
                        <td className="px-2 py-1 text-center">
                          <button
                            onClick={() => removeRule(tool)}
                            className="bg-transparent border-none cursor-pointer text-[var(--text-dim)] hover:text-[var(--red)] text-[14px] leading-none p-0"
                            aria-label={`Remove rule for ${tool}`}
                          >
                            &#10005;
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Add permission row */}
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
                  className="px-2 py-1 text-[11px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-dim)] cursor-pointer hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  +
                </button>
              </div>

              {/* Footer buttons */}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 text-[12px] rounded border border-[var(--border)] bg-transparent text-[var(--text-dim)] cursor-pointer hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !name.trim()}
                  className="px-3 py-1.5 text-[12px] rounded border border-[var(--accent)] bg-[var(--accent)] text-white cursor-pointer hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

export default AgentsTab
