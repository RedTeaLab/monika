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

  const isPlaceholder = filePath === 'editor'
  const hasSiblings = isPlaceholder && (props.api.group?.panels.length ?? 0) > 1

  const handleClose = () => {
    if (isDirty && !window.confirm(`Close "${title}" without saving?`)) {
      return
    }
    useStore.getState().closeFileTab(filePath)
    props.api.close()
  }

  return (
    <div
      className={`group flex items-center gap-1.5 h-full text-[12px] select-none transition-colors duration-150${hasSiblings ? ' pointer-events-none opacity-40' : ''}`}
      style={{ fontFamily: 'var(--font-sans)', padding: '0 10px' }}
    >
      {isDirty && (
        <span className="text-[8px] flex-shrink-0 leading-none" style={{ color: 'var(--text-dim)' }}>
          ●
        </span>
      )}
      <span className="truncate flex-1 min-w-0">{title}</span>
      {!isDefaultPanel && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleClose()
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
