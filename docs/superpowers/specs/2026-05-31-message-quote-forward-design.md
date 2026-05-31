# Message Quoting & Forwarding Design

**Date**: 2026-05-31
**Status**: Draft

## Overview

Add message quoting (引用) and forwarding (转发) to Monika's chat. Both are powered by a unified `quotedMessages` mechanism — quoting is in-session, forwarding is cross-session quoting. Supports selecting multiple messages.

---

## Data Model

### Backend: `pkg/engine/provider.go`

New types:

```go
type QuotedMessage struct {
    ID      string `json:"id"`
    Role    string `json:"role"`
    Content string `json:"content"` // truncated to 500 chars
}
```

`ChatMessage` gains an optional field:

```go
type ChatMessage struct {
    // ... existing fields unchanged ...
    QuotedMessages []QuotedMessage `json:"quoted_messages,omitempty"`
}
```

### Frontend: `frontend/src/store/index.ts`

```typescript
interface QuotedMessage {
  id: string
  role: string
  content: string
}
```

`Message` gains `quotedMessages?: QuotedMessage[]`.

### Storage

`QuotedMessages` serializes alongside the message in the session JSON file. No migration needed — new field is optional.

---

## Backend Changes

### `internal/api/app.go` — `SendMessage`

When constructing `ChatRequest`, if a user message carries `quotedMessages`, format them as a markdown-styled preamble and prepend to `Content`:

```
### Quoted messages:

**user**: This is the quoted content...
**assistant**: Another quoted message...

---
<user's actual input>
```

The raw `quotedMessages` field is NOT passed through to the AI provider.

No new API endpoints required. `SendMessage` handles both quote and forward.

---

## Frontend Changes

### Store (`store/index.ts`)

New state:
- `selectedMessageIds: Set<string>` — currently selected message IDs for multi-select
- `multiSelectMode: 'quote' | 'forward' | null` — which action triggered multi-select

New actions:
- `toggleMessageSelection(id: string)` — toggle single message
- `enterMultiSelect(mode: 'quote' | 'forward', initialId: string)` — enter mode, auto-select initial
- `clearSelection()` — exit multi-select, clear all

### MessageBubble (`MessageBubble.tsx`)

- On hover: show "引用" and "转发" buttons at top-right of the bubble
- When `multiSelectMode !== null`: show a checkbox on each message; checked = selected
- Selected messages get a visual highlight (accent border or background tint)
- Generating (streaming) messages do not show action buttons

### QuotePreview (new: `QuotePreview.tsx`)

A card displayed immediately above `ChatInput` when messages are selected and confirmed.

- Shows a compact list of quoted messages (role label + content preview, each ~1 line)
- Each entry has an × button to remove it from the preview
- Bottom: "引用 N 条消息" label + "清空" link
- Internally manages `quotedMessages` array; on send, passed to `ChatInput` for inclusion in the outgoing message

### ChatInput (`ChatInput.tsx`)

- When `quotedMessages` are present in the preview, include them in the `handleSend` call
- After successful send, clear the quote preview

### SessionPicker (new: `SessionPicker.tsx`)

Modal/dropdown for forward target selection.

- Lists all sessions in the current project (excluding the current session)
- Search/filter by session title
- On select: navigates to target session tab, sets quote preview in that session's input area
- Uses existing `openSessions` / session list data

### Bottom Action Bar (during multi-select)

Floating bar at the bottom of the chat area while `multiSelectMode !== null`:

- "已选 N 条" count
- Primary button: "确认引用" or "确认转发"
- Secondary button: "取消"
- Confirming "引用": clears multi-select, shows `QuotePreview` above input
- Confirming "转发": opens `SessionPicker`
- Cancel / Esc: clears selection, exits multi-select mode

### Quoted message display in sent messages

When a message (user or assistant) has `quotedMessages`, render a compact card at the top of the bubble showing the quoted content. For same-session quotes, clicking the card scrolls to the original message (if still present).

---

## Interaction Flows

### Quote (same session)

1. Hover message → click "引用"
2. Enter multi-select mode; this message auto-selected; checkboxes visible
3. User can check/uncheck additional messages
4. Click "确认引用" → exit multi-select → `QuotePreview` appears above input
5. User types message → clicks send
6. Message sent with `quotedMessages`; preview clears; new message renders with quote card

### Forward (cross-session)

1. Hover message → click "转发"
2. Enter multi-select mode; this message auto-selected; checkboxes visible
3. User can check/uncheck additional messages
4. Click "确认转发" → `SessionPicker` opens
5. User selects target session → navigates to that tab
6. `QuotePreview` appears above target session's input (with source session label)
7. User types additional content → sends
8. Message sent in target session with `quotedMessages`

### Cancel / Esc

At any point during multi-select, pressing Esc or clicking "取消" exits multi-select mode and clears selection. `QuotePreview` (if already shown) is dismissed.

---

## Edge Cases

| Scenario | Handling |
|---|---|
| Quoted message is later deleted | Content snapshot in `QuotedMessage.Content` survives; jump-to-source silently no-ops |
| Target session deleted during forward | SessionPicker loads list live; if session disappears mid-flow, backend returns error, frontend shows toast |
| Switch session tab during multi-select | Auto-exit multi-select and clear selection |
| Quote a generating/streaming message | Action buttons hidden on streaming messages |
| Confirm with zero selected | Primary button disabled when count = 0 |
| Quote across project | Not supported. Forward is same-project only. |
