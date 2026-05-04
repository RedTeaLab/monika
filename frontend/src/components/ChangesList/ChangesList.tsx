import { useState, useEffect } from 'react'
import { IDockviewPanelProps } from 'dockview'
import { App } from '../../../bindings/monika'
import type { ChangeStat } from '../../../bindings/monika'
import { useStore } from '../../store'

function ChangesList(_props: IDockviewPanelProps) {
  const [changes, setChanges] = useState<ChangeStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const projectPath = useStore((s) => s.projectPath)
  const fileTreeVersion = useStore((s) => s.fileTreeVersion)
  const openFileTab = useStore((s) => s.openFileTab)
  const setFileMode = useStore((s) => s.setFileMode)

  useEffect(() => {
    if (!projectPath) return
    let cancelled = false
    setLoading(true)
    App.ListChangeStats(projectPath)
      .then((stats) => {
        if (!cancelled) {
          setChanges(Array.isArray(stats) ? stats : [])
          setError('')
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load changes')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [projectPath, fileTreeVersion])

  const handleClick = async (stat: ChangeStat) => {
    try {
      const result = await App.ReadFile(projectPath, stat.path)
      openFileTab(stat.path, result?.content || '')
    } catch {
      openFileTab(stat.path, '')
    }
    setFileMode(stat.path, 'diff')
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
      } else {
        existing.api.setActive()
        // Force diff mode even if file already open
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
        {loading && changes.length === 0 ? (
          <div className="py-4 text-[12px] text-[var(--text-dim)] px-1">Loading...</div>
        ) : error && changes.length === 0 ? (
          <div className="py-4 text-[12px] text-[var(--red)] px-1">{error}</div>
        ) : changes.length === 0 ? (
          <div className="py-4 text-[12px] text-[var(--text-dim)] px-1">No changes</div>
        ) : (
          changes.map((stat) => (
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
