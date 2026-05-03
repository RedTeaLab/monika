import { useState, useEffect, useRef } from 'react'
import { IDockviewPanelHeaderProps } from 'dockview'
import { useStore } from '../../store'
import { IconClose, IconDots } from '../Icons'

export function EditorTab(props: IDockviewPanelHeaderProps) {
  const filePath = props.api.id
  const file = useStore((s) => s.openFiles.find((f) => f.path === filePath))
  const setFileMode = useStore((s) => s.setFileMode)

  const title = filePath.split('/').pop() || filePath.split('\\').pop() || filePath
  const isDirty = file?.isDirty || false

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

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

      {/* More menu */}
      <div className="relative flex-shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
          aria-label="More options"
          className="text-[var(--text-dim)] hover:text-[var(--text-primary)] w-4 h-4 flex items-center justify-center rounded transition-colors"
        >
          <IconDots size={12} />
        </button>
        {menuOpen && (
          <div ref={menuRef}
            className="absolute right-0 top-full mt-1 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-[var(--radius-md)] shadow-lg z-50 min-w-[130px]"
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                setFileMode(filePath, 'edit')
                setMenuOpen(false)
              }}
              className="block w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--bg-hover)] transition-colors"
              style={{ color: file?.mode !== 'diff' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
            >
              Edit View
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setFileMode(filePath, 'diff')
                setMenuOpen(false)
              }}
              className="block w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--bg-hover)] transition-colors"
              style={{ color: file?.mode === 'diff' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
            >
              Diff View
            </button>
          </div>
        )}
      </div>

      {/* Close button */}
      <button
        onClick={(e) => { e.stopPropagation(); handleClose() }}
        aria-label={`Close ${title}`}
        className="text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] w-4 h-4 flex items-center justify-center rounded flex-shrink-0 transition-colors"
      >
        <IconClose size={10} />
      </button>
    </div>
  )
}
