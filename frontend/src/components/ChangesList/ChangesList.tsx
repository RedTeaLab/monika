import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { IDockviewPanelProps } from 'dockview'
import { App as MonikaApp } from '../../../bindings/monika'
import type { ChangeStat } from '../../../bindings/monika'
import { useStore } from '../../store'
import { IconFile } from '../Icons'

function ChangesList(_props: IDockviewPanelProps) {
  const projectPath = useStore((s) => s.projectPath)
  const changes = useStore((s) => s.changeStats)
  const setPreviewDiff = useStore((s) => s.setPreviewDiff)
  const setPreviewFile = useStore((s) => s.setPreviewFile)
  const setRevealFilePath = useStore((s) => s.setRevealFilePath)
  const selectedPath = useStore((s) => s.preview.mode === 'diff' ? s.preview.filePath : null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    const onClick = () => setContextMenu(null)
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [contextMenu])

  const handleClick = async (stat: ChangeStat) => {
    try {
      const result = await MonikaApp.GetFileDiff(projectPath, stat.path)
      const fileName = stat.path.split('/').pop() || stat.path
      if (result && result.lines) {
        setPreviewDiff(stat.path, fileName, result.lines)
      }
    } catch {
      // ignore
    }
  }

  const handleViewSource = async (path: string) => {
    try {
      const fileName = path.split('/').pop() || path
      const result = await MonikaApp.ReadFile(projectPath, path)
      setPreviewFile(path, fileName, result?.content || '')
      setRevealFilePath(path)
    } catch {
      // ignore
    }
  }

  const handleContextMenu = (e: React.MouseEvent, path: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, path })
  }

  const renderContextMenu = () => {
    if (!contextMenu) return null
    return createPortal(
      <div
        ref={menuRef}
        className="fixed"
        style={{
          left: contextMenu.x,
          top: contextMenu.y,
          zIndex: 2000,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '4px 0',
          minWidth: '200px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          fontSize: '12px',
          fontFamily: 'var(--font-sans)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-2.5 px-3 py-[5px] cursor-pointer transition-colors rounded-sm mx-1"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
          onClick={() => { setContextMenu(null); handleViewSource(contextMenu.path) }}
        >
          <span className="flex-shrink-0 flex items-center" style={{ opacity: 0.7, width: 14 }}><IconFile size={14} /></span>
          <span>View Source File</span>
        </div>
      </div>,
      document.body
    )
  }

  const basenameFn = (p: string) => p.split('/').pop() || p

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--bg-sidebar)' }}
    >
      <div
        className="flex items-center gap-1.5 text-[12px] select-none shrink-0"
        style={{ fontFamily: 'var(--font-sans)', padding: '6px 10px', background: 'var(--bg-sidebar)' }}
      >
        <span className="truncate min-w-0">CHANGES</span>
      </div>
      <div className="flex-1 overflow-y-auto" style={{ padding: '0 8px' }}>
        {changes.loading && changes.stats.length === 0 ? (
          <div className="py-4 text-[12px] text-[var(--text-dim)] px-1">Loading...</div>
        ) : changes.error && changes.stats.length === 0 ? (
          <div className="py-4 text-[12px] text-[var(--red)] px-1">{changes.error}</div>
        ) : changes.stats.length === 0 ? (
          <div className="py-4 text-[12px] text-[var(--text-dim)] px-1">No changes</div>
        ) : (
          changes.stats.map((stat) => {
            const active = selectedPath === stat.path
            return (
              <div
                key={stat.path}
                className="flex items-center gap-1 cursor-pointer text-[13px] leading-[26px] rounded-md transition-colors duration-100 mx-1 px-[6px]"
                style={{
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: active ? 'var(--bg-active)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = active ? 'var(--bg-active)' : 'transparent'
                }}
                onClick={() => handleClick(stat)}
                onContextMenu={(e) => handleContextMenu(e, stat.path)}
                title={stat.path}
              >
                <span className="truncate flex-1">{basenameFn(stat.path)}</span>
                {stat.added > 0 && (
                  <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--green)' }}>
                    +{stat.added}
                  </span>
                )}
                {stat.deleted > 0 && (
                  <span className="text-[11px] flex-shrink-0 ml-0.5" style={{ color: 'var(--red)' }}>
                    -{stat.deleted}
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>

      {renderContextMenu()}
    </div>
  )
}

export default ChangesList