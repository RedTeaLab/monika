import { IDockviewPanelHeaderProps } from 'dockview'
import { useStore } from '../../store'
import { IconClose } from '../Icons'

export function ChatTab(props: IDockviewPanelHeaderProps) {
  const sessionStatuses = useStore((s) => s.sessionStatuses)
  const generatingSessionId = useStore((s) => s.generatingSessionId)

  const sessionId = props.api.id
  const status = generatingSessionId === sessionId
    ? 'generating'
    : sessionStatuses[sessionId] === 'failure'
      ? 'error'
      : sessionStatuses[sessionId] === 'success'
        ? 'completed'
        : 'idle'

  const title = props.api.title || 'Chat'

  return (
    <div className="flex items-center gap-1 px-[16px] h-full text-[12px] select-none"
      style={{ fontFamily: 'var(--font-sans)' }}>
      {/* Status indicator */}
      {status === 'generating' && (
        <span className="inline-block w-[6px] h-[6px] rounded-full flex-shrink-0 animate-pulse"
          style={{ backgroundColor: 'var(--yellow)' }} />
      )}
      {status === 'completed' && (
        <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--green)' }}>✓</span>
      )}
      {status === 'error' && (
        <span className="inline-block w-[6px] h-[6px] rounded-full flex-shrink-0"
          style={{ backgroundColor: 'var(--red)' }} />
      )}
      <span className="truncate flex-1">
        {title}
      </span>
      {/* Close button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          const state = useStore.getState()
          // Sync store state: close the session tab if it exists
          if (state.openSessions.some(s => s.id === sessionId)) {
            state.closeSessionTab(sessionId)
          }
          props.api.close()
        }}
        aria-label={`Close ${title}`}
        className="text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] w-4 h-4 flex items-center justify-center rounded flex-shrink-0 transition-colors"
      >
        <IconClose size={10} />
      </button>
    </div>
  )
}
