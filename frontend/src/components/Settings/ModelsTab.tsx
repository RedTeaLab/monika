import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../../store'
import { Call } from '@wailsio/runtime'
import Modal, { ModalActions, ModalButton } from '../ui/Modal'

interface ModelEntry {
  id: string
  name: string
  context_limit: number
}

interface ProviderTemplate {
  id: string
  name: string
  description: string
  baseURL: string
  wireAPI: string
  models: ModelEntry[]
}

const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek V4 Pro, V4 Flash',
    baseURL: 'https://api.deepseek.com',
    wireAPI: '',
    models: [
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', context_limit: 128000 },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', context_limit: 128000 },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, GPT-4o Mini',
    baseURL: 'https://api.openai.com/v1',
    wireAPI: '',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', context_limit: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', context_limit: 128000 },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Ultra-fast LLM inference',
    baseURL: 'https://api.groq.com/openai/v1',
    wireAPI: 'openai',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', context_limit: 128000 },
    ],
  },
  {
    id: 'together',
    name: 'Together AI',
    description: 'Open-source model hosting',
    baseURL: 'https://api.together.xyz/v1',
    wireAPI: 'openai',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B', context_limit: 128000 },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    description: 'Mistral Large, Small',
    baseURL: 'https://api.mistral.ai/v1',
    wireAPI: 'openai',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', context_limit: 128000 },
      { id: 'mistral-small-latest', name: 'Mistral Small', context_limit: 128000 },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Multi-model gateway',
    baseURL: 'https://openrouter.ai/api/v1',
    wireAPI: 'openai',
    models: [],
  },
]

function emptyModel(): ModelEntry {
  return { id: '', name: '', context_limit: 0 }
}

function maskKey(key: string): string {
  if (!key) return '—'
  if (key.length <= 8) return '••••••••'
  return key.slice(0, 4) + '••••' + key.slice(-4)
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
  const deleteProvider = useStore((s) => s.deleteProviderDetail)
  const selectedProvider = useStore((s) => s.selectedProvider)
  const selectedModel = useStore((s) => s.selectedModel)
  const setSelectedProvider = useStore((s) => s.setSelectedProvider)
  const setSelectedModel = useStore((s) => s.setSelectedModel)

  const [showModal, setShowModal] = useState(false)
  const [step, setStep] = useState<'select' | 'configure'>('select')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [canGoBack, setCanGoBack] = useState(false)
  const [provId, setProvId] = useState('')
  const [name, setName] = useState('')
  const [baseURL, setBaseURL] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [wireAPI, setWireAPI] = useState('')
  const [models, setModels] = useState<ModelEntry[]>([])
  const [modelForm, setModelForm] = useState<ModelEntry>(emptyModel())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => { loadProviders() }, [loadProviders])

  const configuredIds = new Set(providers.map((p) => p.id))

  const openAdd = () => {
    setEditingId(null)
    setCanGoBack(false)
    setStep('select')
    setError('')
    setSaved(false)
    setShowModal(true)
  }

  const selectTemplate = (t: ProviderTemplate) => {
    const existing = providers.find((p) => p.id === t.id)
    if (existing) {
      setEditingId(existing.id)
      setProvId(existing.id)
      setName(existing.display_name)
      setBaseURL(existing.base_url || t.baseURL)
      setApiKey(existing.api_key)
      setWireAPI(existing.wire_api || t.wireAPI)
      setModels((existing.models || []).map((m) => ({ id: m.id, name: m.name, context_limit: m.context_limit || 0 })))
    } else {
      setEditingId(null)
      setProvId(t.id)
      setName(t.name)
      setBaseURL(t.baseURL)
      setWireAPI(t.wireAPI)
      setModels([...t.models])
      setApiKey('')
    }
    setModelForm(emptyModel())
    setError('')
    setSaved(false)
    setCanGoBack(true)
    setStep('configure')
  }

  const selectCustom = () => {
    setEditingId(null)
    setProvId('')
    setName('')
    setBaseURL('')
    setWireAPI('')
    setModels([])
    setApiKey('')
    setModelForm(emptyModel())
    setError('')
    setSaved(false)
    setCanGoBack(true)
    setStep('configure')
  }

  const openEdit = (p: typeof providers[0]) => {
    setEditingId(p.id)
    setProvId(p.id)
    setName(p.display_name)
    setBaseURL(p.base_url)
    setApiKey(p.api_key)
    setWireAPI(p.wire_api || '')
    setModels((p.models || []).map((m) => ({ id: m.id, name: m.name, context_limit: m.context_limit || 0 })))
    setModelForm(emptyModel())
    setError('')
    setSaved(false)
    setCanGoBack(false)
    setStep('configure')
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
        id: provId.trim(), display_name: name.trim(), name: name.trim(), base_url: baseURL.trim(),
        api_key: apiKey.trim(), wire_api: wireAPI.trim(), models,
      })
      setSaved(true)
    } catch { setError('Failed to save provider') }
    finally { setLoading(false) }
  }, [provId, name, baseURL, apiKey, wireAPI, models, saveProvider])

  const handleDelete = useCallback(async (id: string) => {
    await deleteProvider(id)
  }, [deleteProvider])

  const setDefaultModel = useCallback(async (providerId: string, modelId: string) => {
    setSelectedProvider(providerId)
    setSelectedModel(modelId)
    try { await Call.ByName('monika/internal/api.App.SetDefaultModel', providerId, modelId) } catch { /* best effort */ }
  }, [setSelectedProvider, setSelectedModel])

  const closeModal = () => {
    setShowModal(false)
    setStep('select')
  }

  const backToSelect = () => {
    setStep('select')
    setError('')
    setSaved(false)
  }

  const inputCls = 'w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]'
  const labelCls = 'block text-[10px] font-medium text-[var(--text-dim)] mb-1'

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold m-0 mb-1">Providers</h3>
          <p className="text-[11px] text-[var(--text-dim)] m-0">Manage model providers</p>
        </div>
        <button onClick={openAdd} className="px-3 py-1.5 text-[11px] font-medium rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors">+ Add Provider</button>
      </div>

      {providers.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-[var(--text-dim)]">
          <span className="text-[13px]">No model providers configured.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((p) => (
            <div
              key={p.id}
              className="rounded-lg px-4 py-3 w-full relative group/card"
              style={{ background: 'var(--bg-card)' }}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="text-[14px] font-semibold text-[var(--text-primary)]">{p.display_name}</span>
                  <span className="text-[11px] text-[var(--text-dim)] font-mono ml-2">{p.id}</span>
                </div>
                <div className="opacity-0 group-hover/card:opacity-100 transition-opacity flex gap-1">
                  <button onClick={() => openEdit(p)} className="text-[var(--text-dim)] hover:text-[var(--text-primary)] text-[11px] px-1 cursor-pointer bg-transparent border-none">Edit</button>
                  <button onClick={() => handleDelete(p.id)} className="text-[var(--text-dim)] hover:text-red-400 text-[11px] px-1 cursor-pointer bg-transparent border-none">✕</button>
                </div>
              </div>
              <div className="flex gap-4 text-[11px] text-[var(--text-dim)] mb-2">
                <span className="font-mono">{p.base_url || '—'}</span>
                <span>Key: {maskKey(p.api_key)}</span>
              </div>
              {(p.models || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {p.models.map(m => {
                    const isDefault = p.id === selectedProvider && m.id === selectedModel
                    return (
                      <button
                        key={m.id}
                        onClick={() => setDefaultModel(p.id, m.id)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] cursor-pointer transition-colors"
                        style={{
                          background: isDefault ? 'var(--accent)' : 'var(--bg-sidebar)',
                          color: isDefault ? '#fff' : 'var(--text-primary)',
                          border: 'none',
                        }}
                      >
                        {isDefault && <span className="text-[9px]">&#9733;</span>}
                        {m.name}
                        {(m.context_limit ?? 0) > 0 && (
                          <span className={isDefault ? 'opacity-70' : ''} style={{ fontSize: 10 }}>
                            {formatContext(m.context_limit ?? 0)}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal onClose={closeModal} loading={loading} width={480}>
          {step === 'select' ? (
            <>
              <h4 className="text-[14px] font-semibold m-0 mb-1">Choose a Provider</h4>
              <p className="text-[11px] text-[var(--text-dim)] m-0 mb-4">Select a provider template or set up manually.</p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {PROVIDER_TEMPLATES.map((t) => {
                  const isConfigured = configuredIds.has(t.id)
                  return (
                    <button
                      key={t.id}
                      onClick={() => selectTemplate(t)}
                      className="flex flex-col items-start p-3 rounded-lg border cursor-pointer transition-colors text-left"
                      style={{
                        background: 'var(--bg-card)',
                        borderColor: isConfigured ? 'var(--accent)' : 'var(--border)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = isConfigured ? 'var(--accent)' : 'var(--border)' }}
                    >
                      <span className="text-[12px] font-semibold text-[var(--text-primary)]">{t.name}</span>
                      <span className="text-[10px] text-[var(--text-dim)] mt-0.5 leading-tight">{t.description}</span>
                      {isConfigured && (
                        <span className="text-[9px] mt-1.5 px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--accent)', color: '#fff' }}>Configured</span>
                      )}
                    </button>
                  )
                })}
                <button
                  onClick={selectCustom}
                  className="flex flex-col items-start p-3 rounded-lg border cursor-pointer transition-colors text-left"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
                >
                  <span className="text-[12px] font-semibold text-[var(--text-primary)]">Custom</span>
                  <span className="text-[10px] text-[var(--text-dim)] mt-0.5 leading-tight">Manual setup</span>
                </button>
              </div>
              <ModalActions>
                <ModalButton onClick={closeModal}>Cancel</ModalButton>
              </ModalActions>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                {canGoBack && (
                  <button onClick={backToSelect} className="text-[var(--text-dim)] hover:text-[var(--text-primary)] cursor-pointer bg-transparent border-none text-[13px] p-0">&#8592; Back</button>
                )}
                <h4 className="text-[14px] font-semibold m-0">{editingId ? 'Edit Provider' : (provId ? `Configure ${name}` : 'Custom Provider')}</h4>
              </div>
              <div className="space-y-3">
                <div><label className={labelCls}>ID</label>
                  <input className={inputCls} value={provId} onChange={e => setProvId(e.target.value)} disabled={!!editingId} /></div>
                <div><label className={labelCls}>Name</label>
                  <input className={inputCls} value={name} onChange={e => setName(e.target.value)} /></div>
                <div><label className={labelCls}>Base URL</label>
                  <input className={inputCls} value={baseURL} onChange={e => setBaseURL(e.target.value)} /></div>
                <div><label className={labelCls}>Engine</label>
                  <select className={inputCls + ' cursor-pointer'} value={wireAPI} onChange={e => setWireAPI(e.target.value)}>
                    <option value="">Auto (match provider ID)</option>
                    <option value="openai">OpenAI Compatible</option>
                    <option value="deepseek">DeepSeek</option>
                  </select></div>
                <div><label className={labelCls}>API Key</label>
                  <input type="password" className={inputCls} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Enter your API key" autoFocus={!editingId} /></div>
              </div>
              <div className="border-t border-[var(--border)] pt-4 mt-4 mb-4">
                <label className={labelCls}>Models</label>
                {models.length > 0 && (
                  <div className="mb-3 space-y-1">
                    {models.map((m, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-[var(--bg-card)] border border-[var(--border)]">
                        <span className="text-[var(--text-primary)]"><span className="font-mono text-[var(--text-dim)]">{m.id}</span><span className="mx-1.5 text-[var(--text-dim)]">—</span>{m.name}{m.context_limit > 0 && <span className="text-[var(--text-dim)] ml-1">({formatContext(m.context_limit)} ctx)</span>}</span>
                        <button onClick={() => removeModelEntry(i)} className="text-[var(--text-dim)] hover:text-red-400 bg-transparent border-none cursor-pointer text-[13px] p-0 leading-none">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <div className="flex-1"><label className={labelCls}>Model ID</label><input className={inputCls} value={modelForm.id} onChange={e => setModelForm({ ...modelForm, id: e.target.value })} /></div>
                  <div className="flex-1"><label className={labelCls}>Name</label><input className={inputCls} value={modelForm.name} onChange={e => setModelForm({ ...modelForm, name: e.target.value })} /></div>
                  <div style={{ width: 80 }}><label className={labelCls}>Context</label><input type="number" className={inputCls} value={modelForm.context_limit || ''} onChange={e => setModelForm({ ...modelForm, context_limit: parseInt(e.target.value) || 0 })} /></div>
                  <button onClick={addModelEntry} disabled={!modelForm.id.trim() || !modelForm.name.trim()} className="px-2 py-1 text-[11px] font-medium rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors whitespace-nowrap">+ Add</button>
                </div>
              </div>
              {error && <p className="text-[11px] text-[var(--red)] m-0 mt-3">{error}</p>}
              {saved && !error && (
                <p className="text-[11px] m-0 mt-3" style={{ color: 'var(--yellow)' }}>
                  Provider saved. Restart Monika to apply Base URL / API Key changes to the active session.
                </p>
              )}
              <ModalActions>
                <ModalButton onClick={closeModal} disabled={loading}>Cancel</ModalButton>
                <ModalButton variant="primary" onClick={handleSave} disabled={loading || !provId.trim() || !name.trim()}>
                  {loading ? 'Saving...' : 'Save'}
                </ModalButton>
              </ModalActions>
            </>
          )}
        </Modal>
      )}
    </div>
  )
}
