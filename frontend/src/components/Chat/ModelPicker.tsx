import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useStore } from '../../store'
import { App } from '../../../bindings/monika'
import type { ProviderInfo, ModelInfo } from '../../../bindings/monika'

function ModelPicker() {
  const availableProviders = useStore((s) => s.availableProviders)
  const selectedProvider = useStore((s) => s.selectedProvider)
  const selectedModel = useStore((s) => s.selectedModel)
  const modelsByProvider = useStore((s) => s.modelsByProvider)
  const setSelectedProvider = useStore((s) => s.setSelectedProvider)
  const loadModelsForProvider = useStore((s) => s.loadModelsForProvider)

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

  // Load models for all providers when popover opens
  useEffect(() => {
    if (!open) return
    for (const p of availableProviders) {
      if (!modelsByProvider[p.id]) {
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
    | { type: 'provider'; provider: ProviderInfo }
    | { type: 'model'; provider: ProviderInfo; model: ModelInfo }

  const flatItems = useMemo((): FlatItem[] => {
    const items: FlatItem[] = []
    const searchLower = search.toLowerCase()

    for (const p of availableProviders) {
      const models = modelsByProvider[p.id] || []
      const filtered = searchLower
        ? models.filter((m) =>
            m.DisplayName.toLowerCase().includes(searchLower) ||
            m.ID.toLowerCase().includes(searchLower)
          )
        : models

      if (availableProviders.length > 1) {
        items.push({ type: 'provider', provider: p })
      }
      for (const m of filtered) {
        items.push({ type: 'model', provider: p, model: m })
      }
    }
    return items
  }, [availableProviders, modelsByProvider, search])

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
      if (providerId !== selectedProvider) {
        await setSelectedProvider(providerId)
      }
      useStore.getState().setSelectedModel(modelId)
      setOpen(false)
      App.PersistSelection(providerId, modelId).catch((e: unknown) => { console.error('[monika] PersistSelection failed:', e) })
    },
    [selectedProvider, setSelectedProvider],
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
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] px-2 py-0.5 rounded cursor-pointer flex items-center gap-1"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ fontWeight: 600 }}>{providerAbbr}</span>
        <span>{currentModel?.DisplayName || 'Select model'}</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polyline points="2,3 4,5 6,3" />
        </svg>
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
                  key={`m-${item.provider.id}-${m.ID}`}
                  onClick={() => handleSelect(item.provider.id, m.ID)}
                  onMouseEnter={() => setFocusIdx(idx)}
                  className="text-[11px] w-full text-left px-2 py-1 rounded cursor-pointer flex items-center justify-between"
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
                  <span>{m.DisplayName}</span>
                  {isSelected && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="2,6 5,9 10,3" />
                    </svg>
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
