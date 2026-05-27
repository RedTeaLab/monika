import { IDockviewPanelProps } from 'dockview'
import { App as MonikaApp } from '../../../bindings/monika'
import type { ChangeStat } from '../../../bindings/monika'
import { useStore } from '../../store'

function ChangesList(_props: IDockviewPanelProps) {
  const projectPath = useStore((s) => s.projectPath)
  const changes = useStore((s) => s.changeStats)
  const setPreviewDiff = useStore((s) => s.setPreviewDiff)
  const selectedPath = useStore((s) => s.preview.mode === 'diff' ? s.preview.filePath : null)

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

  const basename = (p: string) => p.split('/').pop() || p

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
                  background: active ? 'rgba(75,125,219,0.10)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = active ? 'rgba(75,125,219,0.10)' : 'transparent'
                }}
                onClick={() => handleClick(stat)}
                title={stat.path}
              >
                <span className="truncate flex-1">{basename(stat.path)}</span>
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
    </div>
  )
}

export default ChangesList