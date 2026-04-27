# Session: Delete and Sidebar Collapse

## Scope

Two features:
- **Session deletion** — delete a session with confirmation dialog, auto-switch to the remaining session with the most recent `updated_at`.
- **Session sidebar collapse** — toggle the left sidebar in the status bar using icons instead of text labels.

## Backend

`DeleteSession` already exists in Go (`internal/api/app.go` — `App.DeleteSession`) and TypeScript bindings (`frontend/bindings/monika/index.ts` — `App.DeleteSession`). No backend changes needed.

## Frontend

### Files changed

| File | Change |
|------|--------|
| `Icons.tsx` | Add `IconTrash`, `IconSidebar`, `IconConsole` |
| `ConfirmModal.tsx` | **New** — lightweight confirmation dialog |
| `SessionList.tsx` | Delete button per row + delete logic + auto-switch |
| `StatusBar.tsx` | Add `sessions` toggle; replace text labels with icons for all three toggles |
| `App.tsx` | Add `showSidebar` state; conditionally render SessionList |

### Icons to add

- `IconTrash` — trash can, for delete button
- `IconSidebar` — two-column layout icon, for sessions toggle
- `IconConsole` — `>_` terminal prompt, for console toggle
- `IconFile` — already exists, reused for files toggle

All icons: 16px, `stroke="currentColor"`, `strokeWidth="1.5"`, `strokeLinecap="round"`, `strokeLinejoin="round"`.

### ConfirmModal

```typescript
interface ConfirmModalProps {
  title: string
  message: string
  onConfirm: () => Promise<void>  // async — enables loading state
  onCancel: () => void
}
```

**States:**

- **Normal** — title + message + Cancel/Confirm buttons as specified below.
- **Loading** — internal `isLoading` state, set `true` when `onConfirm` starts, `false` when it resolves/rejects. While loading: both buttons disabled, Confirm button shows "Deleting..." text, Escape and backdrop click are blocked.
- **Error** — internal `error` string state. If `onConfirm` rejects, set `error` to `error.message` from the rejected promise, with a fallback of `"Deletion failed. Please try again."`. Modal stays open so the user can retry or cancel. When the user clicks Confirm to retry, clear `error` and set `isLoading = true` before calling `onConfirm` again. Render error text in red (`text-[var(--red)]`) below the message, 12px.

**Layout and styling:**

- Import: `import { createPortal } from 'react-dom'`
- Rendered via `createPortal(...)` into `document.body`
- Backdrop: fixed inset, `bg-black/50`, `z-50`, `onClick={onCancel}` (card `onClick` calls `stopPropagation` to prevent dismiss on card click)
- Card: `bg-[var(--bg-titlebar)]`, rounded `[6px]`, `max-w-[360px]`, `p-5`, centered
- Title (`id="confirm-modal-title"`): 14px, `font-semibold`, `text-[var(--text-primary)]`
- Message (`id="confirm-modal-desc"`): 13px, `text-[var(--text-secondary)]`, `mt-2`
- Cancel button: `text-[var(--text-secondary)]`, hover `text-[var(--text-primary)]`, `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]`
- Confirm button: `bg-[var(--red)]`, white text, `rounded-[2px]`, hover `opacity-90`, `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]`; disabled state: `opacity-50 cursor-not-allowed`

**Accessibility:**

- Card element: `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby="confirm-modal-title"`, `aria-describedby="confirm-modal-desc"`
- Initial focus: Cancel button (safer default for a destructive action)
- Focus trap: Tab cycles between Cancel and Confirm only; Shift+Tab reverses
- On close: return focus to the element that triggered the modal (the delete icon)
- Escape key closes the modal (cancel) only when not in loading state

### SessionList changes

**Delete button:**
- State: `sessionToDelete: SessionInfo | null`
- Each row: `group` class on row, `flex justify-between items-center`, `tabIndex={0}`, `role="button"`, `aria-label={`Select ${s.title || 'session'}`}`. Delete icon: `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100`, positioned right. `aria-label={`Delete ${s.title || 'session'}`}`. On click, `stopPropagation` to prevent row selection.
- Keyboard: Tab navigates between session rows. Enter on a focused row selects it. Delete/Backspace on a focused row opens the ConfirmModal for that session.
- Delete icon color: `text-[var(--text-dim)]`, hover `text-[var(--red)]`

**Delete flow:**
1. Click trash icon → `setSessionToDelete(s)` → ConfirmModal renders
2. Cancel / Escape / backdrop click → `setSessionToDelete(null)`
3. Confirm → branching on outcome:
   - `await App.DeleteSession(projectPath, s.id)` (note: errors propagate to ConfirmModal via `onConfirm` rejection — do NOT wrap in try/catch in SessionList)
   - On success: remove from `sessions` list, clear `sessionToDelete`
   - On failure: ConfirmModal shows error state (via the `onConfirm` async rejection), modal stays open for retry

**Auto-switch after delete:**
- If the deleted session is NOT the active session: just remove from list, no switch.
- If deleted session === `activeSessionId`:
  1. Guard: `if (!projectPath) return`
  2. `const sortedSessions = remaining.sort(...)` by `updated_at` descending
  3. If remaining sessions exist: pick the one with the most recent `updated_at` (first in `sortedSessions`), call `setActiveSessionId(id)`, then call `App.LoadSession(projectPath, id)` and `setMessages()` to load its messages (same pattern as existing `handleSelect` in `SessionList.tsx`). If `LoadSession` fails, fall back to `setMessages([])` and `setActiveSessionId('')` to avoid displaying stale messages from the deleted session.
  4. If none remain: call `setMessages([])` and `setActiveSessionId('')`
  5. After auto-switch: move focus to the newly active session's row (by id ref). If no sessions remain, move focus to the New Session button. If the sidebar is collapsed, move focus to the chat input. Clear the chat input text to avoid cross-session draft leakage.

**Empty state (zero sessions after deletion):**
- If `sortedSessions.length === 0` after deletion: show "No sessions yet" text (existing behavior in `SessionList.tsx`), plus a subtle "Click + to create one" hint below it in `text-[var(--text-dim)]`, 12px.

### StatusBar changes

New prop: `showSidebar: boolean`, `onToggleSidebar: () => void`.

Replace text labels with icons:

| Before | After |
|--------|-------|
| `console` text | `<IconConsole>` |
| `files` text | `<IconFile>` |
| (new) | `<IconSidebar>` for sessions |

Layout (left to right): `[● ready] [IconSidebar] [IconConsole] [IconFile] [tok: xxx]`

Icon color: `text-[var(--text-primary)]` when active, `text-[var(--text-dim)]` when inactive, hover `text-[var(--text-primary)]`, `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]`. Each icon button gets `aria-label`:
  - `IconSidebar` → `"Toggle session sidebar"`
  - `IconConsole` → `"Toggle console"`
  - `IconFile` → `"Toggle file tree"`

### App.tsx changes

- New state: `const [showSidebar, setShowSidebar] = useState(true)`
- SessionList panel wrapped in `{showSidebar && (...)}`
- Pass `showSidebar` and `onToggleSidebar` to StatusBar
- **Sidebar transition:** use conditional rendering (`{showSidebar && ...}`). The main content area (`ChatArea`) has `flex-1`, so it naturally expands to fill the space when the sidebar unmounts. No animation needed — the instant swap matches the console/files toggle behavior already in place.

## Interaction flow

```
Session row hover/focus → trash icon appears
Click trash / press Delete key on focused row → ConfirmModal opens (focus on Cancel)
[Escape / click overlay / click cancel] → modal closes, focus returns to trash icon
[Click confirm] → loading state (buttons disabled, "Deleting...")
  ├─ API success → modal closes → list updates → auto-switch (load messages, move focus, clear input)
  └─ API failure → error state (error.message text, modal stays open) → retry (clears error) or cancel
```
