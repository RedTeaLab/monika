import { useRef, useEffect } from 'react'
import { useStore, TaskItem } from '../../store'

function StatusIcon({ status }: { status: TaskItem['status'] }) {
  switch (status) {
    case 'pending':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--text-dim)" strokeWidth="1">
          <circle cx="7" cy="7" r="5.5" />
        </svg>
      )
    case 'in_progress':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--text-dim)" strokeWidth="1">
          <circle cx="7" cy="7" r="5.5" />
          <circle cx="7" cy="7" r="2.5" fill="var(--green)" stroke="none" />
        </svg>
      )
    case 'completed':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--green)" strokeWidth="1.2">
          <circle cx="7" cy="7" r="5.5" />
          <path d="M4.5 7l2 2 3-4" stroke="var(--green)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'cancelled':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--text-dim)" strokeWidth="1" opacity={0.3}>
          <circle cx="7" cy="7" r="5.5" />
          <path d="M5 5l4 4M9 5l-4 4" stroke="var(--text-dim)" strokeWidth="1" strokeLinecap="round" />
        </svg>
      )
  }
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

export default function TodoPanel({ sessionId, collapsed, onToggle }: {
  sessionId: string
  collapsed: boolean
  onToggle: () => void
}) {
  const tasks = useStore((s) => (sessionId ? s.tasks[sessionId] : undefined))
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!collapsed || !listRef.current || !tasks || tasks.length === 0) return

    const scrollToTask = (taskId: string) => {
      const el = listRef.current?.querySelector(`[data-id="${taskId}"]`)
      if (el) {
        el.scrollIntoView({ block: 'nearest' })
        return true
      }
      return false
    }

    // 1. Prefer in_progress
    const activeEl = listRef.current.querySelector('[data-status="in_progress"]')
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
      return
    }

    // 2. Find last completed, then first pending after it
    let lastCompletedIdx = -1
    for (let i = 0; i < tasks.length; i++) {
      if (tasks[i].status === 'completed') {
        lastCompletedIdx = i
      }
    }
    if (lastCompletedIdx >= 0) {
      for (let i = lastCompletedIdx + 1; i < tasks.length; i++) {
        if (tasks[i].status === 'pending' && scrollToTask(tasks[i].id)) return
      }
    }

    // 3. Fallback to first pending
    const firstPending = tasks.find((t) => t.status === 'pending')
    if (firstPending && scrollToTask(firstPending.id)) return

    // 4. All done
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [tasks, collapsed])

  if (!sessionId || !tasks || tasks.length === 0) return null

  const completedCount = tasks.filter((t) => t.status === 'completed').length

  return (
    <div
      className="flex flex-col border-t border-[var(--border)]"
      style={{ background: 'var(--bg-sidebar)', maxHeight: collapsed ? undefined : '240px' }}
      role="list"
      aria-label="Task list"
    >
      <div
        className="px-[14px] py-[5px] text-[11px] uppercase tracking-wider font-semibold cursor-pointer select-none flex items-center gap-[6px]"
        style={{ color: 'var(--text-secondary)' }}
        onClick={onToggle}
      >
        <span style={{
          fontSize: '10px',
          transition: 'transform 0.15s',
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
        }}>▼</span>
        Todo
        <span style={{ fontWeight: 400, opacity: 0.6 }}>{completedCount}/{tasks.length}</span>
      </div>

      {!collapsed && (
        <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }} aria-live="polite">
          <span className="sr-only">{completedCount} of {tasks.length} tasks complete</span>
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
              rowStyle.background = 'var(--accent-muted)'
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
              rowStyle.borderLeft = '2px solid var(--accent)'
            }

            const statusLabel =
              task.status === 'in_progress' ? 'In progress:'
              : task.status === 'completed' ? 'Completed:'
              : task.status === 'cancelled' ? 'Cancelled:'
              : 'Pending:'

            return (
              <div key={task.id} role="listitem" style={rowStyle} title={task.subject} data-status={task.status} data-id={task.id}>
                <StatusIcon status={task.status} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span className="sr-only">{statusLabel} </span>
                  {task.subject}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
