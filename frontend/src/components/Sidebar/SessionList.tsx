import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { IDockviewPanelProps } from 'dockview'
import { App, SessionInfo } from '../../../bindings/monika'
import { useStore } from '../../store'
import { IconTrash, IconPlus, IconPin, IconInbox } from '../Icons'
import { logger } from '../../lib/logger'
import ConfirmModal from '../Chat/ConfirmModal'

export function deriveStatus(sessionId: string, s: SessionInfo, generatingIds: string[], sessionStatuses: Record<string, string>): string {
  if (generatingIds.includes(sessionId)) return 'generating'
  const st = sessionStatuses[sessionId] || s.status
  if (st === 'generating') return 'generating'
  if (st === 'pending') return 'pending'
  if (st === 'archived' || st === 'completed' || st === 'success' || st === 'failure' || st === 'stopped') return 'archived'
  return 'idle'
}

function SessionList(props: IDockviewPanelProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionToDelete, setSessionToDelete] = useState<SessionInfo | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const projectPath = useStore((s) => s.projectPath)
  const sessionListVersion = useStore((s) => s.sessionListVersion)
  const sessionStatuses = useStore((s) => s.sessionStatuses)
  const generatingSessionIds = useStore((s) => s.generatingSessionIds)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const setActiveSessionId = useStore((s) => s.setActiveSessionId)
  const setMessages = useStore((s) => s.setMessages)
  const openSessionTab = useStore((s) => s.openSessionTab)
  const openSessions = useStore((s) => s.openSessions)
  const selectedModel = useStore((s) => s.selectedModel)
  const selectedProvider = useStore((s) => s.selectedProvider)
  const bumpSessionListVersion = useStore((s) => s.bumpSessionListVersion)
  const renameSession = useStore((s) => s.renameSession)

  const handleStartEdit = (s: SessionInfo, e: React.MouseEvent) => {
    e.stopPropagation()
    const st = deriveStatus(s.id, s, generatingSessionIds, sessionStatuses)
    if (st === 'generating') return
    setEditingId(s.id)
    setEditTitle(s.title || '')
  }

  const handleFinishEdit = async () => {
    const targetId = editingId
    const newTitle = editTitle.trim()
    setEditingId(null)
    setEditTitle('')
    if (targetId && newTitle) {
      setSessions((prev) => prev.map((s) => s.id === targetId ? { ...s, title: newTitle } : s))
      try {
        await renameSession(targetId, newTitle)
      } catch (err) {
        logger.error('Failed to rename session:', err)
      }
    }
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleFinishEdit()
    } else if (e.key === 'Escape') {
      setEditingId(null)
      setEditTitle('')
    }
  }

  const handleNewSession = async () => {
    if (!projectPath) return
    try {
      const info = await App.NewSession(projectPath, selectedProvider, selectedModel)
      if (!info) return
      bumpSessionListVersion()
      const title = info.title || 'Untitled'
      await openSessionTab(info.id, title)
    } catch (err) {
      logger.error('Failed to create session:', err)
    }
  }

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

  // Auto-open most recent session on first load
  const didAutoOpen = useRef(false)
  useEffect(() => {
    if (!projectPath || sessions.length === 0) return
    if (didAutoOpen.current) return
    if (activeSessionId && openSessions.some((s) => s.id === activeSessionId)) return
    const sorted = [...sessions].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    didAutoOpen.current = true
    openSessionTab(sorted[0].id, sorted[0].title || 'Untitled')
  }, [projectPath, sessions])

  // Dismiss modal when project changes
  useEffect(() => {
    setSessionToDelete(null)
  }, [projectPath])

  const groupedSessions = useMemo(() => {
    const list = Array.isArray(sessions) ? sessions : []
    const sorted = [...list].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    const pinned: SessionInfo[] = []
    const generating: SessionInfo[] = []
    const pending: SessionInfo[] = []
    const idle: SessionInfo[] = []
    const archived: SessionInfo[] = []
    for (const s of sorted) {
      if (s.pinned) {
        pinned.push(s)
        continue
      }
      const st = deriveStatus(s.id, s, generatingSessionIds, sessionStatuses)
      if (st === 'generating') generating.push(s)
      else if (st === 'pending') pending.push(s)
      else if (st === 'archived') archived.push(s)
      else idle.push(s)
    }
    return [
      { label: 'Pinned', items: pinned },
      { label: 'Active', items: generating },
      { label: 'Not Started', items: idle },
      { label: 'Pending', items: pending },
      { label: 'Archived', items: archived, defaultCollapsed: true },
    ].filter((g) => g.items.length > 0)
  }, [sessions, sessionStatuses, generatingSessionIds])

  const totalSessions = sessions.length

  const toggleGroup = (label: string, defaultCollapsed?: boolean) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (defaultCollapsed) {
        const expandKey = 'expanded:' + label
        if (next.has(expandKey)) { next.delete(expandKey) } else { next.add(expandKey) }
      } else {
        if (next.has(label)) next.delete(label)
        else next.add(label)
      }
      return next
    })
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

  const handlePin = async (s: SessionInfo, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!projectPath) return
    try {
      await App.SetSessionPinned(projectPath, s.id, !s.pinned)
      bumpSessionListVersion()
    } catch (err) {
      logger.error('Failed to pin/unpin session:', err)
    }
  }

  const handleArchive = async (s: SessionInfo, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!projectPath) return
    try {
      await App.ArchiveSession(projectPath, s.id)
      bumpSessionListVersion()
    } catch (err) {
      logger.error('Failed to archive session:', err)
    }
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--bg-sidebar)' }}
    >
      <div
        className="flex items-center gap-1.5 text-[12px] select-none shrink-0"
        style={{ fontFamily: 'var(--font-sans)', padding: '6px 10px', background: 'var(--bg-sidebar)' }}
      >
        <span className="truncate min-w-0">SESSIONS</span>
        <div className="flex-1" />
        <button
          onClick={handleNewSession}
          className="w-5 h-5 flex items-center justify-center rounded text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          aria-label="New session"
          id="new-session-btn"
        >
          <IconPlus size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-[12px]">
        {totalSessions === 0 ? (
          <div className="py-4">
            <div className="text-[12px] text-[var(--text-dim)]">No sessions yet</div>
            <div className="text-[12px] text-[var(--text-dim)] mt-0.5">Click + to create one</div>
          </div>
        ) : (
          groupedSessions.map((group) => {
            const collapsed = collapsedGroups.has(group.label) || ('defaultCollapsed' in group && group.defaultCollapsed && !collapsedGroups.has('expanded:' + group.label))
            return (
              <div key={group.label}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleGroup(group.label, 'defaultCollapsed' in group && (group as any).defaultCollapsed)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleGroup(group.label, 'defaultCollapsed' in group && (group as any).defaultCollapsed) }}
                  className="flex items-center gap-1 text-[11px] text-[var(--text-dim)] px-2 pt-3 pb-1 select-none font-medium uppercase tracking-wider cursor-pointer hover:text-[var(--text-secondary)] transition-colors"
                >
                  <span className={`inline-block transition-transform ${collapsed ? '' : 'rotate-90'}`}>
                    &#9654;
                  </span>
                  <span>{group.label}</span>
                  <span className="ml-auto">{group.items.length}</span>
                </div>
                {!collapsed && group.items.map((s) => {
                  const st = deriveStatus(s.id, s, generatingSessionIds, sessionStatuses)
                  return (
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
                          className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${st === 'generating' ? 'motion-safe:animate-pulse' : ''}`}
                          style={{
                            background:
                              st === 'generating' ? 'var(--accent)'
                              : st === 'pending' ? 'var(--yellow)'
                              : st === 'archived' ? 'var(--text-dim)'
                              : 'var(--text-dim)',
                            opacity: st === 'generating' ? 1 : 0.6,
                          }}
                        />
                        <span className="truncate">{editingId === s.id
                          ? <input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onBlur={handleFinishEdit}
                              onKeyDown={handleEditKeyDown}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                              className="w-full bg-transparent border-b border-[var(--border)] text-[13px] px-1 py-0 outline-none"
                              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}
                              maxLength={40}
                            />
                          : <span onDoubleClick={(e) => handleStartEdit(s, e)}>{s.title || 'Untitled'}</span>
                        }</span>
                      </span>
                      <span className="flex items-center gap-1 flex-shrink-0 ml-1">
                        <button
                          onClick={(e) => handlePin(s, e)}
                          aria-label={s.pinned ? 'Unpin session' : 'Pin session'}
                          className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-[var(--text-dim)] hover:text-[var(--yellow)] transition-colors"
                          title={s.pinned ? 'Unpin' : 'Pin'}
                        >
                          <IconPin size={12} filled={s.pinned} />
                        </button>
                        {st !== 'archived' && (
                          <button
                            onClick={(e) => handleArchive(s, e)}
                            aria-label="Archive session"
                            className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-[var(--text-dim)] hover:text-[var(--text-secondary)] transition-colors"
                            title="Archive"
                          >
                            <IconInbox size={12} />
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDeleteClick(s, e)}
                          aria-label={`Delete ${s.title || 'session'}`}
                          className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-[var(--text-dim)] hover:text-[var(--red)] transition-colors"
                        >
                          <IconTrash size={14} />
                        </button>
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })
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
