# TodoPanel Relocate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move TodoPanel from sidebar to ChatArea above ChatInput with collapsible behavior and SVG wireframe icons.

**Architecture:** Four-file change — store foundation first, then TodoPanel rewrite with collapse/SVG, then ChatArea insertion, finally sidebar removal. Purely frontend; zero Go changes.

**Tech Stack:** React + TypeScript, Zustand store, Tailwind CSS (via CSS variables)

---

### Task 1: Add `todoCollapsed` state to Zustand store

**Files:**
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: Add `todoCollapsed` and `setTodoCollapsed` to the `AppState` interface**

Find the `tasks: Record<string, TaskItem[]>` line (~line 76). Add after it:

```typescript
todoCollapsed: Record<string, boolean>
```

Find the `setSessionTasks` setter line (~line 113). Add after it:

```typescript
setTodoCollapsed: (sessionId: string, collapsed: boolean) => void
```

- [ ] **Step 2: Add initial value**

Find `tasks: {}` in the `create` call initial state (~line 153). Add after it:

```typescript
todoCollapsed: {},
```

- [ ] **Step 3: Add setter implementation**

Find the `setSessionTasks` implementation (~line 424). Add after it:

```typescript
setTodoCollapsed: (sessionId, collapsed) =>
  set((s) => ({ todoCollapsed: { ...s.todoCollapsed, [sessionId]: collapsed } })),
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat: add todoCollapsed state to store"
```

---

### Task 2: Rewrite TodoPanel with SVG icons and collapse support

**Files:**
- Modify: `frontend/src/components/TodoPanel/TodoPanel.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
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

export default function TodoPanel({ collapsed, onToggle }: {
  collapsed: boolean
  onToggle: () => void
}) {
  const activeSessionId = useStore((s) => s.activeSessionId)
  const tasks = useStore((s) => (activeSessionId ? s.tasks[activeSessionId] : undefined))

  if (!activeSessionId || !tasks || tasks.length === 0) return null

  const completedCount = tasks.filter((t) => t.status === 'completed').length

  return (
    <div
      className="flex flex-col border-t border-[var(--border)]"
      style={{ background: 'var(--bg-sidebar)', maxHeight: collapsed ? undefined : '120px' }}
      role="list"
      aria-label="Task list"
    >
      <div
        className="px-[14px] py-[5px] text-[11px] uppercase tracking-wider font-semibold cursor-pointer select-none flex items-center gap-[6px]"
        style={{ color: 'var(--text-dim)' }}
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
        <div style={{ overflowY: 'auto', flex: 1 }} aria-live="polite">
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
              task.status === 'in_progress' ? 'In progress:'
              : task.status === 'completed' ? 'Completed:'
              : task.status === 'cancelled' ? 'Cancelled:'
              : 'Pending:'

            return (
              <div key={task.id} role="listitem" style={rowStyle} title={task.subject}>
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TodoPanel/TodoPanel.tsx
git commit -m "feat: rewrite TodoPanel with SVG icons and collapse support"
```

---

### Task 3: Insert TodoPanel into ChatArea

**Files:**
- Modify: `frontend/src/components/Chat/ChatArea.tsx`

- [ ] **Step 1: Add TodoPanel import**

Find the existing imports (~line 6). Add after `import ChatInput from './ChatInput'`:

```typescript
import TodoPanel from '../TodoPanel/TodoPanel'
```

- [ ] **Step 2: Read collapse state from store and insert TodoPanel**

In the `ChatArea` function body, find where `hasActiveSession` is defined (~line 78). Add after it:

```typescript
const todoCollapsed = useStore((s) => s.todoCollapsed)
const setTodoCollapsed = useStore((s) => s.setTodoCollapsed)
const isTodoCollapsed = todoCollapsed[activeSessionId] || false
```

Find the `{hasActiveSession && (` block containing `<ChatInput` (~line 135). Insert `<TodoPanel />` between the messages scroll div's closing `</div>` and the `<ChatInput` block:

The current structure is:
```typescript
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        ...
      </div>
      {hasActiveSession && (
        <ChatInput ... />
      )}
```

Change to:
```typescript
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        ...
      </div>
      <TodoPanel
        collapsed={isTodoCollapsed}
        onToggle={() => setTodoCollapsed(activeSessionId, !isTodoCollapsed)}
      />
      {hasActiveSession && (
        <ChatInput ... />
      )}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Chat/ChatArea.tsx
git commit -m "feat: insert TodoPanel into ChatArea above ChatInput"
```

---

### Task 4: Remove TodoPanel from sidebar

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Remove TodoPanel import**

Find `import TodoPanel from './components/TodoPanel/TodoPanel'` (~line 4). Delete this line.

- [ ] **Step 2: Remove TodoPanel usage**

Find the `<TodoPanel />` element inside the sidebar div (~line 95). Delete this line:

```typescript
                  <TodoPanel />
```

This is the line between `<SessionList />` and `</div>` in the sidebar section.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "refactor: remove TodoPanel from sidebar"
```

---

### Task 5: Verify and build

**Files:** None (verification only)

- [ ] **Step 1: Build frontend**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Verify git status is clean**

Run: `git status`
Expected: Working tree clean (all changes committed).

- [ ] **Step 3: Run full build (Go + frontend)**

Run: `cd d:/git/monika && go build ./...`
Expected: Build succeeds.
