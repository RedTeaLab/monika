import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useStore } from '../../store'
import type { ProviderInfo, ModelInfo } from '../../../bindings/monika'
import { IconChevronDown, IconCheck, IconStar } from '../Icons'

function ModelPicker() {
    const availableProviders = useStore((s) => s.availableProviders)
    const selectedProvider = useStore((s) => s.selectedProvider)
    const selectedModel = useStore((s) => s.selectedModel)
    const modelsByProvider = useStore((s) => s.modelsByProvider)
    const favoriteModels = useStore((s) => s.favoriteModels)
    const toggleFavoriteModel = useStore((s) => s.toggleFavoriteModel)
    const setActiveSessionModel = useStore((s) => s.setActiveSessionModel)
    const loadModelsForProvider = useStore((s) => s.loadModelsForProvider)
    const generatingSessionIds = useStore((s) => s.generatingSessionIds)
    const activeSessionId = useStore((s) => s.activeSessionId)
    const isGenerating = generatingSessionIds.includes(activeSessionId)

    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const [focusIdx, setFocusIdx] = useState(0)
    const ref = useRef<HTMLDivElement>(null)
    const searchRef = useRef<HTMLInputElement>(null)

    // Close on click outside
    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    // Ensure models for the selected provider are loaded so the button label is correct.
    // applySessionBinding can set selectedProvider without loading its models first.
    useEffect(() => {
        if (!selectedProvider || availableProviders.length === 0) return
        const models = modelsByProvider[selectedProvider]
        if (!models || models.length === 0) {
            loadModelsForProvider(selectedProvider)
        }
    }, [selectedProvider, availableProviders, modelsByProvider, loadModelsForProvider])

    // Load models for all providers when popover opens
    useEffect(() => {
        if (!open) return
        for (const p of availableProviders) {
            const existing = modelsByProvider[p.id]
            if (!existing || existing.length === 0) {
                loadModelsForProvider(p.id)
            }
        }
    }, [open, availableProviders, modelsByProvider, loadModelsForProvider])

    // Reset state when popover opens
    useEffect(() => {
        if (open) {
            setSearch('')
            setFocusIdx(0)
            setTimeout(() => searchRef.current?.focus(), 0)
        }
    }, [open])

    // Build flat list of all visible items for keyboard nav
    type FlatItem =
        | { type: 'favorite-header' }
        | { type: 'provider'; provider: ProviderInfo }
        | { type: 'model'; provider: ProviderInfo; model: ModelInfo; isFavorite?: boolean; inFavoriteGroup?: boolean }

    const flatItems = useMemo((): FlatItem[] => {
        const items: FlatItem[] = []
        const searchLower = search.toLowerCase()

        // Build lookup: "providerId:modelId" -> { provider, model }
        const allModelsLookup = new Map<string, { provider: ProviderInfo; model: ModelInfo }>()
        for (const p of availableProviders) {
            const models = (modelsByProvider[p.id] || []).filter(m => (m as any).Enabled !== false)
            for (const m of models) {
                allModelsLookup.set(`${p.id}:${m.ID}`.toLowerCase(), { provider: p, model: m })
            }
        }

        // Favorite group
        const validFavorites: { provider: ProviderInfo; model: ModelInfo }[] = []
        for (const key of favoriteModels) {
            const entry = allModelsLookup.get(key.toLowerCase())
            if (!entry) continue
            if (searchLower) {
                if (!entry.model.DisplayName.toLowerCase().includes(searchLower)
                    && !entry.model.ID.toLowerCase().includes(searchLower)) continue
            }
            validFavorites.push(entry)
        }
        if (validFavorites.length > 0) {
            items.push({ type: 'favorite-header' })
            for (const { provider, model } of validFavorites) {
                items.push({ type: 'model', provider, model, isFavorite: true, inFavoriteGroup: true })
            }
        }

        // Provider groups
        for (const p of availableProviders) {
            const models = (modelsByProvider[p.id] || []).filter(m => (m as any).Enabled !== false)
            const filtered = searchLower
                ? models.filter((m) =>
                    m.DisplayName.toLowerCase().includes(searchLower) ||
                    m.ID.toLowerCase().includes(searchLower)
                )
                : models

            if (filtered.length === 0) continue
            if (availableProviders.length > 1) {
                items.push({ type: 'provider', provider: p })
            }
            for (const m of filtered) {
                items.push({
                    type: 'model',
                    provider: p,
                    model: m,
                    isFavorite: favoriteModels.some(k => k.toLowerCase() === `${p.id}:${m.ID}`.toLowerCase())
                })
            }
        }
        return items
    }, [availableProviders, modelsByProvider, search, favoriteModels])

    // Clamp focusIdx when flatItems changes
    useEffect(() => {
        if (focusIdx >= flatItems.length) {
            setFocusIdx(Math.max(0, flatItems.length - 1))
        }
    }, [flatItems.length, focusIdx])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setOpen(false)
            return
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setFocusIdx((prev) => Math.min(prev + 1, flatItems.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setFocusIdx((prev) => Math.max(prev - 1, 0))
        } else if (e.key === 'Enter') {
            e.preventDefault()
            const item = flatItems[focusIdx]
            if (item && item.type === 'model') {
                handleSelect(item.provider.id, item.model.ID)
            }
        }
    }

    const handleSelect = useCallback(
        async (providerId: string, modelId: string) => {
            if (isGenerating) return
            await setActiveSessionModel(providerId, modelId)
            setOpen(false)
        },
        [setActiveSessionModel, isGenerating],
    )

    // No providers state
    if (availableProviders.length === 0) {
        return (
            <span className="text-[11px] text-[var(--text-dim)]">No providers</span>
        )
    }

    const provider = availableProviders.find((p) => p.id === selectedProvider) || availableProviders[0]
    const providerAbbr = provider.display_name.slice(0, 2).toUpperCase()
    const models = modelsByProvider[selectedProvider] || []
    const currentModel = models.find((m) => m.ID === selectedModel) || models[0]

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <style>{`
.fav-row:hover .fav-star { opacity: 1 !important; }
`}</style>
            <button
                onClick={() => setOpen((v) => !v)}
                disabled={isGenerating}
                className="text-[11px] px-2 py-0.5 rounded cursor-pointer flex items-center gap-1"
                style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    fontFamily: 'inherit',
                    opacity: isGenerating ? 0.5 : 1,
                    cursor: isGenerating ? 'not-allowed' : 'pointer',
                }}
            >
                <span style={{ fontWeight: 600 }}>{providerAbbr}</span>
                <span>{currentModel?.DisplayName || 'Select model'}</span>
                <IconChevronDown size={8} />
            </button>
            {open && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: 0,
                        marginBottom: '4px',
                        minWidth: '200px',
                        maxHeight: '320px',
                        overflowY: 'auto',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 'var(--radius-md, 6px)',
                        padding: '4px',
                        zIndex: 1000,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    }}
                >
                    {/* Search input */}
                    <input
                        ref={searchRef}
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value)
                            setFocusIdx(0)
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder="Search models..."
                        className="text-[11px] w-full px-2 py-1 rounded border mb-1 outline-none"
                        style={{
                            background: 'var(--bg-card)',
                            borderColor: 'var(--border)',
                            color: 'var(--text-primary)',
                            fontFamily: 'inherit',
                        }}
                    />

                    {flatItems.length === 0 ? (
                        <div className="text-[11px] text-[var(--text-dim)] px-2 py-1">
                            No matches
                        </div>
                    ) : (
                        flatItems.map((item, idx) => {
                            if (item.type === 'favorite-header') {
                                return (
                                    <div
                                        key="favorite-header"
                                        className="text-[10px] font-semibold uppercase tracking-[0.05em] px-2 pt-2 pb-0.5"
                                        style={{ color: 'var(--text-dim)' }}
                                    >
                                        Favorite models
                                    </div>
                                )
                            }
                            if (item.type === 'provider') {
                                return (
                                    <div
                                        key={`p-${item.provider.id}`}
                                        className="text-[10px] font-semibold uppercase tracking-[0.05em] px-2 pt-2 pb-0.5"
                                        style={{ color: 'var(--text-dim)' }}
                                    >
                                        {item.provider.display_name}
                                    </div>
                                )
                            }
                            const m = item.model
                            const isSelected =
                                m.ID === selectedModel && item.provider.id === selectedProvider
                            return (
                                <button
                                    key={`${item.inFavoriteGroup ? 'fav' : 'm'}-${item.provider.id}-${m.ID}`}
                                    onClick={() => handleSelect(item.provider.id, m.ID)}
                                    onMouseEnter={() => setFocusIdx(idx)}
                                    className="text-[11px] w-full text-left px-2 py-1 rounded cursor-pointer flex items-center fav-row"
                                    style={{
                                        background:
                                            idx === focusIdx
                                                ? 'var(--bg-hover)'
                                                : isSelected
                                                    ? isSelectedBg
                                                    : 'transparent',
                                        color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                                        border: 'none',
                                        fontFamily: 'inherit',
                                    }}
                                >
                                    <span
                                        onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            toggleFavoriteModel(item.provider.id, m.ID)
                                        }}
                                        className="fav-star"
                                        style={{
                                            padding: '2px',
                                            cursor: 'pointer',
                                            color: item.isFavorite ? 'var(--accent)' : 'var(--text-dim)',
                                            opacity: item.isFavorite ? 1 : 0,
                                            transition: 'opacity 0.15s',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            flexShrink: 0,
                                        }}
                                        title={item.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                                    >
                                        <IconStar filled={item.isFavorite} size={14} />
                                    </span>
                                    <span style={{ marginLeft: 2 }}>
                                        {m.DisplayName}
                                        {item.inFavoriteGroup && (
                                            <span className="text-[9px] font-semibold" style={{ color: 'var(--text-dim)', marginLeft: 4 }}>
                                                {item.provider.id.slice(0, 2).toUpperCase()}
                                            </span>
                                        )}
                                    </span>
                                    {isSelected && (
                                        <span style={{ marginLeft: 'auto', flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
                                            <IconCheck size={12} />
                                        </span>
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

const isSelectedBg = 'var(--accent-muted, var(--bg-hover))'

export default ModelPicker
