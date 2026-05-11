# Input Command Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `$` (shell command execution) and `/init` (generate agent.md) command support to the chat input.

**Architecture:** New `RunShellCommand` backend API executes shell commands in the project directory. Frontend ChatInput detects `$` and `/init` prefixes: `$` routes to shell execution and displays output as a `role: 'shell'` message, `/init` replaces input with a template prompt and sends via the normal AI message flow.

**Tech Stack:** Go (backend), React 18 + TypeScript 5 (frontend), Wails v3 bindings

---

### Task 1: Backend — Add `RunShellCommand` API

**File:**
- Modify: `internal/api/app.go`

- [ ] **Step 1: Add `RunShellCommand` method to App**

Add the following method after the `CancelGeneration` method (around line 528). Also add these two helper functions at the bottom of the file or before `RunShellCommand`:

```go
// resolveShellAPI resolves the system shell (same logic as builtin/bash.go).
func resolveShellAPI() (string, string) {
	if runtime.GOOS == "windows" {
		if path, err := exec.LookPath("pwsh"); err == nil {
			return path, "-Command"
		}
		if path, err := exec.LookPath("powershell"); err == nil {
			return path, "-Command"
		}
		if path, err := exec.LookPath("cmd"); err == nil {
			return path, "/C"
		}
		return "", ""
	}
	if path, err := exec.LookPath("sh"); err == nil {
		return path, "-c"
	}
	if path, err := exec.LookPath("bash"); err == nil {
		return path, "-c"
	}
	return "", ""
}

// RunShellCommand executes a shell command in the project directory and returns merged stdout+stderr.
// Commands timeout after 120 seconds.
func (a *App) RunShellCommand(projectPath, command string) (string, error) {
	shell, shellArg := resolveShellAPI()
	if shell == "" {
		return "", fmt.Errorf("no shell found on system")
	}

	timeoutCtx, cancel := context.WithTimeout(a.ctx, 120*time.Second)
	defer cancel()

	cmd := exec.CommandContext(timeoutCtx, shell, shellArg, command)
	cmd.Dir = projectPath

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	out := stdout.String()
	if errStderr := stderr.String(); errStderr != "" {
		if out != "" {
			out += "\n"
		}
		out += errStderr
	}
	if out == "" && err != nil {
		out = err.Error()
	}

	return strings.TrimSpace(out), nil
}
```

The existing imports already cover everything needed (`context`, `fmt`, `os/exec`, `strings`, `time`, `bytes` is NOT imported — add it).

- [ ] **Step 2: Add `"bytes"` to imports**

Add `"bytes"` to the import block at the top of the file:

```go
import (
	"bytes"
	"context"
	// ... rest unchanged
)
```

- [ ] **Step 3: Add `"runtime"` to imports for resolveShellAPI**

Add `"runtime"` to the import block:

```go
import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
	// ... rest unchanged
)
```

- [ ] **Step 4: Build to verify Go code compiles**

Run: `cd d:/git/monika && go build ./...`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd d:/git/monika && git add internal/api/app.go && git commit -m "feat: add RunShellCommand API for shell command execution"
```

---

### Task 2: Store — Add `'shell'` role to Message type

**File:**
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: Update the Message interface**

At line 43, change:
```typescript
role: 'user' | 'assistant' | 'system' | 'error' | 'compaction' | 'subtask'
```
To:
```typescript
role: 'user' | 'assistant' | 'system' | 'error' | 'compaction' | 'subtask' | 'shell'
```

- [ ] **Step 2: Check TypeScript compilation**

Run: `cd d:/git/monika/frontend && npx tsc --noEmit`
Expected: No errors (shell role not yet used anywhere, so no issues expected).

- [ ] **Step 3: Commit**

```bash
cd d:/git/monika && git add frontend/src/store/index.ts && git commit -m "feat: add shell role to Message type"
```

---

### Task 3: MessageBubble — Add shell message rendering

**File:**
- Modify: `frontend/src/components/Chat/MessageBubble.tsx`

- [ ] **Step 1: Add shell entry to ROLE_LABEL**

Inside the `ROLE_LABEL` object (around line 31), add after the `subtask` entry:

```typescript
const ROLE_LABEL: Record<string, { text: string; color: string }> = {
  user:      { text: 'You',       color: 'var(--text-dim)' },
  assistant: { text: 'Assistant', color: 'var(--text-dim)' },
  error:      { text: 'Error',     color: 'var(--red)' },
  compaction: { text: 'Compacted', color: 'var(--compaction)' },
  subtask:   { text: 'Subtask',   color: 'var(--subtask)' },
  shell:     { text: 'Shell',     color: 'var(--yellow)' },
}
```

- [ ] **Step 2: Add shell role routing in MessageBubble**

Inside the `MessageBubble` function, before the `if (role === 'subtask')` block (around line 442), add:

```tsx
if (role === 'shell') {
  return (
    <div className="flex flex-col gap-1.5 mb-1.5">
      <RoleLabel role="shell" />
      <MsgBlock accent="var(--yellow)">
        <div
          className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap leading-[1.6]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {content}
        </div>
      </MsgBlock>
    </div>
  )
}
```

- [ ] **Step 3: Check TypeScript compilation**

Run: `cd d:/git/monika/frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd d:/git/monika && git add frontend/src/components/Chat/MessageBubble.tsx && git commit -m "feat: add shell message rendering in MessageBubble"
```

---

### Task 4: ChatArea — Add `handleRunShell` callback

**File:**
- Modify: `frontend/src/components/Chat/ChatArea.tsx`

- [ ] **Step 1: Add `handleRunShell` function**

Add after the `handleStop` function (around line 36), before `handleSend`:

```tsx
const handleRunShell = async (command: string) => {
  if (!projectPath || !sessionId) return

  const store = useStore.getState()
  const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: `$ ${command}` }
  store.appendToSession(sessionId, [userMsg])

  try {
    const output = await App.RunShellCommand(projectPath, command)
    const shellMsg = { id: crypto.randomUUID(), role: 'shell' as const, content: `$ ${command}\n${output}` }
    store.appendToSession(sessionId, [shellMsg])
  } catch (err) {
    const errorMsg = { id: crypto.randomUUID(), role: 'shell' as const, content: `$ ${command}\nError: ${String(err)}` }
    store.appendToSession(sessionId, [errorMsg])
  }
}
```

- [ ] **Step 2: Pass `onRunShell` to ChatInput**

In the JSX where ChatInput is rendered (around line 119), add the new prop:

```tsx
<ChatInput
  key={sessionId}
  onSend={handleSend}
  onStop={handleStop}
  onRunShell={handleRunShell}
  disabled={generatingSessionId !== ''}
  compacting={compactingSessionId !== ''}
/>
```

- [ ] **Step 3: Check TypeScript compilation**

Run: `cd d:/git/monika/frontend && npx tsc --noEmit`
Expected: Error — ChatInput doesn't have `onRunShell` prop yet. This is expected and will be fixed in Task 5.

- [ ] **Step 4: Commit**

```bash
cd d:/git/monika && git add frontend/src/components/Chat/ChatArea.tsx && git commit -m "feat: add handleRunShell callback in ChatArea"
```

---

### Task 5: ChatInput — Add `$` and `/init` detection and routing

**File:**
- Modify: `frontend/src/components/Chat/ChatInput.tsx`

- [ ] **Step 1: Add init template constant**

Add at the top of the file, after the imports:

```tsx
const INIT_TEMPLATE = `Please analyze this project and create an \`agent.md\` file in the project root. The file should contain:

1. Build, test, and run commands specific to this project
2. Project structure overview (key directories and their purposes)
3. Coding conventions and patterns used
4. Framework and library specifics

First, explore the codebase to understand the project, then create the agent.md file with compact, actionable information. Every line should answer "would an agent likely miss this without help?"`
```

- [ ] **Step 2: Add `onRunShell` prop to component signature**

Change the component props from:

```tsx
function ChatInput({ onSend, onStop, disabled, compacting }: {
  onSend: (text: string) => void
  onStop: () => void
  disabled: boolean
  compacting: boolean
})
```

To:

```tsx
function ChatInput({ onSend, onStop, onRunShell, disabled, compacting }: {
  onSend: (text: string) => void
  onStop: () => void
  onRunShell: (command: string) => void
  disabled: boolean
  compacting: boolean
})
```

- [ ] **Step 3: Add `handleSubmit` function for unified routing**

Add after `handleChange` (around line 48):

```tsx
const handleSubmit = () => {
  const trimmed = value.trim()
  if (!trimmed || disabled || compacting) return

  if (trimmed.startsWith('$')) {
    const command = trimmed.slice(1).trim()
    if (!command) { onSend(trimmed); setValue(''); return }
    onRunShell(command)
    setValue('')
    return
  }

  if (trimmed === '/init') {
    onSend(INIT_TEMPLATE)
    setValue('')
    return
  }

  onSend(trimmed)
  setValue('')
}
```

- [ ] **Step 4: Update `handleKeyDown` to use `handleSubmit`**

Replace the current `handleKeyDown`:

```tsx
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}
```

- [ ] **Step 5: Update `handleSendClick` to use `handleSubmit`**

Replace the current `handleSendClick`:

```tsx
const handleSendClick = () => {
  handleSubmit()
}
```

- [ ] **Step 6: Check TypeScript compilation**

Run: `cd d:/git/monika/frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
cd d:/git/monika && git add frontend/src/components/Chat/ChatInput.tsx && git commit -m "feat: add $ and /init command support in ChatInput"
```

---

## Verification

- [ ] **Verify full stack**: Build the project with `cd d:/git/monika && wails build` (or `go build` + `cd frontend && npm run build`)
- [ ] **Test `$` command**: Open Monika, type `$echo hello`, verify shell output appears in chat
- [ ] **Test `/init` command**: Open Monika, type `/init`, verify AI generates agent.md in project root
- [ ] **Test fallthrough**: Type `$` alone (no command) or `/something`, verify it sends as normal message
