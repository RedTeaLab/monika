# Session: Delete and Sidebar Collapse

## Scope

Two features:
- **Session deletion** — delete a session with confirmation dialog, auto-switch to nearest remaining session.
- **Session sidebar collapse** — toggle the left sidebar in the status bar using icons instead of text labels.

## Backend

`DeleteSession` already exists in Go (`internal/api/app.go:179`) and TypeScript bindings (`frontend/bindings/monika/index.ts:83`). No backend changes needed.

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
  onConfirm: () => void
  onCancel: () => void
}
```

- Rendered via `createPortal` into `document.body`
- Backdrop: fixed inset, `bg-black/50`, `z-50`
- Card: `bg-[var(--bg-titlebar)]`, rounded `[6px]`, `max-w-[360px]`, `p-5`, centered
- Title: 14px, `font-semibold`, `text-[var(--text-primary)]`
- Message: 13px, `text-[var(--text-secondary)]`, `mt-2`
- Cancel button: `text-[var(--text-secondary)]`, hover `text-[var(--text-primary)]`
- Confirm button: `bg-[var(--red)]`, white text, `rounded-[2px]`, hover `opacity-90`
- Escape key and backdrop click both cancel

### SessionList changes

- State: `sessionToDelete: SessionInfo | null`
- Each row: `group` class on row, `flex justify-between items-center`. Delete icon: `opacity-0 group-hover:opacity-100`, positioned right. On click, stop propagation to prevent row selection.
- Delete icon color: `text-[var(--text-dim)]`, hover `text-[var(--red)]`
- Click delete → `setSessionToDelete(s)` → ConfirmModal renders
- Confirm → `App.DeleteSession(projectPath, s.id)` → remove from list
- If deleted session === `activeSessionId`: find nearest by `updated_at` in remaining sessions and auto-select; if none remain, call `setMessages([])` and `setActiveSessionId('')`

### StatusBar changes

New prop: `showSidebar: boolean`, `onToggleSidebar: () => void`.

Replace text labels with icons:

| Before | After |
|--------|-------|
| `console` text | `<IconConsole>` |
| `files` text | `<IconFile>` |
| (new) | `<IconSidebar>` for sessions |

Layout (left to right): `[● ready] [IconSidebar] [IconConsole] [IconFile] [tok: xxx]`

Icon color: `text-[var(--text-primary)]` when active, `text-[var(--text-dim)]` when inactive, hover `text-[var(--text-primary)]`. Each icon button gets `aria-label`.

### App.tsx changes

- New state: `const [showSidebar, setShowSidebar] = useState(true)`
- SessionList panel wrapped in `{showSidebar && (...)}`
- Pass `showSidebar` and `onToggleSidebar` to StatusBar

## Interaction flow

```
Session row hover → trash icon appears
Click trash → ConfirmModal opens
[Escape / click overlay / click cancel] → modal closes
[Click confirm] → API delete → list updates → auto-switch if needed
```
