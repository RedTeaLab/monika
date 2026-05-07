import { useState, useEffect, useCallback } from 'react'

interface ModelEntry {
  id: string
  name: string
  contextLimit: number
}

interface ProviderFull {
  id: string
  name: string
  baseURL: string
  apiKey: string
  models: ModelEntry[]
}

function emptyProvider(): ProviderFull {
  return { id: '', name: '', baseURL: '', apiKey: '', models: [] }
}

function emptyModel(): ModelEntry {
  return { id: '', name: '', contextLimit: 0 }
}

export default function ModelsTab() {
  const [providers, setProviders] = useState<ProviderFull[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProviderFull>(emptyProvider())
  const [modelForm, setModelForm] = useState<ModelEntry>(emptyModel())

  useEffect(() => {
    try {
      const saved = localStorage.getItem('monika-model-providers')
      if (saved) setProviders(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [])

  const persistProviders = useCallback((p: ProviderFull[]) => {
    setProviders(p)
    localStorage.setItem('monika-model-providers', JSON.stringify(p))
  }, [])

  const openAdd = useCallback(() => {
    setForm(emptyProvider())
    setModelForm(emptyModel())
    setEditingId(null)
    setShowModal(true)
  }, [])

  const openEdit = useCallback((p: ProviderFull) => {
    setForm({ ...p, models: p.models.map((m) => ({ ...m })) })
    setModelForm(emptyModel())
    setEditingId(p.id)
    setShowModal(true)
  }, [])

  const addModelEntry = useCallback(() => {
    const m = modelForm
    if (!m.id.trim() || !m.name.trim()) return
    setForm({ ...form, models: [...form.models, { ...m, id: m.id.trim(), name: m.name.trim() }] })
    setModelForm(emptyModel())
  }, [modelForm, form])

  const removeModelEntry = useCallback((idx: number) => {
    setForm({ ...form, models: form.models.filter((_, i) => i !== idx) })
  }, [form])

  const handleSave = useCallback(() => {
    const trimmed = {
      ...form,
      id: form.id.trim(),
      name: form.name.trim(),
      baseURL: form.baseURL.trim(),
      apiKey: form.apiKey.trim(),
    }
    if (!trimmed.id || !trimmed.name) return
    if (editingId !== null) {
      persistProviders(providers.map((p) => (p.id === editingId ? trimmed : p)))
    } else {
      if (providers.some((p) => p.id === trimmed.id)) return
      persistProviders([...providers, trimmed])
    }
    setShowModal(false)
    setForm(emptyProvider())
    setModelForm(emptyModel())
    setEditingId(null)
  }, [form, editingId, providers, persistProviders])

  const handleDelete = useCallback((id: string) => {
    persistProviders(providers.filter((p) => p.id !== id))
  }, [providers, persistProviders])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowModal(false)
      setForm(emptyProvider())
      setModelForm(emptyModel())
      setEditingId(null)
    }
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold m-0 mb-1">Models</h3>
          <p className="text-[11px] text-[var(--text-dim)] m-0">Manage model providers</p>
        </div>
        <button
          className="px-3 py-1.5 text-[11px] font-medium rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
          onClick={openAdd}
        >
          + Add Provider
        </button>
      </div>

      {providers.length > 0 ? (
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="text-left text-[var(--text-dim)] border-b border-[var(--border)]">
              <th className="py-2 pr-4 font-medium">Provider</th>
              <th className="py-2 pr-4 font-medium">Base URL</th>
              <th className="py-2 pr-4 font-medium">Models</th>
              <th className="py-2 pr-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-elevated)]">
                <td className="py-2 pr-4 text-[var(--text-primary)]">{p.name}</td>
                <td className="py-2 pr-4 text-[var(--text-dim)] font-mono text-[11px]">{p.baseURL}</td>
                <td className="py-2 pr-4 text-[var(--text-dim)] text-[11px]">
                  {p.models.map((m) => m.name).join(', ') || '—'}
                </td>
                <td className="py-2 pr-4">
                  <div className="flex gap-2">
                    <button
                      className="text-[var(--text-dim)] hover:text-[var(--text-primary)] bg-transparent border-none cursor-pointer text-[11px] p-0"
                      onClick={() => openEdit(p)}
                    >
                      Edit
                    </button>
                    <button
                      className="text-[var(--text-dim)] hover:text-red-400 bg-transparent border-none cursor-pointer text-[11px] p-0"
                      onClick={() => handleDelete(p.id)}
                    >
                      Del
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="flex flex-col items-center justify-center h-48 text-[var(--text-dim)]">
          <span className="text-[13px]">No model providers configured.</span>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => { setShowModal(false); setForm(emptyProvider()); setModelForm(emptyModel()); setEditingId(null) }}
        >
          <div
            role="dialog"
            aria-modal
            className="bg-[var(--bg-elevated)] rounded-[var(--radius-lg)] w-[460px] p-5 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            <h4 className="text-[14px] font-semibold m-0 mb-4">
              {editingId !== null ? 'Edit Provider' : 'Add Provider'}
            </h4>

            <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">ID</label>
            <input
              className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] mb-3"
              placeholder="openai"
              value={form.id}
              onChange={(e) => setForm({ ...form, id: e.target.value })}
              onKeyDown={handleKeyDown}
              autoFocus
              disabled={editingId !== null}
            />

            <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Name</label>
            <input
              className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] mb-3"
              placeholder="OpenAI"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onKeyDown={handleKeyDown}
            />

            <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Base URL</label>
            <input
              className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] mb-3"
              placeholder="https://api.openai.com/v1"
              value={form.baseURL}
              onChange={(e) => setForm({ ...form, baseURL: e.target.value })}
              onKeyDown={handleKeyDown}
            />

            <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">API Key</label>
            <input
              type="password"
              className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] mb-4"
              placeholder="sk-..."
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              onKeyDown={handleKeyDown}
            />

            {/* Models sub-list */}
            <div className="border-t border-[var(--border)] pt-4 mt-2 mb-4">
              <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-2">Models</label>

              {form.models.length > 0 && (
                <div className="mb-3 space-y-1">
                  {form.models.map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-[var(--bg-card)] border border-[var(--border)]">
                      <span className="text-[var(--text-primary)]">
                        <span className="font-mono text-[var(--text-dim)]">{m.id}</span>
                        <span className="mx-1.5 text-[var(--text-dim)]">—</span>
                        {m.name}
                        <span className="text-[var(--text-dim)] ml-1">({m.contextLimit > 0 ? m.contextLimit.toLocaleString() : '—'} ctx)</span>
                      </span>
                      <button
                        className="text-[var(--text-dim)] hover:text-red-400 bg-transparent border-none cursor-pointer text-[13px] p-0 leading-none"
                        onClick={() => removeModelEntry(i)}
                        title="Remove model"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Model ID</label>
                  <input
                    className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]"
                    placeholder="gpt-4"
                    value={modelForm.id}
                    onChange={(e) => setModelForm({ ...modelForm, id: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') addModelEntry() }}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Display Name</label>
                  <input
                    className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]"
                    placeholder="GPT-4"
                    value={modelForm.name}
                    onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') addModelEntry() }}
                  />
                </div>
                <div style={{ width: 80 }}>
                  <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Context</label>
                  <input
                    type="number"
                    className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]"
                    placeholder="8192"
                    value={modelForm.contextLimit || ''}
                    onChange={(e) => setModelForm({ ...modelForm, contextLimit: parseInt(e.target.value) || 0 })}
                    onKeyDown={(e) => { if (e.key === 'Enter') addModelEntry() }}
                  />
                </div>
                <button
                  className="px-3 py-1.5 text-[11px] font-medium rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors whitespace-nowrap"
                  onClick={addModelEntry}
                  disabled={!modelForm.id.trim() || !modelForm.name.trim()}
                >
                  + Add
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <button
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] px-3 py-1.5 text-[13px] rounded-[2px] transition-colors disabled:opacity-50"
                onClick={() => { setShowModal(false); setForm(emptyProvider()); setModelForm(emptyModel()); setEditingId(null) }}
              >
                Cancel
              </button>
              <button
                className="bg-[var(--accent)] text-white px-3 py-1.5 text-[13px] rounded-[2px] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleSave}
                disabled={!form.id.trim() || !form.name.trim()}
              >
                {editingId !== null ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
