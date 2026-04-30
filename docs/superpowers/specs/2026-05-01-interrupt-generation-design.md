# Interrupt Generation Design

## Overview

Allow users to stop an in-progress AI response. The backend cancellation chain already exists (`App.CancelGeneration`), this feature adds the UI affordance.

## UI: ChatInput

**File:** `frontend/src/components/Chat/ChatInput.tsx`

### Current state
- Textarea-only, no send button. Enter to submit, Shift+Enter for newline.
- During generation: textarea disabled, placeholder shows "Generating..."

### Changes
1. **Send button** — added next to the textarea (icon: arrow-up or send). Click triggers `onSend`.
2. **Stop button** — replaces send button when `disabled` is true. Square stop icon. Click triggers `onStop`.
3. **ESC shortcut** — `keydown` listener on the document (or textarea). If `Escape` and `disabled` is true, call `onStop`. No-op otherwise.
4. **New prop:** `onStop: () => void`

### Layout
```
[idle]     [textarea] [send button]
[generating] [textarea (disabled)] [stop button]
```

### ChatInput props
```
onSend: (text: string) => void
onStop: () => void
disabled: boolean
```

## UI: ChatArea

**File:** `frontend/src/components/Chat/ChatArea.tsx`

- Pass `onStop` to `ChatInput` — calls `App.CancelGeneration(generatingSessionId)`
- Everything else unchanged — `handleSend` and `disabled` logic stay as-is

## Store: Event Handling

**File:** `frontend/src/store/index.ts`

### Change
In `setupWailsEvents`, modify the `error` case:

- **Before:** always adds error message, session error, and console line
- **After:** when `data.content === 'cancelled'`, skip all that — just clear `generatingSessionId`

```typescript
case 'error':
  if (data.content === 'cancelled') {
    if (sid === store.generatingSessionId) {
      store.setGeneratingSessionId('')
    }
    break
  }
  // ... existing error handling unchanged
```

## Backend: No Changes

The cancellation chain already works:

1. `App.CancelGeneration(sessionID)` — calls stored `context.CancelFunc`
2. Agent loop checks `ctx.Done()` at turn start → emits `Event{Type: EventError, Content: "cancelled"}`
3. SSE stream aborts via HTTP request context propagation
4. `handleAgentEvent` converts to `StreamEvent{Type: "error", Content: "cancelled"}`
5. Goroutine cleans up cancel funcs map, saves partial conversation, emits `session_updated`

## Full Data Flow (Stop)

```
User presses ESC / clicks stop button
  → ChatInput.onStop()
    → App.CancelGeneration(generatingSessionId)
      → context.CancelFunc()
        → agent loop: emits EventError{cancelled}, returns
        → SSE stream: aborted
        → goroutine: saves conversation, emits session_updated
      → store: receives error event with content='cancelled'
        → clears generatingSessionId
      → ChatInput: disabled=false, stop button → send button
      → partial content stays as normal message
```

## Edge Cases

| Case | Behavior |
|------|----------|
| Rapid double-click stop | `context.CancelFunc` is idempotent |
| ESC while idle | `disabled` is false, no-op |
| Send new message after stop | `generatingSessionId` already cleared, normal flow |
| Switch session during generation | Existing session-switch safety handles it |

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/components/Chat/ChatInput.tsx` | Send button, stop button, ESC listener, `onStop` prop |
| `frontend/src/components/Chat/ChatArea.tsx` | Pass `onStop` to ChatInput |
| `frontend/src/store/index.ts` | Special-case `cancelled` in error event handler |
