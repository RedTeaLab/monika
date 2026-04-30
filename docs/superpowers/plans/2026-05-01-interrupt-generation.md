# Interrupt Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a send/stop button in ChatInput so users can interrupt in-progress AI generation, plus ESC keyboard shortcut.

**Architecture:** Modify 3 existing files — ChatInput gets send/stop button toggle and ESC listener, ChatArea wires the stop callback to existing `App.CancelGeneration`, and the store skips error-message display when the error is a user-initiated cancellation.

**Tech Stack:** React, TypeScript, Zustand, Wails v3 bindings

---

### Task 1: Add send/stop button and ESC shortcut to ChatInput

**Files:**
- Modify: `frontend/src/components/Chat/ChatInput.tsx`

- [ ] **Step 1: Update ChatInput with send button, stop button, onStop prop, and ESC listener**

Replace `frontend/src/components/Chat/ChatInput.tsx` with:

```tsx
import { useState, KeyboardEvent, useEffect } from 'react'

function ChatInput({ onSend, onStop, disabled }: {
  onSend: (text: string) => void
  onStop: () => void
  disabled: boolean
}) {
  const [value, setValue] = useState('')

  // ESC key to stop generation
  useEffect(() => {
    if (!disabled) return
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onStop()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [disabled, onStop])

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !disabled) { onSend(value); setValue('') }
    }
  }

  const handleSendClick = () => {
    if (value.trim() && !disabled) { onSend(value); setValue('') }
  }

  return (
    <div className="border-t border-[var(--border)] px-4 py-3" style={{ background: 'var(--bg-sidebar)' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? 'Generating...' : 'Send a message... (Enter to submit)'}
          className="flex-1 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-dim)] resize-none outline-none px-[14px] py-[10px] rounded-md border transition-colors"
          style={{ background: 'var(--bg-card)' }}
          rows={2}
        />
        {disabled ? (
          <button
            onClick={onStop}
            title="Stop generating (Esc)"
            style={{
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              cursor: 'pointer',
              flexShrink: 0,
              alignSelf: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="1" y="1" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSendClick}
            disabled={!value.trim()}
            title="Send message (Enter)"
            style={{
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              border: 'none',
              background: value.trim() ? 'var(--accent)' : 'var(--border)',
              color: value.trim() ? '#fff' : 'var(--text-dim)',
              cursor: value.trim() ? 'pointer' : 'default',
              flexShrink: 0,
              alignSelf: 'center',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="7" y1="2" x2="7" y2="12" />
              <polyline points="3,7 7,3 11,7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

export default ChatInput
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd d:/git/monika/frontend && npx tsc --noEmit --pretty
```

Expected: PASS (no type errors)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Chat/ChatInput.tsx
git commit -m "feat: add send/stop button and ESC shortcut to ChatInput"
```

---

### Task 2: Wire onStop in ChatArea

**Files:**
- Modify: `frontend/src/components/Chat/ChatArea.tsx`

- [ ] **Step 1: Add handleStop and pass onStop to ChatInput**

In `frontend/src/components/Chat/ChatArea.tsx`:
- Add `handleStop` callback after `handleSend` (around line 59)
- Pass `onStop={handleStop}` to ChatInput

```tsx
// After handleSend (line 59), add:
const handleStop = () => {
  if (generatingSessionId !== '') {
    App.CancelGeneration(generatingSessionId)
  }
}
```

Change the ChatInput render (line 115-119) from:

```tsx
        <ChatInput
          key={activeSessionId}
          onSend={handleSend}
          disabled={generatingSessionId !== ''}
        />
```

To:

```tsx
        <ChatInput
          key={activeSessionId}
          onSend={handleSend}
          onStop={handleStop}
          disabled={generatingSessionId !== ''}
        />
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd d:/git/monika/frontend && npx tsc --noEmit --pretty
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Chat/ChatArea.tsx
git commit -m "feat: wire stop button to CancelGeneration in ChatArea"
```

---

### Task 3: Handle cancelled error in store

**Files:**
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: Special-case 'cancelled' in error event handler**

In `frontend/src/store/index.ts`, replace the `case 'error':` block (lines 669-678):

```typescript
      case 'error':
        if (data.content === 'cancelled') {
          if (sid === store.generatingSessionId) {
            store.setGeneratingSessionId('')
          }
          break
        }
        store.addConsoleLine(`[error] ${data.content || 'Unknown error'}`)
        store.addSessionError(sid, data.content || 'Unknown error')
        if (sid === store.activeSessionId) {
          store.addMessage({ id: crypto.randomUUID(), role: 'error', content: data.content || 'Unknown error' })
        }
        if (sid === store.generatingSessionId) {
          store.setGeneratingSessionId('')
        }
        break
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd d:/git/monika/frontend && npx tsc --noEmit --pretty
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "fix: skip error display for user-initiated cancellation"
```

---

### Task 4: Build and smoke test

**Files:** None (verification only)

- [ ] **Step 1: Build the frontend**

```bash
cd d:/git/monika/frontend && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Build the Go backend**

```bash
cd d:/git/monika && go build ./...
```

Expected: Build succeeds.

- [ ] **Step 3: Manual smoke test checklist**

Launch the app and verify:
1. Send button appears next to textarea (idle state)
2. Send button is dimmed when textarea is empty, colored when text entered
3. Click send button → message sends, button changes to stop button
4. Stop button is visible during generation (square icon, accent color)
5. Click stop button → generation stops, button returns to send
6. ESC key during generation → same behavior as clicking stop
7. ESC key when not generating → no-op
8. Partial AI response remains visible after stop
9. No error message appears in chat after stopping
10. Can send a new message immediately after stopping

- [ ] **Step 4: Commit (if any fixes)**

No commit needed unless smoke test reveals issues.
