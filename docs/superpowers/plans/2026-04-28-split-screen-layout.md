# Split Screen Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Monika's layout into a Chrome-like split screen with two functional groups (chat + files) and three layout modes switchable from TitleBar icons.

**Architecture:** CSS show/hide (no unmount) to preserve component state across mode switches. Zustand store holds layout mode, split ratio, and file editor state. DragDivider component handles resizable split. FileEditor extracted from FileTree into standalone component reading from store.

**Tech Stack:** React 18, TypeScript 5, Zustand v5, Tailwind CSS v4, Wails v3 runtime

**Spec:** `docs/superpowers/specs/2026-04-28-split-screen-layout-design.md`

---

### Task 1: Store — Add layout state and file editor state

**Files:**
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: Add LayoutMode type and new fields to AppState interface**

In `frontend/src/store/index.ts`, add the type and fields before the `AppState` interface:

```typescript
export type LayoutMode = 'chat' | 'split' | 'files'
```

Add these fields to the `AppState` interface (after `consoleLines: string[]`):

```typescript
  layoutMode: LayoutMode
  splitRatio: number
  selectedFilePath: string
  selectedFileContent: string

  setLayoutMode: (mode: LayoutMode) => void
  setSplitRatio: (ratio: number) => void
  setSelectedFile: (path: string, content: string) => void
  clearSelectedFile: () => void
```

- [ ] **Step 2: Add default values and actions to the store**

In the `create<AppState>((set) => ({...}))` call, add after `consoleLines: ['$ ready'],`:

```typescript
  layoutMode: 'split',
  splitRatio: 0.5,
  selectedFilePath: '',
  selectedFileContent: '',
```

Add the actions after `addConsoleLine`:

```typescript
  setLayoutMode: (mode) => set({ layoutMode: mode }),
  setSplitRatio: (ratio) => set({ splitRatio: ratio }),
  setSelectedFile: (path, content) => set({ selectedFilePath: path, selectedFileContent: content }),
  clearSelectedFile: () => set({ selectedFilePath: '', selectedFileContent: '' }),
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat(store): add layout mode, split ratio, and file editor state"
```

---

### Task 2: Icons — Add layout mode icons

**Files:**
- Modify: `frontend/src/components/Icons.tsx`

- [ ] **Step 1: Add IconChatLayout, IconSplitLayout, IconFilesLayout**

Add after the `IconConsole` export in `frontend/src/components/Icons.tsx`:

```typescript
export function IconChatLayout({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v9a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5v-9z" />
      <path d="M5 6h6M5 8.5h4" />
    </Icon>
  )
}

export function IconSplitLayout({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <rect x="2" y="2" width="5" height="12" rx="1" />
      <rect x="9" y="2" width="5" height="12" rx="1" />
    </Icon>
  )
}

export function IconFilesLayout({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M2 3.5A1.5 1.5 0 013.5 2h2l1.2 1.2h5.8a1.5 1.5 0 011.5 1.5v7.8a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5v-9z" />
      <path d="M5 8h3M5 10.5h2" />
    </Icon>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Icons.tsx
git commit -m "feat(icons): add chat, split, and files layout icons"
```

---

### Task 3: DragDivider — New resizable divider component

**Files:**
- Create: `frontend/src/components/DragDivider/DragDivider.tsx`

- [ ] **Step 1: Create DragDivider component**

Create `frontend/src/components/DragDivider/DragDivider.tsx`:

```tsx
import { useCallback, useRef, useEffect } from 'react'

interface DragDividerProps {
  ratio: number
  onRatioChange: (ratio: number) => void
}

function DragDivider({ ratio, onRatioChange }: DragDividerProps) {
  const dragging = useRef(false)
  const startX = useRef(0)
  const startRatio = useRef(ratio)

  useEffect(() => {
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startRatio.current = ratio
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const parent = (e.target as HTMLElement).parentElement
    if (!parent) return

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const totalWidth = parent.offsetWidth - 4
      if (totalWidth <= 0) return
      const delta = ev.clientX - startX.current
      const newRatio = Math.max(0.2, Math.min(0.8, startRatio.current + delta / totalWidth))
      onRatioChange(newRatio)
    }

    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [ratio, onRatioChange])

  return (
    <div
      className="w-1 flex-shrink-0 cursor-col-resize transition-colors"
      style={{ background: 'var(--border)' }}
      onMouseDown={handleMouseDown}
      onMouseEnter={(e) => (e.target as HTMLElement).style.background = 'var(--accent)'}
      onMouseLeave={(e) => { if (!dragging.current) (e.target as HTMLElement).style.background = 'var(--border)' }}
    />
  )
}

export default DragDivider
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/DragDivider/DragDivider.tsx
git commit -m "feat: add DragDivider component for resizable split"
```

---

### Task 4: FileEditor — Extract from FileTree, read from store

**Files:**
- Modify: `frontend/src/components/FileTree/FileEditor.tsx`

- [ ] **Step 1: Update FileEditor to read from store and add empty placeholder**

Replace the entire content of `frontend/src/components/FileTree/FileEditor.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { json } from '@codemirror/lang-json'
import { go } from '@codemirror/lang-go'
import { useStore } from '../../store'
import { IconClose } from '../Icons'

function getLangExtension(filePath: string) {
  if (filePath.endsWith('.go')) return go()
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) return javascript()
  if (filePath.endsWith('.py')) return python()
  if (filePath.endsWith('.json')) return json()
  return []
}

function FileEditor() {
  const filePath = useStore((s) => s.selectedFilePath)
  const content = useStore((s) => s.selectedFileContent)
  const clearSelectedFile = useStore((s) => s.clearSelectedFile)
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView>()

  useEffect(() => {
    if (!filePath || !editorRef.current) return

    viewRef.current?.destroy()

    const state = EditorState.create({
      doc: content || '',
      extensions: [
        oneDark,
        keymap.of(defaultKeymap),
        getLangExtension(filePath),
        EditorView.editable.of(false),
      ],
    })

    viewRef.current = new EditorView({
      state,
      parent: editorRef.current,
    })

    return () => { viewRef.current?.destroy() }
  }, [filePath, content])

  if (!filePath) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--bg-main)]">
        <span className="text-[13px] text-[var(--text-dim)]">Select a file to preview</span>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div
        className="flex items-center justify-between px-3 py-1 border-b border-[var(--border)] flex-shrink-0"
        style={{ background: 'var(--glass-strong)' }}
      >
        <span className="text-[12px] truncate text-[var(--text-secondary)]">
          {filePath.split('/').pop() || filePath.split('\\').pop()}
        </span>
        <button
          onClick={clearSelectedFile}
          className="text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] w-6 h-6 flex items-center justify-center rounded transition-colors"
          aria-label="Close editor"
        >
          <IconClose size={12} />
        </button>
      </div>
      <div ref={editorRef} className="flex-1 overflow-hidden" />
    </div>
  )
}

export default FileEditor
```

Key changes from original:
- Props removed — reads from store via `useStore`
- Empty placeholder when no file selected
- `readOnly` hardcoded to `true` (matching current behavior)
- Takes full height (`flex-1 flex flex-col`) instead of fixed `h-64`
- No longer a child of FileTree

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/FileTree/FileEditor.tsx
git commit -m "refactor(FileEditor): read from store, add empty placeholder"
```

---

### Task 5: FileTree — Remove FileEditor, use store for file selection

**Files:**
- Modify: `frontend/src/components/FileTree/FileTree.tsx`

- [ ] **Step 1: Remove FileEditor import and usage, write to store on file click**

Replace the entire content of `frontend/src/components/FileTree/FileTree.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { App, FileNode } from '../../../bindings/monika'
import { useStore } from '../../store'
import { IconChevronRight, IconChevronDown, IconFile } from '../Icons'

function FileTree() {
  const [tree, setTree] = useState<FileNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const projectPath = useStore((s) => s.projectPath)
  const selectedFilePath = useStore((s) => s.selectedFilePath)
  const setSelectedFile = useStore((s) => s.setSelectedFile)

  useEffect(() => {
    if (!projectPath) return
    App.ListFileTree(projectPath).then(setTree).catch(() => {})
  }, [projectPath])

  const handleFileClick = async (node: FileNode) => {
    if (node.is_dir) {
      const next = new Set(expanded)
      next.has(node.path) ? next.delete(node.path) : next.add(node.path)
      setExpanded(next)
    } else {
      try {
        const result = await App.ReadFile(projectPath, node.path)
        setSelectedFile(node.path, result?.content || '')
      } catch {
        setSelectedFile(node.path, '')
      }
    }
  }

  const gitColor = (status?: string) => {
    switch (status) { case 'M': return 'var(--yellow)'; case 'A': return 'var(--green)'; case 'D': return 'var(--red)'; default: return undefined; }
  }

  const renderNode = (node: FileNode, depth = 0) => {
    const isExpanded = expanded.has(node.path)
    const isSelected = selectedFilePath === node.path
    const gColor = gitColor(node.status)

    return (
      <div key={node.path}>
        <div
          className={`flex items-center gap-1 cursor-pointer text-[13px] leading-[26px] rounded-md transition-colors mx-1`}
          style={{
            paddingLeft: `${depth * 14 + 6}px`,
            paddingRight: '6px',
            color: gColor || (isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'),
            background: isSelected ? 'var(--glass-active)' : 'transparent',
          }}
          onClick={() => handleFileClick(node)}
        >
          <span className="flex-shrink-0 inline-flex items-center justify-center w-4 h-4 text-[var(--text-dim)]">
            {node.is_dir
              ? (isExpanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />)
              : <IconFile size={13} />
            }
          </span>
          <span className="truncate">{node.name}</span>
          {node.status && (
            <span className="text-[10px] font-semibold ml-auto opacity-60">{node.status}</span>
          )}
        </div>
        {node.is_dir && isExpanded && node.children?.map(ch => renderNode(ch, depth + 1))}
      </div>
    )
  }

  return (
    <div
      className="flex flex-col h-full backdrop-blur-md"
      style={{ background: 'var(--glass-light)', padding: '0 8px' }}
    >
      <div className="pt-5 pb-2 px-1">
        <span className="text-[10px] font-semibold text-[var(--text-dim)] tracking-[0.06em] uppercase">Files</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tree.length === 0 ? (
          <div className="py-4 text-[12px] text-[var(--text-dim)] px-1">No project opened</div>
        ) : (
          tree.map(node => renderNode(node))
        )}
      </div>
    </div>
  )
}

export default FileTree
```

Key changes:
- Removed `import FileEditor`
- Removed local `selectedFile` and `fileContent` state
- Reads `selectedFilePath` from store for highlight
- Uses `setSelectedFile` from store on file click
- Removed the `<FileEditor .../>` at the bottom of the component

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/FileTree/FileTree.tsx
git commit -m "refactor(FileTree): use store for selection, remove FileEditor"
```

---

### Task 6: TitleBar — Add layout mode switcher

**Files:**
- Modify: `frontend/src/components/TitleBar/TitleBar.tsx`

- [ ] **Step 1: Add layout mode switcher icons to TitleBar**

Update the imports in `frontend/src/components/TitleBar/TitleBar.tsx`:

```typescript
import { useState, useEffect } from 'react'
import { Window, Events, Application } from '@wailsio/runtime'
import { useStore, LayoutMode } from '../../store'
import { IconMinimize, IconMaximize, IconClose, IconRestore, IconChatLayout, IconSplitLayout, IconFilesLayout } from '../Icons'
```

Add the layout switcher block. Replace the `<div className="flex-1" />` spacer and the window controls `<div>` with:

```typescript
      <div className="flex-1" />
      <div
        style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}
        className="flex h-full"
        role="group"
        aria-label="Layout modes"
      >
        {([
          { mode: 'chat' as LayoutMode, icon: IconChatLayout, label: 'Chat mode' },
          { mode: 'split' as LayoutMode, icon: IconSplitLayout, label: 'Split mode' },
          { mode: 'files' as LayoutMode, icon: IconFilesLayout, label: 'Files mode' },
        ]).map(({ mode, icon: IconComp, label }) => (
          <button
            key={mode}
            onClick={() => useStore.getState().setLayoutMode(mode)}
            className={`w-[32px] h-full flex items-center justify-center transition-colors ${layoutMode === mode ? 'text-[var(--accent)]' : 'text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)]'}`}
            aria-label={label}
            aria-pressed={layoutMode === mode}
          >
            <IconComp size={14} />
          </button>
        ))}
      </div>
      <div style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties} className="flex h-full">
```

Add `const layoutMode = useStore((s) => s.layoutMode)` alongside the other `useStore` selectors near the top of the component.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/TitleBar/TitleBar.tsx
git commit -m "feat(TitleBar): add layout mode switcher icons"
```

---

### Task 7: App.tsx — Restructure layout with ChatGroup/FilesGroup/DragDivider

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Replace entire App.tsx**

Replace the entire content of `frontend/src/App.tsx`:

```tsx
import { useState } from 'react'
import TitleBar from './components/TitleBar/TitleBar'
import SessionList from './components/Sidebar/SessionList'
import ChatArea from './components/Chat/ChatArea'
import FileTree from './components/FileTree/FileTree'
import FileEditor from './components/FileTree/FileEditor'
import Console from './components/Console/Console'
import StatusBar from './components/StatusBar/StatusBar'
import DragDivider from './components/DragDivider/DragDivider'
import { useStore } from './store'

function App() {
  const [showConsole, setShowConsole] = useState(true)
  const [showSidebar, setShowSidebar] = useState(true)
  const [showFileTree, setShowFileTree] = useState(true)
  const [consoleHeight, setConsoleHeight] = useState(200)

  const layoutMode = useStore((s) => s.layoutMode)
  const splitRatio = useStore((s) => s.splitRatio)
  const setSplitRatio = useStore((s) => s.setSplitRatio)

  const showChat = layoutMode === 'chat' || layoutMode === 'split'
  const showFiles = layoutMode === 'files' || layoutMode === 'split'
  const showDivider = layoutMode === 'split'

  return (
    <div className="flex flex-col h-full bg-[var(--bg-main)] overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        {showChat && (
          <div
            className="flex flex-shrink-0 overflow-hidden"
            style={{
              width: layoutMode === 'split' ? `${splitRatio * 100}%` : '100%',
              minWidth: 0,
            }}
          >
            {showSidebar && (
              <div className="w-56 border-r border-[var(--border)] flex-shrink-0">
                <SessionList />
              </div>
            )}
            <div className="flex-1 flex flex-col min-w-0">
              <ChatArea />
            </div>
          </div>
        )}
        {showDivider && (
          <DragDivider ratio={splitRatio} onRatioChange={setSplitRatio} />
        )}
        {showFiles && (
          <div
            className="flex flex-shrink-0 overflow-hidden"
            style={{
              width: layoutMode === 'split' ? `${(1 - splitRatio) * 100}%` : '100%',
              minWidth: 0,
            }}
          >
            <div className="flex-1 flex flex-col min-w-0">
              <FileEditor />
            </div>
            {showFileTree && (
              <div className="w-56 border-l border-[var(--border)] flex-shrink-0">
                <FileTree />
              </div>
            )}
          </div>
        )}
      </div>
      {showConsole && (
        <div style={{ height: consoleHeight }} className="border-t border-[var(--border)]">
          <Console onResize={setConsoleHeight} />
        </div>
      )}
      <StatusBar
        showConsole={showConsole}
        showFileTree={showFileTree}
        showSidebar={showSidebar}
        onToggleConsole={() => setShowConsole(!showConsole)}
        onToggleFileTree={() => setShowFileTree(!showFileTree)}
        onToggleSidebar={() => setShowSidebar(!showSidebar)}
      />
    </div>
  )
}

export default App
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(App): restructure layout with ChatGroup/FilesGroup/DragDivider"
```

---

### Task 8: Verify and fix typecheck

**Files:**
- All modified files

- [ ] **Step 1: Run frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors. If there are type errors, fix them.

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Run dev mode and visually verify**

Run: `cd d:/git/monika && wails3 dev`

Verify:
- [ ] Default mode is split — both chat and file groups visible side by side
- [ ] TitleBar shows 3 layout icons, split icon highlighted in accent color
- [ ] Click chat icon → only ChatGroup visible, FilesGroup hidden
- [ ] Click files icon → only FilesGroup visible, ChatGroup hidden
- [ ] Click split icon → both groups visible again, ratio preserved
- [ ] Drag the divider between groups → ratio updates, clamped 0.2–0.8
- [ ] Click a file in FileTree → FileEditor shows content
- [ ] Close file editor → placeholder "Select a file to preview" shown
- [ ] Console visible in all three modes
- [ ] StatusBar sidebar toggle collapses/expands Sessions within ChatGroup
- [ ] StatusBar file tree toggle collapses/expands FileTree within FilesGroup
- [ ] Switching modes preserves chat messages and file selection

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address typecheck and visual issues from layout restructure"
```
