import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../../store'

interface ModelEntry {
  id: string
  name: string
  contextLimit: number
}

function emptyModel(): ModelEntry {
  return { id: '', name: '', contextLimit: 0 }
}

export default function ModelsTab() {
  const providers = useStore((s) => s.providerDetails)
  const loadProviders = useStore((s) => s.loadProviderDetails)
  const saveProvider = useStore((s) => s.saveProviderDetail)
  const deleteProvider = useStore((s) => s.deleteProviderDetail)

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [provId, setProvId] = useState('')
  const [name, setName] = useState('')
  const [baseURL, setBaseURL] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [models, setModels] = useState<ModelEntry[]>([])
  const [modelForm, setModelForm] = useState<ModelEntry>(emptyModel())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadProviders() }, [loadProviders])

  const openAdd = () => {
    setEditingId(null); setProvId(''); setName(''); setBaseURL(''); setApiKey('')
    setModels([]); setModelForm(emptyModel()); setError('')
    setShowModal(true)
  }

  const openEdit = (p: typeof providers[0]) => {
    setEditingId(p.id); setProvId(p.id); setName(p.name); setBaseURL(p.baseURL)
    setApiKey(p.apiKey)
    setModels((p.models || []).map(m => ({ id: m.id, name: m.name, contextLimit: m.contextLimit || 0 })))
    setModelForm(emptyModel()); setError('')
    setShowModal(true)
  }

  const addModelEntry = () => {
    if (!modelForm.id.trim() || !modelForm.name.trim()) return
    setModels([...models, { ...modelForm, id: modelForm.id.trim(), name: modelForm.name.trim() }])
    setModelForm(emptyModel())
  }

  const removeModelEntry = (idx: number) => {
    setModels(models.filter((_, i) => i !== idx))
  }

  const handleSave = useCallback(async () => {
    if (!provId.trim() || !name.trim()) { setError('ID and Name are required'); return }
    setLoading(true); setError('')
    try {
      await saveProvider({
        id: provId.trim(), name: name.trim(), baseURL: baseURL.trim(),
        apiKey: apiKey.trim(), models
      } as any)
      setShowModal(false)
    } catch { setError('Failed to save provider') }
    finally { setLoading(false) }
  }, [provId, name, baseURL, apiKey, models, saveProvider])

  const handleDelete = useCallback(async (id: string) => {
    await deleteProvider(id)
  }, [deleteProvider])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !loading) { setShowModal(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold m-0 mb-1">Models</h3>
          <p className="text-[11px] text-[var(--text-dim)] m-0">Manage model providers</p>
        </div>
        <button onClick={openAdd} className="px-3 py-1.5 text-[11px] font-medium rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors">+ Add Provider</button>
      </div>

      {providers.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-[var(--text-dim)]">
          <span className="text-[13px]">No model providers configured.</span>
        </div>
      ) : (
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="text-left text-[var(--text-dim)] border-b border-[var(--border)]">
              <th className="py-2 pr-4 font-medium">Provider</th>
              <th className="py-2 pr-4 font-medium">Base URL</th>
              <th className="py-2 pr-4 font-medium">Models</th>
              <th className="py-2 font-medium w-[100px]"></th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-elevated)]">
                <td className="py-2 pr-4 text-[var(--text-primary)]">{p.name}</td>
                <td className="py-2 pr-4 text-[var(--text-dim)] font-mono text-[11px]">{p.baseURL}</td>
                <td className="py-2 pr-4 text-[var(--text-dim)] text-[11px]">{(p.models || []).map(m => m.name).join(', ') || '—'}</td>
                <td className="py-2">
                  <button onClick={() => openEdit(p)} className="text-[var(--text-dim)] hover:text-[var(--text-primary)] text-[11px] px-1">Edit</button>
                  <button onClick={() => handleDelete(p.id)} className="text-[var(--text-dim)] hover:text-red-400 text-[11px] px-1">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={loading ? undefined : () => setShowModal(false)}>
          <div role="dialog" aria-modal className="bg-[var(--bg-elevated)] rounded-[var(--radius-lg)] w-[460px] p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
            <h4 className="text-[14px] font-semibold m-0 mb-4">{editingId ? 'Edit Provider' : 'Add Provider'}</h4>
            <div className="space-y-3">
              <div><label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">ID</label>
                <input className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" value={provId} onChange={e => setProvId(e.target.value)} disabled={!!editingId} /></div>
              <div><label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Name</label>
                <input className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" value={name} onChange={e => setName(e.target.value)} /></div>
              <div><label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Base URL</label>
                <input className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" value={baseURL} onChange={e => setBaseURL(e.target.value)} /></div>
              <div><label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">API Key</label>
                <input type="password" className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" value={apiKey} onChange={e => setApiKey(e.target.value)} /></div>
            </div>
            <div className="border-t border-[var(--border)] pt-4 mt-4 mb-4">
              <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-2">Models</label>
              {models.length > 0 && (
                <div className="mb-3 space-y-1">
                  {models.map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-[var(--bg-card)] border border-[var(--border)]">
                      <span className="text-[var(--text-primary)]"><span className="font-mono text-[var(--text-dim)]">{m.id}</span><span className="mx-1.5 text-[var(--text-dim)]">—</span>{m.name}<span className="text-[var(--text-dim)] ml-1">({m.contextLimit > 0 ? m.contextLimit.toLocaleString() : '—'} ctx)</span></span>
                      <button onClick={() => removeModelEntry(i)} className="text-[var(--text-dim)] hover:text-red-400 bg-transparent border-none cursor-pointer text-[13px] p-0 leading-none">✕</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 items-end">
                <div className="flex-1"><label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Model ID</label><input className="w-full px-2 py-1 text-[11px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" value={modelForm.id} onChange={e => setModelForm({ ...modelForm, id: e.target.value })} /></div>
                <div className="flex-1"><label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Name</label><input className="w-full px-2 py-1 text-[11px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" value={modelForm.name} onChange={e => setModelForm({ ...modelForm, name: e.target.value })} /></div>
                <div style={{ width: 80 }}><label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Context</label><input type="number" className="w-full px-2 py-1 text-[11px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" value={modelForm.contextLimit || ''} onChange={e => setModelForm({ ...modelForm, contextLimit: parseInt(e.target.value) || 0 })} /></div>
                <button onClick={addModelEntry} disabled={!modelForm.id.trim() || !modelForm.name.trim()} className="px-2 py-1 text-[11px] font-medium rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors whitespace-nowrap">+ Add</button>
              </div>
            </div>
            {error && <p className="text-[11px] text-[var(--red)] m-0 mt-3">{error}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowModal(false)} disabled={loading} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-1.5 text-[13px] rounded-[2px] transition-colors disabled:opacity-50">Cancel</button>
              <button onClick={handleSave} disabled={loading || !provId.trim() || !name.trim()} className="bg-[var(--accent)] text-white px-3 py-1.5 text-[13px] rounded-[2px] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">{loading ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
