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
  // FileEditor state lifted to store
  selectedFilePath?: string
  selectedFileContent?: string
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

- **ChatGroup**: `flex row` — Sessions (w-56) + ChatArea (flex-1)
- **FilesGroup**: `flex row` — FileEditor (flex-1) + FileTree (w-56)

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
- **split**: ChatGroup `splitRatio`%, FilesGroup `(1 - splitRatio)`%, DragDivider 4px

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

When no file is selected, FileEditor shows a centered placeholder: "Select a file to preview" in `--text-dim`, 13px, on `--bg-main` background.

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/App.tsx` | Restructure to ChatGroup/FilesGroup/DragDivider, visibility logic |
| `frontend/src/store/index.ts` | Add `layoutMode`, `splitRatio`, `selectedFilePath`, `selectedFileContent` |
| `frontend/src/components/TitleBar/TitleBar.tsx` | Add 3 layout mode icons |
| `frontend/src/components/FileTree/FileTree.tsx` | Remove FileEditor, write to store instead of local state |
| `frontend/src/components/FileTree/FileEditor.tsx` | Read from store, add empty placeholder |
| `frontend/src/components/Icons.tsx` | Add split/column icon if needed |
| `frontend/src/components/StatusBar/StatusBar.tsx` | Remove file tree toggle (layout modes replace it) |
