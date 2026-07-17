import { useState, useMemo, useCallback, useEffect, KeyboardEvent } from 'react'
import { App } from '../../../bindings/monika'
import { useStore } from '../../store'
import Modal, { ModalHeader, ModalFooter } from '../ui/Modal'
import { Button, Input } from '../ui'

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
  }, [filtered, selectedIdx, onSelect, onCancel, allSessions])

  if (!open) return null

  return (
    <Modal onClose={onCancel} width={380}>
      <ModalHeader>
        <div className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          Forward to Session
        </div>
      </ModalHeader>

      <div className="px-5 py-3 border-b border-[var(--border)]">
        <Input
          type="text"
          placeholder="Search sessions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          inputSize="sm"
        />
      </div>

      <div className="flex-1 overflow-y-auto py-1 min-h-0">
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
              style={{ color: 'var(--text-primary)' }}
              onMouseEnter={() => setSelectedIdx(idx)}
            >
              {s.title || 'Untitled'}
            </button>
          ))
        )}
      </div>

      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </ModalFooter>
    </Modal>
  )
}
