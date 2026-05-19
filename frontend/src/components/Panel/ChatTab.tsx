import { IDockviewPanelHeaderProps } from 'dockview'
import { useStore } from '../../store'
import { IconClose } from '../Icons'

export function ChatTab(props: IDockviewPanelHeaderProps) {
  const sessionStatuses = useStore((s) => s.sessionStatuses)
  const generatingSessionIds = useStore((s) => s.generatingSessionIds)
  const openSessions = useStore((s) => s.openSessions)

  const sessionId = props.api.id
  const status = generatingSessionIds.includes(sessionId)
    ? 'generating'
    : sessionStatuses[sessionId] === 'failure'
      ? 'error'
      : sessionStatuses[sessionId] === 'success'
        ? 'completed'
        : 'idle'

  const storeTitle = openSessions.find((s) => s.id === sessionId)?.title
  const title = storeTitle || props.api.title || 'CHAT'

  return (
    <div
      className="group flex items-center gap-1.5 h-full text-[12px] select-none transition-colors duration-150 max-w-[172px]"
      style={{ fontFamily: 'var(--font-sans)', padding: '0 10px' }}
    >
      {/* Status indicator */}
      {status === 'generating' && (
        <span
          className="inline-block w-[7px] h-[7px] rounded-full flex-shrink-0 animate-pulse"
          style={{ backgroundColor: 'var(--yellow)', boxShadow: '0 0 5px var(--yellow)' }}
        />
      )}
      {status === 'completed' && (
        <span className="text-[10px] flex-shrink-0 leading-none" style={{ color: 'var(--green)' }}>
          ✓
        </span>
      )}
      {status === 'error' && (
        <span
          className="inline-block w-[7px] h-[7px] rounded-full flex-shrink-0"
          style={{ backgroundColor: 'var(--red)' }}
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
