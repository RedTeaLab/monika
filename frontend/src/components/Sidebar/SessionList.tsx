import { useEffect, useState, useMemo, useCallback } from 'react'
import { App, SessionInfo } from '../../../bindings/monika'
import { useStore } from '../../store'
import { IconPlus, IconTrash } from '../Icons'
import ConfirmModal from '../Chat/ConfirmModal'

function SessionList() {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionToDelete, setSessionToDelete] = useState<SessionInfo | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const projectPath = useStore((s) => s.projectPath)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const sessionListVersion = useStore((s) => s.sessionListVersion)
  const setActiveSessionId = useStore((s) => s.setActiveSessionId)
  const setMessages = useStore((s) => s.setMessages)
  const openSessionTab = useStore((s) => s.openSessionTab)

  useEffect(() => {
    if (!projectPath) return
    App.ListSessions(projectPath).then(setSessions).catch(() => setSessions([]))
  }, [projectPath, sessionListVersion])

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
      await openSessionTab(info.id, info.title || 'Untitled')
    } catch (err) {
      console.error('Failed to create session:', err)
    }
  }

  const handleSelect = async (id: string) => {
    const session = sessions.find((s) => s.id === id)
    const title = session?.title || 'Untitled'
    await openSessionTab(id, title)
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
    useStore.getState().closeSessionTab(deletedId)
    setSessionToDelete(null)

    // Compute remaining sessions
    let remaining: SessionInfo[] = []
    setSessions((prev) => {
      remaining = prev.filter((s) => s.id !== deletedId)
      return remaining
    })

    if (deletedId === activeSessionId) {
      const newActiveId = useStore.getState().activeSessionId
      if (newActiveId) {
        document.getElementById(`session-${newActiveId}`)?.focus()
      } else {
        setMessages([])
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
      className="flex flex-col h-full"
      style={{ background: 'var(--bg-sidebar)', padding: '0 14px' }}
    >
      <div className="flex items-center justify-between pt-5 pb-2">
        <span className="text-[10px] font-semibold text-[var(--text-dim)] tracking-[0.06em] uppercase">Sessions</span>
        <button
          onClick={handleNewSession}
          className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
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
              className="group flex justify-between items-center py-1 px-2 cursor-pointer text-[13px] truncate leading-[26px] rounded-md transition-colors focus-visible:shadow-[0_0_0_3px_var(--accent-muted)] outline-none"
              style={{
                color: activeSessionId === s.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: activeSessionId === s.id ? 'var(--bg-active)' : hoveredId === s.id ? 'var(--bg-hover)' : 'transparent',
              }}
              onMouseEnter={() => setHoveredId(s.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <span className="truncate">{s.title || 'Untitled'}</span>
              <button
                onClick={(e) => handleDeleteClick(s, e)}
                aria-label={`Delete ${s.title || 'session'}`}
                className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 w-5 h-5 flex items-center justify-center rounded text-[var(--text-dim)] hover:text-[var(--red)] hover:bg-[rgba(224,96,96,0.12)] transition-all flex-shrink-0 ml-2"
              >
                <IconTrash size={13} />
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
