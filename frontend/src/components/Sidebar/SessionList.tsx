import { useState } from 'react'

interface SessionItem {
  id: string
  title: string
  updatedAt: string
}

function SessionList() {
  const [sessions] = useState<SessionItem[]>([])
  const [activeId, setActiveId] = useState<string>()

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-secondary)]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]">
        <span className="text-xs font-semibold text-[var(--color-text-dim)]">SESSIONS</span>
        <button className="text-xs text-[var(--color-accent)] hover:text-white">+</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="px-3 py-4 text-xs text-[var(--color-text-dim)] text-center">No sessions yet</div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className={`px-3 py-2 cursor-pointer text-xs truncate hover:bg-[var(--color-bg-tertiary)] ${activeId === s.id ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-accent)]' : ''}`}
              onClick={() => setActiveId(s.id)}
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
