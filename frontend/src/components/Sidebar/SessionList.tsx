import { useEffect, useState } from 'react'
import { App, SessionInfo } from '../../../bindings/monika'
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
    <div className="flex flex-col h-full bg-[var(--bg-sidebar)]">
      <div className="flex items-center justify-between px-5 pt-4 pb-1">
        <span className="text-[11px] font-semibold text-[var(--text-secondary)] tracking-[0.05em] uppercase">Sessions</span>
        <button
          onClick={handleNewSession}
          className="w-5 h-5 flex items-center justify-center rounded-[3px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] text-[14px] leading-none"
        >+</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="px-5 py-4 text-[12px] text-[var(--text-dim)]">No sessions yet</div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => handleSelect(s.id)}
              className={`px-5 py-[2px] cursor-pointer text-[13px] truncate leading-[22px] hover:bg-[var(--bg-hover)] ${activeSessionId === s.id ? 'bg-[var(--bg-active)]' : ''}`}
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
