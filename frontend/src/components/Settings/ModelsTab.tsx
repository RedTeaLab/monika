import { useState, useEffect, useCallback } from 'react'
import { useStore, AvailableProviderInfo } from '../../store'
import { CopilotLoginSection } from './CopilotLogin'
import Modal, { ModalHeader, ModalBody, ModalFooter, ModalButton } from '../ui/Modal'
import ConfirmModal from '../Chat/ConfirmModal'
import { Button, Input, Combobox } from '../ui'
import { IconDatabase, IconEdit, IconPlus, IconTrash, IconStar } from '../Icons'
import { SettingsTabHeader, SettingsCardList, SettingsCard, SettingsEmptyState } from './shared'

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
    const availableProvidersCatalog = useStore((s) => s.availableProvidersCatalog)
    const loadProviders = useStore((s) => s.loadProviderDetails)
    const loadAvailableProviders = useStore((s) => s.loadAvailableProviders)
    const saveProvider = useStore((s) => s.saveProviderDetail)
    const deleteProvider = useStore((s) => s.deleteProviderDetail)
    const selectedProvider = useStore((s) => s.defaultProvider)
    const selectedModel = useStore((s) => s.defaultModel)
    const setDefaultModelGlobal = useStore((s) => s.setDefaultModelGlobal)

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
    const [authMode, setAuthMode] = useState<'api_key' | 'oauth'>('api_key')
    const [copilotToken, setCopilotToken] = useState<{
        refreshToken: string
        expiresIn: number
    } | null>(null)

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
        setAuthMode(p.wire_api === 'copilot' ? 'oauth' : 'api_key')
        setCopilotToken(null)
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
        setWireAPI('openai')
        setSelectedAvailableProvider('')
        setError('')
        setAuthMode('api_key')
        setCopilotToken(null)
        setSaved(false)
    }

    const handleProviderSelect = (catalog: AvailableProviderInfo) => {
        setSelectedAvailableProvider(catalog.id)
        setProvId(catalog.id)
        setName(catalog.display_name || catalog.id.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '))
        setBaseURL(catalog.base_url || '')

        const isOAuth = catalog.env?.includes('GITHUB_TOKEN')
        if (isOAuth) {
            setAuthMode('oauth')
            setWireAPI('copilot')
            setApiKey('')
            setCopilotToken(null)
        } else {
            setAuthMode('api_key')
            setWireAPI('openai')
        }
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
        if (authMode === 'oauth' && !apiKey.trim()) {
            setError('Please login with GitHub first')
            return
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
                    id: m.id, name: m.name, context_limit: m.context_limit || 0, output_limit: m.output_limit || 0, enabled: m.enabled ?? true,
                }))
            }
            const tokenExpiresAt = copilotToken
                ? Math.floor(Date.now() / 1000) + copilotToken.expiresIn
                : 0
            await saveProvider({
                id: provId.trim(), display_name: name.trim(), name: name.trim(), base_url: baseURL.trim(),
                api_key: apiKey.trim(), wire_api: wireAPI.trim(),
                refresh_token: copilotToken?.refreshToken || '',
                token_expires_at: tokenExpiresAt,
                models,
            })
            setSaved(true)
            closeModal()
        } catch { setError('Failed to save provider') }
        finally { setLoading(false) }
    }, [isAdding, provId, name, baseURL, apiKey, wireAPI, providers, editingId, selectedAvailableProvider, availableProvidersCatalog, saveProvider, authMode, copilotToken])

    const handleDelete = useCallback(async () => {
        if (!deleteTarget) return
        try { await deleteProvider(deleteTarget) } catch { /* best effort */ }
        setDeleteTarget(null)
    }, [deleteTarget, deleteProvider])

    const setDefaultModel = useCallback(async (providerId: string, modelId: string) => {
        await setDefaultModelGlobal(providerId, modelId)
    }, [setDefaultModelGlobal])

    const labelCls = 'block text-[11px] font-medium text-[var(--text-secondary)] mb-1.5'

    // Only show providers that have API keys configured.
    const sortedProviders = [...providers].filter(p => p.api_key).sort((a, b) => {
        return a.id.localeCompare(b.id)
    })

    return (
        <div>
            <SettingsTabHeader
                title="Providers"
                description="Manage model providers and API keys"
                actions={
                    <Button variant="outline" size="sm" onClick={openAdd}>
                        <IconPlus size={12} />
                        Add
                    </Button>
                }
            />

            {sortedProviders.length === 0 ? (
                <SettingsEmptyState
                    icon={<IconDatabase size={32} />}
                    title="No providers configured"
                    description="Add a provider to start using Monika"
                    action={
                        <Button variant="outline" size="sm" onClick={openAdd}>
                            <IconPlus size={12} />
                            Add Your First Provider
                        </Button>
                    }
                />
            ) : (
                <SettingsCardList>
                    {sortedProviders.map((p) => {
                        const totalModels = (p.models || []).length
                        return (
                            <SettingsCard
                                key={p.id}
                                hoverActions={
                                    <>
                                        <button onClick={() => openEdit(p)} className="inline-flex items-center text-[var(--text-dim)] hover:text-[var(--text-primary)] text-[11px] px-1.5 py-0.5 cursor-pointer bg-transparent border-none rounded transition-colors" aria-label={`Edit ${p.display_name}`}><IconEdit size={13} /></button>
                                        <button onClick={() => setDeleteTarget(p.id)} className="inline-flex items-center text-[var(--text-dim)] hover:text-[var(--red)] text-[11px] px-1.5 py-0.5 cursor-pointer bg-transparent border-none rounded transition-colors" aria-label={`Delete ${p.display_name}`}><IconTrash size={13} /></button>
                                    </>
                                }
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
                                </div>
                                {p.api_key && (
                                    <div className="flex gap-4 text-[11px] text-[var(--text-dim)] mb-2 ml-7">
                                        <span className="font-mono">{p.base_url || '\u2014'}</span>
                                        <span>{p.wire_api === 'copilot' ? 'Token' : 'Key'}: {maskKey(p.api_key)}</span>
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
                                                    {isDefault && <IconStar size={10} filled />}
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
                            </SettingsCard>
                        )
                    })}
                </SettingsCardList>
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
                                    <Combobox
                                        value={selectedAvailableProvider || null}
                                        options={availableProvidersCatalog
                                            .filter(p => p.npm === '@ai-sdk/openai-compatible' && !providers.find(c => c.id === p.id))
                                            .map(p => ({ value: p.id, label: p.display_name || p.id, description: `${p.models.length} models` }))}
                                        onChange={(v) => {
                                            const cat = availableProvidersCatalog.find(p => p.id === v)
                                            if (cat) handleProviderSelect(cat)
                                        }}
                                        placeholder="Choose a provider..."
                                        searchable={true}
                                        searchPlaceholder="Search providers..."
                                    />
                                </div>
                            )}
                            <div>
                                <label className={labelCls}>ID</label>
                                <Input value={provId} onChange={e => setProvId(e.target.value)} disabled={!!selectedAvailableProvider} placeholder={isAdding ? 'Auto-filled from selection' : ''} />
                            </div>
                            <div>
                                <label className={labelCls}>Display Name</label>
                                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My OpenAI" />
                            </div>
                            {authMode === 'api_key' && (
                                <div>
                                    <label className={labelCls}>Base URL</label>
                                <Input value={baseURL} onChange={e => setBaseURL(e.target.value)} placeholder="https://api.openai.com/v1" />
                                </div>
                            )}
                            {authMode === 'api_key' ? (
                                <div>
                                <Input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Enter your API key" autoFocus={!isAdding} />
                                </div>
                            ) : (
                                <div>
                                    <label className={labelCls}>Authentication</label>
                                    <CopilotLoginSection
                                        existingToken={editingId ? apiKey : undefined}
                                        onToken={(at, rt, exp) => {
                                            setApiKey(at)
                                            setCopilotToken({ refreshToken: rt, expiresIn: exp })
                                        }}
                                        onError={setError}
                                    />
                                </div>
                            )}
                        </div>
                        {error && <p className="text-[11px] text-[var(--red)] m-0 mt-4">{error}</p>}
                        {saved && !error && (
                            <p className="text-[11px] m-0 mt-4" style={{ color: 'var(--green)' }}>
                                Provider saved successfully.
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
