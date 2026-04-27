import { useState, useEffect } from 'react'
import { Window, Events, Application } from '@wailsio/runtime'
import { useStore } from '../../store'
import { IconMinimize, IconMaximize, IconClose, IconRestore } from '../Icons'

function TitleBar() {
  const projectPath = useStore((s) => s.projectPath)
  const branch = useStore((s) => s.branch)
  const [isMaximised, setIsMaximised] = useState(false)

  useEffect(() => {
    Window.IsMaximised().then(setIsMaximised)
    const un1 = Events.On('common:WindowMaximise', () => setIsMaximised(true))
    const un2 = Events.On('common:WindowUnMaximise', () => setIsMaximised(false))
    const un3 = Events.On('common:WindowRestore', () => setIsMaximised(false))
    return () => { un1(); un2(); un3() }
  }, [])

  const projectName = projectPath ? projectPath.split(/[/\\]/).pop() || projectPath : ''

  return (
    <div
      className="flex items-center h-[32px] backdrop-blur-md border-b border-[var(--border)] select-none"
      style={{
        '--wails-draggable': 'drag' as string,
        background: 'var(--glass-strong)',
        paddingLeft: '12px',
      } as React.CSSProperties}
    >
      <span className="text-[13px] font-semibold text-[var(--text-primary)] tracking-tight">Monika</span>
      <span className="text-[11px] text-[var(--text-dim)] ml-3">{projectName || 'project'}</span>
      <span className="text-[11px] text-[var(--text-dim)] ml-1.5">{branch || 'branch'}</span>
      <div className="flex-1" />
      <div style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties} className="flex h-full">
        <button
          onClick={() => Window.Minimise()}
          className="w-[40px] h-full flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] transition-colors"
          aria-label="Minimize"
        >
          <IconMinimize size={14} />
        </button>
        <button
          onClick={() => Window.ToggleMaximise()}
          className="w-[40px] h-full flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] transition-colors"
          aria-label={isMaximised ? 'Restore' : 'Maximize'}
        >
          {isMaximised ? <IconRestore size={13} /> : <IconMaximize size={13} />}
        </button>
        <button
          onClick={() => Application.Quit()}
          className="w-[40px] h-full flex items-center justify-center text-[var(--text-dim)] hover:text-white hover:bg-[var(--red)] transition-colors"
          aria-label="Close"
        >
          <IconClose size={14} />
        </button>
      </div>
    </div>
  )
}

export default TitleBar
