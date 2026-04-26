import { Window } from '@wailsio/runtime'
import { useStore } from '../../store'

function TitleBar() {
  const projectPath = useStore((s) => s.projectPath)
  const branch = useStore((s) => s.branch)

  const projectName = projectPath ? projectPath.split(/[/\\]/).pop() || projectPath : ''

  return (
    <div
      className="flex items-center gap-4 h-[30px] bg-[var(--bg-titlebar)] border-b border-[var(--border)] select-none"
      style={{ '--wails-draggable': 'drag' as string, paddingLeft: '10px' } as React.CSSProperties}
    >
      <div className="text-[13px] font-semibold text-[var(--text-primary)]">Monika</div>
      <div className="text-[11px] text-[var(--text-secondary)]">{projectName || 'project'}</div>
      <div className="text-[11px] text-[var(--text-secondary)]">{branch || 'branch'}</div>
      <div className="flex-1" />
      <div style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties} className="flex h-full">
        <button
          onClick={() => Window.Minimise()}
          className="w-[46px] h-full flex items-center justify-center hover:bg-[#3e3e40] text-[13px] text-[var(--text-primary)]"
        >─</button>
        <button
          onClick={() => Window.Maximise()}
          className="w-[46px] h-full flex items-center justify-center hover:bg-[#3e3e40] text-[13px] text-[var(--text-primary)]"
        >□</button>
        <button
          onClick={() => Window.Close()}
          className="w-[46px] h-full flex items-center justify-center hover:bg-[#e81123] text-[13px] text-[var(--text-primary)] hover:text-white"
        >✕</button>
      </div>
    </div>
  )
}

export default TitleBar
