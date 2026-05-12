import { useEffect, useState, useMemo, useCallback } from 'react'
import { IDockviewPanelProps } from 'dockview'
import { App, SessionInfo } from '../../../bindings/monika'
import { useStore } from '../../store'
import { IconTrash } from '../Icons'
import ConfirmModal from '../Chat/ConfirmModal'

function SessionList(props: IDockviewPanelProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionToDelete, setSessionToDelete] = useState<SessionInfo | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const projectPath = useStore((s) => s.projectPath)
  const sessionListVersion = useStore((s) => s.sessionListVersion)
  const sessionStatuses = useStore((s) => s.sessionStatuses)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const setActiveSessionId = useStore((s) => s.setActiveSessionId)
  const setMessages = useStore((s) => s.setMessages)
  const openSessionTab = useStore((s) => s.openSessionTab)

  useEffect(() => {
    if (!projectPath) return
    let cancelled = false
    App.ListSessions(projectPath)
      .then((result) => {
        if (!cancelled) setSessions(Array.isArray(result) ? result : [])
      })
      .catch(() => {
        if (!cancelled) setSessions([])
      })
    return () => { cancelled = true }
  }, [projectPath, sessionListVersion])

  // Dismiss modal when project changes
  useEffect(() => {
    setSessionToDelete(null)
  }, [projectPath])

  const sortedSessions = useMemo(() => {
    const list = Array.isArray(sessions) ? sessions : []
    return [...list].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }, [sessions])

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
    const state = useStore.getState()
    state.closeSessionTab(deletedId)
    // Also close the corresponding dockview panel
    state.dockviewApi?.getPanel(deletedId)?.api.close()
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
      style={{ background: 'var(--bg-sidebar)', padding: '0 12px' }}
    >
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
                background: activeSessionId === s.id ? 'var(--bg-active)' : hoveredId === s.id ? 'var(--bg-hover)' : 'transparent',
              }}
              onMouseEnter={() => setHoveredId(s.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <span className="flex items-center gap-1.5 truncate min-w-0">
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${(sessionStatuses[s.id] || s.status) === 'generating' ? 'motion-safe:animate-pulse' : ''}`}
                  style={{
                    background:
                      (sessionStatuses[s.id] || s.status) === 'generating' ? 'var(--accent)'
                      : (sessionStatuses[s.id] || s.status) === 'success' ? 'var(--green)'
                      : (sessionStatuses[s.id] || s.status) === 'failure' ? 'var(--red)'
                      : 'var(--text-dim)',
                    opacity: (sessionStatuses[s.id] || s.status) === 'generating' ? 1 : 0.6,
                  }}
                />
                <span className="truncate">{s.title || 'Untitled'}</span>
              </span>
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
