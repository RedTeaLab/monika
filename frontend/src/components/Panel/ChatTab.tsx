import { IDockviewPanelHeaderProps } from 'dockview'
import { useStore } from '../../store'
import { deriveStatus } from '../Sidebar/SessionList'

export function ChatTab(props: IDockviewPanelHeaderProps) {
  const sessionStatuses = useStore((s) => s.sessionStatuses)
  const generatingSessionIds = useStore((s) => s.generatingSessionIds)
  const openSessions = useStore((s) => s.openSessions)
  const activeSessionId = useStore((s) => s.activeSessionId)

  const sessionId = activeSessionId || 'chat'
  const storeSession = openSessions.find((s) => s.id === sessionId)
  const status = storeSession
    ? deriveStatus(storeSession.id, { id: storeSession.id, title: '', status: '', updated_at: '' } as any, generatingSessionIds, sessionStatuses)
    : ''

  const title = storeSession?.title || 'CHAT'

  const dotColor =
    status === 'generating' ? 'var(--accent)'
    : status === 'pending' ? 'var(--yellow)'
    : 'var(--text-dim)'

  const showDot = sessionId !== 'chat'

  return (
    <div
      className="flex items-center gap-1.5 h-full text-[12px] select-none"
      style={{ fontFamily: 'var(--font-sans)', padding: '0 10px' }}
    >
      {showDot && (
        <span
          className={`inline-block w-[7px] h-[7px] rounded-full flex-shrink-0 ${status === 'generating' ? 'motion-safe:animate-pulse' : ''}`}
          style={{
            backgroundColor: dotColor,
            opacity: status === 'generating' ? 1 : 0.6,
          }}
        />
      )}
      <span className="truncate flex-1 min-w-0">{title}</span>
    </div>
  )
}