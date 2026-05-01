import { useState, useEffect, useCallback, useRef } from 'react'
import { IconClose, IconChevronDown } from '../Icons'

const MIN_TAB_WIDTH = 120
const MAX_TAB_WIDTH = 200
const MORE_BUTTON_WIDTH = 28
const TAB_BAR_HEIGHT = 36

interface TabData {
  key: string
  label: string
  dirty?: boolean
  status?: 'idle' | 'generating' | 'completed' | 'error'
}

interface TabBarProps {
  tabs: TabData[]
  activeKey: string
  onSelect: (key: string) => void
  onClose: (key: string) => void
  emptyLabel: string
}

function StatusIndicator({ status }: { status?: TabData['status'] }) {
  if (!status || status === 'idle') return null
  if (status === 'generating') {
    return (
      <span className="inline-block w-[6px] h-[6px] rounded-full mr-1 flex-shrink-0 animate-pulse"
        style={{ backgroundColor: 'var(--yellow)' }} />
    )
  }
  if (status === 'completed') {
    return <span className="text-[10px] mr-1 flex-shrink-0" style={{ color: 'var(--green)' }}>✓</span>
  }
  if (status === 'error') {
    return (
      <span className="inline-block w-[6px] h-[6px] rounded-full mr-1 flex-shrink-0"
        style={{ backgroundColor: 'var(--red)' }} />
    )
  }
  return null
}

function TabBar({ tabs, activeKey, onSelect, onClose, emptyLabel }: TabBarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const [overflowKeys, setOverflowKeys] = useState<string[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // ResizeObserver — set up once, read latest tabs from ref
  const calcRef = useRef<() => void>(() => {})

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const calc = () => {
      const current = tabsRef.current
      if (current.length === 0) {
        setOverflowKeys((prev) => (prev.length === 0 ? prev : []))
        return
      }
      const containerWidth = el.clientWidth
      let used = 0
      const overflow: string[] = []

      current.forEach((tab) => {
        if (used + MIN_TAB_WIDTH + (overflow.length > 0 ? MORE_BUTTON_WIDTH : 0) <= containerWidth) {
          used += MIN_TAB_WIDTH
        } else {
          overflow.push(tab.key)
        }
      })

      setOverflowKeys((prev) => {
        if (prev.length === overflow.length && prev.every((k, i) => k === overflow[i])) return prev
        return overflow
      })
    }
    calcRef.current = calc

    calc()
    const ro = new ResizeObserver(() => calcRef.current())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Recalculate when tabs change
  useEffect(() => {
    calcRef.current()
  }, [tabs])

  // Click outside to close
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const handleMenuKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setMenuOpen(false); containerRef.current?.focus() }
  }, [])

  if (tabs.length === 0) {
    return (
      <div className="flex items-center px-3 py-1 border-b border-[var(--border)] flex-shrink-0"
        style={{ height: TAB_BAR_HEIGHT }}>
        <span className="text-[12px] text-[var(--text-dim)]">{emptyLabel}</span>
      </div>
    )
  }

  return (
    <div ref={containerRef}
      className="flex items-end border-b border-[var(--border)] flex-shrink-0 overflow-x-hidden bg-[var(--bg-elevated)]"
      style={{ height: TAB_BAR_HEIGHT }}>
      <div className="flex items-end overflow-hidden" role="tablist" aria-orientation="horizontal">
        {tabs.filter(t => !overflowKeys.includes(t.key)).map((tab) => {
          const isActive = tab.key === activeKey
          return (
            <div key={tab.key}
              role="tab"
              aria-selected={isActive}
              aria-label={`${tab.label}${tab.dirty ? ' (unsaved)' : ''}${tab.status === 'generating' ? ' (generating)' : ''}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelect(tab.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(tab.key) }
                else if (e.key === 'w' && e.ctrlKey) { e.preventDefault(); onClose(tab.key) }
              }}
              className="flex items-center gap-1 px-[16px] cursor-pointer transition-colors border-r border-[var(--border)] select-none flex-shrink-0"
              style={{
                minWidth: MIN_TAB_WIDTH, maxWidth: MAX_TAB_WIDTH, height: TAB_BAR_HEIGHT - 1,
                color: isActive ? 'var(--text-primary)' : 'var(--text-dim)',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              }}>
              <StatusIndicator status={tab.status} />
              <span className="text-[12px] truncate flex-1">{tab.label}</span>
              {tab.dirty && (
                <span className="text-[8px] flex-shrink-0" style={{ color: 'var(--text-dim)' }}>●</span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onClose(tab.key) }}
                aria-label={`Close ${tab.label}`}
                className="text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] w-4 h-4 flex items-center justify-center rounded flex-shrink-0 transition-colors"
                style={{ opacity: isActive ? 1 : 0 }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.opacity = '1' }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.opacity = '0' }}>
                <IconClose size={10} />
              </button>
            </div>
          )
        })}
      </div>
      {overflowKeys.length > 0 && (
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center justify-center h-full text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors"
            style={{ width: MORE_BUTTON_WIDTH }}
          >
            <IconChevronDown size={12} />
          </button>
          {menuOpen && (
            <div ref={menuRef} role="menu" onKeyDown={handleMenuKey}
              className="absolute right-0 top-full bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-[var(--radius-md)] shadow-lg z-50 min-w-[160px]"
              style={{ maxHeight: 400, overflowY: 'auto' }}>
              {tabs.filter(t => overflowKeys.includes(t.key)).map((tab) => (
                <div key={tab.key} role="menuitem"
                  onClick={() => { onSelect(tab.key); setMenuOpen(false) }}
                  className="flex items-center gap-1 px-3 py-1.5 cursor-pointer text-[12px] hover:bg-[var(--bg-hover)] transition-colors"
                  style={{ color: tab.key === activeKey ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  <StatusIndicator status={tab.status} />
                  <span className="flex-1 truncate">{tab.label}</span>
                  {tab.key === activeKey && <span className="text-[10px]" style={{ color: 'var(--accent)' }}>✓</span>}
                  {tab.dirty && <span className="text-[8px] flex-shrink-0" style={{ color: 'var(--text-dim)' }}>●</span>}
                  <button
                    onClick={(e) => { e.stopPropagation(); onClose(tab.key) }}
                    aria-label={`Close ${tab.label}`}
                    className="text-[var(--text-dim)] hover:text-[var(--text-primary)] w-4 h-4 flex items-center justify-center rounded flex-shrink-0 transition-colors ml-1">
                    <IconClose size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default TabBar
export type { TabData }
