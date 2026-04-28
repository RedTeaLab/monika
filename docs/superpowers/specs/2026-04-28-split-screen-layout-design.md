# Split Screen Layout Design

## Overview

Refactor Monika's layout into a Chrome-like split screen with two functional groups: chat (Sessions + ChatArea) and files (FileEditor + FileTree). Three layout modes with TitleBar switching.

## Data Model

### State

```typescript
type LayoutMode = 'chat' | 'split' | 'files'

interface AppState {
  layoutMode: LayoutMode      // default: 'split'
  splitRatio: number          // 0.2 ~ 0.8, default: 0.5 (chat group share)
  selectedFilePath: string
  selectedFileContent: string
  activeSessionTitle: string  // current session title for ChatArea header
}
```

No localStorage persistence. Startup defaults: `layoutMode = 'split'`, `splitRatio = 0.5`.

## Layout Structure

```
App
├── TitleBar (includes 3 layout icons)
├── Main (flex row)
│   ├── ChatGroup (Sessions + ChatArea)
│   ├── DragDivider (split mode only, 4px)
│   └── FilesGroup (FileEditor + FileTree)
├── Console (bottom panel)
└── StatusBar
```

### Group Internals

- **ChatGroup**: `flex row` — Sessions (w-56, independently collapsible via StatusBar toggle) + ChatArea (flex-1)
- **FilesGroup**: `flex row` — FileEditor (flex-1) + FileTree (w-56, independently collapsible via StatusBar toggle)

### Panel Headers

Both ChatArea and FileEditor have a consistent header bar for visual unity:

- **Style**: `px-3 py-1 border-b border-[var(--border)]` with `background: var(--glass-strong)`
- **ChatArea header**: Shows session title (or "Chat" when no session). Close button closes the current session (`setActiveSessionId('')` + `clearMessages()`).
- **FileEditor header (file open)**: Shows filename. Close button clears the selected file (`clearSelectedFile()`).
- **FileEditor header (empty)**: Shows "Preview" label. No close button.

### Visibility (CSS display, no unmount)

| Mode  | ChatGroup | DragDivider | FilesGroup | Console |
|-------|-----------|-------------|------------|---------|
| chat  | flex      | hidden      | hidden     | visible |
| split | flex      | visible     | flex       | visible |
| files | hidden    | hidden      | flex       | visible |

Console always visible unless manually toggled via StatusBar.

### Width Calculation

- **chat**: ChatGroup 100%
- **files**: FilesGroup 100%
- **split**: ChatGroup `calc(splitRatio * 100% - 2px)`, FilesGroup `calc((1 - splitRatio) * 100% - 2px)`, DragDivider 4px

## TitleBar Layout Switcher

### Position

Three icon buttons grouped together, placed left of the window controls (minimize, maximize, close) in the TitleBar.

```
                    Monika    [chat] [split] [files]   ─  □  ✕
```

### Styling

- Active icon: `--accent` color
- Inactive icons: `--text-dim`, hover `--text-primary`
- Same size as window controls, `no-drag` region
- Each button has `aria-label`
- Keyboard: `role="group"`, Tab enters group, Arrow keys switch between modes, visible focus ring on active button

### Icons

- Chat mode: message bubble icon
- Split mode: dual-column icon
- Files mode: file icon

## DragDivider

- Width: 4px, `cursor-col-resize`
- Background: `--border`, hover/dragging: `--accent`
- Drag logic:
  - `mousedown` on divider → record start position and current ratio
  - `mousemove` on `document` → compute new ratio, clamp 0.2–0.8
  - `mouseup` on `document` → stop
  - `user-select: none` during drag

## FileEditor

### Extraction

FileEditor is extracted from FileTree into a standalone component in FilesGroup.

### State Lift

`selectedFilePath` and `selectedFileContent` move to Zustand store. FileTree writes them on file click; FileEditor reads them.

### Empty State

When no file is selected, FileEditor shows a header bar with "Preview" label plus a centered placeholder: "Select a file to preview" in `--text-dim`, 13px, on `--bg-main` background.

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/App.tsx` | Restructure to ChatGroup/FilesGroup/DragDivider, visibility logic, calc() widths |
| `frontend/src/store/index.ts` | Add `layoutMode`, `splitRatio`, `selectedFilePath`, `selectedFileContent`, `activeSessionTitle` |
| `frontend/src/components/TitleBar/TitleBar.tsx` | Add 3 layout mode icons |
| `frontend/src/components/FileTree/FileTree.tsx` | Remove FileEditor, write to store instead of local state, width changes w-64 → w-56 |
| `frontend/src/components/FileTree/FileEditor.tsx` | Read from store, add consistent header bar with empty placeholder |
| `frontend/src/components/Chat/ChatArea.tsx` | Add header bar with session title and close button (closes session) |
| `frontend/src/components/Sidebar/SessionList.tsx` | Set activeSessionTitle on session select and new session |
| `frontend/src/components/Icons.tsx` | Add split/column icon if needed |
| `frontend/src/components/StatusBar/StatusBar.tsx` | Keep sidebar toggle and file tree toggle (both now independent within their groups), keep console toggle |
