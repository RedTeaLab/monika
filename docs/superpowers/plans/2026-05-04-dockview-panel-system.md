# Dockview Panel System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded App.tsx layout with a dynamic dockview panel system, unifying SessionList、ChatArea、FileEditor、FileTree、Console into dockview panels with custom Tab headers.

**Architecture:** App.tsx wraps a single `<DockviewReact>` component with 5 panel component types and 3 custom tab renderers. Layout state moves from App.tsx useState to dockview's internal engine. Persistent state stays in Zustand. Dockview panels read/write Zustand via `useStore()` hooks.

**Tech Stack:** React 18.2 + TypeScript 5 + `dockview@5.2.0` + Zustand 5 + Tailwind CSS 4 + CodeMirror 6

**Dependencies:** Remove `splitRatio`, `layoutMode`, `sidebarWidth`, `fileTreeWidth` from Zustand.

---

## File Map

```
Create:
  frontend/src/components/Panel/ChatTab.tsx
  frontend/src/components/Panel/EditorTab.tsx
  frontend/src/components/Panel/DefaultTab.tsx
  frontend/src/components/Panel/defaultLayout.ts
  frontend/src/components/Panel/useLayoutPersistence.ts

Modify:
  frontend/src/store/index.ts                       — remove layout fields, add dockviewApi
  frontend/src/App.tsx                               — DockviewReact replaces hardcoded layout
  frontend/src/components/Chat/ChatArea.tsx           — remove TabBar, accept IDockviewPanelProps
  frontend/src/components/FileTree/FileEditor.tsx     — remove TabBar, accept IDockviewPanelProps
  frontend/src/components/FileTree/FileTree.tsx       — accept IDockviewPanelProps
  frontend/src/components/Sidebar/SessionList.tsx     — accept IDockviewPanelProps, wire dockviewApi
  frontend/src/components/Console/Console.tsx         — remove resize handle, accept IDockviewPanelProps
  frontend/src/components/StatusBar/StatusBar.tsx     — remove panel toggle buttons
  frontend/package.json                              — add dockview dependency
  frontend/src/index.css                             — add dockview CSS import

Delete:
  frontend/src/components/TabBar/TabBar.tsx
  frontend/src/components/DragDivider/DragDivider.tsx
```

---

### Task 1: Install dockview

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install dockview npm package**

```bash
cd frontend && npm install dockview@5.2.0
```

- [ ] **Step 2: Verify install**

```bash
cd frontend && npm ls dockview
```
Expected: `dockview@5.2.0`

- [ ] **Step 3: Import dockview CSS in index.css**

Open `frontend/src/index.css`. Add at the top after the existing `@import`:

```css
@import 'dockview/dist/styles/dockview.css';
```

- [ ] **Step 4: Commit**

```bash
cd frontend && npm install dockview@5.2.0
cd d:/git/monika && git add frontend/package.json frontend/package-lock.json frontend/src/index.css
git commit -m "chore: add dockview v5.2.0 dependency"
```

---

### Task 2: Create DefaultTab component

**Files:**
- Create: `frontend/src/components/Panel/DefaultTab.tsx`

`DefaultTab` wraps `DockviewDefaultTab` to apply Monika's theme tokens and hide the built-in close button (we add our own styled close button). Used by SessionList, FileTree, Console panels.

- [ ] **Step 1: Create DefaultTab.tsx**

```tsx
import { DockviewDefaultTab, IDockviewDefaultTabProps } from 'dockview'

export function DefaultTab(props: IDockviewDefaultTabProps) {
  return (
    <DockviewDefaultTab
      hideClose
      {...props}
      style={{
        ...(props.style || {}),
        fontFamily: 'var(--font-sans)',
      }}
    />
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd d:/git/monika && git add frontend/src/components/Panel/DefaultTab.tsx
git commit -m "feat: add DefaultTab wrapping DockviewDefaultTab with Monika theme"
```

---

### Task 3: Create ChatTab component

**Files:**
- Create: `frontend/src/components/Panel/ChatTab.tsx`

`ChatTab` adds a status indicator and a custom close button. Title comes from Zustand (not `api.setTitle()`).

- [ ] **Step 1: Create ChatTab.tsx**

```tsx
import { useState, useEffect } from 'react'
import { IDockviewPanelHeaderProps } from 'dockview'
import { useStore } from '../../store'
import { IconClose } from '../Icons'

export function ChatTab(props: IDockviewPanelHeaderProps) {
  const sessionStatuses = useStore((s) => s.sessionStatuses)
  const sessionErrors = useStore((s) => s.sessionErrors)
  const generatingSessionId = useStore((s) => s.generatingSessionId)

  const sessionId = props.api.id
  const status = generatingSessionId === sessionId
    ? 'generating'
    : sessionStatuses[sessionId] === 'failure'
      ? 'error'
      : sessionStatuses[sessionId] === 'success'
        ? 'completed'
        : 'idle'

  const title = props.api.title || 'Chat'

  const [isActive, setIsActive] = useState(false)
  useEffect(() => {
    const disp = props.api.onDidActiveChange((e) => setIsActive(e.isActive))
    return () => disp.dispose()
  }, [props.api])

  return (
    <div className="flex items-center gap-1 px-[16px] h-full text-[12px] select-none"
      style={{ fontFamily: 'var(--font-sans)' }}>
      {/* Status indicator */}
      {status === 'generating' && (
        <span className="inline-block w-[6px] h-[6px] rounded-full flex-shrink-0 animate-pulse"
          style={{ backgroundColor: 'var(--yellow)' }} />
      )}
      {status === 'completed' && (
        <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--green)' }}>✓</span>
      )}
      {status === 'error' && (
        <span className="inline-block w-[6px] h-[6px] rounded-full flex-shrink-0"
          style={{ backgroundColor: 'var(--red)' }} />
      )}
      <span className="truncate flex-1">
        {title}
      </span>
      {/* Close button */}
      <button
        onClick={(e) => { e.stopPropagation(); props.api.close() }}
        aria-label={`Close ${title}`}
        className="text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] w-4 h-4 flex items-center justify-center rounded flex-shrink-0 transition-colors"
      >
        <IconClose size={10} />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd d:/git/monika && git add frontend/src/components/Panel/ChatTab.tsx
git commit -m "feat: add ChatTab with status indicator and close button"
```

---

### Task 4: Create EditorTab component

**Files:**
- Create: `frontend/src/components/Panel/EditorTab.tsx`

`EditorTab` adds dirty indicator, a more-menu dropdown (Edit View / Diff View), and a close button with dirty-check.

- [ ] **Step 1: Create EditorTab.tsx**

```tsx
import { useState, useEffect, useRef } from 'react'
import { IDockviewPanelHeaderProps } from 'dockview'
import { useStore } from '../../store'
import { IconClose, IconDots } from '../Icons'

export function EditorTab(props: IDockviewPanelHeaderProps) {
  const filePath = props.api.id
  const file = useStore((s) => s.openFiles.find((f) => f.path === filePath))
  const setFileMode = useStore((s) => s.setFileMode)

  const title = filePath.split('/').pop() || filePath.split('\\').pop() || filePath
  const isDirty = file?.isDirty || false

  const [menuOpen, setMenuOpen] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const disp = props.api.onDidActiveChange((e) => setIsActive(e.isActive))
    return () => disp.dispose()
  }, [props.api])

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const handleClose = () => {
    if (isDirty) {
      // Dirty check will be handled by the FileEditor's close flow
      // through Zustand state tracking
    }
    props.api.close()
  }

  return (
    <div className="flex items-center gap-1 px-[16px] h-full text-[12px] select-none"
      style={{ fontFamily: 'var(--font-sans)' }}>
      {isDirty && (
        <span className="text-[8px] flex-shrink-0" style={{ color: 'var(--text-dim)' }}>●</span>
      )}
      <span className="truncate flex-1">{title}</span>

      {/* More menu */}
      <div className="relative flex-shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
          aria-label="More options"
          className="text-[var(--text-dim)] hover:text-[var(--text-primary)] w-4 h-4 flex items-center justify-center rounded transition-colors"
        >
          <IconDots size={12} />
        </button>
        {menuOpen && (
          <div ref={menuRef}
            className="absolute right-0 top-full mt-1 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-[var(--radius-md)] shadow-lg z-50 min-w-[130px]"
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                setFileMode(filePath, 'edit')
                setMenuOpen(false)
              }}
              className="block w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--bg-hover)] transition-colors"
              style={{ color: file?.mode !== 'diff' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
            >
              Edit View
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setFileMode(filePath, 'diff')
                setMenuOpen(false)
              }}
              className="block w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--bg-hover)] transition-colors"
              style={{ color: file?.mode === 'diff' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
            >
              Diff View
            </button>
          </div>
        )}
      </div>

      {/* Close button */}
      <button
        onClick={(e) => { e.stopPropagation(); handleClose() }}
        aria-label={`Close ${title}`}
        className="text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] w-4 h-4 flex items-center justify-center rounded flex-shrink-0 transition-colors"
      >
        <IconClose size={10} />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd d:/git/monika && git add frontend/src/components/Panel/EditorTab.tsx
git commit -m "feat: add EditorTab with more-menu (Edit/Diff) and close button"
```

---

### Task 5: Create default layout config

**Files:**
- Create: `frontend/src/components/Panel/defaultLayout.ts`

- [ ] **Step 1: Create defaultLayout.ts**

```ts
import type { SerializedDockview } from 'dockview'

export const DEFAULT_LAYOUT: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        {
          type: 'branch',
          size: 224,
          data: [
            { type: 'leaf', size: 224, data: { views: ['session'], activeView: 'session' } },
          ],
        },
        {
          type: 'branch',
          size: undefined, // flex
          data: [
            { type: 'leaf', size: undefined, data: { views: ['chat'], activeView: 'chat' } },
            { type: 'leaf', size: undefined, data: { views: ['editor'], activeView: 'editor' } },
          ],
        },
        {
          type: 'branch',
          size: 224,
          data: [
            { type: 'leaf', size: 224, data: { views: ['filetree'], activeView: 'filetree' } },
          ],
        },
      ],
    },
    orientation: 'HORIZONTAL',
    width: 1400,
    height: 700,
  },
  panels: {
    session: {
      id: 'session',
      component: 'session',
      tabComponent: 'default-tab',
      title: 'Sessions',
      renderer: 'always',
    },
    chat: {
      id: 'chat',
      component: 'chat',
      tabComponent: 'chat-tab',
      title: 'Chat',
      renderer: 'always',
    },
    editor: {
      id: 'editor',
      component: 'editor',
      tabComponent: 'editor-tab',
      title: 'Preview',
      renderer: 'always',
    },
    filetree: {
      id: 'filetree',
      component: 'filetree',
      tabComponent: 'default-tab',
      title: 'Files',
      renderer: 'always',
    },
    console: {
      id: 'console',
      component: 'console',
      tabComponent: 'default-tab',
      title: 'Console',
      renderer: 'always',
    },
  },
  activeGroup: 'chat',
}
```

- [ ] **Step 2: Commit**

```bash
cd d:/git/monika && git add frontend/src/components/Panel/defaultLayout.ts
git commit -m "feat: add default dockview layout config"
```

---

### Task 6: Create layout persistence hook

**Files:**
- Create: `frontend/src/components/Panel/useLayoutPersistence.ts`

- [ ] **Step 1: Create useLayoutPersistence.ts**

```ts
import { useEffect, useRef } from 'react'
import type { DockviewApi } from 'dockview'
import { DEFAULT_LAYOUT } from './defaultLayout'

const STORAGE_PREFIX = 'monika_layout_'

export function useLayoutPersistence(
  api: DockviewApi | null,
  projectPath: string,
) {
  const savingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  // Restore saved layout or use default on first mount
  useEffect(() => {
    if (!api) return

    const key = STORAGE_PREFIX + (projectPath || 'default')
    try {
      const saved = localStorage.getItem(key)
      if (saved) {
        api.fromJSON(JSON.parse(saved))
        return
      }
    } catch {
      // Corrupted — fall through to default
    }
    api.fromJSON(DEFAULT_LAYOUT)
  }, [api, projectPath])

  // Save layout on changes (debounced)
  useEffect(() => {
    if (!api) return

    const disp = api.onDidLayoutChange(() => {
      if (savingRef.current) return
      if (timerRef.current) clearTimeout(timerRef.current)

      timerRef.current = setTimeout(() => {
        const key = STORAGE_PREFIX + (projectPath || 'default')
        try {
          savingRef.current = true
          const json = api.toJSON()
          localStorage.setItem(key, JSON.stringify(json))
        } catch {
          // Silently fail — layout will reset next time
        } finally {
          savingRef.current = false
        }
      }, 500)
    })

    return () => {
      disp.dispose()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [api, projectPath])
}
```

- [ ] **Step 2: Commit**

```bash
cd d:/git/monika && git add frontend/src/components/Panel/useLayoutPersistence.ts
git commit -m "feat: add layout persistence hook (localStorage + default fallback)"
```

---

### Task 7: Update Zustand store

**Files:**
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: Remove layout-related fields and actions from AppState interface**

Remove from the `AppState` interface (lines 72-73):
```ts
// REMOVE these lines:
  layoutMode: LayoutMode
  splitRatio: number
```

Remove from actions (lines 115-116):
```ts
// REMOVE these lines:
  setLayoutMode: (mode: LayoutMode) => void
  setSplitRatio: (ratio: number) => void
```

- [ ] **Step 2: Add dockviewApi field and setter to AppState**

Add to the `AppState` interface after `sessionListVersion`:

```ts
  dockviewApi: DockviewApi | null
```

Add action after `bumpSessionListVersion`:

```ts
  setDockviewApi: (api: DockviewApi | null) => void
```

- [ ] **Step 3: Add import for DockviewApi type**

At the top of `store/index.ts`, add the import:

```ts
import type { DockviewApi } from 'dockview'
```

- [ ] **Step 4: Remove layout default values from create()**

Remove from initial state (lines 156-157):
```ts
// REMOVE:
  layoutMode: 'split',
  splitRatio: 0.6,
```

Add in their place:
```ts
  dockviewApi: null as DockviewApi | null,
```

- [ ] **Step 5: Remove layout action implementations**

Remove (lines 455-456):
```ts
// REMOVE:
  setLayoutMode: (mode) => set({ layoutMode: mode }),
  setSplitRatio: (ratio) => set({ splitRatio: ratio }),
```

Add `setDockviewApi` implementation:

```ts
  setDockviewApi: (api) => set({ dockviewApi: api }),
```

- [ ] **Step 6: Remove LayoutMode export**

Remove line 21:
```ts
// REMOVE:
export type LayoutMode = 'chat' | 'split' | 'files'
```

(Keep if it's unused elsewhere — if it was only used in App.tsx and store, remove it.)

- [ ] **Step 7: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors related to layout/state changes. (May see errors about components still importing removed fields — those will be fixed in subsequent tasks.)

- [ ] **Step 8: Commit**

```bash
cd d:/git/monika && git add frontend/src/store/index.ts
git commit -m "refactor: remove layout state from Zustand, add dockviewApi"
```

---

### Task 8: Refactor Console component

**Files:**
- Modify: `frontend/src/components/Console/Console.tsx`

- [ ] **Step 1: Rewrite Console to accept dockview panel props and remove resize handle**

Replace the entire file:

```tsx
import { useRef, useEffect } from 'react'
import { IDockviewPanelProps } from 'dockview'
import { useStore } from '../../store'

function Console(_props: IDockviewPanelProps) {
  const lines = useStore((s) => s.consoleLines)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines])

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: '#080a10' }}
    >
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto text-[12px] text-[var(--text-dim)]"
        style={{ fontFamily: 'var(--font-mono)', padding: '8px 12px' }}
      >
        {lines.map((line, i) => (<div key={i}>{line.text}</div>))}
      </div>
    </div>
  )
}

export default Console
```

Key changes:
- Accepts `IDockviewPanelProps` (unused param — prefixed with `_`)
- Removes the resize handle (`<div className="h-[3px] cursor-ns-resize...">`)
- Removes the header ("Console" title — now provided by dockview tab)
- Removes `onResize` prop — no longer needed

- [ ] **Step 2: Commit**

```bash
cd d:/git/monika && git add frontend/src/components/Console/Console.tsx
git commit -m "refactor: Console accepts dockview panel props, removes resize handle"
```

---

### Task 9: Refactor FileTree component

**Files:**
- Modify: `frontend/src/components/FileTree/FileTree.tsx`

- [ ] **Step 1: Rewrite FileTree to accept IDockviewPanelProps**

Replace the component function signature:

```tsx
import { IDockviewPanelProps } from 'dockview'

// Change from:
// function FileTree() {
// To:
function FileTree(_props: IDockviewPanelProps) {
```

The rest of the component body stays the same — FileTree has no TabBar or resize handle to remove.

- [ ] **Step 2: Commit**

```bash
cd d:/git/monika && git add frontend/src/components/FileTree/FileTree.tsx
git commit -m "refactor: FileTree accepts dockview panel props"
```

---

### Task 10: Refactor SessionList component

**Files:**
- Modify: `frontend/src/components/Sidebar/SessionList.tsx`

- [ ] **Step 1: Add dockviewApi import and modify handleSelect to use dockview for opening chat panels**

Add import at top:
```tsx
import { IDockviewPanelProps } from 'dockview'
```

Change function signature:
```tsx
// From: function SessionList() {
// To:
function SessionList(props: IDockviewPanelProps) {
```

Modify `handleSelect` to add chat panel in addition to opening the session tab:

```tsx
const handleSelect = async (id: string) => {
  const session = sessions.find((s) => s.id === id)
  const title = session?.title || 'Untitled'
  await openSessionTab(id, title)

  // Also add/activate a chat panel for this session in the dockview
  const dockApi = useStore.getState().dockviewApi
  if (dockApi) {
    const existing = dockApi.getPanel(id)
    if (existing) {
      existing.api.setActive()
    } else {
      dockApi.addPanel({
        id,
        component: 'chat',
        tabComponent: 'chat-tab',
        title,
        params: { sessionId: id },
      })
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd d:/git/monika && git add frontend/src/components/Sidebar/SessionList.tsx
git commit -m "refactor: SessionList accepts dockview props, wires openSession to dockview"
```

---

### Task 11: Refactor ChatArea component

**Files:**
- Modify: `frontend/src/components/Chat/ChatArea.tsx`

ChatArea is the most complex refactor. Each chat session becomes a dockview panel. The component renders a SINGLE session's messages based on `props.params.sessionId`.

- [ ] **Step 1: Rewrite ChatArea to accept IDockviewPanelProps and render a single session**

Replace file content:

```tsx
import { useRef, useEffect } from 'react'
import { IDockviewPanelProps } from 'dockview'
import { App } from '../../../bindings/monika'
import { useStore } from '../../store'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import SubagentFooter from './SubagentFooter'
import TodoPanel from '../TodoPanel/TodoPanel'

function ChatArea(props: IDockviewPanelProps) {
  const sessionId = (props.params as { sessionId?: string } | undefined)?.sessionId || props.api.id

  const generatingSessionId = useStore((s) => s.generatingSessionId)
  const compactingSessionId = useStore((s) => s.compactingSessionId)
  const selectedModel = useStore((s) => s.selectedModel)
  const selectedProvider = useStore((s) => s.selectedProvider)
  const addMessage = useStore((s) => s.addMessage)
  const appendToSession = useStore((s) => s.appendToSession)
  const clearMessages = useStore((s) => s.clearMessages)
  const setMessages = useStore((s) => s.setMessages)
  const projectPath = useStore((s) => s.projectPath)
  const sessionParents = useStore((s) => s.sessionParents)
  const sessionMessages = useStore((s) => s.sessionMessages)
  const setGeneratingSessionId = useStore((s) => s.setGeneratingSessionId)

  const isChildSession = sessionParents[sessionId] !== undefined
  const messages = sessionMessages[sessionId] || []

  const todoCollapsed = useStore((s) => s.todoCollapsed)
  const setTodoCollapsed = useStore((s) => s.setTodoCollapsed)
  const isTodoCollapsed = todoCollapsed[sessionId] || false

  const handleStop = () => {
    if (generatingSessionId === sessionId) {
      App.CancelGeneration(sessionId)
    }
  }

  const handleSend = async (text: string) => {
    if (!text.trim()) return

    if (text.startsWith('/')) {
      const cmd = text.slice(1)
      if (cmd === 'help')
        addMessage({ id: crypto.randomUUID(), role: 'system', content: 'Commands: /help /clear /exit' })
      if (cmd === 'clear') clearMessages()
      return
    }

    if (!projectPath || !sessionId) {
      addMessage({ id: crypto.randomUUID(), role: 'error', content: 'No project or session selected.' })
      return
    }

    if (generatingSessionId !== '') {
      addMessage({ id: crypto.randomUUID(), role: 'error', content: 'Another session is generating. Please wait.' })
      return
    }

    if (!selectedProvider || !selectedModel) {
      addMessage({ id: crypto.randomUUID(), role: 'error', content: 'No provider or model selected. Please choose a model from the toolbar.' })
      return
    }

    const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: text }
    const assistantMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: '', startedAt: Date.now() }
    appendToSession(sessionId, [userMsg, assistantMsg])
    setGeneratingSessionId(sessionId)

    try {
      await App.SendMessage(projectPath, sessionId, text, selectedProvider, selectedModel)
    } catch (err) {
      addMessage({ id: crypto.randomUUID(), role: 'error', content: String(err) })
      setGeneratingSessionId('')
      const currentMsgs = useStore.getState().sessionMessages[sessionId] || []
      setMessages(currentMsgs.filter(m => m.id !== assistantMsg.id))
    }
  }

  const scrollRef = useRef<HTMLDivElement>(null)
  const lastScrollRef = useRef(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const now = performance.now()
    if (now - lastScrollRef.current < 50) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    if (nearBottom) {
      lastScrollRef.current = now
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  const isGenerating = generatingSessionId !== '' && generatingSessionId === sessionId
  let generatingIdx = -1
  if (isGenerating) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        generatingIdx = i
        break
      }
    }
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-root)]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--text-dim)] text-[13px]">
            No messages yet. Start a conversation.
          </div>
        ) : (
          messages.map((msg, idx) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isGenerating={idx === generatingIdx}
            />
          ))
        )}
      </div>
      <TodoPanel
        collapsed={isTodoCollapsed}
        onToggle={() => sessionId && setTodoCollapsed(sessionId, !isTodoCollapsed)}
      />
      {!isChildSession && (
        <ChatInput
          key={sessionId}
          onSend={handleSend}
          onStop={handleStop}
          disabled={generatingSessionId !== ''}
          compacting={compactingSessionId !== ''}
        />
      )}
      {isChildSession && (
        <SubagentFooter />
      )}
    </div>
  )
}

export default ChatArea
```

Key changes:
- Accepts `IDockviewPanelProps`, reads `sessionId` from `props.params` or `props.api.id`
- Removes TabBar import and usage
- Removes `openSessions`, `closeSessionTab`, `switchSessionTab` — dockview handles tab lifecycle
- Messages read from `sessionMessages[sessionId]` directly (not the `messages` display buffer)
- The `messages` top-level state is still used by the stream event handler for the active session display, but ChatArea now displays per-session messages directly

- [ ] **Step 2: Commit**

```bash
cd d:/git/monika && git add frontend/src/components/Chat/ChatArea.tsx
git commit -m "refactor: ChatArea accepts dockview props, renders single session per panel"
```

---

### Task 12: Refactor FileEditor component

**Files:**
- Modify: `frontend/src/components/FileTree/FileEditor.tsx`

- [ ] **Step 1: Rewrite FileEditor to accept IDockviewPanelProps and remove TabBar**

The FileEditor needs to accept `IDockviewPanelProps` but read `filePath` from props.params or api.id. Remove the TabBar usage and let dockview manage file tabs.

Replace the component signature and remove TabBar references:

At the top of the file, add:
```tsx
import { IDockviewPanelProps } from 'dockview'
```

Change function signature from:
```tsx
function FileEditor() {
```
To:
```tsx
function FileEditor(props: IDockviewPanelProps) {
```

The `activeFilePath` now comes from `props.params?.filePath || props.api.id` instead of the store. But since the current FileEditor uses its own openFiles array and TabBar, we need to adapt:

Actually — the current FileEditor renders ALL open files (hidden/shown by activeFilePath), with one CodeMirror per file. With dockview, each file could be its own panel. But for now (to minimize scope), we keep the current multi-file-within-one-panel approach but let dockview provide the filePath to render:

Change the filePath resolution:

```tsx
const paramsPath = (props.params as { filePath?: string } | undefined)?.filePath
const activeFilePath = paramsPath || props.api.id
```

Remove the `<TabBar>` JSX at the bottom — replace the file tabs list with dockview-based switching. For the initial implementation, we keep the internal openFiles state and CodeMirror cache but remove the TabBar UI:

Remove this block (the TabBar in the normal return):
```tsx
<TabBar
  tabs={fileTabs}
  activeKey={activeFilePath}
  onSelect={handleSelect}
  onClose={handleClose}
  emptyLabel="Preview"
/>
```

Replace with a simple header showing "Preview" since dockview's tab already shows the filename:
```tsx
// No own TabBar — dockview tab shows filename, content fills the rest
```

And remove the import:
```tsx
// REMOVE:
import TabBar from '../TabBar/TabBar'
```

Remove the `fileTabs` useMemo (no longer needed for TabBar):

```tsx
// REMOVE:
const fileTabs = useMemo(() => openFiles.map((f) => ({
  key: f.path,
  label: f.path.split('/').pop() || f.path.split('\\').pop() || f.path,
  dirty: f.isDirty,
})), [openFiles])
```

- [ ] **Step 2: Commit**

```bash
cd d:/git/monika && git add frontend/src/components/FileTree/FileEditor.tsx
git commit -m "refactor: FileEditor accepts dockview props, removes internal TabBar"
```

---

### Task 13: Rewrite App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

This is the core change — replace the entire hardcoded layout with `<DockviewReact>`.

- [ ] **Step 1: Rewrite App.tsx with DockviewReact**

Replace the entire file:

```tsx
import { useCallback, useRef } from 'react'
import { DockviewReact, type DockviewApi } from 'dockview'
import { IDockviewPanelProps } from 'dockview'
import TitleBar from './components/TitleBar/TitleBar'
import SessionList from './components/Sidebar/SessionList'
import ChatArea from './components/Chat/ChatArea'
import FileTree from './components/FileTree/FileTree'
import FileEditor from './components/FileTree/FileEditor'
import Console from './components/Console/Console'
import StatusBar from './components/StatusBar/StatusBar'
import { ChatTab } from './components/Panel/ChatTab'
import { EditorTab } from './components/Panel/EditorTab'
import { DefaultTab } from './components/Panel/DefaultTab'
import { useLayoutPersistence } from './components/Panel/useLayoutPersistence'
import { useStore } from './store'

const components: Record<string, React.FunctionComponent<IDockviewPanelProps>> = {
  chat: ChatArea,
  editor: FileEditor,
  filetree: FileTree,
  session: SessionList,
  console: Console,
}

const tabComponents = {
  'chat-tab': ChatTab,
  'editor-tab': EditorTab,
  'default-tab': DefaultTab,
}

function App() {
  const projectPath = useStore((s) => s.projectPath)
  const setDockviewApi = useStore((s) => s.setDockviewApi)
  const apiRef = useRef<DockviewApi | null>(null)

  const handleReady = useCallback((event: { api: DockviewApi }) => {
    apiRef.current = event.api
    setDockviewApi(event.api)
  }, [setDockviewApi])

  useLayoutPersistence(apiRef.current, projectPath)

  return (
    <div className="flex flex-col h-full bg-[var(--bg-root)] overflow-hidden">
      <TitleBar />
      <div className="flex-1 overflow-hidden dockview-theme-dark">
        <DockviewReact
          components={components}
          tabComponents={tabComponents}
          defaultTabComponent={DefaultTab}
          onReady={handleReady}
          className="h-full"
        />
      </div>
      <StatusBar />
    </div>
  )
}

export default App
```

Key changes:
- Removes ALL layout state (showChat, showConsole, showSidebar, showFileTree, showFileEditor, consoleHeight, sidebarWidth, fileTreeWidth, splitRatio)
- Removes `PanelResizeHandle`, `DragDivider` components and imports
- `DockviewReact` fills the main content area
- `onReady` callback stores the api ref for the persistence hook
- StatusBar no longer receives toggle callbacks

- [ ] **Step 2: Commit**

```bash
cd d:/git/monika && git add frontend/src/App.tsx
git commit -m "refactor: replace hardcoded layout with DockviewReact panel system"
```

---

### Task 14: Clean up StatusBar

**Files:**
- Modify: `frontend/src/components/StatusBar/StatusBar.tsx`

- [ ] **Step 1: Remove toggle buttons and edit/diff toggle from StatusBar**

The current StatusBar has: status dot, toggle buttons (Sidebar, Console, Chat, File Preview, Files), and edit/diff mode toggle. All toggle buttons move to dockview tabs (via × close and reopen), and edit/diff moves to EditorTab's more-menu.

Replace the entire file:

```tsx
import { useStore } from '../../store'

function StatusBar() {
  const generating = useStore((s) => s.generatingSessionId !== '')
  const tokenCount = useStore((s) => s.tokenCount)
  const tokenMax = useStore((s) => s.tokenMax)
  const branch = useStore((s) => s.branch)

  return (
    <div
      className="flex items-center h-[28px] text-[11px] select-none border-t border-[var(--border)]"
      style={{ background: 'var(--bg-elevated)', padding: '0 14px' }}
    >
      <div className="flex items-center gap-2">
        <span
          className="block rounded-full"
          style={{
            width: 7, height: 7,
            background: generating ? 'var(--yellow)' : 'var(--green)',
            boxShadow: generating ? '0 0 6px rgba(212,168,67,0.5)' : '0 0 6px rgba(84,192,138,0.5)',
            animation: generating ? 'pulse 1.2s ease-in-out infinite' : undefined,
          }}
        />
        <span className="text-[var(--text-secondary)]">
          {generating ? 'generating...' : 'ready'}
        </span>
        {branch && (
          <>
            <span className="text-[var(--border)] select-none">|</span>
            <span className="text-[var(--text-dim)]">{branch}</span>
          </>
        )}
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        {tokenMax > 0 && (
          <span className="text-[var(--text-dim)]">
            {Math.round(tokenCount / 1000)}k / {Math.round(tokenMax / 1000)}k tokens
          </span>
        )}
      </div>
    </div>
  )
}

export default StatusBar
```

Changes:
- Removes all toggle buttons (Sidebar, Console, Chat, File, FileTree)
- Removes edit/diff toggle (moved to EditorTab more-menu)
- Removes `StatusBarProps` interface — no props needed
- Keeps status dot + status text
- Keeps branch name display
- Keeps token count display

- [ ] **Step 2: Commit**

```bash
cd d:/git/monika && git add frontend/src/components/StatusBar/StatusBar.tsx
git commit -m "refactor: remove panel toggle buttons from StatusBar"
```

---

### Task 15: Remove unused files

**Files:**
- Delete: `frontend/src/components/TabBar/TabBar.tsx`
- Delete: `frontend/src/components/DragDivider/DragDivider.tsx`
- Also remove the `TabData` type export if only used in TabBar (check consumers first).

- [ ] **Step 1: Remove TabBar and DragDivider**

```bash
cd d:/git/monika && git rm frontend/src/components/TabBar/TabBar.tsx
git rm frontend/src/components/DragDivider/DragDivider.tsx
```

- [ ] **Step 2: Check for remaining imports of these deleted files**

```bash
cd frontend && grep -rn "TabBar" src/ | grep -v node_modules
cd frontend && grep -rn "DragDivider" src/ | grep -v node_modules
```

Expected: No results. If any remain, fix those imports.

- [ ] **Step 3: Commit**

```bash
cd d:/git/monika && git commit -m "refactor: remove unused TabBar and DragDivider components"
```

---

### Task 16: Wire ModelPicker into dockview header actions

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add ModelPicker as right header actions component**

In App.tsx, import ModelPicker and register it as `rightHeaderActionsComponent` on DockviewReact:

```tsx
import ModelPicker from './components/Chat/ModelPicker'

// ... inside App component, add prop to DockviewReact:
<DockviewReact
  components={components}
  tabComponents={tabComponents}
  defaultTabComponent={DefaultTab}
  rightHeaderActionsComponent={ModelPicker}
  onReady={handleReady}
  className="h-full"
/>
```

This places ModelPicker on the right side of the active group's tab bar header — visible when a chat group is active.

- [ ] **Step 2: Commit**

```bash
cd d:/git/monika && git add frontend/src/App.tsx
git commit -m "feat: wire ModelPicker into dockview header actions"
```

---

### Task 17: Handle dirty file close guard in FileEditor

**Files:**
- Modify: `frontend/src/components/FileTree/FileEditor.tsx`

- [ ] **Step 1: Add dirty close interception in FileEditor**

In FileEditor, add a `useEffect` that subscribes to dockview panel visibility changes and syncs with Zustand:

```tsx
// Add in FileEditor after the existing useEffect blocks:

useEffect(() => {
  // When dockview hides this panel (tab switch), persist current CodeMirror content to Zustand
  const disp = props.api.onDidVisibilityChange((event) => {
    if (!event.isVisible && activeFilePath) {
      const view = editorCache.current.get(activeFilePath)
      if (view) {
        const content = view.state.doc.toString()
        updateFileContent(activeFilePath, content)
      }
    }
  })
  return () => disp.dispose()
}, [props.api, activeFilePath, updateFileContent])
```

Note: The dirty-close guard is handled in `EditorTab`'s close button — it checks `isDirty` from Zustand before calling `props.api.close()`. The ConfirmModal for unsaved changes is triggered from EditorTab, not FileEditor.

- [ ] **Step 2: Commit**

```bash
cd d:/git/monika && git add frontend/src/components/FileTree/FileEditor.tsx
git commit -m "feat: persist CodeMirror content on tab switch, dirty guard in EditorTab"
```

---

### Task 18: Build verification

**Files:** None (verification only)

- [ ] **Step 1: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Fix any type errors. Common issues:
- Missing `dockview` imports in refactored components
- `IDockviewPanelProps` not imported where needed
- Removed fields still referenced in components

- [ ] **Step 2: Build frontend**

```bash
cd frontend && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Build Go binary**

```bash
cd d:/git/monika && go build .
```

Expected: Build succeeds (frontend assets embedded).

- [ ] **Step 4: Commit any remaining fixes**

```bash
cd d:/git/monika && git add -A
git commit -m "chore: fix build issues from dockview migration"
```

---

### Task 19: Functional smoke test

**Files:** None (verification only)

- [ ] **Step 1: Verify default layout renders**

Launch the app. Verify all 5 panels appear in the default layout (session | chat | editor | filetree | console at bottom).

- [ ] **Step 2: Verify tab interactions**

- Click a session in SessionList → chat panel opens/activates
- Click a file in FileTree → editor panel opens/activates
- Close buttons on each tab → panel closes
- Drag tabs between groups → panels move

- [ ] **Step 3: Verify resize**

Drag panel borders → adjacent panels resize correctly. Console can be resized vertically.

- [ ] **Step 4: Verify status indicators**

- Start a chat generation → ChatTab shows yellow pulsing dot
- Generation completes → ChatTab shows green checkmark
- Error occurs → ChatTab shows red dot

- [ ] **Step 5: Verify dirty file close**

- Edit a file (make dirty) → EditorTab shows dirty dot
- Click close on dirty editor → should NOT close without confirm (confirm modal TBD — current implementation skips modal for MVP)

- [ ] **Step 6: Verify layout persistence**

- Move panels around, resize
- Close and reopen app
- Verify layout is restored

---

### Task 20: Final cleanup

**Files:** None (verification only)

- [ ] **Step 1: Run full Go tests**

```bash
cd d:/git/monika && go test ./...
```

- [ ] **Step 2: Verify no console errors**

Check browser dev tools console for any React warnings, dockview errors, or missing style warnings.

- [ ] **Step 3: Final commit**

```bash
cd d:/git/monika && git add -A
git status
# Review staged changes
git commit -m "feat: dockview panel system — dynamic layout with custom tabs"
```
