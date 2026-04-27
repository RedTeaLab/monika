# Session Delete and Sidebar Collapse — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add session deletion with confirmation dialog and auto-switch, plus a sidebar collapse toggle in the status bar with icon replacements.

**Architecture:** Five files touched — icons added, a new ConfirmModal component with loading/error/accessibility states, SessionList extended with delete + keyboard nav, StatusBar iconified with a sessions toggle, and App.tsx wired for sidebar visibility.

**Tech Stack:** React 18 + TypeScript 5, Tailwind CSS v4, Zustand v5, Wails v3 bindings

---

### Task 1: Add New Icons

**Files:**
- Modify: `frontend/src/components/Icons.tsx`

- [ ] **Step 1: Add IconTrash, IconSidebar, IconConsole**

Append after the existing `IconDots` export:

```tsx
export function IconTrash({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M3 4h10M5.5 4V3a1 1 0 011-1h3a1 1 0 011 1v1M6 4v9.5a1 1 0 001 1h2a1 1 0 001-1V4" />
    </Icon>
  )
}

export function IconSidebar({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <rect x="2.5" y="3" width="4.5" height="10" rx="0.5" />
      <rect x="9" y="3" width="4.5" height="10" rx="0.5" />
    </Icon>
  )
}

export function IconConsole({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M3 4l3 3-3 3M8 10h5" />
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
    </Icon>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors related to Icons.tsx.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Icons.tsx
git commit -m "feat: add IconTrash, IconSidebar, IconConsole icons"
```

---

### Task 2: Create ConfirmModal Component

**Files:**
- Create: `frontend/src/components/Chat/ConfirmModal.tsx`

- [ ] **Step 1: Create ConfirmModal with all states and accessibility**

```tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface ConfirmModalProps {
  title: string
  message: string
  onConfirm: () => Promise<void>
  onCancel: () => void
}

function ConfirmModal({ title, message, onConfirm, onCancel }: ConfirmModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Focus Cancel button on mount
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  // Focus trap
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isLoading) {
      onCancel()
      return
    }
    if (e.key === 'Tab') {
      const cancel = cancelRef.current
      const confirm = confirmRef.current
      if (e.shiftKey) {
        if (document.activeElement === cancel) {
          e.preventDefault()
          confirm?.focus()
        }
      } else {
        if (document.activeElement === confirm) {
          e.preventDefault()
          cancel?.focus()
        }
      }
    }
  }, [isLoading, onCancel])

  const handleConfirm = async () => {
    setError('')
    setIsLoading(true)
    try {
      await onConfirm()
    } catch (err: any) {
      setError(err?.message || 'Deletion failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-desc"
        className="bg-[var(--bg-titlebar)] rounded-[6px] max-w-[360px] p-5"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 id="confirm-modal-title" className="text-[14px] font-semibold text-[var(--text-primary)]">
          {title}
        </h2>
        <p id="confirm-modal-desc" className="text-[13px] text-[var(--text-secondary)] mt-2">
          {message}
        </p>
        {error && (
          <p className="text-[12px] text-[var(--red)] mt-2">{error}</p>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={isLoading}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] px-3 py-1.5 text-[13px] rounded-[2px] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-[var(--red)] text-white px-3 py-1.5 text-[13px] rounded-[2px] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ConfirmModal
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors related to ConfirmModal.tsx.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Chat/ConfirmModal.tsx
git commit -m "feat: add ConfirmModal with loading, error, and accessibility states"
```

---

### Task 3: Update SessionList with Delete Functionality

**Files:**
- Modify: `frontend/src/components/Sidebar/SessionList.tsx`

- [ ] **Step 1: Add imports, new state, and delete handlers**

Replace the existing file content:

```tsx
import { useEffect, useState, useMemo, useCallback } from 'react'
import { App, SessionInfo } from '../../../bindings/monika'
import { useStore, loadSessionMessages } from '../../store'
import { IconPlus, IconTrash } from '../Icons'
import ConfirmModal from '../Chat/ConfirmModal'

function SessionList() {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionToDelete, setSessionToDelete] = useState<SessionInfo | null>(null)
  const projectPath = useStore((s) => s.projectPath)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const setActiveSessionId = useStore((s) => s.setActiveSessionId)
  const setMessages = useStore((s) => s.setMessages)

  useEffect(() => {
    if (!projectPath) return
    App.ListSessions(projectPath).then(setSessions).catch(() => setSessions([]))
  }, [projectPath])

  // Dismiss modal when project changes
  useEffect(() => {
    setSessionToDelete(null)
  }, [projectPath])

  const sortedSessions = useMemo(() =>
    [...sessions].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [sessions]
  )

  const handleNewSession = async () => {
    if (!projectPath) return
    try {
      const info = await App.NewSession(projectPath)
      setSessions((prev) => [info, ...prev])
      setActiveSessionId(info.id)
      setMessages([])
    } catch (err) {
      console.error('Failed to create session:', err)
    }
  }

  const handleSelect = async (id: string) => {
    setActiveSessionId(id)
    if (!projectPath) return
    try {
      const s = await App.LoadSession(projectPath, id)
      if (s.messages && s.messages.length > 0) {
        setMessages(loadSessionMessages(s.messages as any[]))
      } else {
        setMessages([])
      }
    } catch (err) {
      console.error('Failed to load session:', err)
    }
  }

  const handleDeleteClick = (s: SessionInfo, e: React.MouseEvent) => {
    e.stopPropagation()
    setSessionToDelete(s)
  }

  const handleDeleteCancel = () => {
    setSessionToDelete(null)
  }

  const handleDeleteConfirm = useCallback(async () => {
    if (!projectPath || !sessionToDelete) return
    await App.DeleteSession(projectPath, sessionToDelete.id)
    // Remove from local list
    setSessions((prev) => prev.filter((s) => s.id !== sessionToDelete.id))
    const deletedId = sessionToDelete.id
    setSessionToDelete(null)

    // Auto-switch if deleted session was active
    if (deletedId === activeSessionId) {
      setSessions((prev) => {
        const sortedSessions = [...prev].sort((a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )
        if (sortedSessions.length > 0) {
          const nearest = sortedSessions[0]
          setActiveSessionId(nearest.id)
          App.LoadSession(projectPath, nearest.id).then((s) => {
            if (s.messages && s.messages.length > 0) {
              setMessages(loadSessionMessages(s.messages as any[]))
            } else {
              setMessages([])
            }
            // Focus the newly active row
            document.getElementById(`session-${nearest.id}`)?.focus()
          }).catch(() => {
            setMessages([])
            setActiveSessionId('')
          })
        } else {
          setMessages([])
          setActiveSessionId('')
        }
        return prev
      })
    }
  }, [projectPath, sessionToDelete, activeSessionId, setActiveSessionId, setMessages])

  const handleRowKeyDown = (s: SessionInfo, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSelect(s.id)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      setSessionToDelete(s)
    }
  }

  return (
    <div
      className="flex flex-col h-full backdrop-blur-md"
      style={{ background: 'var(--glass-light)', padding: '0 12px' }}
    >
      <div className="flex items-center justify-between pt-5 pb-2">
        <span className="text-[10px] font-semibold text-[var(--text-dim)] tracking-[0.06em] uppercase">Sessions</span>
        <button
          onClick={handleNewSession}
          className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] transition-colors"
          aria-label="New session"
          id="new-session-btn"
        >
          <IconPlus size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sortedSessions.length === 0 ? (
          <div className="py-4">
            <div className="text-[12px] text-[var(--text-dim)]">No sessions yet</div>
            <div className="text-[12px] text-[var(--text-dim)] mt-0.5">Click + to create one</div>
          </div>
        ) : (
          sortedSessions.map((s) => (
            <div
              key={s.id}
              id={`session-${s.id}`}
              onClick={() => handleSelect(s.id)}
              onKeyDown={(e) => handleRowKeyDown(s, e)}
              tabIndex={0}
              role="button"
              aria-label={`Select ${s.title || 'session'}`}
              className="group flex justify-between items-center py-1 px-2 cursor-pointer text-[13px] truncate leading-[26px] rounded-md transition-colors"
              style={{
                color: activeSessionId === s.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: activeSessionId === s.id ? 'var(--glass-active)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (activeSessionId !== s.id) (e.target as HTMLElement).style.background = 'var(--glass-hover)'
              }}
              onMouseLeave={(e) => {
                if (activeSessionId !== s.id) (e.target as HTMLElement).style.background = 'transparent'
              }}
            >
              <span className="truncate">{s.title || 'Untitled'}</span>
              <button
                onClick={(e) => handleDeleteClick(s, e)}
                aria-label={`Delete ${s.title || 'session'}`}
                className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-[var(--text-dim)] hover:text-[var(--red)] transition-colors flex-shrink-0 ml-2"
              >
                <IconTrash size={14} />
              </button>
            </div>
          ))
        )}
      </div>
      {sessionToDelete && (
        <ConfirmModal
          title="Delete Session"
          message={`Delete "${sessionToDelete.title || 'Untitled'}"? This cannot be undone.`}
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
        />
      )}
    </div>
  )
}

export default SessionList
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Sidebar/SessionList.tsx
git commit -m "feat: add session delete with confirm modal, keyboard nav, and auto-switch"
```

---

### Task 4: Update StatusBar with Icon Toggles

**Files:**
- Modify: `frontend/src/components/StatusBar/StatusBar.tsx`

- [ ] **Step 1: Replace text with icons, add sessions toggle**

Replace the existing file content:

```tsx
import { useStore } from '../../store'
import { IconCircle, IconSidebar, IconConsole, IconFile } from '../Icons'

interface StatusBarProps {
  showConsole: boolean; showFileTree: boolean; showSidebar: boolean
  onToggleConsole: () => void; onToggleFileTree: () => void; onToggleSidebar: () => void
}

function StatusBar({ showConsole, showFileTree, showSidebar, onToggleConsole, onToggleFileTree, onToggleSidebar }: StatusBarProps) {
  const generating = useStore((s) => s.generating)
  const tokenCount = useStore((s) => s.tokenCount)

  const iconClass = (active: boolean) =>
    `transition-colors hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] ${active ? 'text-[var(--text-primary)]' : 'text-[var(--text-dim)]'}`

  return (
    <div
      className="flex items-center h-[24px] text-[11px] select-none border-t border-[var(--border)] backdrop-blur-md"
      style={{ background: 'var(--glass-strong)', padding: '0 12px' }}
    >
      <div className="flex items-center gap-1.5">
        <span style={{ color: generating ? 'var(--yellow)' : 'var(--green)' }}>
          <IconCircle size={10} filled={!generating} />
        </span>
        <span className="text-[var(--text-secondary)]">{generating ? 'generating...' : 'ready'}</span>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className={iconClass(showSidebar)}
          aria-label="Toggle session sidebar"
        >
          <IconSidebar size={14} />
        </button>
        <button
          onClick={onToggleConsole}
          className={iconClass(showConsole)}
          aria-label="Toggle console"
        >
          <IconConsole size={14} />
        </button>
        <button
          onClick={onToggleFileTree}
          className={iconClass(showFileTree)}
          aria-label="Toggle file tree"
        >
          <IconFile size={14} />
        </button>
        <span className="text-[var(--text-dim)]">tok: {tokenCount}</span>
      </div>
    </div>
  )
}

export default StatusBar
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/StatusBar/StatusBar.tsx
git commit -m "feat: replace StatusBar text toggles with icons, add sessions toggle"
```

---

### Task 5: Update App.tsx with Sidebar Collapse

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add showSidebar state, wire to StatusBar and SessionList**

Replace the existing file content:

```tsx
import { useState } from 'react'
import TitleBar from './components/TitleBar/TitleBar'
import SessionList from './components/Sidebar/SessionList'
import ChatArea from './components/Chat/ChatArea'
import FileTree from './components/FileTree/FileTree'
import Console from './components/Console/Console'
import StatusBar from './components/StatusBar/StatusBar'

function App() {
  const [showConsole, setShowConsole] = useState(true)
  const [showFileTree, setShowFileTree] = useState(true)
  const [showSidebar, setShowSidebar] = useState(true)
  const [consoleHeight, setConsoleHeight] = useState(200)

  return (
    <div className="flex flex-col h-full bg-[var(--bg-main)] overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        {showSidebar && (
          <div className="w-56 border-r border-[var(--border)] flex-shrink-0">
            <SessionList />
          </div>
        )}
        <div className="flex-1 flex flex-col min-w-0">
          <ChatArea />
        </div>
        {showFileTree && (
          <div className="w-64 border-l border-[var(--border)] flex-shrink-0">
            <FileTree />
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

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: add session sidebar collapse via StatusBar toggle"
```

---

### Task 6: Clear Chat Input on Session Switch

**Files:**
- Modify: `frontend/src/components/Chat/ChatArea.tsx`

- [ ] **Step 1: Add key prop to ChatInput to reset on session change**

In `ChatArea.tsx`, line 56, change:

```tsx
<ChatInput onSend={handleSend} disabled={generating} />
```

To:

```tsx
<ChatInput key={activeSessionId} onSend={handleSend} disabled={generating} />
```

This forces React to unmount and remount `ChatInput` whenever the active session changes, clearing any draft text. No other changes needed — the `key` prop is built into React.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Chat/ChatArea.tsx
git commit -m "feat: clear chat input on session switch via key prop"
```

---

### Verification

- [ ] **Build check:** `cd frontend && npm run build` — must succeed
- [ ] **Manual test:** Delete a session, verify confirmation modal appears with loading/error states
- [ ] **Manual test:** Delete the active session, verify auto-switch to nearest session
- [ ] **Manual test:** Toggle sidebar via StatusBar sessions icon, verify sidebar hides/shows
- [ ] **Manual test:** Tab through session rows, verify Delete key opens confirm modal
- [ ] **Manual test:** Tab through StatusBar icon toggles, verify focus-visible ring appears
