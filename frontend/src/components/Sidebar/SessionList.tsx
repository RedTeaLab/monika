import { useEffect, useState } from 'react'
import { App, SessionInfo } from '../../bindings/monika'
import { useStore } from '../../store'

function SessionList() {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const projectPath = useStore((s) => s.projectPath)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const setActiveSessionId = useStore((s) => s.setActiveSessionId)

  useEffect(() => {
    if (!projectPath) return
    App.ListSessions(projectPath).then(setSessions).catch(() => setSessions([]))
  }, [projectPath])

  const handleNewSession = async () => {
    if (!projectPath) return
    try {
      const info = await App.NewSession(projectPath)
      setSessions((prev) => [...prev, info])
      setActiveSessionId(info.id)
    } catch (err) {
      console.error('Failed to create session:', err)
    }
  }

  const handleSelect = (id: string) => {
    setActiveSessionId(id)
  }

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-secondary)]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]">
        <span className="text-xs font-semibold text-[var(--color-text-dim)]">SESSIONS</span>
        <button onClick={handleNewSession} className="text-xs text-[var(--color-accent)] hover:text-white">+</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="px-3 py-4 text-xs text-[var(--color-text-dim)] text-center">No sessions yet</div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className={`px-3 py-2 cursor-pointer text-xs truncate hover:bg-[var(--color-bg-tertiary)] ${activeSessionId === s.id ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-accent)]' : ''}`}
              onClick={() => handleSelect(s.id)}
            >
              {s.title || 'Untitled'}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default SessionList
