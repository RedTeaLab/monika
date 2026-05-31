import { useState, useMemo, useCallback, useEffect, KeyboardEvent } from 'react'
import { useStore } from '../../store'

interface SessionPickerProps {
  open: boolean
  onSelect: (sessionId: string) => void
  onCancel: () => void
  excludeSessionId?: string
}

export default function SessionPicker({ open, onSelect, onCancel, excludeSessionId }: SessionPickerProps) {
  const [search, setSearch] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const openSessions = useStore((s) => s.openSessions)

  const filtered = useMemo(() => {
    if (!open) return []
    return openSessions.filter((s) => {
      if (s.id === excludeSessionId) return false
      if (!search) return true
      return s.title.toLowerCase().includes(search.toLowerCase())
    })
  }, [openSessions, search, excludeSessionId, open])

  // Reset index when search changes
  useEffect(() => {
    setSelectedIdx(0)
  }, [search])

  const handleSelect = useCallback((id: string) => {
    onSelect(id)
  }, [onSelect])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((prev) => Math.min(prev + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && filtered.length > 0) {
      e.preventDefault()
      onSelect(filtered[selectedIdx].id)
    }
  }, [filtered, selectedIdx, onSelect, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="rounded-lg p-4 min-w-[320px] max-w-[440px] max-h-[60vh] flex flex-col"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="text-[13px] font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Forward to Session
        </div>
        <input
          type="text"
          placeholder="Search sessions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          className="text-[13px] px-3 py-1.5 rounded-md mb-3 outline-none border"
          style={{
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            borderColor: 'var(--border)',
          }}
        />
        <div className="flex-1 overflow-y-auto flex flex-col gap-0.5">
          {filtered.length === 0 ? (
            <div className="text-[12px] py-4 text-center" style={{ color: 'var(--text-dim)' }}>
              No sessions found
            </div>
          ) : (
            filtered.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => handleSelect(s.id)}
                className={`text-left text-[13px] px-3 py-2 rounded-md transition-colors truncate cursor-pointer ${
                  idx === selectedIdx ? 'bg-[var(--bg-hover)]' : ''
                }`}
                style={{
                  color: 'var(--text-primary)',
                  background: idx === selectedIdx ? 'var(--bg-hover)' : undefined,
                }}
              >
                {s.title || 'Untitled'}
              </button>
            ))
          )}
        </div>
        <div className="flex justify-end mt-3">
          <button
            onClick={onCancel}
            className="text-[12px] font-semibold uppercase tracking-[0.04em] px-3 py-1.5 rounded hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            style={{ color: 'var(--text-dim)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
