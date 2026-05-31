import { useState } from 'react'
import { useStore } from '../../store'

interface SessionPickerProps {
  open: boolean
  onSelect: (sessionId: string) => void
  onCancel: () => void
  excludeSessionId?: string
}

export default function SessionPicker({ open, onSelect, onCancel, excludeSessionId }: SessionPickerProps) {
  const [search, setSearch] = useState('')
  const openSessions = useStore((s) => s.openSessions)

  if (!open) return null

  const filtered = openSessions.filter((s) => {
    if (s.id === excludeSessionId) return false
    if (!search) return true
    return s.title.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onCancel}
    >
      <div
        className="rounded-lg p-4 min-w-[320px] max-w-[440px] max-h-[60vh] flex flex-col"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[13px] font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Forward to Session
        </div>
        <input
          type="text"
          placeholder="Search sessions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
            filtered.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className="text-left text-[13px] px-3 py-2 rounded-md hover:bg-[var(--bg-hover)] transition-colors truncate cursor-pointer"
                style={{ color: 'var(--text-primary)' }}
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
