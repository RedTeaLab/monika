# Split Screen Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Monika's layout into a Chrome-like split screen with two functional groups (chat + files) and three layout modes switchable from TitleBar icons.

**Architecture:** CSS show/hide (no unmount) to preserve component state across mode switches. Zustand store holds layout mode, split ratio, file editor state, and session title. DragDivider component handles resizable split. FileEditor extracted from FileTree into standalone component reading from store. Both ChatArea and FileEditor have consistent header bars.

**Tech Stack:** React 18, TypeScript 5, Zustand v5, Tailwind CSS v4, Wails v3 runtime

**Spec:** `docs/superpowers/specs/2026-04-28-split-screen-layout-design.md`

---

### Task 1: Store — Add layout state, file editor state, and session title

**Files:**
- Modify: `frontend/src/store/index.ts`

- [x] **Step 1: Add LayoutMode type and new fields to AppState interface**

```typescript
export type LayoutMode = 'chat' | 'split' | 'files'
```

Fields added to `AppState`:

```typescript
  layoutMode: LayoutMode
  splitRatio: number
  selectedFilePath: string
  selectedFileContent: string
  activeSessionTitle: string

  setLayoutMode: (mode: LayoutMode) => void
  setSplitRatio: (ratio: number) => void
  setSelectedFile: (path: string, content: string) => void
  clearSelectedFile: () => void
  setActiveSessionTitle: (title: string) => void
```

- [x] **Step 2: Add default values and actions**

Defaults:
```typescript
  layoutMode: 'split',
  splitRatio: 0.5,
  selectedFilePath: '',
  selectedFileContent: '',
  activeSessionTitle: '',
```

Actions:
```typescript
  setLayoutMode: (mode) => set({ layoutMode: mode }),
  setSplitRatio: (ratio) => set({ splitRatio: ratio }),
  setSelectedFile: (path, content) => set({ selectedFilePath: path, selectedFileContent: content }),
  clearSelectedFile: () => set({ selectedFilePath: '', selectedFileContent: '' }),
  setActiveSessionTitle: (title) => set({ activeSessionTitle: title }),
```

- [x] **Step 3: Commit** `feat(store): add layout mode, split ratio, and file editor state`

---

### Task 2: Icons — Add layout mode icons

**Files:**
- Modify: `frontend/src/components/Icons.tsx`

- [x] **Step 1: Add IconChatLayout, IconSplitLayout, IconFilesLayout**

- [x] **Step 2: Commit** `feat(icons): add chat, split, and files layout icons`

---

### Task 3: DragDivider — New resizable divider component

**Files:**
- Create: `frontend/src/components/DragDivider/DragDivider.tsx`

- [x] **Step 1: Create DragDivider component**

Handles mousedown/mousemove/mouseup on document, clamps ratio 0.2–0.8, sets cursor and user-select during drag.

- [x] **Step 2: Commit** `feat: add DragDivider component for resizable split`

---

### Task 4: FileEditor — Extract from FileTree, read from store

**Files:**
- Modify: `frontend/src/components/FileTree/FileEditor.tsx`

- [x] **Step 1: Update FileEditor to read from store**

Key changes:
- Props removed — reads from store via `useStore`
- Consistent header bar with "Preview" label when empty, filename + close button when file open
- Empty placeholder: header bar + "Select a file to preview"
- Close button: calls `clearSelectedFile()` — clears the selected file
- `readOnly` hardcoded to `true`
- Takes full height (`flex-1 flex flex-col`) instead of fixed `h-64`

- [x] **Step 2: Commit** `refactor(FileEditor): read from store, add empty placeholder`

---

### Task 5: FileTree — Remove FileEditor, use store for selection

**Files:**
- Modify: `frontend/src/components/FileTree/FileTree.tsx`

- [x] **Step 1: Remove FileEditor import and usage, write to store on file click**

Key changes:
- Removed `import FileEditor`
- Removed local `selectedFile` and `fileContent` state
- Reads `selectedFilePath` from store for highlight
- Uses `setSelectedFile` from store on file click
- Width changed w-64 → w-56

- [x] **Step 2: Commit** `refactor(FileTree): use store for selection, remove FileEditor`

---

### Task 6: TitleBar — Add layout mode switcher

**Files:**
- Modify: `frontend/src/components/TitleBar/TitleBar.tsx`

- [x] **Step 1: Add layout mode switcher icons to TitleBar**

Layout modes array defined outside component. Three buttons with `role="group"`, `aria-label`, `aria-pressed`.

- [x] **Step 2: Commit** `feat(TitleBar): add layout mode switcher icons`

---

### Task 7: App.tsx — Restructure layout with ChatGroup/FilesGroup/DragDivider

**Files:**
- Modify: `frontend/src/App.tsx`

- [x] **Step 1: Replace App.tsx layout**

Key structure:
- ChatGroup: Sessions sidebar (w-56, collapsible) + ChatArea
- DragDivider (split mode only)
- FilesGroup: FileEditor + FileTree sidebar (w-56, collapsible)
- Width uses `calc()` to account for divider: `calc(ratio * 100% - 2px)`
- Console always visible (independent of layout mode)

- [x] **Step 2: Commit** `feat(App): restructure layout with ChatGroup/FilesGroup/DragDivider`

---

### Task 8: ChatArea — Add header bar with session title and close button

**Files:**
- Modify: `frontend/src/components/Chat/ChatArea.tsx`

- [x] **Step 1: Add header bar**

- Header bar matches FileEditor style: `var(--glass-strong)` background, border-b
- Shows `activeSessionTitle` from store (or "Chat" when no session)
- Close button: closes current session (`setActiveSessionId('')` + `clearMessages()`)
- Semantic: consistent with FileEditor close (which clears the selected file)

- [x] **Step 2: Commit** `feat: add consistent header bars to ChatArea and FileEditor`

---

### Task 9: SessionList — Set session title on select and new session

**Files:**
- Modify: `frontend/src/components/Sidebar/SessionList.tsx`

- [x] **Step 1: Call setActiveSessionTitle on session select and new session**

- `handleSelect`: finds session in local list, calls `setActiveSessionTitle(session.title || 'Untitled')`
- `handleNewSession`: calls `setActiveSessionTitle(info.title || 'Untitled')`

- [x] **Step 2: Commit** `feat: show session title in ChatArea header`

---

### Task 10: Verify and fix

**Files:**
- All modified files

- [x] **Step 1: Typecheck** — `cd frontend && npx tsc --noEmit` — passed
- [x] **Step 2: Build** — `cd frontend && npm run build` — passed
- [x] **Step 3: Code review fix** — `fix: account for divider width in split mode layout` (P1 width overflow)
