import { useStore } from '../../store'
import { DEFAULT_LAYOUT } from '../Panel/defaultLayout'
import { applyLayoutSizes } from '../Panel/applyLayoutSizes'


const STORAGE_PREFIX = 'monika_layout_'

function StatusBar() {
  const generating = useStore((s) => s.generatingSessionIds.length > 0)
  const dockviewApi = useStore((s) => s.dockviewApi)
  const projectPath = useStore((s) => s.projectPath)
  const toggleSettings = useStore((s) => s.toggleSettings)

  const handleRestoreLayout = () => {
    if (!dockviewApi) return

    const baseKey = projectPath || 'default'
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(STORAGE_PREFIX) && key.endsWith(baseKey)) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key)
    }

    dockviewApi.fromJSON(DEFAULT_LAYOUT)
    applyLayoutSizes(dockviewApi)
  }

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
        <span className="text-[var(--text-secondary)]">
          {generating ? 'generating...' : 'ready'}
        </span>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        <button
          onClick={toggleSettings}
          title="Settings"
          className="flex items-center justify-center bg-transparent border-none cursor-pointer p-[2px] rounded-[var(--radius-sm)] text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <span className="text-[13px] leading-none">⚙</span>
        </button>
        <button
          onClick={handleRestoreLayout}
          title="Refresh layout"
          className="flex items-center justify-center bg-transparent border-none cursor-pointer p-[2px] rounded-[var(--radius-sm)] text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <span className="text-[13px] leading-none">↻</span>
        </button>
      </div>
    </div>
  )
}

export default StatusBar
