import { useStore, TaskItem } from '../../store'

const STATUS_ICONS: Record<string, string> = {
  pending: '⏳',
  in_progress: '🔄',
  completed: '✅',
  cancelled: '❌',
}

function computeDepth(task: TaskItem, allTasks: TaskItem[]): number {
  if (!task.blockedBy || task.blockedBy.length === 0) return 0
  let maxDepth = 0
  for (const depId of task.blockedBy) {
    const dep = allTasks.find((t) => t.id === depId)
    if (dep) {
      maxDepth = Math.max(maxDepth, 1 + computeDepth(dep, allTasks))
    }
  }
  return Math.min(maxDepth, 3)
}

export default function TodoPanel() {
  const activeSessionId = useStore((s) => s.activeSessionId)
  const tasks = useStore((s) => (activeSessionId ? s.tasks[activeSessionId] : undefined))

  if (!activeSessionId || !tasks || tasks.length === 0) return null

  const completedCount = tasks.filter((t) => t.status === 'completed').length

  return (
    <div
      className="flex flex-col border-t border-[var(--border)]"
      style={{ maxHeight: '40%', overflowY: 'auto' }}
      role="list"
      aria-label="Task list"
    >
      <div
        className="px-3 py-2 text-[11px] uppercase tracking-wider font-semibold"
        style={{ opacity: 0.6 }}
      >
        Todo
      </div>
      <div aria-live="polite" className="sr-only">
        {completedCount} of {tasks.length} tasks complete
      </div>
      {tasks.map((task) => {
        const depth = computeDepth(task, tasks)
        const allDepsDone =
          task.blockedBy &&
          task.blockedBy.length > 0 &&
          task.blockedBy.every((depId) => {
            const dep = tasks.find((t) => t.id === depId)
            return dep && (dep.status === 'completed' || dep.status === 'cancelled')
          })

        let rowStyle: React.CSSProperties = {
          paddingLeft: `${8 + depth * 16}px`,
          paddingRight: '8px',
          paddingTop: '4px',
          paddingBottom: '4px',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }

        if (task.status === 'in_progress') {
          rowStyle.background = 'var(--accent-bg, rgba(137,180,250,0.15))'
        }
        if (task.status === 'completed') {
          rowStyle.textDecoration = 'line-through'
          rowStyle.opacity = 0.6
        }
        if (task.status === 'cancelled') {
          rowStyle.textDecoration = 'line-through'
          rowStyle.opacity = 0.3
        }
        if (allDepsDone && task.status === 'pending') {
          rowStyle.borderLeft = '2px solid var(--accent, #89b4fa)'
        }

        const statusLabel =
          task.status === 'in_progress'
            ? 'In progress:'
            : task.status === 'completed'
            ? 'Completed:'
            : task.status === 'cancelled'
            ? 'Cancelled:'
            : 'Pending:'

        return (
          <div key={task.id} role="listitem" style={rowStyle} title={task.subject}>
            <span aria-hidden="true">{STATUS_ICONS[task.status] || STATUS_ICONS.pending}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span className="sr-only">{statusLabel} </span>
              {task.subject}
            </span>
          </div>
        )
      })}
    </div>
  )
}
