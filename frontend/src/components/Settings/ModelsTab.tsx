import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useStore, AvailableProviderInfo } from '../../store'
import { Call } from '@wailsio/runtime'
import Modal, { ModalHeader, ModalBody, ModalFooter, ModalButton } from '../ui/Modal'
import ConfirmModal from '../Chat/ConfirmModal'
import { IconDatabase, IconEdit, IconPlus, IconTrash } from '../Icons'

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

function ProviderSelect({ catalog, onSelect }: { catalog: AvailableProviderInfo[]; onSelect: (p: AvailableProviderInfo) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [focusIdx, setFocusIdx] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return catalog
    return catalog.filter(p => p.id.toLowerCase().includes(q) || p.display_name.toLowerCase().includes(q))
  }, [catalog, search])

  useEffect(() => {
    if (focusIdx >= filtered.length) setFocusIdx(Math.max(0, filtered.length - 1))
  }, [filtered.length, focusIdx])

  useEffect(() => {
    if (!open) return
    setSearch('')
    setFocusIdx(0)
    setTimeout(() => searchRef.current?.focus(), 0)
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const p = filtered[focusIdx]
      if (p) { onSelect(p); setOpen(false) }
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full px-3 py-2 text-[12px] rounded-md border cursor-pointer flex items-center justify-between"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)', fontFamily: 'inherit', textAlign: 'left' }}
      >
        <span className="text-[var(--text-dim)]">Choose a provider...</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="2,3 4,5 6,3" /></svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', width: '100%', maxHeight: '260px', overflowY: 'auto', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md, 6px)', padding: '4px', zIndex: 1000, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          <input
            ref={searchRef}
            value={search}
            onChange={e => { setSearch(e.target.value); setFocusIdx(0) }}
            onKeyDown={handleKeyDown}
            placeholder="Search providers..."
            className="text-[11px] w-full px-2 py-1 rounded border mb-1 outline-none"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
          />
          {filtered.length === 0 ? (
            <div className="text-[11px] text-[var(--text-dim)] px-2 py-1">No matches</div>
          ) : (
            filtered.map((p, idx) => (
              <div
                key={p.id}
                onClick={() => { onSelect(p); setOpen(false) }}
                className="text-[11px] px-2 py-1 rounded cursor-pointer flex justify-between items-center"
                style={{
                  background: idx === focusIdx ? 'var(--bg-sidebar)' : 'transparent',
                  color: idx === focusIdx ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
                onMouseEnter={() => setFocusIdx(idx)}
              >
                <span>{p.display_name || p.id}</span>
                <span className="text-[10px] text-[var(--text-dim)]">{p.models.length} models</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function ModelsTab() {
  const providers = useStore((s) => s.providerDetails)
  const availableProvidersCatalog = useStore((s) => s.availableProvidersCatalog)
  const loadProviders = useStore((s) => s.loadProviderDetails)
  const loadAvailableProviders = useStore((s) => s.loadAvailableProviders)
  const saveProvider = useStore((s) => s.saveProviderDetail)
  const deleteProvider = useStore((s) => s.deleteProviderDetail)
  const selectedProvider = useStore((s) => s.selectedProvider)
  const selectedModel = useStore((s) => s.selectedModel)
  const setSelectedProvider = useStore((s) => s.setSelectedProvider)
  const setSelectedModel = useStore((s) => s.setSelectedModel)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [provId, setProvId] = useState('')
  const [name, setName] = useState('')
  const [baseURL, setBaseURL] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [wireAPI, setWireAPI] = useState('')
  const [selectedAvailableProvider, setSelectedAvailableProvider] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => {
    loadProviders()
    loadAvailableProviders()
  }, [loadProviders, loadAvailableProviders])

  const openEdit = (p: typeof providers[0]) => {
    setIsAdding(false)
    setEditingId(p.id)
    setProvId(p.id)
    setName(p.display_name)
    setBaseURL(p.base_url)
    setApiKey(p.api_key)
    setWireAPI(p.wire_api || '')
    setSelectedAvailableProvider('')
    setError('')
    setSaved(false)
  }

  const openAdd = () => {
    setIsAdding(true)
    setEditingId(null)
    setProvId('')
    setName('')
    setBaseURL('')
    setApiKey('')
    setWireAPI('openai-compatible')
    setSelectedAvailableProvider('')
    setError('')
    setSaved(false)
  }

  const handleProviderSelect = (catalog: AvailableProviderInfo) => {
    setSelectedAvailableProvider(catalog.id)
    setProvId(catalog.id)
    setName(catalog.display_name || catalog.id.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '))
    setBaseURL(catalog.base_url || '')
    setWireAPI('openai-compatible')
  }

  const closeModal = () => {
    setIsAdding(false)
    setEditingId(null)
  }

  const handleSave = useCallback(async () => {
    if (!provId.trim() || !name.trim()) { setError('ID and Name are required'); return }
    if (isAdding) {
      if (!apiKey.trim()) { setError('API Key is required when adding a provider'); return }
    }
    setLoading(true); setError('')
    try {
      let models
      if (isAdding && selectedAvailableProvider) {
        const cat = availableProvidersCatalog.find(p => p.id === selectedAvailableProvider)
        models = (cat?.models || []).map(m => ({
          id: m.id, name: m.name, context_limit: m.context_limit || 0, output_limit: m.output_limit || 0, enabled: true,
        }))
      } else {
        models = (providers.find((p) => p.id === editingId)?.models || []).map(m => ({
          id: m.id, name: m.name, context_limit: m.context_limit || 0, output_limit: m.output_limit || 0, enabled: true,
        }))
      }
      await saveProvider({
        id: provId.trim(), display_name: name.trim(), name: name.trim(), base_url: baseURL.trim(),
        api_key: apiKey.trim(), wire_api: wireAPI.trim(),
        models,
      })
      setSaved(true)
    } catch { setError('Failed to save provider') }
    finally { setLoading(false) }
  }, [isAdding, provId, name, baseURL, apiKey, wireAPI, providers, editingId, selectedAvailableProvider, availableProvidersCatalog, saveProvider])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try { await deleteProvider(deleteTarget) } catch { /* best effort */ }
    setDeleteTarget(null)
  }, [deleteTarget, deleteProvider])

  const setDefaultModel = useCallback(async (providerId: string, modelId: string) => {
    setSelectedProvider(providerId)
    setSelectedModel(modelId)
    try { await Call.ByName('monika/internal/api.App.SetDefaultModel', providerId, modelId) } catch { /* best effort */ }
  }, [setSelectedProvider, setSelectedModel])

  const inputCls = 'w-full px-3 py-2 text-[12px] rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--border-strong)] form-input-glow transition-colors duration-150'
  const labelCls = 'block text-[11px] font-medium text-[var(--text-secondary)] mb-1.5'

  // Only show providers that have API keys configured.
  const sortedProviders = [...providers].filter(p => p.api_key).sort((a, b) => {
    return a.id.localeCompare(b.id)
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold m-0 mb-1">Providers</h3>
          <p className="text-[11px] text-[var(--text-dim)] m-0">Configure your AI model providers.</p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded cursor-pointer bg-transparent border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors"
          style={{ color: 'var(--text-primary)' }}
        >
          <IconPlus size={12} />
          Add Provider
        </button>
      </div>

      {sortedProviders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-dim)]">
          <IconDatabase size={32} />
          <span className="text-[13px] mt-3">No providers configured</span>
          <span className="text-[11px] mt-1 mb-3">Add a provider to start using Monika</span>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded cursor-pointer transition-colors"
            style={{ color: 'var(--accent)', background: 'var(--accent-muted)' }}
          >
            <IconPlus size={12} />
            Add Your First Provider
          </button>
        </div>
      ) : (
        <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto">
          {sortedProviders.map((p) => {
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
                      {p.api_key && totalModels > 0 && (
                        <span className="text-[10px] text-[var(--text-dim)]">{totalModels} models</span>
                      )}
                    </div>
                  </div>
                  <div className="opacity-0 group-hover/card:opacity-100 transition-opacity flex gap-1">
                    <button onClick={() => openEdit(p)} className="inline-flex items-center text-[var(--text-dim)] hover:text-[var(--text-primary)] text-[11px] px-1.5 py-0.5 cursor-pointer bg-transparent border-none rounded transition-colors" aria-label={`Edit ${p.display_name}`}><IconEdit size={13} /></button>
                    <button onClick={() => setDeleteTarget(p.id)} className="inline-flex items-center text-[var(--text-dim)] hover:text-[var(--red)] text-[11px] px-1.5 py-0.5 cursor-pointer bg-transparent border-none rounded transition-colors" aria-label={`Delete ${p.display_name}`}><IconTrash size={13} /></button>
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
                        <button
                          key={m.id}
                          onClick={() => setDefaultModel(p.id, m.id)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-transparent border-none cursor-pointer transition-colors"
                          style={{
                            background: isDefault ? 'var(--accent-muted)' : 'var(--bg-sidebar)',
                            color: isDefault ? 'var(--accent)' : 'var(--text-primary)',
                          }}
                        >
                          {isDefault && <span className="text-[9px]" style={{ color: 'var(--accent)' }}>&#9733; </span>}
                          {m.name}
                          {(m.context_limit ?? 0) > 0 && (
                            <span className={isDefault ? 'opacity-70' : ''} style={{ color: 'var(--text-dim)', fontSize: 10 }}>
                              {formatContext(m.context_limit ?? 0)}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {(editingId || isAdding) && (
        <Modal onClose={closeModal} loading={loading} width={500}>
          <ModalHeader icon={<IconDatabase size={15} />}>
            <h4 className="text-[14px] font-semibold m-0">{isAdding ? 'Add Provider' : `Edit ${name || editingId}`}</h4>
            <p className="text-[11px] text-[var(--text-dim)] m-0 mt-0.5">{isAdding ? 'Select a provider from models.dev and configure your credentials.' : 'Update your provider credentials here.'}</p>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              {isAdding && (
                <div>
                  <label className={labelCls}>Select Provider</label>
                  <ProviderSelect catalog={availableProvidersCatalog.filter(p => p.npm === '@ai-sdk/openai-compatible' && !providers.find(c => c.id === p.id))} onSelect={handleProviderSelect} />
                </div>
              )}
              <div>
                <label className={labelCls}>ID</label>
                <input className={inputCls} value={provId} onChange={e => setProvId(e.target.value)} disabled={!!selectedAvailableProvider} placeholder={isAdding ? 'Auto-filled from selection' : ''} />
              </div>
              <div>
                <label className={labelCls}>Display Name</label>
                <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My OpenAI" />
              </div>
              <div>
                <label className={labelCls}>Base URL</label>
                <input className={inputCls} value={baseURL} onChange={e => setBaseURL(e.target.value)} placeholder="https://api.openai.com/v1" />
              </div>
              <div>
                <label className={labelCls}>API Key</label>
                <input type="password" className={inputCls} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Enter your API key" autoFocus={!isAdding} />
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

      {deleteTarget && (
        <ConfirmModal
          title="Delete Provider"
          message={`Are you sure you want to delete "${providers.find(p => p.id === deleteTarget)?.display_name || deleteTarget}"? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          icon={<IconTrash size={15} />}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
