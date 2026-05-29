import { useEffect, useRef, useCallback } from 'react'

export interface AcItem {
  name: string
  detail: string    // e.g. "system command", "file", "directory"
  icon: string      // single char or short text
  insert: string    // text to insert into input on selection
}

export interface AcState {
  open: boolean
  items: AcItem[]
  selectedIdx: number
  prefix: string    // trigger prefix: '$', '/', '@'
  query?: string    // current search query for highlight
}

interface Props {
  state: AcState
  onSelect: (item: AcItem) => void
  onClose: () => void
}

const MAX_ITEMS = 8

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
}

function AutocompleteDropdown({ state, onSelect, onClose }: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  // scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selected = listRef.current.children[state.selectedIdx] as HTMLElement | undefined
    if (selected) selected.scrollIntoView({ block: 'nearest' })
  }, [state.selectedIdx])

  // close on click outside
  const handleBlur = useCallback((e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      onClose()
    }
  }, [onClose])

  if (!state.open || state.items.length === 0) return null

  return (
    <div
      className="absolute z-50 rounded-md border shadow-lg overflow-hidden"
      style={{
        left: 0,
        right: 0,
        bottom: '100%',
        marginBottom: 4,
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
        maxHeight: `${MAX_ITEMS * 50 + 24}px`,
        animation: 'ac-enter 150ms ease-out',
      }}
      onBlur={handleBlur}
      tabIndex={-1}
    >
      <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: `${MAX_ITEMS * 50}px` }}>
        {state.items.slice(0, MAX_ITEMS).map((item, i) => (
          <div
            key={item.name}
            className="flex items-start gap-2 px-3 cursor-pointer"
            style={{
              minHeight: 36,
              padding: '6px 12px',
              background: i === state.selectedIdx ? 'var(--bg-active)' : 'transparent',
            }}
            onMouseDown={(e) => { e.preventDefault(); onSelect(item) }}
          >
            <span className="shrink-0 w-4 text-center text-[11px] mt-px" style={{ color: 'var(--text-dim)' }}>
              {item.icon}
            </span>
            <div className="flex-1 min-w-0">
              <div className="truncate text-[13px]" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {highlightMatch(item.name, state.query || '')}
              </div>
              {item.detail && (
                <div
                  className="truncate text-[11px]"
                  style={{ color: 'var(--text-dim)' }}
                  title={item.detail}
                >
                  {item.detail}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div
        className="text-[10px] px-3 border-t"
        style={{
          height: 24,
          lineHeight: '24px',
          color: 'var(--text-dim)',
          borderColor: 'var(--border)',
          background: 'var(--bg-sidebar)',
        }}
      >
        Tab or Enter to select · Esc to close
      </div>
    </div>
  )
}

export default AutocompleteDropdown
