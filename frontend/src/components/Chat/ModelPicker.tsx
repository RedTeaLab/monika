import { useEffect, useMemo } from 'react'
import { useStore } from '../../store'
import type { ModelInfo } from '../../../bindings/monika'
import { IconStar } from '../Icons'
import { Combobox, IconButton } from '../ui'
import type { ComboboxOption } from '../ui'

/** Format a context-limit token count the same way ModelsTab does (e.g. 200K ctx, 1M ctx). */
function formatContext(limit: number): string {
    if (limit <= 0) return ''
    if (limit >= 1000000) return `${(limit / 1000000).toFixed(0)}M ctx`
    if (limit >= 1000) return `${(limit / 1000).toFixed(0)}K ctx`
    return `${limit} ctx`
}

/** ModelInfo only declares ID/DisplayName in the bindings; ContextLimit/Enabled arrive via Object.assign. */
type ResolvedModel = ModelInfo & { ContextLimit?: number; Enabled?: boolean }

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

    // Ensure models for the selected provider are loaded so the button label is correct.
    // applySessionBinding can set selectedProvider without loading its models first.
    useEffect(() => {
        if (!selectedProvider || availableProviders.length === 0) return
        const models = modelsByProvider[selectedProvider]
        if (!models || models.length === 0) {
            loadModelsForProvider(selectedProvider)
        }
    }, [selectedProvider, availableProviders, modelsByProvider, loadModelsForProvider])

    const models = useMemo<ResolvedModel[]>(
        () => (modelsByProvider[selectedProvider] || []).filter((m) => (m as ResolvedModel).Enabled !== false),
        [modelsByProvider, selectedProvider],
    )

    const options = useMemo<ComboboxOption[]>(() => (
        models.map((m) => {
            const favKey = `${selectedProvider}:${m.ID}`.toLowerCase()
            const isFavorite = favoriteModels.some((k) => k.toLowerCase() === favKey)
            return {
                value: m.ID,
                label: m.DisplayName || m.ID,
                description: formatContext((m as ResolvedModel).ContextLimit ?? 0) || undefined,
                icon: isFavorite ? <IconStar filled size={11} /> : undefined,
            }
        })
    ), [models, favoriteModels, selectedProvider])

    // No providers state
    if (availableProviders.length === 0) {
        return <span className="text-[11px] text-[var(--text-dim)]">No providers</span>
    }

    const currentModel = models.find((m) => m.ID === selectedModel) || models[0]
    const currentFavKey = currentModel ? `${selectedProvider}:${currentModel.ID}`.toLowerCase() : ''
    const isFavorite = !!currentModel && favoriteModels.some((k) => k.toLowerCase() === currentFavKey)

    return (
        <div className="flex items-center gap-1">
            <Combobox
                value={currentModel?.ID ?? null}
                options={options}
                onChange={(modelId) => {
                    // Combobox is disabled while generating; guard stays defensive.
                    if (isGenerating) return
                    // Options are scoped to the selected provider, so providerId is fixed.
                    void setActiveSessionModel(selectedProvider, modelId)
                }}
                placeholder="Select model"
                searchPlaceholder="Search models…"
                searchable
                disabled={isGenerating}
                emptyMessage="No models"
                aria-label="Select model"
                panelWidth={240}
                className={
                    '!w-auto min-w-[120px] ' +
                    '[&>button]:!w-auto [&>button]:!h-auto [&>button]:!py-0.5 [&>button]:!px-2 ' +
                    '[&>button]:!text-[11px] [&>button]:!gap-1 [&>button]:!bg-[var(--bg-elevated)] ' +
                    '[&>button]:!border-[var(--border)] [&>button]:!rounded'
                }
            />
            {currentModel && (
                <IconButton
                    label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    size="sm"
                    onClick={() => toggleFavoriteModel(selectedProvider, currentModel.ID)}
                    className="!h-5 !w-5"
                >
                    <span style={{ color: isFavorite ? 'var(--accent)' : 'var(--text-dim)' }}>
                        <IconStar filled={isFavorite} size={11} />
                    </span>
                </IconButton>
            )}
        </div>
    )
}

export default ModelPicker
