import { useState, useMemo, useCallback, useEffect, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { App } from '../../../bindings/monika'
import { useStore } from '../../store'

interface SessionPickerProps {
  open: boolean
  onSelect: (sessionId: string, sessions: { id: string; title: string }[]) => void
  onCancel: () => void
  excludeSessionId?: string
}

export default function SessionPicker({ open, onSelect, onCancel, excludeSessionId }: SessionPickerProps) {
  const [search, setSearch] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [allSessions, setAllSessions] = useState<{ id: string; title: string }[]>([])

  useEffect(() => {
    if (!open) return
    setSearch('')
    setSelectedIdx(0)
    const project = useStore.getState().projectPath
    if (!project) return
    App.ListSessions(project).then((sessions) => {
      setAllSessions(sessions.map(s => ({ id: s.id, title: s.title })))
    }).catch(() => {})
  }, [open])

  const filtered = useMemo(() => {
    if (!open) return []
    let list = allSessions.filter((s) => s.id !== excludeSessionId)
    if (search) {
      list = list.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()))
    } else {
      list = list.slice(0, 5)
    }
    return list
  }, [allSessions, search, excludeSessionId, open])

  useEffect(() => {
    setSelectedIdx(0)
  }, [search])

  const handleSelect = useCallback((id: string) => {
    onSelect(id, allSessions)
  }, [onSelect, allSessions])

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
      onSelect(filtered[selectedIdx].id, allSessions)
    }
  }, [filtered, selectedIdx, onSelect, onCancel])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop-enter"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="modal-panel-enter flex flex-col bg-[var(--bg-elevated)] rounded-[var(--radius-lg)] border border-[var(--border-strong)] overflow-hidden"
        style={{ width: 380, maxHeight: '85vh', boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)' }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              Forward to Session
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-b border-[var(--border)]">
          <input
            type="text"
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            className="w-full text-[13px] px-3 py-1.5 rounded-md outline-none border"
            style={{
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border)',
            }}
          />
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="text-[12px] py-6 text-center" style={{ color: 'var(--text-dim)' }}>
              No sessions found
            </div>
          ) : (
            filtered.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => handleSelect(s.id)}
                className={`w-full text-left text-[13px] px-5 py-2 transition-colors truncate cursor-pointer ${
                  idx === selectedIdx ? 'bg-[var(--bg-hover)]' : ''
                }`}
                style={{
                  color: 'var(--text-primary)',
                }}
                onMouseEnter={() => setSelectedIdx(idx)}
              >
                {s.title || 'Untitled'}
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border)]" style={{ background: 'rgba(0,0,0,0.15)' }}>
          <button
            onClick={onCancel}
            className="px-3.5 py-1.5 text-[12px] font-medium rounded-md transition-all duration-150 cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
