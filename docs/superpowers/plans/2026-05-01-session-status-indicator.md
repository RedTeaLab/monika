# Session List Status Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-session status indicators (spinning/green/red) to the session list with backend persistence.

**Architecture:** Add a `Status` field to the Go `Session` struct persisted in JSON files. The backend manages status transitions in `SendMessage`/`CancelGeneration` goroutines. The frontend tracks real-time status in a Zustand `sessionStatuses` map and renders a spinner/dot indicator in `SessionList.tsx`.

**Tech Stack:** Go (Wails v3), React 18 + TypeScript + Zustand v5 + Tailwind CSS v4

---

### Task 1: Add Status field to Go Session and SessionInfo structs

**Files:**
- Modify: `internal/api/session_manager.go:16-25` (Session struct)
- Modify: `internal/api/types.go:45-49` (SessionInfo struct)

- [ ] **Step 1: Add Status to Session struct**

```go
type Session struct {
    ID         string               `json:"id"`
    Title      string               `json:"title"`
    ProjectDir string               `json:"project_dir"`
    Messages   []engine.ChatMessage `json:"messages"`
    Model      string               `json:"model"`
    Provider   string               `json:"provider"`
    Status     string               `json:"status"`
    CreatedAt  time.Time            `json:"created_at"`
    UpdatedAt  time.Time            `json:"updated_at"`
}
```

- [ ] **Step 2: Add Status to SessionInfo struct**

```go
type SessionInfo struct {
    ID        string `json:"id"`
    Title     string `json:"title"`
    Status    string `json:"status"`
    UpdatedAt string `json:"updated_at"`
}
```

- [ ] **Step 3: Verify compilation**

Run: `go build ./...`
Expected: Compiles successfully (other references to SessionInfo/New will need updating in later tasks)

- [ ] **Step 4: Commit**

```bash
git add internal/api/session_manager.go internal/api/types.go
git commit -m "feat: add Status field to Session and SessionInfo structs"
```

---

### Task 2: Add SetStatus method and update SessionManager methods

**Files:**
- Modify: `internal/api/session_manager.go:63-73` (New)
- Modify: `internal/api/session_manager.go:75-86` (Load)
- Modify: `internal/api/session_manager.go:106-130` (List)
- Add: `internal/api/session_manager.go` (SetStatus, after Save)

- [ ] **Step 1: Default Status to "idle" in New()**

Update the `New` function:

```go
func (sm *SessionManager) New(model, provider string) (*Session, error) {
    now := time.Now()
    return &Session{
        ID:         generateID(),
        ProjectDir: sm.projectDir,
        Model:      model,
        Provider:   provider,
        Status:     "idle",
        CreatedAt:  now,
        UpdatedAt:  now,
    }, nil
}
```

- [ ] **Step 2: Add backward compatibility guard in Load()**

After `json.Unmarshal`, add the defaulting guard:

```go
func (sm *SessionManager) Load(id string) (*Session, error) {
    p := filepath.Join(sm.sessionsDir, id+".json")
    data, err := os.ReadFile(p)
    if err != nil {
        return nil, err
    }
    var s Session
    if err := json.Unmarshal(data, &s); err != nil {
        return nil, err
    }
    if s.Status == "" {
        s.Status = "idle"
    }
    return &s, nil
}
```

- [ ] **Step 3: Add SetStatus method**

Add after the `Save` method:

```go
func (sm *SessionManager) SetStatus(s *Session, status string) {
    s.Status = status
}
```

- [ ] **Step 4: Include Status in List() SessionInfo**

Update the `SessionInfo{}` literal in `List()`:

```go
infos = append(infos, SessionInfo{
    ID:        s.ID,
    Title:     s.Title,
    Status:    s.Status,
    UpdatedAt: s.UpdatedAt.Format(time.RFC3339),
})
```

- [ ] **Step 5: Verify compilation**

Run: `go build ./...`
Expected: Compiles successfully

- [ ] **Step 6: Commit**

```bash
git add internal/api/session_manager.go
git commit -m "feat: add SetStatus, default status in New/Load, include Status in List"
```

---

### Task 3: Update NewSession to include Status in SessionInfo

**Files:**
- Modify: `internal/api/app.go:182-186`

- [ ] **Step 1: Add Status to NewSession return**

```go
func (a *App) NewSession(projectPath string) (*SessionInfo, error) {
    sm := a.getSessionManager(projectPath)
    s, err := sm.New(a.model, a.cfg.ModelProvider)
    if err != nil {
        return nil, err
    }
    s.Title = "New Session"
    if err := sm.Save(s); err != nil {
        return nil, err
    }
    return &SessionInfo{
        ID:        s.ID,
        Title:     s.Title,
        Status:    s.Status,
        UpdatedAt: s.UpdatedAt.Format(time.RFC3339),
    }, nil
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./...`
Expected: Compiles successfully

- [ ] **Step 3: Commit**

```bash
git add internal/api/app.go
git commit -m "feat: include Status in NewSession SessionInfo"
```

---

### Task 4: Add startup stale-status sweep in OpenProject

**Files:**
- Modify: `internal/api/app.go:119-165` (OpenProject)

- [ ] **Step 1: Add stale-status sweep after getSessionManager**

Add after `a.getSessionManager(path)` (line 160), before `a.getFileService(path)`:

```go
a.getSessionManager(path)
// Reset any sessions left in "generating" status from a previous crash
a.resetStaleSessions(path)
a.getFileService(path)
```

- [ ] **Step 2: Add resetStaleSessions helper method**

Add after the `getSessionManager` method (around line 358):

```go
func (a *App) resetStaleSessions(projectPath string) {
    sm := a.getSessionManager(projectPath)
    sessions, err := sm.List()
    if err != nil {
        return
    }
    for _, info := range sessions {
        if info.Status == "generating" {
            s, err := sm.Load(info.ID)
            if err != nil {
                continue
            }
            sm.Lock()
            sm.SetStatus(s, "idle")
            sm.Save(s)
            sm.Unlock()
        }
    }
}
```

- [ ] **Step 3: Add getSessionManagerForSession helper**

Since `CancelGeneration` only has `sessionID` (not `projectPath`), add a helper to find which project a session belongs to. Add after `getSessionManager`:

```go
func (a *App) getSessionManagerForSession(sessionID string) *SessionManager {
    a.mu.RLock()
    defer a.mu.RUnlock()
    for projectPath, sm := range a.sessions {
        if _, err := sm.Load(sessionID); err == nil {
            _ = projectPath
            return sm
        }
    }
    return nil
}
```

- [ ] **Step 4: Verify compilation**

Run: `go build ./...`
Expected: Compiles successfully

- [ ] **Step 5: Commit**

```bash
git add internal/api/app.go
git commit -m "feat: add startup stale-status sweep and session lookup helper"
```

---

### Task 5: Update SendMessage with status lifecycle and in-flight guard

**Files:**
- Modify: `internal/api/app.go:199-248` (SendMessage)

- [ ] **Step 1: Add in-flight guard and status lifecycle**

Replace the `SendMessage` method:

```go
func (a *App) SendMessage(projectPath, sessionID, text string) error {
    sm := a.getSessionManager(projectPath)
    sm.Lock()
    defer sm.Unlock()

    s, err := sm.Load(sessionID)
    if err != nil {
        return err
    }

    ctx, cancel := context.WithCancel(a.ctx)
    a.cancelMu.Lock()
    if _, exists := a.cancelFuncs[sessionID]; exists {
        a.cancelMu.Unlock()
        cancel()
        return fmt.Errorf("session %s is already generating", sessionID)
    }
    a.cancelFuncs[sessionID] = cancel
    a.cancelMu.Unlock()

    conv := &agent2.Conversation{
        ID:       s.ID,
        Messages: s.Messages,
    }

    opts := append([]agent2.LoopOption{
        agent2.WithModel(a.model),
        agent2.WithProjectDir(projectPath),
    }, a.loopOpts...)
    loop := agent2.NewLoop(a.provider, a.registry, opts...)

    go func() {
        defer cancel()
        defer func() {
            a.cancelMu.Lock()
            delete(a.cancelFuncs, sessionID)
            a.cancelMu.Unlock()
        }()

        // Set generating status
        sm.Lock()
        sm.SetStatus(s, "generating")
        sm.Save(s)
        sm.Unlock()

        hadError := false

        events := loop.RunStreaming(ctx, conv, text)
        for ev := range events {
            if ev.Type == agent2.EventError {
                hadError = true
            }
            a.handleAgentEvent(sessionID, ev)
        }

        s.Messages = conv.Messages
        sm.SetTitle(s)

        sm.Lock()
        if hadError {
            sm.SetStatus(s, "failure")
        } else {
            sm.SetStatus(s, "success")
        }
        sm.Save(s)
        sm.Unlock()

        a.handleAgentEvent(sessionID, agent2.Event{
            Type:    agent2.EventSessionUpdated,
            Content: s.Title,
        })
    }()

    return nil
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./...`
Expected: Compiles successfully

- [ ] **Step 3: Commit**

```bash
git add internal/api/app.go
git commit -m "feat: add status lifecycle and in-flight guard to SendMessage"
```

---

### Task 6: Update CancelGeneration to reset status to idle

**Files:**
- Modify: `internal/api/app.go:250-257` (CancelGeneration)

- [ ] **Step 1: Add status reset on cancel**

Replace `CancelGeneration`:

```go
func (a *App) CancelGeneration(sessionID string) {
    a.cancelMu.Lock()
    cancel, ok := a.cancelFuncs[sessionID]
    a.cancelMu.Unlock()
    if ok {
        cancel()
        if sm := a.getSessionManagerForSession(sessionID); sm != nil {
            if s, err := sm.Load(sessionID); err == nil {
                sm.Lock()
                sm.SetStatus(s, "idle")
                sm.Save(s)
                sm.Unlock()
            }
        }
    }
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./...`
Expected: Compiles successfully

- [ ] **Step 3: Commit**

```bash
git add internal/api/app.go
git commit -m "feat: reset session status to idle on cancellation"
```

---

### Task 7: Update TypeScript bindings with Status field

**Files:**
- Modify: `frontend/bindings/monika/index.ts:11-26`

- [ ] **Step 1: Add status to SessionInfo and Session interfaces**

```typescript
export interface SessionInfo {
  id: string;
  title: string;
  status: string;
  updated_at: string;
}

export interface Session {
  id: string;
  title: string;
  project_dir: string;
  messages: { role: string; content: string; tool_calls?: any[] }[];
  model: string;
  provider: string;
  status: string;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/bindings/monika/index.ts
git commit -m "feat: add status field to SessionInfo and Session TypeScript types"
```

---

### Task 8: Add sessionStatuses and sessionErrors to Zustand store

**Files:**
- Modify: `frontend/src/store/index.ts` (AppState interface + create call)

- [ ] **Step 1: Add state fields to AppState interface**

In the `AppState` interface (around line 40), add after `generatingSessionId`:

```typescript
sessionStatuses: Record<string, string>
sessionErrors: Record<string, string>
```

- [ ] **Step 2: Add setters to AppState interface**

In the actions section of the interface (around line 70), add:

```typescript
setSessionStatus: (sessionId: string, status: string) => void
setSessionError: (sessionId: string, error: string) => void
```

- [ ] **Step 3: Add initial state in create()**

In the `create<AppState>` call (around line 103), after `generatingSessionId: ''`:

```typescript
sessionStatuses: {},
sessionErrors: {},
```

- [ ] **Step 4: Add setter implementations**

In the `create<AppState>` call (around line 306), after `setGeneratingSessionId`:

```typescript
setSessionStatus: (sessionId, status) =>
  set((s) => ({ sessionStatuses: { ...s.sessionStatuses, [sessionId]: status } })),
setSessionError: (sessionId, error) =>
  set((s) => ({ sessionErrors: { ...s.sessionErrors, [sessionId]: error } })),
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat: add sessionStatuses and sessionErrors to Zustand store"
```

---

### Task 9: Update setupWailsEvents for status tracking

**Files:**
- Modify: `frontend/src/store/index.ts:590-716` (setupWailsEvents)

- [ ] **Step 1: Add status tracking to turn_start case**

Replace the `turn_start` case (line 710):

```typescript
case 'turn_start': {
  const newMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: '', startedAt: Date.now(), model: data.model || undefined }
  store.appendToSession(sid, [newMsg])
  store.setSessionStatus(sid, 'generating')
  store.setGeneratingSessionId(sid)
  break
}
```

- [ ] **Step 2: Add status tracking to done case**

After `store.bumpSessionListVersion()` in the `done` case (line 698), add:

```typescript
store.setSessionStatus(sid, 'success')
```

The full `done` case becomes:

```typescript
case 'done': {
  if (sid === store.generatingSessionId) {
    store.setGeneratingSessionId('')
  }
  const sessionMsgs = store.sessionMessages[sid] || []
  for (let i = sessionMsgs.length - 1; i >= 0; i--) {
    if (sessionMsgs[i].role === 'assistant' && sessionMsgs[i].startedAt) {
      store.setLastAssistantMeta(sid, { duration: Math.round((Date.now() - sessionMsgs[i].startedAt!) / 100) / 10 })
      break
    }
  }
  store.setSessionStatus(sid, 'success')
  store.bumpFileTreeVersion()
  store.bumpSessionListVersion()
  break
}
```

- [ ] **Step 3: Add status tracking to error case**

After the `generatingSessionId` check in the `error` case (line 676), add:

```typescript
store.setSessionStatus(sid, 'failure')
store.setSessionError(sid, data.content || 'Unknown error')
```

The full `error` case becomes:

```typescript
case 'error':
  store.addConsoleLine(`[error] ${data.content || 'Unknown error'}`)
  store.addSessionError(sid, data.content || 'Unknown error')
  if (sid === store.activeSessionId) {
    store.addMessage({ id: crypto.randomUUID(), role: 'error', content: data.content || 'Unknown error' })
  }
  if (sid === store.generatingSessionId) {
    store.setGeneratingSessionId('')
  }
  store.setSessionStatus(sid, 'failure')
  store.setSessionError(sid, data.content || 'Unknown error')
  break
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat: track session status from stream events in store"
```

---

### Task 10: Add spinner keyframes to CSS

**Files:**
- Modify: `frontend/src/index.css:60` (after pulse keyframe)

- [ ] **Step 1: Add @keyframes spin**

After the `label-blink` keyframe block (after line 65), add:

```css
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat: add spin keyframes for session status spinner"
```

---

### Task 11: Update SessionList with status indicator

**Files:**
- Modify: `frontend/src/components/Sidebar/SessionList.tsx` (full component)

- [ ] **Step 1: Add status indicator element between title and delete button**

Replace the session row rendering (lines 116-142). Add imports and status indicator:

```tsx
import { useEffect, useState, useMemo, useCallback } from 'react'
import { App, SessionInfo } from '../../../bindings/monika'
import { useStore } from '../../store'
import { IconPlus, IconTrash } from '../Icons'
import ConfirmModal from '../Chat/ConfirmModal'

function StatusDot({ status, errorMsg }: { status: string; errorMsg?: string }) {
  if (status === 'idle' || !status) return null

  if (status === 'generating') {
    return (
      <span
        role="status"
        aria-label="Generating..."
        className="flex-shrink-0 ml-1.5 transition-opacity duration-200"
      >
        <span
          className="block rounded-full border-2 animate-spin"
          style={{
            width: 12,
            height: 12,
            borderColor: 'var(--yellow)',
            borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      </span>
    )
  }

  if (status === 'success') {
    return (
      <span
        role="status"
        aria-label="Generation succeeded"
        className="flex-shrink-0 ml-1.5 transition-opacity duration-200"
      >
        <span
          className="block rounded-full"
          style={{ width: 6, height: 6, backgroundColor: 'var(--green)' }}
        />
      </span>
    )
  }

  if (status === 'failure') {
    return (
      <span
        role="status"
        aria-label={`Generation failed: ${errorMsg || 'Unknown error'}`}
        title={errorMsg || 'Unknown error'}
        className="flex-shrink-0 ml-1.5 transition-opacity duration-200"
      >
        <span
          className="block rounded-full"
          style={{ width: 6, height: 6, backgroundColor: 'var(--red)' }}
        />
      </span>
    )
  }

  return null
}
```

- [ ] **Step 2: Update SessionList to use status from store + backend**

Add store subscriptions and status logic in the component body:

```tsx
function SessionList() {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionToDelete, setSessionToDelete] = useState<SessionInfo | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const projectPath = useStore((s) => s.projectPath)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const sessionListVersion = useStore((s) => s.sessionListVersion)
  const sessionStatuses = useStore((s) => s.sessionStatuses)
  const sessionErrors = useStore((s) => s.sessionErrors)
  const setActiveSessionId = useStore((s) => s.setActiveSessionId)
  const setMessages = useStore((s) => s.setMessages)
  const openSessionTab = useStore((s) => s.openSessionTab)

  // ... existing useEffect and handlers ...

  // Resolve effective status: in-memory wins over persisted
  const getStatus = useCallback((s: SessionInfo) => {
    if (sessionStatuses[s.id]) return sessionStatuses[s.id]
    return s.status || 'idle'
  }, [sessionStatuses])
```

- [ ] **Step 3: Add StatusDot to the session row**

Insert `<StatusDot>` between the title span and delete button in the row:

```tsx
sortedSessions.map((s) => {
  const effectiveStatus = getStatus(s)
  return (
    <div
      key={s.id}
      id={`session-${s.id}`}
      onClick={() => handleSelect(s.id)}
      onKeyDown={(e) => handleRowKeyDown(s, e)}
      tabIndex={0}
      role="button"
      aria-label={`Select ${s.title || 'session'}`}
      className="group flex justify-between items-center py-1 px-2 cursor-pointer text-[13px] truncate leading-[26px] rounded-md transition-colors focus-visible:shadow-[0_0_0_3px_var(--accent-muted)] outline-none"
      style={{
        color: activeSessionId === s.id ? 'var(--text-primary)' : 'var(--text-secondary)',
        background: activeSessionId === s.id ? 'var(--bg-active)' : hoveredId === s.id ? 'var(--bg-hover)' : 'transparent',
      }}
      onMouseEnter={() => setHoveredId(s.id)}
      onMouseLeave={() => setHoveredId(null)}
    >
      <div className="flex items-center min-w-0 flex-1">
        <span className="truncate">{s.title || 'Untitled'}</span>
        <StatusDot status={effectiveStatus} errorMsg={sessionErrors[s.id]} />
      </div>
      <button
        onClick={(e) => handleDeleteClick(s, e)}
        aria-label={`Delete ${s.title || 'session'}`}
        className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 w-5 h-5 flex items-center justify-center rounded text-[var(--text-dim)] hover:text-[var(--red)] hover:bg-[rgba(224,96,96,0.12)] transition-all flex-shrink-0 ml-2"
      >
        <IconTrash size={13} />
      </button>
    </div>
  )
})
```

- [ ] **Step 4: Verify TypeScript compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Sidebar/SessionList.tsx
git commit -m "feat: add status indicator dots and spinner to session list"
```

---

### Task 12: End-to-end verification

- [ ] **Step 1: Build and verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds

Run: `go build -o monika.exe .`
Expected: Build succeeds

- [ ] **Step 2: Manually verify the flow**

1. Create a new session — verify no indicator shown
2. Send a message — verify yellow spinning circle appears
3. Wait for completion — verify green dot appears
4. Send a message that will fail (e.g., invalid model) — verify red dot with tooltip
5. Cancel mid-generation — verify indicator disappears (idle)
6. Close and reopen app — verify previous success/failure dots persist
7. Verify screen reader announces status changes (check aria-label in devtools)

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final verification tweaks for session status indicator"
```
