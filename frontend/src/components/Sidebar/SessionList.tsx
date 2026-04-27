import { useEffect, useState, useMemo, useCallback } from 'react'
import { App, SessionInfo } from '../../../bindings/monika'
import { useStore, loadSessionMessages } from '../../store'
import { IconPlus, IconTrash } from '../Icons'
import ConfirmModal from '../Chat/ConfirmModal'

function SessionList() {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionToDelete, setSessionToDelete] = useState<SessionInfo | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const projectPath = useStore((s) => s.projectPath)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const setActiveSessionId = useStore((s) => s.setActiveSessionId)
  const setMessages = useStore((s) => s.setMessages)

  useEffect(() => {
    if (!projectPath) return
    App.ListSessions(projectPath).then(setSessions).catch(() => setSessions([]))
  }, [projectPath])

  // Dismiss modal when project changes
  useEffect(() => {
    setSessionToDelete(null)
  }, [projectPath])

  const sortedSessions = useMemo(() =>
    [...sessions].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [sessions]
  )

  const handleNewSession = async () => {
    if (!projectPath) return
    try {
      const info = await App.NewSession(projectPath)
      setSessions((prev) => [info, ...prev])
      setActiveSessionId(info.id)
      setMessages([])
    } catch (err) {
      console.error('Failed to create session:', err)
    }
  }

  const handleSelect = async (id: string) => {
    setActiveSessionId(id)
    if (!projectPath) return
    try {
      const s = await App.LoadSession(projectPath, id)
      if (s.messages && s.messages.length > 0) {
        setMessages(loadSessionMessages(s.messages as any[]))
      } else {
        setMessages([])
      }
    } catch (err) {
      console.error('Failed to load session:', err)
    }
  }

  const handleDeleteClick = (s: SessionInfo, e: React.MouseEvent) => {
    e.stopPropagation()
    setSessionToDelete(s)
  }

  const handleDeleteCancel = () => {
    setSessionToDelete(null)
  }

  const handleDeleteConfirm = useCallback(async () => {
    if (!projectPath || !sessionToDelete) return
    await App.DeleteSession(projectPath, sessionToDelete.id)
    const deletedId = sessionToDelete.id
    setSessionToDelete(null)

    // Compute remaining sessions
    let remaining: SessionInfo[] = []
    setSessions((prev) => {
      remaining = prev.filter((s) => s.id !== deletedId)
      return remaining
    })

    if (deletedId === activeSessionId) {
      const sorted = [...remaining].sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )
      if (sorted.length > 0) {
        const nearest = sorted[0]
        setActiveSessionId(nearest.id)
        try {
          const s = await App.LoadSession(projectPath, nearest.id)
          if (s.messages && s.messages.length > 0) {
            setMessages(loadSessionMessages(s.messages as any[]))
          } else {
            setMessages([])
          }
          document.getElementById(`session-${nearest.id}`)?.focus()
        } catch {
          setMessages([])
          setActiveSessionId('')
          document.getElementById('new-session-btn')?.focus()
        }
      } else {
        setMessages([])
        setActiveSessionId('')
        document.getElementById('new-session-btn')?.focus()
      }
    }
  }, [projectPath, sessionToDelete, activeSessionId, setActiveSessionId, setMessages])

  const handleRowKeyDown = (s: SessionInfo, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSelect(s.id)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      setSessionToDelete(s)
    }
  }

  return (
    <div
      className="flex flex-col h-full backdrop-blur-md"
      style={{ background: 'var(--glass-light)', padding: '0 12px' }}
    >
      <div className="flex items-center justify-between pt-5 pb-2">
        <span className="text-[10px] font-semibold text-[var(--text-dim)] tracking-[0.06em] uppercase">Sessions</span>
        <button
          onClick={handleNewSession}
          className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] transition-colors"
          aria-label="New session"
          id="new-session-btn"
        >
          <IconPlus size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sortedSessions.length === 0 ? (
          <div className="py-4">
            <div className="text-[12px] text-[var(--text-dim)]">No sessions yet</div>
            <div className="text-[12px] text-[var(--text-dim)] mt-0.5">Click + to create one</div>
          </div>
        ) : (
          sortedSessions.map((s) => (
            <div
              key={s.id}
              id={`session-${s.id}`}
              onClick={() => handleSelect(s.id)}
              onKeyDown={(e) => handleRowKeyDown(s, e)}
              tabIndex={0}
              role="button"
              aria-label={`Select ${s.title || 'session'}`}
              className="group flex justify-between items-center py-1 px-2 cursor-pointer text-[13px] truncate leading-[26px] rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]"
              style={{
                color: activeSessionId === s.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: activeSessionId === s.id ? 'var(--glass-active)' : hoveredId === s.id ? 'var(--glass-hover)' : 'transparent',
              }}
              onMouseEnter={() => setHoveredId(s.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <span className="truncate">{s.title || 'Untitled'}</span>
              <button
                onClick={(e) => handleDeleteClick(s, e)}
                aria-label={`Delete ${s.title || 'session'}`}
                className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-[var(--text-dim)] hover:text-[var(--red)] transition-colors flex-shrink-0 ml-2"
              >
                <IconTrash size={14} />
              </button>
            </div>
          ))
        )}
      </div>
      {sessionToDelete && (
        <ConfirmModal
          title="Delete Session"
          message={`Delete "${sessionToDelete.title || 'Untitled'}"? This cannot be undone.`}
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
        />
      )}
    </div>
  )
}

export default SessionList
