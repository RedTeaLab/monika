import { IDockviewPanelProps } from 'dockview'
import { App as MonikaApp } from '../../../bindings/monika'
import type { ChangeStat } from '../../../bindings/monika'
import { useStore } from '../../store'

function ChangesList(_props: IDockviewPanelProps) {
  const projectPath = useStore((s) => s.projectPath)
  const changes = useStore((s) => s.changeStats)
  const openFileTab = useStore((s) => s.openFileTab)
  const setFileMode = useStore((s) => s.setFileMode)

  const handleClick = async (stat: ChangeStat) => {
    try {
      const result = await MonikaApp.ReadFile(projectPath, stat.path)
      openFileTab(stat.path, result?.content || '')
    } catch {
      openFileTab(stat.path, '')
    }
    const dockApi = useStore.getState().dockviewApi
    if (dockApi) {
      const existing = dockApi.getPanel(stat.path)
      if (!existing) {
        dockApi.addPanel({
          id: stat.path,
          component: 'editor',
          tabComponent: 'editor-tab',
          title: stat.path.split('/').pop() || stat.path,
          params: { filePath: stat.path },
          position: { referenceGroup: 'editor-group' },
        })
        setFileMode(stat.path, 'diff')
      } else {
        existing.api.setActive()
        setFileMode(stat.path, 'diff')
      }
    }
  }

  const basename = (p: string) => p.split('/').pop() || p

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--bg-sidebar)', padding: '0 8px' }}
    >
      <div className="flex-1 overflow-y-auto">
        {changes.loading && changes.stats.length === 0 ? (
          <div className="py-4 text-[12px] text-[var(--text-dim)] px-1">Loading...</div>
        ) : changes.error && changes.stats.length === 0 ? (
          <div className="py-4 text-[12px] text-[var(--red)] px-1">{changes.error}</div>
        ) : changes.stats.length === 0 ? (
          <div className="py-4 text-[12px] text-[var(--text-dim)] px-1">No changes</div>
        ) : (
          changes.stats.map((stat) => (
            <div
              key={stat.path}
              className="flex items-center gap-1 cursor-pointer text-[13px] leading-[26px] rounded-md transition-colors mx-1 px-[6px]"
              style={{ color: 'var(--text-secondary)' }}
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
          ))
        )}
      </div>
    </div>
  )
}

export default ChangesList