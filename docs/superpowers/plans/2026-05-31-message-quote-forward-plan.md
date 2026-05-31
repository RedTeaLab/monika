# Message Quoting & Forwarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add message quoting (in-session reply) and forwarding (cross-session quoting) to Monika's chat, with multi-select support.

**Architecture:** Frontend-driven approach with a new `QuotedMessage` type on the Go `ChatMessage` struct for future-proofing. The frontend manages quote selection, preview, and display entirely in-memory; quoted context is formatted as a markdown block and prepended to the message text before sending to the AI provider. No Wails API signature changes required.

**Tech Stack:** Go (backend structs), TypeScript/React/Zustand (frontend store + components), Tailwind CSS

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `pkg/engine/provider.go` | Modify | Add `QuotedMessage` type and field to `ChatMessage` |
| `frontend/src/store/index.ts` | Modify | Add `QuotedMessage` interface, multi-select state, actions |
| `frontend/src/components/Chat/MessageBubble.tsx` | Modify | Hover buttons, checkbox, quoted-message display card |
| `frontend/src/components/Chat/QuotePreview.tsx` | Create | Compact preview card above input |
| `frontend/src/components/Chat/SessionPicker.tsx` | Create | Modal for forward target session selection |
| `frontend/src/components/Chat/MultiSelectBar.tsx` | Create | Bottom action bar during multi-select mode |
| `frontend/src/components/Chat/ChatInput.tsx` | Modify | Accept `quotedMessages` prop, format into text on send |
| `frontend/src/components/Chat/ChatArea.tsx` | Modify | Wire new components, manage selection lifecycle |

---

### Task 1: Add `QuotedMessage` to Go ChatMessage

**Files:**
- Modify: `pkg/engine/provider.go`

- [ ] **Step 1: Add types**

In `pkg/engine/provider.go`, add after the `ChatMessage` struct:

```go
// QuotedMessage is a snapshot of a referenced message used for quoting/forwarding.
type QuotedMessage struct {
	ID      string `json:"id"`
	Role    string `json:"role"`
	Content string `json:"content"`
}
```

Add the `QuotedMessages` field to `ChatMessage`:

```go
type ChatMessage struct {
	Role             string          `json:"role"`
	Content          string          `json:"content"`
	ReasoningContent string          `json:"reasoning_content"`
	ToolCalls        []ToolCall      `json:"tool_calls,omitempty"`
	ToolCallID       string          `json:"tool_call_id,omitempty"`
	Name             string          `json:"name,omitempty"`
	TokenUsage       *Usage          `json:"token_usage,omitempty"`
	QuotedMessages   []QuotedMessage `json:"quoted_messages,omitempty"`
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd d:/git/monika && go build ./...`
Expected: no errors (field is additive and optional)

- [ ] **Step 3: Commit**

```bash
git add pkg/engine/provider.go
git commit -m "feat: add QuotedMessage type to ChatMessage struct"
```

---

### Task 2: Extend frontend store with multi-select state

**Files:**
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: Add `QuotedMessage` interface**

After the existing `interface ToolCall` block, add:

```typescript
export interface QuotedMessage {
  id: string
  role: string
  content: string
}
```

- [ ] **Step 2: Add `quotedMessages` to `Message` interface**

In the `Message` interface, add after `tools?: ToolCall[]`:

```typescript
  quotedMessages?: QuotedMessage[]
```

- [ ] **Step 3: Add multi-select state to `AppState`**

Add to the `interface AppState` block (before `addMessage`):

```typescript
  selectedMessageIds: string[]
  multiSelectMode: 'quote' | 'forward' | null
```

- [ ] **Step 4: Add multi-select actions to `AppState`**

Add to `interface AppState` (after `appendPathToInput`):

```typescript
  toggleMessageSelection: (id: string) => void
  enterMultiSelect: (mode: 'quote' | 'forward', initialId: string) => void
  clearSelection: () => void
```

- [ ] **Step 5: Add initial values to `create` call**

In the initial state object (between `chatInputAppendPath: null` and `addMessage`):

```typescript
  selectedMessageIds: [] as string[],
  multiSelectMode: null as 'quote' | 'forward' | null,
```

- [ ] **Step 6: Add action implementations to `create` call**

After `appendPathToInput: (path) => set({ chatInputAppendPath: path })`:

```typescript
  toggleMessageSelection: (id) => set((s) => {
    const ids = s.selectedMessageIds.includes(id)
      ? s.selectedMessageIds.filter(x => x !== id)
      : [...s.selectedMessageIds, id]
    return { selectedMessageIds: ids }
  }),

  enterMultiSelect: (mode, initialId) => set({
    multiSelectMode: mode,
    selectedMessageIds: [initialId],
  }),

  clearSelection: () => set({
    multiSelectMode: null,
    selectedMessageIds: [],
  }),
```

- [ ] **Step 7: Add to `resetProjectState`**

In the `resetProjectState` object, add:

```typescript
      selectedMessageIds: [],
      multiSelectMode: null,
```

- [ ] **Step 8: Verify build**

Run: `cd d:/git/monika/frontend && npm run build:dev`
Expected: no TypeScript errors

- [ ] **Step 9: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat: add QuotedMessage type and multi-select state to store"
```

---

### Task 3: Add hover quote/forward buttons and checkbox to MessageBubble

**Files:**
- Modify: `frontend/src/components/Chat/MessageBubble.tsx`

- [ ] **Step 1: Import store hooks**

At the top of the file, add to the existing imports:

```typescript
import { useStore, QuotedMessage } from '../../store'
```

- [ ] **Step 2: Add `QuotedMessage` to local `Message` interface**

In the local `interface Message` at the top of the file, add:

```typescript
  quotedMessages?: QuotedMessage[]
```

- [ ] **Step 3: Add `onQuote`, `onForward`, `multiSelectMode`, `isSelected` to props**

Change `interface MessageBubbleProps`:

```typescript
interface MessageBubbleProps {
  message: Message
  isGenerating?: boolean
  hideExtras?: boolean
  onQuote?: (id: string) => void
  onForward?: (id: string) => void
  multiSelectMode?: 'quote' | 'forward' | null
  isSelected?: boolean
  onToggleSelect?: (id: string) => void
}
```

- [ ] **Step 4: Update the `MessageBubble` function signature**

```typescript
const MessageBubble = React.memo(function MessageBubble({ message, isGenerating, hideExtras, onQuote, onForward, multiSelectMode, isSelected, onToggleSelect }: MessageBubbleProps) {
```

- [ ] **Step 5: Add quoted-messages display card**

At the top of the return for user/assistant messages (before existing content), add:

```typescript
      {message.quotedMessages && message.quotedMessages.length > 0 && (
        <div
          className="mb-2 px-2 py-1.5 rounded-md border-l-2 text-[12px]"
          style={{
            background: 'var(--bg-sidebar)',
            borderColor: 'var(--border)',
            color: 'var(--text-dim)',
          }}
        >
          {message.quotedMessages.map((qm, i) => (
            <div key={i} className="flex gap-1.5 truncate">
              <span
                className="text-[10px] font-semibold uppercase shrink-0"
                style={{ color: qm.role === 'user' ? 'var(--accent)' : 'var(--text-dim)' }}
              >
                {qm.role === 'user' ? 'You' : qm.role === 'assistant' ? 'Assistant' : qm.role}
              </span>
              <span className="truncate">{qm.content.slice(0, 100)}</span>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 6: Add checkbox and hover buttons to user/assistant messages**

In the main return of user and assistant messages, wrap the existing content with a container that includes the checkbox and hover buttons. For the user message case, after the `<div>` that wraps `RoleLabel` and `MsgBlock`, add a wrapping div with relative positioning. Place this block inside the user message return AND the assistant message return (for the assistant case, it goes around the existing fragment):

For user messages, replace:
```tsx
        <div>
          <RoleLabel role="user" />
          <MsgBlock ...>
```
with:
```tsx
        <div className="group/bubble relative">
          {multiSelectMode && (
            <div className="absolute left-[-28px] top-1/2 -translate-y-1/2 z-10">
              <input
                type="checkbox"
                checked={isSelected || false}
                onChange={() => onToggleSelect?.(message.id)}
                className="w-4 h-4 rounded accent-[var(--accent)] cursor-pointer"
                style={{ accentColor: 'var(--accent)' }}
              />
            </div>
          )}
          {!isGenerating && !multiSelectMode && onQuote && onForward && (
            <div className="absolute right-0 top-0 opacity-0 group-hover/bubble:opacity-100 transition-opacity z-10 flex gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); onQuote(message.id) }}
                className="text-[10px] font-semibold uppercase tracking-[0.04em] rounded px-1.5 py-0.5 hover:bg-[var(--bg-hover)] cursor-pointer"
                style={{ color: 'var(--text-dim)' }}
              >
                Quote
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onForward(message.id) }}
                className="text-[10px] font-semibold uppercase tracking-[0.04em] rounded px-1.5 py-0.5 hover:bg-[var(--bg-hover)] cursor-pointer"
                style={{ color: 'var(--text-dim)' }}
              >
                Forward
              </button>
            </div>
          )}
          <div style={{ borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent', paddingLeft: '12px', borderRadius: '0 4px 4px 0', transition: 'border-color 0.15s' }}>
            <RoleLabel role="user" />
            <MsgBlock ...>
          </div>
        </div>
```

Apply similar pattern for the assistant message block.

- [ ] **Step 7: Update the ChatArea call sites to pass new props**

(Will be done in Task 7 when ChatArea is modified)

- [ ] **Step 8: Verify build**

Run: `cd d:/git/monika/frontend && npm run build:dev`
Expected: no TypeScript errors

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/Chat/MessageBubble.tsx
git commit -m "feat: add quote/forward buttons and quoted-message display to MessageBubble"
```

---

### Task 4: Create QuotePreview component

**Files:**
- Create: `frontend/src/components/Chat/QuotePreview.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { QuotedMessage } from '../../store'

interface QuotePreviewProps {
  messages: QuotedMessage[]
  onRemove: (id: string) => void
  onClear: () => void
}

export default function QuotePreview({ messages, onRemove, onClear }: QuotePreviewProps) {
  if (messages.length === 0) return null

  return (
    <div
      className="mx-4 mb-1 rounded-md px-3 py-2"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.04em]" style={{ color: 'var(--text-dim)' }}>
          Quoting {messages.length} message{messages.length > 1 ? 's' : ''}
        </span>
        <button
          onClick={onClear}
          className="text-[10px] font-semibold uppercase tracking-[0.04em] hover:underline cursor-pointer"
          style={{ color: 'var(--text-dim)' }}
        >
          Clear
        </button>
      </div>
      <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
        {messages.map((qm) => (
          <div
            key={qm.id}
            className="flex items-center gap-1.5 text-[12px] py-0.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span
              className="text-[10px] font-semibold uppercase shrink-0"
              style={{ color: qm.role === 'user' ? 'var(--accent)' : 'var(--text-dim)' }}
            >
              {qm.role === 'user' ? 'You' : qm.role === 'assistant' ? 'Assistant' : qm.role}
            </span>
            <span className="truncate">{qm.content.slice(0, 150)}</span>
            <button
              onClick={() => onRemove(qm.id)}
              className="shrink-0 ml-auto text-[14px] leading-none hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              style={{ color: 'var(--text-dim)' }}
              aria-label="Remove"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd d:/git/monika/frontend && npm run build:dev`
Expected: no errors (component is not yet imported anywhere)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Chat/QuotePreview.tsx
git commit -m "feat: add QuotePreview component"
```

---

### Task 5: Create SessionPicker component

**Files:**
- Create: `frontend/src/components/Chat/SessionPicker.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react'
import { useStore } from '../../store'

interface SessionPickerProps {
  open: boolean
  onSelect: (sessionId: string) => void
  onCancel: () => void
  excludeSessionId?: string
}

export default function SessionPicker({ open, onSelect, onCancel, excludeSessionId }: SessionPickerProps) {
  const [search, setSearch] = useState('')
  const openSessions = useStore((s) => s.openSessions)

  if (!open) return null

  const filtered = openSessions.filter((s) => {
    if (s.id === excludeSessionId) return false
    if (!search) return true
    return s.title.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onCancel}
    >
      <div
        className="rounded-lg p-4 min-w-[320px] max-w-[440px] max-h-[60vh] flex flex-col"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[13px] font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Forward to Session
        </div>
        <input
          type="text"
          placeholder="Search sessions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          className="text-[13px] px-3 py-1.5 rounded-md mb-3 outline-none border"
          style={{
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            borderColor: 'var(--border)',
          }}
        />
        <div className="flex-1 overflow-y-auto flex flex-col gap-0.5">
          {filtered.length === 0 ? (
            <div className="text-[12px] py-4 text-center" style={{ color: 'var(--text-dim)' }}>
              No sessions found
            </div>
          ) : (
            filtered.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className="text-left text-[13px] px-3 py-2 rounded-md hover:bg-[var(--bg-hover)] transition-colors truncate cursor-pointer"
                style={{ color: 'var(--text-primary)' }}
              >
                {s.title || 'Untitled'}
              </button>
            ))
          )}
        </div>
        <div className="flex justify-end mt-3">
          <button
            onClick={onCancel}
            className="text-[12px] font-semibold uppercase tracking-[0.04em] px-3 py-1.5 rounded hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            style={{ color: 'var(--text-dim)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd d:/git/monika/frontend && npm run build:dev`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Chat/SessionPicker.tsx
git commit -m "feat: add SessionPicker component for forward target selection"
```

---

### Task 6: Create MultiSelectBar component

**Files:**
- Create: `frontend/src/components/Chat/MultiSelectBar.tsx`

- [ ] **Step 1: Create the component**

```tsx
interface MultiSelectBarProps {
  count: number
  mode: 'quote' | 'forward'
  onConfirm: () => void
  onCancel: () => void
}

export default function MultiSelectBar({ count, mode, onConfirm, onCancel }: MultiSelectBarProps) {
  const label = mode === 'quote' ? 'Confirm Quote' : 'Confirm Forward'

  return (
    <div
      className="border-t px-4 py-2 flex items-center gap-3"
      style={{
        background: 'var(--bg-sidebar)',
        borderColor: 'var(--border)',
      }}
    >
      <span className="text-[13px]" style={{ color: 'var(--text-primary)' }}>
        {count} selected
      </span>
      <div className="flex-1" />
      <button
        onClick={onCancel}
        className="text-[12px] font-semibold uppercase tracking-[0.04em] px-3 py-1 rounded hover:bg-[var(--bg-hover)] cursor-pointer"
        style={{ color: 'var(--text-dim)' }}
      >
        Cancel
      </button>
      <button
        onClick={onConfirm}
        disabled={count === 0}
        className="text-[12px] font-semibold uppercase tracking-[0.04em] px-3 py-1 rounded cursor-pointer"
        style={{
          background: count > 0 ? 'var(--accent)' : 'var(--border)',
          color: count > 0 ? '#fff' : 'var(--text-dim)',
          opacity: count > 0 ? 1 : 0.5,
        }}
      >
        {label}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd d:/git/monika/frontend && npm run build:dev`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Chat/MultiSelectBar.tsx
git commit -m "feat: add MultiSelectBar component"
```

---

### Task 7: Modify ChatInput to accept and format quotedMessages

**Files:**
- Modify: `frontend/src/components/Chat/ChatInput.tsx`

- [ ] **Step 1: Add `quotedMessages` prop**

Change the `ChatInput` function props:

```typescript
function ChatInput({ onSend, onStop, onRunShell, disabled, quotedMessages }: {
  onSend: (text: string) => void
  onStop: () => void
  onRunShell: (command: string) => void
  disabled: boolean
  quotedMessages?: { id: string; role: string; content: string }[]
}) {
```

- [ ] **Step 2: Format quoted messages into text on send**

In `handleSubmit`, before the line `// Normal message`, add quotation formatting. Replace:

```typescript
    // Normal message
    onSend(resolved)
```

with:

```typescript
    // Prepend quoted messages as formatted context block
    if (quotedMessages && quotedMessages.length > 0) {
      const quoteBlock = quotedMessages
        .map(qm => `> **${qm.role}**: ${qm.content.slice(0, 500)}`)
        .join('\n')
      resolved = `${quoteBlock}\n\n---\n${resolved}`
    }

    // Normal message
    onSend(resolved)
```

- [ ] **Step 3: Verify build**

Run: `cd d:/git/monika/frontend && npm run build:dev`
Expected: no errors (will have a TS error about missing `quotedMessages` prop in ChatArea until Task 8)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Chat/ChatInput.tsx
git commit -m "feat: add quotedMessages prop to ChatInput and format into text on send"
```

---

### Task 8: Wire everything together in ChatArea

**Files:**
- Modify: `frontend/src/components/Chat/ChatArea.tsx`

- [ ] **Step 1: Import new components**

Add imports:

```typescript
import QuotePreview from './QuotePreview'
import SessionPicker from './SessionPicker'
import MultiSelectBar from './MultiSelectBar'
```

- [ ] **Step 2: Subscribe to multi-select state**

Add after existing store subscriptions:

```typescript
  const selectedMessageIds = useStore((s) => s.selectedMessageIds)
  const multiSelectMode = useStore((s) => s.multiSelectMode)
  const toggleMessageSelection = useStore((s) => s.toggleMessageSelection)
  const enterMultiSelect = useStore((s) => s.enterMultiSelect)
  const clearSelection = useStore((s) => s.clearSelection)
  const switchSessionTab = useStore((s) => s.switchSessionTab)
```

- [ ] **Step 3: Add quote preview state**

```typescript
  const [quotePreviewMessages, setQuotePreviewMessages] = useState<{ id: string; role: string; content: string }[]>([])
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false)
```

- [ ] **Step 4: Clear selection on session switch**

Add a `useEffect` that clears selection when `sessionId` changes:

```typescript
  useEffect(() => {
    clearSelection()
    setQuotePreviewMessages([])
    setSessionPickerOpen(false)
  }, [sessionId])
```

- [ ] **Step 5: Add keyboard handler for Escape**

Add a `useEffect` for Esc key:

```typescript
  useEffect(() => {
    if (!multiSelectMode) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection()
        setQuotePreviewMessages([])
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [multiSelectMode])
```

- [ ] **Step 6: Create handler functions**

Add before the return statement:

```typescript
  const handleQuote = (id: string) => {
    enterMultiSelect('quote', id)
  }

  const handleForward = (id: string) => {
    enterMultiSelect('forward', id)
  }

  const buildQuotedMessages = (): { id: string; role: string; content: string }[] => {
    const store = useStore.getState()
    const msgs = isOverlay ? overlayMessages : messages
    return selectedMessageIds
      .map((id) => msgs.find((m: any) => m.id === id))
      .filter(Boolean)
      .map((m: any) => ({ id: m.id, role: m.role, content: truncateContent(m.content || '', 500) }))
  }

  const handleConfirmQuote = () => {
    const quoted = buildQuotedMessages()
    setQuotePreviewMessages(quoted)
    clearSelection()
  }

  const handleConfirmForward = () => {
    const quoted = buildQuotedMessages()
    setQuotePreviewMessages(quoted)
    clearSelection()
    setSessionPickerOpen(true)
  }

  const handleSessionPick = (targetSessionId: string) => {
    setSessionPickerOpen(false)
    switchSessionTab(targetSessionId)
    // QuotePreview along with quotedMessages is local state — needs to persist across session switch.
    // The preview will be rendered above the input in the new session.
  }

  const handleRemoveQuoteMessage = (id: string) => {
    setQuotePreviewMessages((prev) => prev.filter((m) => m.id !== id))
  }

  const handleClearQuote = () => {
    setQuotePreviewMessages([])
  }
```

Add a helper:

```typescript
function truncateContent(content: string, maxLen: number): string {
  return content.length > maxLen ? content.slice(0, maxLen) + '...' : content
}
```

- [ ] **Step 7: Update MessageBubble calls to pass new props**

In the messages `.map()` call where `<MessageBubble>` is rendered, add:

```typescript
  onQuote={handleQuote}
  onForward={handleForward}
  multiSelectMode={multiSelectMode}
  isSelected={selectedMessageIds.includes(msg.id)}
  onToggleSelect={toggleMessageSelection}
```

- [ ] **Step 8: Add QuotePreview, MultiSelectBar, and SessionPicker to JSX**

Before the `<ChatInput>` in the return, add:

```typescript
  {quotePreviewMessages.length > 0 && (
    <QuotePreview
      messages={quotePreviewMessages}
      onRemove={handleRemoveQuoteMessage}
      onClear={handleClearQuote}
    />
  )}
```

Replace the existing `<ChatInput>` with:

```typescript
  {multiSelectMode ? (
    <MultiSelectBar
      count={selectedMessageIds.length}
      mode={multiSelectMode}
      onConfirm={multiSelectMode === 'quote' ? handleConfirmQuote : handleConfirmForward}
      onCancel={() => { clearSelection(); setQuotePreviewMessages([]) }}
    />
  ) : (
    <ChatInput
      onSend={handleSend}
      onStop={handleStop}
      onRunShell={handleRunShell}
      disabled={isGenerating}
      quotedMessages={quotePreviewMessages.length > 0 ? quotePreviewMessages : undefined}
    />
  )}
```

After `ChatInput`, add:

```typescript
  <SessionPicker
    open={sessionPickerOpen}
    onSelect={handleSessionPick}
    onCancel={() => setSessionPickerOpen(false)}
    excludeSessionId={sessionId}
  />
```

- [ ] **Step 9: Handle forward — persist quote preview across session switch**

Modify `handleSessionPick` to store forwarded messages in a cross-session state. Add to component top level:

```typescript
// Stores forwarded quote data keyed by target session ID
const [forwardedQuotes, setForwardedQuotes] = useState<Record<string, { id: string; role: string; content: string }[]>>({})
```

Update `handleSessionPick`:

```typescript
  const handleSessionPick = (targetSessionId: string) => {
    setForwardedQuotes((prev) => ({ ...prev, [targetSessionId]: quotePreviewMessages }))
    setSessionPickerOpen(false)
    switchSessionTab(targetSessionId)
  }
```

Add a `useEffect` to restore forwarded quotes when switching to a session:

```typescript
  useEffect(() => {
    if (forwardedQuotes[sessionId]) {
      setQuotePreviewMessages(forwardedQuotes[sessionId])
      setForwardedQuotes((prev) => {
        const next = { ...prev }
        delete next[sessionId]
        return next
      })
    }
  }, [sessionId])
```

- [ ] **Step 10: Clear quote preview after successful send**

In the existing `handleSend` function, add at the top:

```typescript
    setQuotePreviewMessages([])
```

- [ ] **Step 11: Verify build**

Run: `cd d:/git/monika/frontend && npm run build:dev`
Expected: no TypeScript errors

- [ ] **Step 12: Commit**

```bash
git add frontend/src/components/Chat/ChatArea.tsx
git commit -m "feat: wire quote/forward UI in ChatArea with multi-select flow"
```

---

### Task 9: Add quotedMessages to session message loading

**Files:**
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: Update `loadSessionMessages` to preserve quotedMessages**

In the `loadSessionMessages` function, add `quoted_messages` extraction. Update the user message creation:

Replace:
```typescript
      result.push({ id: crypto.randomUUID(), role: 'user', content: m.content || '' })
```

With:
```typescript
      result.push({
        id: crypto.randomUUID(),
        role: 'user',
        content: m.content || '',
        quotedMessages: (m as any).quoted_messages?.map((qm: any) => ({
          id: qm.id || '',
          role: qm.role || '',
          content: qm.content || '',
        })) || undefined,
      })
```

Do the same for assistant messages:

Replace:
```typescript
        result.push({
          id: crypto.randomUUID(), role: 'assistant',
```

With:
```typescript
        result.push({
          id: crypto.randomUUID(), role: 'assistant',
          quotedMessages: (m as any).quoted_messages?.map((qm: any) => ({
            id: qm.id || '',
            role: qm.role || '',
            content: qm.content || '',
          })) || undefined,
```

- [ ] **Step 2: Verify build**

Run: `cd d:/git/monika/frontend && npm run build:dev`
Expected: no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat: preserve quotedMessages when loading sessions"
```

---

### Task 10: Add package-level test for QuotedMessage serialization

**Files:**
- Create: `pkg/engine/provider_test.go`

- [ ] **Step 1: Create test file**

```go
package engine

import (
	"encoding/json"
	"testing"
)

func TestChatMessageWithQuotedMessages(t *testing.T) {
	msg := ChatMessage{
		Role:    "user",
		Content: "hello",
		QuotedMessages: []QuotedMessage{
			{ID: "msg-1", Role: "assistant", Content: "quoted content"},
		},
	}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded ChatMessage
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if len(decoded.QuotedMessages) != 1 {
		t.Fatalf("expected 1 quoted message, got %d", len(decoded.QuotedMessages))
	}
	if decoded.QuotedMessages[0].Content != "quoted content" {
		t.Fatalf("unexpected content: %q", decoded.QuotedMessages[0].Content)
	}
}

func TestChatMessageWithoutQuotedMessages(t *testing.T) {
	msg := ChatMessage{Role: "user", Content: "hello"}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	// omitempty should exclude empty slice
	if string(data) != `{"role":"user","content":"hello"}` {
		t.Fatalf("unexpected JSON: %s", string(data))
	}
}
```

- [ ] **Step 2: Run tests**

Run: `cd d:/git/monika && go test ./pkg/engine/ -v -run TestChatMessage`
Expected: both tests PASS

- [ ] **Step 3: Commit**

```bash
git add pkg/engine/provider_test.go
git commit -m "test: add ChatMessage QuotedMessages serialization tests"
```
