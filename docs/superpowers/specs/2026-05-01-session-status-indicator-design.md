# Session List: Status Indicator

## Scope

Add a per-session status indicator to the session list sidebar. Each session row shows:
- **Spinning circle** while the session is generating output
- **Green dot** when the last generation completed successfully
- **Red dot** when the last generation ended in error
- **No indicator** for idle sessions (new or not yet messaged)

Status transitions:
- `idle` → `generating` on `turn_start` (new message sent)
- `generating` → `success` on `done`
- `generating` → `failure` on `error`
- `generating` → `idle` on user cancellation (via `CancelGeneration`)
- `success` / `failure` persist until the next `turn_start`, which resets to `generating`

Status persists in the session JSON file so it survives app restarts. On app startup, any session found with `status: "generating"` is reset to `"idle"` (no generation can be running before the app starts).

## Backend

### Session struct — add Status field (`internal/api/session_manager.go`)

```go
type Session struct {
    // ... existing fields ...
    Status string `json:"status"` // "idle" | "generating" | "success" | "failure"
}
```

### SessionInfo — add Status field (`internal/api/types.go`)

```go
type SessionInfo struct {
    ID        string `json:"id"`
    Title     string `json:"title"`
    Status    string `json:"status"`
    UpdatedAt string `json:"updated_at"`
}
```

### SessionManager — add SetStatus method (`internal/api/session_manager.go`)

```go
func (sm *SessionManager) SetStatus(s *Session, status string) {
    s.Status = status
}
```

### SessionManager.List — include Status in SessionInfo

Add `Status: s.Status` to the `SessionInfo{}` literal in `List()`.

### NewSession — default to "idle"

Set `Status: "idle"` in the `New()` constructor so new sessions start idle. Also add `Status: s.Status` to the `SessionInfo{}` literal in `App.NewSession` (app.go:182-186), not only in `List()`.

### Backward compatibility for old session files

Existing session JSON files on disk have no `status` key. When Go's `json.Unmarshal` decodes them into the new struct, `Status` defaults to `""` (Go zero value for string). Add a guard after `json.Unmarshal` in `Load()`: if `s.Status == ""` set it to `"idle"`. This ensures all existing sessions display correctly on first load after the upgrade.

### Startup stale-status sweep

When a project is opened, iterate all sessions and reset any with `Status == "generating"` to `"idle"` (since no generation can be in progress before the app starts). This prevents perpetual spinners after an unclean shutdown. Run this in the project-open flow before the frontend fetches the session list.

### App.SendMessage — status lifecycle (`internal/api/app.go`)

The goroutine handles all status transitions directly; `handleAgentEvent` remains a pure event translator (no signature change needed):

```go
go func() {
    defer cancel()
    defer func() {
        a.cancelMu.Lock()
        delete(a.cancelFuncs, sessionID)
        a.cancelMu.Unlock()
    }()

    // Set generating status before starting the event loop
    sm.Lock()
    sm.SetStatus(s, "generating")
    sm.Save(s)
    sm.Unlock()

    events := loop.RunStreaming(ctx, conv, text)
    for ev := range events {
        a.handleAgentEvent(sessionID, ev)
    }

    s.Messages = conv.Messages
    sm.SetTitle(s)
    sm.Lock()
    sm.SetStatus(s, "success") // default; overridden below if error occurred
    sm.Save(s)
    sm.Unlock()
    a.handleAgentEvent(sessionID, agent2.Event{
        Type:    agent2.EventSessionUpdated,
        Content: s.Title,
    })
}()
```

For the `error` path: when `handleAgentEvent` processes an `EventError`, instead of saving status there, set a flag on the goroutine's local state so the deferred save writes `"failure"` instead of `"success"`. Alternatively, handle the error status save in the goroutine's event loop before calling `handleAgentEvent`.

### App.CancelGeneration — status handling (`internal/api/app.go`)

Add status reset to `CancelGeneration`:

```go
func (a *App) CancelGeneration(sessionID string) {
    a.cancelMu.Lock()
    cancel, ok := a.cancelFuncs[sessionID]
    a.cancelMu.Unlock()
    if ok {
        cancel()
        // Reset status to idle since cancellation is user-initiated, not a failure
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

### App.SendMessage — in-flight guard

Add a guard at the start of `SendMessage`: if a `cancelFunc` already exists for `sessionID` (indicating a generation is in progress), return an error. This prevents concurrent goroutines from racing on status and message writes:

```go
a.cancelMu.Lock()
if _, exists := a.cancelFuncs[sessionID]; exists {
    a.cancelMu.Unlock()
    return fmt.Errorf("session %s is already generating", sessionID)
}
a.cancelFuncs[sessionID] = cancel
a.cancelMu.Unlock()
```

## Frontend

### TypeScript types (`frontend/bindings/monika/index.ts`)

```typescript
export interface SessionInfo {
    id: string;
    title: string;
    status: string;  // added
    updated_at: string;
}

export interface Session {
    // ... existing fields ...
    status: string;  // added for consistency with Go struct
}
```

### Zustand store (`frontend/src/store/index.ts`)

- Add `sessionStatuses: Record<string, string>` to track per-session status in memory
- Add `sessionErrors: Record<string, string>` to capture error messages for tooltip display
- In `setupWailsEvents()`:
  - `turn_start`: set `sessionStatuses[sid] = 'generating'`
  - `done`: set `sessionStatuses[sid] = 'success'` + bump session list version
  - `error`: set `sessionStatuses[sid] = 'failure'`, store `data.content` in `sessionErrors[sid]`, bump session list version

### SessionList component (`frontend/src/components/Sidebar/SessionList.tsx`)

Add a status indicator span after the session title, before the delete button:

```
[title] [indicator] [delete-btn]
```

Indicator element:

```tsx
<span
  role="status"
  aria-label={
    status === 'generating' ? 'Generating...' :
    status === 'success' ? 'Generation succeeded' :
    status === 'failure' ? `Generation failed: ${errorMsg || 'Unknown error'}` :
    ''
  }
  title={status === 'failure' ? errorMsg : undefined}
  className="flex-shrink-0 ml-1.5 transition-opacity duration-200"
>
  {/* content based on status */}
</span>
```

Indicator rendering:
- `idle` — nothing rendered (return null)
- `generating` — spinning circle: a 12px diameter bordered circle, 2px border with `border-t-transparent`, `var(--yellow)` color, `animate-spin` (0.8s linear infinite)
- `success` — 6px solid green dot, `var(--green)`
- `failure` — 6px solid red dot, `var(--red)`, with `title` attribute showing the last error message

Accessibility:
- `role="status"` on the indicator span so screen readers announce state changes
- `aria-label` with human-readable status text (e.g., "Generating...", "Generation succeeded", "Generation failed: connection refused")
- The green/red dots are supplemented by the `aria-label` text so status is not conveyed by color alone (WCAG 1.4.1)

The status shown is the in-memory `sessionStatuses[s.id]` when present, falling back to persisted `s.status` from the backend. In-memory always wins during active generation; persisted wins on initial load.

### CSS (`frontend/src/index.css`)

Add spinner keyframes (Tailwind's `animate-spin` is not active in this project):

```css
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

Spinner element uses `animation: spin 0.8s linear infinite`, with a CSS transition (`transition: opacity 0.2s`) when switching between spinner and dot states.

## Status precedence

During app lifetime, the store's `sessionStatuses` map takes priority over the persisted `SessionInfo.status` because it reflects real-time events. On initial load, `SessionInfo.status` from the backend provides the persisted state.

When `sessionStatuses[sid]` has no entry, fall back to `s.status` from the list fetch.

Precedence is a simple override: if `sessionStatuses[sid]` is defined, use it; otherwise use `s.status`.
