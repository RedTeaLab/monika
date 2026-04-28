import { useRef } from 'react'
import { IconClose } from '../Icons'

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

  if (tabs.length === 0) {
    return (
      <div className="flex items-center px-3 py-1 border-b border-[var(--border)] flex-shrink-0"
        style={{ background: 'var(--glass-strong)', height: 36 }}>
        <span className="text-[12px] text-[var(--text-dim)]">{emptyLabel}</span>
      </div>
    )
  }

  return (
    <div ref={containerRef}
      className="flex items-end border-b border-[var(--border)] flex-shrink-0 overflow-x-auto"
      style={{ background: 'var(--glass-strong)', height: 36 }}
      role="tablist" aria-orientation="horizontal">
      {tabs.map((tab) => {
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
            className="flex items-center gap-1 px-2 cursor-pointer transition-colors border-r border-[var(--border)] select-none flex-shrink-0"
            style={{
              minWidth: 120, maxWidth: 200, height: 35,
              background: isActive ? 'var(--bg-main)' : 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}>
            <StatusIndicator status={tab.status} />
            <span className="text-[12px] truncate flex-1">{tab.label}</span>
            {tab.dirty && (
              <span className="text-[8px] flex-shrink-0" style={{ color: 'var(--text-dim)' }}>●</span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(tab.key) }}
              aria-label={`Close ${tab.label}`}
              className="text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] w-4 h-4 flex items-center justify-center rounded flex-shrink-0 transition-colors"
              style={{ opacity: isActive ? 1 : 0 }}
              onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.opacity = '1' }}
              onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.opacity = '0' }}>
              <IconClose size={10} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default TabBar
export type { TabData }
