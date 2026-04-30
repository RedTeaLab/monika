# Session List: Status Indicator

## Scope

Add a per-session status indicator to the session list sidebar. Each session row shows:
- **Spinning circle** while the session is generating output
- **Green dot** when the last generation completed successfully
- **Red dot** when the last generation ended in error
- **No indicator** for idle sessions (new or not yet messaged)

Status persists in the session JSON file so it survives app restarts.

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

Set `Status: "idle"` in the `New()` constructor so new sessions start idle.

### App.SendMessage — status lifecycle (`internal/api/app.go`)

In the goroutine that processes agent events:
- Before the event loop starts: `sm.SetStatus(s, "generating")` then `sm.Save(s)` so frontend sees it on next list fetch
- On `EventError`: `sm.SetStatus(s, "failure")` then `sm.Save(s)`
- On `EventDone`: `sm.SetStatus(s, "success")` then `sm.Save(s)`

Status saves happen inside `handleAgentEvent` for error/done, and before the goroutine for generating.

## Frontend

### TypeScript types (`frontend/bindings/monika/index.ts`)

```typescript
export interface SessionInfo {
    id: string;
    title: string;
    status: string;  // added
    updated_at: string;
}
```

### Zustand store (`frontend/src/store/index.ts`)

- Add `sessionStatuses: Record<string, string>` to track per-session status in memory
- In `setupWailsEvents()`:
  - `turn_start`: set `sessionStatuses[sid] = 'generating'`
  - `done`: set `sessionStatuses[sid] = 'success'` + bump session list version
  - `error`: set `sessionStatuses[sid] = 'failure'` + bump session list version

### SessionList component (`frontend/src/components/Sidebar/SessionList.tsx`)

Add a status indicator span after the session title, before the delete button:

```
[title] [indicator] [delete-btn]
```

Indicator rendering:
- `idle` — nothing rendered
- `generating` — spinning circle: `animate-spin` on an SVG or a border-based CSS spinner, using `var(--yellow)` color
- `success` — 6px solid green dot, `var(--green)`
- `failure` — 6px solid red dot, `var(--red)`

The status shown is the max of the store's in-memory `sessionStatuses[s.id]` and the persisted `s.status` from the backend (in-memory wins during active generation, persisted wins on initial load).

### CSS (`frontend/src/index.css`)

Add a `@keyframes spin` if not already present (Tailwind's `animate-spin` covers this via the Tailwind preset).

## Status precedence

During app lifetime, the store's `sessionStatuses` map takes priority over the persisted `SessionInfo.status` because it reflects real-time events. On initial load, `SessionInfo.status` from the backend provides the persisted state.

When `sessionStatuses[sid]` has no entry, fall back to `s.status` from the list fetch.
