import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../../store'
import { Call } from '@wailsio/runtime'
import Modal, { ModalHeader, ModalBody, ModalFooter, ModalButton } from '../ui/Modal'
import { IconDatabase, IconEdit } from '../Icons'

function maskKey(key: string): string {
  if (!key) return '\u2014'
  if (key.length <= 8) return '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'
  return key.slice(0, 4) + '\u2022\u2022\u2022\u2022' + key.slice(-4)
}

function formatContext(limit: number): string {
  if (limit <= 0) return ''
  if (limit >= 1000000) return `${(limit / 1000000).toFixed(0)}M`
  if (limit >= 1000) return `${(limit / 1000).toFixed(0)}K`
  return `${limit}`
}

export default function ModelsTab() {
  const providers = useStore((s) => s.providerDetails)
  const loadProviders = useStore((s) => s.loadProviderDetails)
  const saveProvider = useStore((s) => s.saveProviderDetail)
  const selectedProvider = useStore((s) => s.selectedProvider)
  const selectedModel = useStore((s) => s.selectedModel)
  const setSelectedProvider = useStore((s) => s.setSelectedProvider)
  const setSelectedModel = useStore((s) => s.setSelectedModel)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [provId, setProvId] = useState('')
  const [name, setName] = useState('')
  const [baseURL, setBaseURL] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [wireAPI, setWireAPI] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => { loadProviders() }, [loadProviders])

  const openEdit = (p: typeof providers[0]) => {
    setEditingId(p.id)
    setProvId(p.id)
    setName(p.display_name)
    setBaseURL(p.base_url)
    setApiKey(p.api_key)
    setWireAPI(p.wire_api || '')
    setError('')
    setSaved(false)
    setEditingId(p.id)
  }

  const closeModal = () => {
    setEditingId(null)
  }

  const handleSave = useCallback(async () => {
    if (!provId.trim() || !name.trim()) { setError('ID and Name are required'); return }
    setLoading(true); setError('')
    try {
      await saveProvider({
        id: provId.trim(), display_name: name.trim(), name: name.trim(), base_url: baseURL.trim(),
        api_key: apiKey.trim(), wire_api: wireAPI.trim(),
        models: (providers.find((p) => p.id === editingId)?.models || []).map(m => ({
          id: m.id, name: m.name, context_limit: m.context_limit || 0, output_limit: m.output_limit || 0, enabled: m.enabled ?? false,
        })),
      })
      setSaved(true)
    } catch { setError('Failed to save provider') }
    finally { setLoading(false) }
  }, [provId, name, baseURL, apiKey, wireAPI, providers, editingId, saveProvider])

  const setDefaultModel = useCallback(async (providerId: string, modelId: string) => {
    setSelectedProvider(providerId)
    setSelectedModel(modelId)
    try { await Call.ByName('monika/internal/api.App.SetDefaultModel', providerId, modelId) } catch { /* best effort */ }
  }, [setSelectedProvider, setSelectedModel])

  const toggleModelEnabled = useCallback(async (providerId: string, modelId: string, enabled: boolean) => {
    const p = providers.find((x) => x.id === providerId)
    if (!p) return
    const newModels = p.models.map(m => m.id === modelId ? { ...m, enabled } : m)
    try {
      await saveProvider({
        id: p.id, display_name: p.display_name, name: p.display_name, base_url: p.base_url,
        api_key: p.api_key, wire_api: p.wire_api || '',
        models: newModels,
      })
    } catch { /* best effort */ }
  }, [providers, saveProvider])

  const inputCls = 'w-full px-3 py-2 text-[12px] rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--border-strong)] form-input-glow transition-colors duration-150'
  const labelCls = 'block text-[11px] font-medium text-[var(--text-secondary)] mb-1.5'

  // Only show providers that have models (populated from models.dev).
  const visibleProviders = providers.filter((p) => (p.models || []).length > 0)

  // Sort: user-configured first (has api_key), then alphabetically.
  const sortedProviders = [...visibleProviders].sort((a, b) => {
    const aKey = a.api_key ? 0 : 1
    const bKey = b.api_key ? 0 : 1
    if (aKey !== bKey) return aKey - bKey
    return a.id.localeCompare(b.id)
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold m-0 mb-1">Providers</h3>
          <p className="text-[11px] text-[var(--text-dim)] m-0">Models synced from models.dev. Edit providers to add API keys.</p>
        </div>
      </div>

      {sortedProviders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-dim)]">
          <IconDatabase size={32} />
          <span className="text-[13px] mt-3">No models loaded.</span>
          <span className="text-[11px] mt-1">Ensure models.dev is accessible and restart Monika.</span>
        </div>
      ) : (
        <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto">
          {sortedProviders.map((p) => {
            const enabledModels = (p.models || []).filter((m) => m.enabled)
            const totalModels = (p.models || []).length
            return (
              <div
                key={p.id}
                className="rounded-lg px-4 py-3 w-full relative group/card"
                style={{ background: 'var(--bg-card)' }}
              >
                <div className="flex items-start gap-3 mb-2">
                  <div className="mt-0.5 shrink-0" style={{ color: 'var(--text-dim)' }}>
                    <IconDatabase size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold text-[var(--text-primary)]">{p.display_name}</span>
                      {!p.api_key && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}>No API key</span>
                      )}
                      {p.api_key && enabledModels.length > 0 && (
                        <span className="text-[10px] text-[var(--text-dim)]">{enabledModels.length}/{totalModels} enabled</span>
                      )}
                    </div>
                  </div>
                  <div className="opacity-0 group-hover/card:opacity-100 transition-opacity flex gap-1">
                    <button onClick={() => openEdit(p)} className="inline-flex items-center text-[var(--text-dim)] hover:text-[var(--text-primary)] text-[11px] px-1.5 py-0.5 cursor-pointer bg-transparent border-none rounded transition-colors" aria-label={`Edit ${p.display_name}`}><IconEdit size={13} /></button>
                  </div>
                </div>
                {p.api_key && (
                  <div className="flex gap-4 text-[11px] text-[var(--text-dim)] mb-2 ml-7">
                    <span className="font-mono">{p.base_url || '\u2014'}</span>
                    <span>Key: {maskKey(p.api_key)}</span>
                  </div>
                )}
                {(p.models || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 ml-7">
                    {p.models.map(m => {
                      const isDefault = p.id === selectedProvider && m.id === selectedModel
                      return (
                        <div
                          key={m.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors group/chip"
                          style={{
                            background: isDefault ? 'var(--accent-muted)' : 'var(--bg-sidebar)',
                            border: 'none',
                          }}
                        >
                          <label
                            className="flex items-center gap-1 cursor-pointer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={!!m.enabled}
                              onChange={(e) => {
                                toggleModelEnabled(p.id, m.id, e.target.checked)
                              }}
                              className="w-3 h-3 accent-[var(--accent)]"
                            />
                          </label>
                          <button
                            onClick={() => setDefaultModel(p.id, m.id)}
                            className="bg-transparent border-none p-0 cursor-pointer"
                            style={{
                              color: isDefault ? 'var(--accent)' : 'var(--text-primary)',
                            }}
                          >
                            {isDefault && <span className="text-[9px]" style={{ color: 'var(--accent)' }}>&#9733; </span>}
                            {m.name}
                          </button>
                          {(m.context_limit ?? 0) > 0 && (
                            <span className={isDefault ? 'opacity-70' : ''} style={{ color: 'var(--text-dim)', fontSize: 10 }}>
                              {formatContext(m.context_limit ?? 0)}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editingId && (
        <Modal onClose={closeModal} loading={loading} width={500}>
          <ModalHeader icon={<IconDatabase size={15} />}>
            <h4 className="text-[14px] font-semibold m-0">Edit {name || editingId}</h4>
            <p className="text-[11px] text-[var(--text-dim)] m-0 mt-0.5">Models are synced from models.dev. Update your credentials here.</p>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>ID</label>
                <input className={inputCls} value={provId} disabled />
              </div>
              <div>
                <label className={labelCls}>Display Name</label>
                <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My Provider" />
              </div>
              <div>
                <label className={labelCls}>Base URL</label>
                <input className={inputCls} value={baseURL} onChange={e => setBaseURL(e.target.value)} placeholder="https://api.example.com/v1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Engine</label>
                  <select className={inputCls + ' cursor-pointer'} value={wireAPI} onChange={e => setWireAPI(e.target.value)}>
                    <option value="">Auto (match provider ID)</option>
                    <option value="openai">OpenAI Compatible</option>
                    <option value="deepseek">DeepSeek</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>API Key</label>
                  <input type="password" className={inputCls} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Enter your API key" autoFocus />
                </div>
              </div>
            </div>
            {error && <p className="text-[11px] text-[var(--red)] m-0 mt-4">{error}</p>}
            {saved && !error && (
              <p className="text-[11px] m-0 mt-4" style={{ color: 'var(--yellow)' }}>
                Provider saved. Restart Monika to apply changes to the active session.
              </p>
            )}
          </ModalBody>
          <ModalFooter>
            <ModalButton onClick={closeModal} disabled={loading}>Cancel</ModalButton>
            <ModalButton variant="primary" onClick={handleSave} disabled={loading || !provId.trim() || !name.trim()}>
              {loading ? 'Saving...' : 'Save Provider'}
            </ModalButton>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}
