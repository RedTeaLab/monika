import { IDockviewPanelHeaderProps } from 'dockview'
import { useStore } from '../../store'
import { IconClose } from '../Icons'
import { deriveStatus } from '../Sidebar/SessionList'

export function ChatTab(props: IDockviewPanelHeaderProps) {
  const sessionStatuses = useStore((s) => s.sessionStatuses)
  const generatingSessionIds = useStore((s) => s.generatingSessionIds)
  const openSessions = useStore((s) => s.openSessions)

  const sessionId = props.api.id
  const status = deriveStatus(sessionId, { id: sessionId, title: '', status: '', updated_at: '' } as any, generatingSessionIds, sessionStatuses)

  const storeTitle = openSessions.find((s) => s.id === sessionId)?.title
  const title = storeTitle || props.api.title || 'CHAT'

  const dotColor =
    status === 'generating' ? 'var(--accent)'
    : status === 'failure' ? 'var(--red)'
    : status === 'stopped' ? 'var(--yellow)'
    : 'var(--green)'

  const isPlaceholder = sessionId === 'chat'
  const hasSiblings = isPlaceholder && (props.api.group?.panels.length ?? 0) > 1

  return (
    <div
      className={`group flex items-center gap-1.5 h-full text-[12px] select-none transition-colors duration-150 max-w-[172px]${hasSiblings ? ' pointer-events-none opacity-40' : ''}`}
      style={{ fontFamily: 'var(--font-sans)', padding: '0 10px' }}
    >
      {!isPlaceholder && (
        <span
          className={`inline-block w-[7px] h-[7px] rounded-full flex-shrink-0 ${status === 'generating' ? 'motion-safe:animate-pulse' : ''}`}
          style={{
            backgroundColor: dotColor,
            opacity: status === 'generating' ? 1 : 0.6,
          }}
        />
      )}
      <span className="truncate flex-1 min-w-0">{title}</span>
      {sessionId !== 'chat' && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            const state = useStore.getState()
            if (state.openSessions.some((s) => s.id === sessionId)) {
              state.closeSessionTab(sessionId)
            }
            props.api.close()
          }}
          aria-label={`Close ${title}`}
          className="opacity-0 group-hover:opacity-100 text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] w-4 h-4 flex items-center justify-center rounded flex-shrink-0 transition-all duration-100"
        >
          <IconClose size={10} />
        </button>
      )}
    </div>
  )
}
