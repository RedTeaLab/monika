import { IDockviewPanelHeaderProps } from 'dockview'
import { useStore } from '../../store'
import { IconClose } from '../Icons'

export function EditorTab(props: IDockviewPanelHeaderProps) {
  const filePath = props.api.id
  const file = useStore((s) => s.openFiles.find((f) => f.path === filePath))

  const isDefaultPanel = props.api.id === 'editor'
  const title = isDefaultPanel
    ? (props.api.title || 'EDITOR')
    : (filePath.split('/').pop() || filePath.split('\\').pop() || filePath)
  const isDirty = file?.isDirty || false

  const handleClose = () => {
    if (isDirty && !window.confirm(`Close "${title}" without saving?`)) {
      return
    }
    useStore.getState().closeFileTab(filePath)
    props.api.close()
  }

  return (
    <div className="flex items-center gap-1 px-[16px] h-full text-[12px] select-none"
      style={{ fontFamily: 'var(--font-sans)' }}>
      {isDirty && (
        <span className="text-[8px] flex-shrink-0" style={{ color: 'var(--text-dim)' }}>●</span>
      )}
      <span className="truncate flex-1">{title}</span>

      {!isDefaultPanel && (
        <button
          onClick={(e) => { e.stopPropagation(); handleClose() }}
          aria-label={`Close ${title}`}
          className="text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] w-4 h-4 flex items-center justify-center rounded flex-shrink-0 transition-colors"
        >
          <IconClose size={10} />
        </button>
      )}
    </div>
  )
}
