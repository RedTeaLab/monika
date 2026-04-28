import { useStore } from '../../store'
import { IconCircle, IconSidebar, IconConsole, IconFile } from '../Icons'

interface StatusBarProps {
  showConsole: boolean; showFileTree: boolean; showSidebar: boolean
  onToggleConsole: () => void; onToggleFileTree: () => void; onToggleSidebar: () => void
}

function StatusBar({ showConsole, showFileTree, showSidebar, onToggleConsole, onToggleFileTree, onToggleSidebar }: StatusBarProps) {
  const generating = useStore((s) => s.generatingSessionId !== '')
  const tokenCount = useStore((s) => s.tokenCount)

  const iconClass = (active: boolean) =>
    `transition-colors hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] ${active ? 'text-[var(--text-primary)]' : 'text-[var(--text-dim)]'}`

  return (
    <div
      className="flex items-center h-[24px] text-[11px] select-none border-t border-[var(--border)] backdrop-blur-md"
      style={{ background: 'var(--glass-strong)', padding: '0 12px' }}
    >
      <div className="flex items-center gap-1.5">
        <span style={{ color: generating ? 'var(--yellow)' : 'var(--green)' }}>
          <IconCircle size={10} filled={!generating} />
        </span>
        <span className="text-[var(--text-secondary)]">{generating ? 'generating...' : 'ready'}</span>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className={iconClass(showSidebar)}
          aria-label="Toggle session sidebar"
        >
          <IconSidebar size={14} />
        </button>
        <button
          onClick={onToggleConsole}
          className={iconClass(showConsole)}
          aria-label="Toggle console"
        >
          <IconConsole size={14} />
        </button>
        <button
          onClick={onToggleFileTree}
          className={iconClass(showFileTree)}
          aria-label="Toggle file tree"
        >
          <IconFile size={14} />
        </button>
        <span className="text-[var(--text-dim)]">tok: {tokenCount}</span>
      </div>
    </div>
  )
}

export default StatusBar
