import { useEffect, useMemo } from 'react'
import { useStore } from '../../store'
import type { ModelInfo } from '../../../bindings/monika'
import { IconStar } from '../Icons'
import { Combobox } from '../ui'
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
    const setActiveSessionModel = useStore((s) => s.setActiveSessionModel)
    const loadModelsForProvider = useStore((s) => s.loadModelsForProvider)
    const generatingSessionIds = useStore((s) => s.generatingSessionIds)
    const activeSessionId = useStore((s) => s.activeSessionId)
    const isGenerating = generatingSessionIds.includes(activeSessionId)

    // Ensure models for the selected provider are loaded so the button label is correct.
    // applySessionBinding can set selectedProvider without loading its models first.
    // Load models for ALL providers so the dropdown shows every available model.
    // The selected provider is loaded first (for the trigger label); the rest
    // are loaded in parallel so they appear in the dropdown without delay.
    useEffect(() => {
        if (availableProviders.length === 0) return
        for (const p of availableProviders) {
            const existing = modelsByProvider[p.id]
            if (!existing || existing.length === 0) {
                loadModelsForProvider(p.id)
            }
        }
    }, [availableProviders, modelsByProvider, loadModelsForProvider])

    // Build options across ALL providers, grouped by Favorites + provider name.
    // Each option's value is encoded as "providerId:modelId" so onChange can
    // route to the correct provider. The trigger label is resolved separately.
    const options = useMemo<ComboboxOption[]>(() => {
        const result: ComboboxOption[] = []

        // Lookup: "providerId:modelId" → { provider, model }
        const allModels: { providerId: string; providerName: string; model: ResolvedModel }[] = []
        for (const p of availableProviders) {
            const models = (modelsByProvider[p.id] || []).filter((m) => (m as ResolvedModel).Enabled !== false)
            for (const m of models) {
                allModels.push({ providerId: p.id, providerName: p.display_name || p.id, model: m as ResolvedModel })
            }
        }

        // Favorites group
        const favSet = new Set(favoriteModels.map((k) => k.toLowerCase()))
        const favItems = allModels.filter(({ providerId, model }) =>
            favSet.has(`${providerId}:${model.ID}`.toLowerCase())
        )
        if (favItems.length > 0) {
            for (const { providerId, providerName, model } of favItems) {
                const ctx = formatContext(model.ContextLimit ?? 0)
                result.push({
                    value: `${providerId}\u0000${model.ID}`,
                    label: model.DisplayName || model.ID,
                    description: ctx ? `${providerName} · ${ctx}` : providerName,
                    icon: <IconStar filled size={11} />,
                    group: 'Favorites',
                })
            }
        }

        // Provider groups
        const showProviderHeaders = availableProviders.length > 1
        for (const p of availableProviders) {
            const models = (modelsByProvider[p.id] || []).filter((m) => (m as ResolvedModel).Enabled !== false)
            if (models.length === 0) continue
            const providerName = p.display_name || p.id
            for (const m of models) {
                const ctx = formatContext((m as ResolvedModel).ContextLimit ?? 0)
                const isFav = favSet.has(`${p.id}:${m.ID}`.toLowerCase())
                result.push({
                    value: `${p.id}\u0000${m.ID}`,
                    label: m.DisplayName || m.ID,
                    description: ctx || undefined,
                    icon: isFav ? <IconStar filled size={11} /> : undefined,
                    group: showProviderHeaders ? providerName : undefined,
                })
            }
        }
        return result
    }, [availableProviders, modelsByProvider, favoriteModels])

    // No providers state
    if (availableProviders.length === 0) {
        return <span className="text-[11px] text-[var(--text-dim)]">No providers</span>
    }

    // Resolve current model from selectedProvider + selectedModel
    const currentModels = (modelsByProvider[selectedProvider] || []).filter((m) => (m as ResolvedModel).Enabled !== false)
    const currentModel = currentModels.find((m) => m.ID === selectedModel) || currentModels[0]

    return (
        <Combobox
            value={currentModel ? `${selectedProvider}\u0000${currentModel.ID}` : null}
            options={options}
            onChange={(encoded) => {
                if (isGenerating) return
                const sep = encoded.indexOf('\u0000')
                if (sep < 0) return
                const providerId = encoded.slice(0, sep)
                const modelId = encoded.slice(sep + 1)
                void setActiveSessionModel(providerId, modelId)
            }}
            placeholder="Select model"
            searchPlaceholder="Search models…"
            searchable
            disabled={isGenerating}
            emptyMessage="No models"
            aria-label="Select model"
            panelWidth={240}
            className={
                '!w-auto min-w-[100px] ' +
                '[&>button]:!w-auto [&>button]:!h-auto [&>button]:!py-0.5 [&>button]:!px-2 ' +
                '[&>button]:!text-[11px] [&>button]:!gap-1 [&>button]:!bg-[var(--bg-elevated)] ' +
                '[&>button]:!border-[var(--border)] [&>button]:!rounded'
            }
        />
    )
}

export default ModelPicker
