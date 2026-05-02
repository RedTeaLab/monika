# TodoPanel Relocate Design

**Date:** 2026-05-02
**Goal:** Move TodoPanel from the left sidebar to the ChatArea, positioned between the message list and ChatInput, with collapsible behavior and wireframe status icons.

## 1. Layout Change

```
Before:                          After:
┌──────────┬─────────────────┐   ┌──────────┬─────────────────┐
│ Sidebar  │ ChatArea         │   │ Sidebar  │ ChatArea         │
│ Sessions │  TabBar          │   │ Sessions │  TabBar          │
│          │  Messages        │   │          │  Messages        │
│ TodoPanel│  ChatInput       │   │          │  TodoPanel       │
└──────────┴─────────────────┘   │          │  ChatInput       │
                                 └──────────┴─────────────────┘
```

TodoPanel moves from sidebar bottom to ChatArea, between the messages container and ChatInput. It is visually separate from both — bordered like the input area (`border-top: 1px solid var(--border)`, `background: var(--bg-sidebar)`).

## 2. TodoPanel Behavior

- **No tasks → not rendered.** Identical to current behavior (`if (!tasks || tasks.length === 0) return null`).
- **Max height 120px** with `overflow-y: auto` for internal scroll.
- **Collapsible:** Clicking the header row toggles collapse. When collapsed, only the header row is visible. When expanded, the task list renders below.
- **Collapse state persisted per session** via `todoCollapsed: Record<string, boolean>` in Zustand store. Switching sessions preserves each session's collapse preference. State lives in memory only (not persisted to backend JSON).

## 3. Status Icons

Replace emoji with wireframe SVG icons (14×14 viewport):

| Status | Icon | Color |
|--------|------|-------|
| pending | Empty circle | `var(--text-dim)` |
| in_progress | Empty circle + solid green dot center | circle: `var(--text-dim)`, dot: `var(--green)` |
| completed | Circle + checkmark | `var(--green)` |
| cancelled | Circle + X (both dimmed) | `var(--text-dim)` at 0.3 opacity |

Icons replace the `STATUS_ICONS` emoji map in TodoPanel.tsx.

## 4. Files Changed

| File | Change |
|------|--------|
| `frontend/src/App.tsx` | Remove `<TodoPanel />` from sidebar (line 95) |
| `frontend/src/components/Chat/ChatArea.tsx` | Insert `<TodoPanel />` between messages div and ChatInput |
| `frontend/src/components/TodoPanel/TodoPanel.tsx` | Add collapse state (`collapsed` prop + `onToggle` callback), SVG icons, 120px max-height, new header with chevron |
| `frontend/src/store/index.ts` | Add `todoCollapsed: Record<string, boolean>` and `setTodoCollapsed` setter |

### 4.1 App.tsx

Remove line 95 (`<TodoPanel />`). No other changes.

### 4.2 ChatArea.tsx

Insert `<TodoPanel />` between the messages scroll div and the `{hasActiveSession && <ChatInput ... />}` block. TodoPanel renders unconditionally within ChatArea — its own internal null-return handles the "no tasks" case.

ChatArea reads `todoCollapsed` from store and passes it down, along with `setTodoCollapsed`.

### 4.3 TodoPanel.tsx

New props:
```typescript
interface TodoPanelProps {
  collapsed: boolean
  onToggle: () => void
}
```

New header row (always visible):
```
▼ Todo · 3/5                    click to collapse
```
- Chevron rotates -90deg when collapsed.
- Clicking anywhere on the header calls `onToggle`.
- The count badge (`3/5`) shows completed/total.

Task list body: only rendered when `!collapsed`. Max height 120px, overflow-y auto.

STATUS_ICONS replaced with inline SVG components keyed by status.

### 4.4 store/index.ts

Add to `AppState` interface:
```typescript
todoCollapsed: Record<string, boolean>
setTodoCollapsed: (sessionId: string, collapsed: boolean) => void
```

Initial value: `todoCollapsed: {}`. Default (absent key) means expanded.

## 5. Not Changed

- Backend (Go): No changes. Event flow, task data, and session persistence unchanged.
- Task rendering logic: Same `computeDepth`, `blockedBy` handling, styling for in_progress/completed/cancelled rows.
- `task_updated` event handler: Unchanged.
- `setSessionTasks` action: Unchanged.

## 6. States Covered

| State | Behavior |
|-------|----------|
| No active session | TodoPanel returns null (same as today) |
| Active session, no tasks | TodoPanel returns null |
| Active session, has tasks, not collapsed | Full list visible, 120px max, scroll |
| Active session, has tasks, collapsed | Only header row visible |
| Session switch | Collapse state read from `todoCollapsed[sessionId]` |
| Tasks update during generation | List re-renders reactively from store |
| New session (no collapse state) | Defaults to expanded (`todoCollapsed[id]` is `undefined` → treated as `false`) |
