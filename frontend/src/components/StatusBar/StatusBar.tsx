import { useStore } from '../../store'
import { IconSidebar, IconConsole, IconFolder, IconCode, IconCircle } from '../Icons'

interface StatusBarProps {
  showConsole: boolean; showFileTree: boolean; showSidebar: boolean
  onToggleConsole: () => void; onToggleFileTree: () => void; onToggleSidebar: () => void
}

const togClass = (active: boolean) =>
  `flex items-center justify-center bg-transparent border-none cursor-pointer p-[2px] rounded-[var(--radius-sm)] outline-none transition-colors ${active ? 'text-[var(--text-primary)]' : 'text-[var(--text-dim)]'} hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] focus-visible:shadow-[0_0_0_3px_var(--accent-muted)]`

function StatusBar({ showConsole, showFileTree, showSidebar, onToggleConsole, onToggleFileTree, onToggleSidebar }: StatusBarProps) {
  const generating = useStore((s) => s.generatingSessionId !== '')
  const activeFilePath = useStore((s) => s.activeFilePath)
  const openFiles = useStore((s) => s.openFiles)
  const setFileMode = useStore((s) => s.setFileMode)

  const activeFile = openFiles.find((f) => f.path === activeFilePath)
  const currentMode = activeFile?.mode || 'edit'

  return (
    <div
      className="flex items-center h-[28px] text-[11px] select-none border-t border-[var(--border)]"
      style={{ background: 'var(--bg-elevated)', padding: '0 14px' }}
    >
      <div className="flex items-center gap-2">
        <span
          className="block rounded-full"
          style={{
            width: 7, height: 7,
            background: generating ? 'var(--yellow)' : 'var(--green)',
            boxShadow: generating ? '0 0 6px rgba(212,168,67,0.5)' : '0 0 6px rgba(84,192,138,0.5)',
            animation: generating ? 'pulse 1.2s ease-in-out infinite' : undefined,
          }}
        />
        <span className="text-[var(--text-secondary)]">{generating ? 'generating...' : 'ready'}</span>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-0.5 rounded-[var(--radius-sm)]" style={{ background: 'var(--bg-main)', padding: '2px 4px' }}>
        <button onClick={onToggleSidebar} title="Sidebar" className={togClass(showSidebar)} aria-label="Toggle session sidebar">
          <IconSidebar size={13} />
        </button>
        <button onClick={onToggleConsole} title="Console" className={togClass(showConsole)} aria-label="Toggle console">
          <IconConsole size={13} />
        </button>
        <button onClick={onToggleFileTree} title="Files" className={togClass(showFileTree)} aria-label="Toggle file tree">
          <IconFolder size={13} />
        </button>
        <span className="text-[var(--border)] select-none mx-0.5">|</span>
        <button
          type="button"
          onClick={() => setFileMode(activeFilePath, currentMode === 'edit' ? 'diff' : 'edit')}
          className={togClass(true)}
          title={currentMode === 'edit' ? 'Diff mode (Ctrl+/)' : 'Edit mode (Ctrl+/)'}
          aria-label={currentMode === 'edit' ? 'Switch to diff mode' : 'Switch to edit mode'}
        >
          {currentMode === 'edit' ? <IconCode size={13} /> : <IconCircle size={13} />}
        </button>
      </div>
    </div>
  )
}

export default StatusBar
