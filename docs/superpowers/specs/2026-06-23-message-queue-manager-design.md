# Session Message Queue Manager — Design Spec

**Date:** 2026-06-23
**Status:** Implemented
**Approach:** A — Embed queue in SessionManager

## Problem

When a session is generating, new messages are hard-rejected at both the frontend (`generatingSessionIds` check in `ChatArea.tsx:190`) and backend (`cancelFuncs` check in `app.go:678`). Users cannot queue follow-up messages while the agent is working. This forces a strict send-wait-send workflow with no way to plan ahead or batch messages.

## Solution

Add a per-session message queue. Messages sent while the agent is busy are queued instead of rejected. The queue auto-drains as the agent completes each message. Users can modify, reorder, and cancel queued messages through a dedicated UI.

## Requirements Summary

| Item | Decision |
|---|---|
| Execution mode | Hybrid — auto-execute by default, user can pause for manual control |
| Persistence | Queue saved to disk as part of session JSON, survives app restart |
| UI layout | Inline bar above chat input (always visible, auto/manual mode toggle) |
| Queue scope | Chat messages only (shell commands and compaction still reject when busy) |
| Error handling | Pause queue on failure, user decides: retry / skip / edit-then-retry |
| Queue operations | Modify text, drag-to-reorder, cancel, manual run (manual mode) |

## Architecture: Approach A (Embed in SessionManager)

The queue is stored as a field on the existing `Session` struct and persisted alongside the session JSON. This reuses the existing `SessionManager` Lock/Load/Save pattern with minimal new infrastructure.

## 1. Data Model

### `QueuedMessage` (new struct in `internal/api/types.go`)

```go
type QueuedMessage struct {
    ID         string `json:"id"`                       // UUID
    Text       string `json:"text"`                     // message text (editable)
    ProviderID string `json:"provider_id"`              // provider selected at send time
    Model      string `json:"model"`                    // model selected at send time
    Status     string `json:"status"`                   // "queued" | "executing" | "error"
    Error      string `json:"error,omitempty"`          // failure reason
    CreatedAt  int64  `json:"created_at"`               // unix timestamp for ordering reference
}
```

### `Session` changes (`internal/api/session_manager.go`)

```go
type Session struct {
    ...existing fields...
    Queue       []QueuedMessage `json:"queue,omitempty"`
    QueuePaused bool            `json:"queue_paused,omitempty"`
}
```

- Queue items persist with the session JSON via existing Load/Save.
- `QueuePaused` marks whether auto-execution is paused.
- The currently executing message has `Status="executing"`; on completion it is removed from the queue and enters `Messages` history (existing behavior).

## 2. Backend Queue Logic

### `SendMessage` flow change (`internal/api/app.go`)

Current behavior: if `cancelFuncs[sessionID]` exists, return error `"session is already generating"`.

New behavior — **always enqueue**:

```
SendMessage(projectPath, sessionID, text, providerID, model):
  1. Lock session, Load
  2. Validate provider exists
  3. Create QueuedMessage{ID: uuid, Text, ProviderID, Model, Status: "queued", CreatedAt: now}
  4. Append to s.Queue
  5. Save session, Unlock
  6. Emit "queue_updated" event
  7. If agent is idle (cancelFuncs[sessionID] absent) AND not paused:
     → drainQueue(sm, sessionID)  // picks up the item immediately
```

> **Design deviation from original spec:** The original spec proposed enqueuing only when busy and executing immediately when idle. The actual implementation **always enqueues** then calls `drainQueue`. This eliminates the conditional branch entirely and avoids a check-then-act race on `cancelFuncs`. When the agent is idle, `drainQueue` picks up the item within milliseconds — the user perceives immediate execution. When busy, the item waits in the queue.

### Auto-drain mechanism

In the agent loop completion goroutine (`startAgentLoop` in `app.go`), after the agent loop finishes:

```
goroutine cleanup (3 paths):
  1. Cancel path (ctx.Err() != nil):
     → Reload session from disk (preserve concurrent changes)
     → Copy conversation data via copyConversationData()
     → Set StatusPending, Save
     → delete(cancelFuncs[sessionID])
     → return (no drain)

  2. Error path (hadError && queueItemID != ""):
     → Reload session from disk
     → Copy conversation data
     → Set queue item Status="error"
     → Set QueuePaused = true
     → Set StatusPending, Save
     → delete(cancelFuncs[sessionID])
     → Emit "queue_error"
     → return (no drain — queue paused)

  3. Normal completion path:
     → Reload session from disk
     → Copy conversation data
     → Remove completed queue item
     → Set StatusPending, Save
     → Sync s.Queue from fresh copy
     → Emit "queue_updated"
     → delete(cancelFuncs[sessionID])  // BEFORE drain so drainQueue sees idle
     → drainQueue(sm, sessionID)       // chains to next item if not paused
```

> **Concurrency safety:** All three paths reload the session from disk before saving (`sm.Load(sessionID)`) to avoid overwriting concurrent queue modifications from `SendMessage`/`PauseQueue`/`CancelQueueItem`. The `copyConversationData()` helper copies Messages/TokenCount/TokenMax/CompactionCount/CompactionFrom/Provider/Model from the goroutine's in-memory session to the fresh disk copy.

### Pause / Resume (Auto / Manual mode)

- `PauseQueue(sessionID)`: set `QueuePaused = true`, Save. UI shows "Manual Mode".
- `ResumeQueue(sessionID)`: set `QueuePaused = false`, Save. UI shows "Auto Mode". If session is idle and queue has queued items → immediately trigger execution of the first item.
- `ExecuteQueueItem(sessionID, itemID)` (manual mode only): move target item to front of queue, mark "executing", start agent loop directly. Bypasses normal drain order — user picks which item runs next.

### Error handling

```
Agent loop error:
  1. Find Queue item with Status="executing"
  2. Set Status="error", Error=<error message>
  3. Set QueuePaused = true
  4. Emit "queue_error" event

User recovery options:
  - Retry:   RetryQueueItem (resets Status to "queued" AND resumes queue)
  - Skip:    SkipQueueItem (removes item AND resumes queue)
  - Edit:    EditQueueItem (change text), then RetryQueueItem
```

## 3. Wails API Bindings

### New methods (`internal/api/app.go`)

| Method | Description |
|---|---|
| `GetQueue(projectPath, sessionID) []QueuedMessage` | Return current queue |
| `EditQueueItem(projectPath, sessionID, itemID, newText)` | Edit a queued message's text |
| `ReorderQueue(projectPath, sessionID, itemIds [])` | Reorder queue by given ID sequence (preserves unlisted items) |
| `CancelQueueItem(projectPath, sessionID, itemID)` | Cancel/remove a queue item (behavior depends on status — see Cancel Behavior below) |
| `PauseQueue(projectPath, sessionID)` | Pause auto-execution (switch to manual mode) |
| `ResumeQueue(projectPath, sessionID)` | Resume auto-execution (triggers if idle) |
| `RetryQueueItem(projectPath, sessionID, itemID)` | Reset failed item to "queued" and resume queue |
| `SkipQueueItem(projectPath, sessionID, itemID)` | Remove failed item and resume queue |
| `ExecuteQueueItem(projectPath, sessionID, itemID)` | Manual mode: execute specific item immediately (moves to front, bypasses drain order) |

All methods follow the `sm.Lock() → Load → modify Queue → Save → Unlock` pattern for thread safety.

### Modified existing methods

`SendMessage` — always enqueues, then triggers `drainQueue` if idle. No direct execution path remains. Also validates provider before enqueuing.

`CancelGeneration` — now also resets any `"executing"` queue items to `"error"` (Stop button path).

### Events emitted via Wails EventEmit

| Event | Trigger |
|---|---|
| `queue_updated` | Queue changed (item added, removed, reordered, status changed) |
| `queue_item_started` | A queue item begins executing (event payload includes message text, provider, model so frontend can add it to chat) |
| `queue_error` | A queue item failed, queue paused |

## 4. Cancel Behavior

Two distinct cancel scenarios:

| Scenario | Behavior |
|---|---|
| **Cancel executing message** | Stop agent loop (CancelGeneration) + set item Status="error", Error="cancelled by user" + **pause entire queue** (`QueuePaused = true`) + emit `queue_error`. User must manually ResumeQueue to continue. |
| **Cancel queued message** | Remove item from Queue. Queue continues normally — no pause. |

`CancelQueueItem` branches on item Status:

```
CancelQueueItem(sessionID, itemID):
  If item.Status == "executing":
    → CancelGeneration(sessionID)
    → item.Status = "error", Error = "cancelled by user"
    → QueuePaused = true
    → Emit "queue_error"
  If item.Status == "queued" or "error":
    → Remove from Queue
    → Emit "queue_updated"
```

## 5. Frontend Design

### New components

**`QueuePanel`** (inline bar above chat input, always visible)
- Auto/Manual mode toggle button (green "Auto Mode" / yellow "Manual Mode")
- Shows queue count badge when items exist
- Collapsible list of queue items below the bar

**`QueueItem`** (reusable single-item component)
- Click to enter inline edit mode
- Drag handle for reorder (HTML5 drag-and-drop)
- Status indicator (queued / executing / error)
- In manual mode: shows "Run" button to execute this specific item
- Error state: additional retry/skip buttons

### `ChatInput` changes

- New `isGenerating` prop: when true, input stays editable. Shows both stop button (cancel agent) and send button (queue message, yellow icon).
- QueuePanel rendered above the input field.

### Zustand store additions (`frontend/src/store/index.ts`)

```ts
// New state
sessionQueues: Record<string, QueuedMessage[]>
queuePaused: Record<string, boolean>

// New actions
setQueue(sessionId, items)
updateQueueItem(sessionId, itemId, changes)
removeQueueItem(sessionId, itemId)
reorderQueue(sessionId, itemIds)
toggleQueuePause(sessionId)
```

### Event listeners (in `setupWailsEvents()`)

| Event | Frontend action |
|---|---|
| `queue_updated` | Update `sessionQueues[sid]` |
| `queue_item_started` | Update corresponding item status to executing, add user message + assistant placeholder to chat (payload includes text/provider/model) |
| `queue_error` | Update item status to error, set `queuePaused[sid] = true` |

### Send message flow change (`ChatArea.tsx`)

Always calls `SendMessage` (no busy guard). The backend always enqueues. No optimistic UI — the `queue_item_started` event adds the user message + assistant placeholder to chat when the item actually begins executing. The `queue_updated` event refreshes the QueuePanel immediately to show the queued item.

## 6. Edge Cases & Recovery

### App restart recovery

Existing `resetStaleSessions` (`app.go:1556`) resets `StatusGenerating` → `StatusPending`. Add:

- Scan all sessions' `Queue` fields
- Reset any `Status="executing"` items to `"queued"` (crash recovery — incomplete execution)
- If session is idle AND `QueuePaused=false` AND has `"queued"` items → auto-trigger execution of first item

### Concurrency

- All queue operation methods go through `sm.Lock() → Load → modify Queue → Save → Unlock`, ensuring serialization.
- The agent loop goroutine runs concurrently with `SendMessage`/`PauseQueue`/etc. To avoid stale overwrites, the goroutine **reloads the session from disk** (`sm.Load(sessionID)`) at all save points before writing.
- `cancelFuncs[sessionID]` serves as the "agent busy" indicator. It is deleted explicitly in each goroutine return path **before** calling `drainQueue`, so `drainQueue` correctly sees the session as idle.
- `copyConversationData()` helper centralizes the 7-field conversation data copy, avoiding duplication across the 3 goroutine save paths.

### Operation permissions by status

| Operation | queued | executing | error |
|---|---|---|---|
| Edit text | yes | no | yes |
| Drag reorder | yes | no (fixed position) | yes |
| Cancel/remove | yes (simple removal) | yes (cancel gen + pause queue) | yes (simple removal) |
| Retry | — | — | yes |

## 7. Testing Strategy

### Go backend

- Unit test `Session` queue save/load round-trip
- Unit test `SendMessage` enqueue behavior when busy (mock agent loop)
- Unit test auto-drain chain (mock agent loop completing → next item starts)
- Unit test error → pause → retry/skip flows
- Unit test restart recovery (executing → queued reset)
- Unit test concurrent SendMessage (two goroutines, same busy session)

### Frontend

- Manual testing via dev mode (`wails3 dev`)
- Verify QueuePanel renders, drag-reorder works, inline edit works
- Verify event-driven updates (queue_updated, queue_error)
- Verify overflow → full page transition at >10 items
