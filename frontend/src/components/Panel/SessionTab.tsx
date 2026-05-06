import { IDockviewPanelHeaderProps } from 'dockview'
import { useStore } from '../../store'
import { App } from '../../../bindings/monika'
import { logger } from '../../lib/logger'
import { IconPlus } from '../Icons'

export function SessionTab(props: IDockviewPanelHeaderProps) {
  const projectPath = useStore((s) => s.projectPath)
  const selectedModel = useStore((s) => s.selectedModel)
  const selectedProvider = useStore((s) => s.selectedProvider)
  const openSessionTab = useStore((s) => s.openSessionTab)
  const bumpSessionListVersion = useStore((s) => s.bumpSessionListVersion)

  const handleNewSession = async () => {
    if (!projectPath) return
    try {
      const info = await App.NewSession(projectPath, selectedProvider, selectedModel)
      if (!info) return
      bumpSessionListVersion()
      const title = info.title || 'Untitled'
      await openSessionTab(info.id, title)
    } catch (err) {
      logger.error('Failed to create session:', err)
    }
  }

  return (
    <div
      className="flex items-center gap-1 px-[16px] h-full text-[12px] select-none"
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      <span className="truncate flex-1">{props.api.title || 'SESSIONS'}</span>
      <button
        onClick={handleNewSession}
        className="w-5 h-5 flex items-center justify-center rounded text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
        aria-label="New session"
        id="new-session-btn"
      >
        <IconPlus size={12} />
      </button>
    </div>
  )
}
