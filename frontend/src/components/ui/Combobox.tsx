import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check, Search } from 'lucide-react'
import { cn } from './cn'
import { IconButton } from './Button'
import { useClickOutside } from '../../hooks/useClickOutside'

/* ─────────────────────────── Types ─────────────────────────────── */

export interface ComboboxOption {
  value: string
  label: string
  /** Optional secondary description shown below the label. */
  description?: string
  /** Optional leading icon/node rendered before the label. */
  icon?: ReactNode
  /** Disable this specific option. */
  disabled?: boolean
}

export interface ComboboxProps {
  /** Currently selected value (controlled). */
  value: string | null
  /** Options to render. Pass empty array and `loading=true` for async. */
  options: ComboboxOption[]
  /** Called when an option is selected. */
  onChange: (value: string) => void
  /** Placeholder shown when no value is set. */
  placeholder?: string
  /** Whether to show the search input. Default: true. */
  searchable?: boolean
  /** Controlled search query (for async filtering). */
  searchValue?: string
  onSearchChange?: (q: string) => void
  /** Loading indicator — disables interaction and shows spinner. */
  loading?: boolean
  /** Render at a different width than the trigger (px or CSS string). */
  panelWidth?: number | string
  /** Max height of the options panel before scrolling. */
  panelMaxHeight?: number | string
  /** Disabled state for the whole control. */
  disabled?: boolean
  /** Optional className on the trigger button. */
  className?: string
  /** Optional id for the search input (a11y label-by). */
  searchPlaceholder?: string
  /** Horizontal anchor: 'start' (default) aligns panel left edge with trigger. */
  align?: 'start' | 'end'
  /** Panel placement. 'bottom' (default) / 'top' / 'auto' (flip on overflow). */
  placement?: 'bottom' | 'top' | 'auto'
  /** Empty-state message when options is empty. */
  emptyMessage?: string
  'aria-label'?: string
}

/* ────────────────────────── Component ──────────────────────────── */

export function Combobox({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  searchable = true,
  searchValue,
  onSearchChange,
  loading = false,
  panelWidth,
  panelMaxHeight = 280,
  disabled = false,
  className,
  searchPlaceholder = 'Search…',
  align = 'start',
  placement = 'auto',
  emptyMessage = 'No results',
  'aria-label': ariaLabel,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [internalQuery, setInternalQuery] = useState('')
  const [focusIdx, setFocusIdx] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; maxH: number } | null>(null)

  const query = searchValue ?? internalQuery
  const setQuery = onSearchChange ?? setInternalQuery

  useClickOutside(panelRef, triggerRef, () => setOpen(false), open)

  // Filter options when searching locally
  const filtered = searchable && !onSearchChange
    ? options.filter((o) => {
        if (!query) return true
        const q = query.toLowerCase()
        return o.label.toLowerCase().includes(q) || (o.description?.toLowerCase().includes(q) ?? false)
      })
    : options

  const selected = options.find((o) => o.value === value) ?? null

  useEffect(() => {
    if (open) {
      setFocusIdx(Math.max(0, options.findIndex((o) => o.value === value)))
      // Focus search input after the panel mounts
      requestAnimationFrame(() => searchRef.current?.focus())
    } else {
      setInternalQuery('')
    }
  }, [open, options, value])

  // Position the panel under the trigger. The panel is portaled to
  // document.body, so viewport coordinates must be computed explicitly — a
  // `fixed` element with auto offsets otherwise renders at its static position
  // (off-screen, below #root) instead of beside the trigger. useLayoutEffect
  // runs before paint so there is no first-frame flash at the wrong location.
  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null)
      return
    }
    const baseMax = typeof panelMaxHeight === 'number' ? panelMaxHeight : 280
    const pw = panelWidth
      ? typeof panelWidth === 'number' ? panelWidth : triggerRef.current?.offsetWidth ?? 200
      : triggerRef.current?.offsetWidth ?? 200
    const margin = 4
    const position = () => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      let left = align === 'end' ? r.right - pw : r.left
      left = Math.max(margin, Math.min(left, vw - pw - margin))
      const spaceBelow = vh - r.bottom - margin
      const spaceAbove = r.top - margin
      // Resolve requested placement — explicit wins; 'auto' flips to whichever
      // side has more room, defaulting to bottom on a tie.
      let placeBelow: boolean
      if (placement === 'bottom') {
        placeBelow = true
      } else if (placement === 'top') {
        placeBelow = false
      } else {
        placeBelow = spaceBelow >= spaceAbove || spaceBelow >= baseMax
      }
      // Safety flip: if the chosen side has no room at all, fall back to the
      // other side rather than rendering off-screen.
      if (placeBelow && spaceBelow < 120 && spaceAbove >= 120) placeBelow = false
      else if (!placeBelow && spaceAbove < 120 && spaceBelow >= 120) placeBelow = true
      if (placeBelow) {
        const maxH = Math.max(120, Math.min(baseMax, spaceBelow))
        setPanelPos({ top: r.bottom + margin, left, maxH })
      } else {
        const maxH = Math.max(120, Math.min(baseMax, spaceAbove))
        setPanelPos({ top: Math.max(margin, r.top - margin - maxH), left, maxH })
      }
    }
    position()
    const reposition = () => position()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, panelWidth, panelMaxHeight, align, placement])

  const selectOption = (v: string) => {
    onChange(v)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusIdx((i) => (i + 1) % filtered.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusIdx((i) => (i - 1 + filtered.length) % filtered.length)
        break
      case 'Enter':
        e.preventDefault()
        if (filtered[focusIdx]) selectOption(filtered[focusIdx].value)
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  const triggerWidth = triggerRef.current?.offsetWidth ?? 0
  const style = panelWidth ? { width: panelWidth } : { width: triggerWidth }

  return (
    <div className={cn('relative inline-block w-full', className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || loading}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        className={cn(
          'inline-flex items-center justify-between w-full gap-2',
          'h-9 px-3 text-sm rounded-[var(--radius-md)]',
          'bg-[var(--surface-card)] border border-[var(--border-default)]',
          'text-[var(--text-primary)]',
          'transition-colors duration-150 cursor-pointer',
          'hover:border-[var(--border-strong)]',
          'focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          !selected && 'text-[var(--text-dim)]',
        )}
      >
        <span className="flex items-center gap-2 truncate min-w-0">
          {selected?.icon}
          <span className="truncate">{selected?.label ?? placeholder}</span>
        </span>
        <ChevronDown
          size={14}
          className={cn('flex-shrink-0 text-[var(--text-dim)] transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          role="listbox"
          aria-activedescendant={filtered[focusIdx]?.value}
          style={{ ...style, ...(panelPos ? { top: panelPos.top, left: panelPos.left, maxHeight: panelPos.maxH } : { maxHeight: panelMaxHeight }) }}
          className={cn(
            'fixed z-[1000]',
            'bg-[var(--surface-elevated)] border border-[var(--border-default)] rounded-[var(--radius-md)]',
            'shadow-[var(--shadow-lg)] overflow-hidden flex flex-col',
            'animate-combobox-in',
          )}
        >
          {searchable && (
            <div className="flex items-center gap-2 px-2.5 py-2 border-b border-[var(--border-subtle)]">
              <Search size={14} className="text-[var(--text-dim)] flex-shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:outline-none"
              />
              {query && (
                <IconButton
                  label="Clear search"
                  size="sm"
                  onClick={() => setQuery('')}
                  className="h-5 w-5"
                >
                  ×
                </IconButton>
              )}
            </div>
          )}

          <div
            className="overflow-y-auto py-1"
            style={{ maxHeight: (panelPos?.maxH ?? (typeof panelMaxHeight === 'number' ? panelMaxHeight : 280)) - (searchable ? 44 : 0) }}
          >
            {loading && (
              <div className="px-3 py-4 text-sm text-[var(--text-dim)] text-center">Loading…</div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="px-3 py-4 text-sm text-[var(--text-dim)] text-center">{emptyMessage}</div>
            )}
            {!loading && filtered.map((opt, i) => {
              const isSelected = opt.value === value
              const isFocused = i === focusIdx
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={opt.disabled}
                  onClick={() => !opt.disabled && selectOption(opt.value)}
                  onMouseEnter={() => setFocusIdx(i)}
                  className={cn(
                    'w-full flex items-start gap-2 px-3 py-1.5 text-left text-sm',
                    'text-[var(--text-primary)] cursor-pointer',
                    'transition-colors duration-75',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                    isFocused && 'bg-[var(--surface-hover)]',
                    isSelected && 'text-[var(--accent)]',
                  )}
                >
                  {opt.icon && <span className="flex-shrink-0 mt-0.5">{opt.icon}</span>}
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{opt.label}</span>
                    {opt.description && (
                      <span className="block text-xs text-[var(--text-dim)] truncate">
                        {opt.description}
                      </span>
                    )}
                  </span>
                  {isSelected && (
                    <Check size={14} className="flex-shrink-0 mt-0.5 text-[var(--accent)]" />
                  )}
                </button>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
