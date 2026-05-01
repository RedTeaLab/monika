# Session Compaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic LLM-based conversation compaction when token usage exceeds the model's safe threshold.

**Architecture:** The agent loop checks for overflow before each turn. When triggered, it collects a synchronous summary via the existing streaming provider, rewrites `conv.Messages` to `[summary] + [preserved recent window]`, and emits new event types to the frontend. The frontend renders a compaction card and tracks per-session token state.

**Tech Stack:** Go 1.25+ (backend), React 18 + TypeScript 5 + Zustand 5 (frontend), Wails v3 (IPC)

---

### Task 1: Add new event types and structs to agent package

**Files:**
- Modify: `internal/agent/event.go`

- [ ] **Step 1: Add new event type constants and structs**

```go
// after EventTurnStart, add:
	EventCompacting
	EventCompaction
```

Update `Event` struct to carry compaction payloads:

```go
type Event struct {
	Type       EventType
	Content    string
	Tool       *ToolEvent
	Usage      UsageEvent
	Compacting *CompactingEvent
	Compaction *CompactionEvent
}
```

Add new struct types at end of file:

```go
type CompactingEvent struct {
	SessionID string `json:"session_id"`
}

type CompactionEvent struct {
	Summary       string `json:"summary"`
	BeforeTokens  int64  `json:"before_tokens"`
	AfterTokens   int64  `json:"after_tokens"`
	CompactionNum int    `json:"compaction_num"`
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./internal/agent/...`
Expected: compiles successfully

- [ ] **Step 3: Commit**

```bash
git add internal/agent/event.go
git commit -m "feat(agent): add EventCompacting and EventCompaction event types"
```

---

### Task 2: Add compaction logic to agent loop

**Files:**
- Modify: `internal/agent/agent_loop.go`

- [ ] **Step 1: Add model output limits map and Conversation fields**

Add after `modelContextLimits`:

```go
var modelOutputLimits = map[string]int64{
	"gpt-4o":              16384,
	"gpt-4o-mini":         16384,
	"gpt-4-turbo":         4096,
	"gpt-4":               4096,
	"gpt-3.5-turbo":       4096,
	"deepseek-chat":       32768,
	"deepseek-reasoner":   32768,
	"claude-3-opus":       4096,
	"claude-3.5-sonnet":   8192,
	"claude-3.7-sonnet":   8192,
}

func outputLimit(model string) int64 {
	if limit, ok := modelOutputLimits[model]; ok {
		return limit
	}
	return 32768
}
```

Update `Conversation`:

```go
type Conversation struct {
	ID              string
	Messages        []engine.ChatMessage
	TokenCount      int64
	TokenMax        int64
	CompactionCount int
}
```

- [ ] **Step 2: Add isOverflow function**

```go
const compactionBuffer = 20_000

func (a *AgentLoop) isOverflow(conv *Conversation) bool {
	limit := contextLimit(a.model)
	outputMax := outputLimit(a.model)
	usable := limit - outputMax - compactionBuffer
	if usable <= 0 {
		usable = limit / 2 // fallback for small-context models
	}
	estimated := a.estimateContextTokens(conv)
	conv.TokenCount = estimated
	conv.TokenMax = limit
	return estimated > usable
}
```

- [ ] **Step 3: Add buildCompactionPrompt function**

```go
func (a *AgentLoop) buildCompactionPrompt(conv *Conversation) []engine.ChatMessage {
	prompt := `You are a conversation summarizer. Summarize the conversation below.
Focus on information that is essential for continuing the work without
losing context. Output a structured summary in this format:

## Goal
What the user is trying to accomplish.

## Key Decisions
Design choices, architectural decisions, agreed approaches.

## Discoveries
Important findings, bugs identified, constraints discovered.

## Current State
What has been done so far. Files created/modified, tests passing/failing.

## Next Steps
What remains to be done. Explicit TODOs mentioned by user.

## Summary Quality Gate
- Must preserve all stated user goals
- Must preserve all agreed design decisions
- Must preserve all discovered bugs and constraints
- If these cannot fit, prioritize goals > decisions > discoveries`
	return []engine.ChatMessage{
		{Role: "user", Content: prompt},
		{Role: "user", Content: "Here is the conversation to summarize:\n\n" + formatMessagesForCompaction(conv.Messages)},
	}
}

func formatMessagesForCompaction(msgs []engine.ChatMessage) string {
	var b strings.Builder
	for _, m := range msgs {
		b.WriteString(fmt.Sprintf("[%s]: %s\n", m.Role, m.Content))
	}
	return b.String()
}
```

- [ ] **Step 4: Add rewriteMessages function**

```go
func (a *AgentLoop) rewriteMessages(conv *Conversation, summary string) {
	beforeTokens := a.estimateContextTokens(conv)

	limit := contextLimit(a.model)
	preserveBudget := int64(float64(limit) * 0.25)

	// walk backwards from end to find turn-aligned retention window
	var keepFrom int
	var runningTokens int64
	for i := len(conv.Messages) - 1; i >= 0; i-- {
		m := conv.Messages[i]
		runningTokens += int64(tokenizer.Count(m.Role))
		runningTokens += int64(tokenizer.Count(m.Content))
		runningTokens += int64(tokenizer.Count(m.ReasoningContent))
		runningTokens += 4 // per-message overhead
		if runningTokens > preserveBudget && i < len(conv.Messages)-1 {
			// align to turn boundary: walk back to the closest preceding user message
			keepFrom = i + 1
			for keepFrom < len(conv.Messages) && conv.Messages[keepFrom].Role != "user" {
				keepFrom++
			}
			if keepFrom >= len(conv.Messages) {
				keepFrom = len(conv.Messages) - 1
			}
			break
		}
	}

	// ensure we keep at least the last complete turn (last user message + everything after)
	lastUserIdx := -1
	for i := len(conv.Messages) - 1; i >= 0; i-- {
		if conv.Messages[i].Role == "user" {
			lastUserIdx = i
			break
		}
	}
	if lastUserIdx >= 0 && keepFrom > lastUserIdx {
		keepFrom = lastUserIdx
	}

	summaryMsg := engine.ChatMessage{
		Role: "assistant",
		Name: "compaction_summary",
		Content: summary,
	}

	recent := make([]engine.ChatMessage, len(conv.Messages)-keepFrom)
	copy(recent, conv.Messages[keepFrom:])

	conv.Messages = append([]engine.ChatMessage{summaryMsg}, recent...)
	conv.CompactionCount++

	afterTokens := a.estimateContextTokens(conv)
	conv.TokenCount = afterTokens

	// archive original messages
	_ = beforeTokens // used by caller for event
}
```

- [ ] **Step 5: Add runCompaction function**

```go
func (a *AgentLoop) runCompaction(ctx context.Context, conv *Conversation, ch chan<- Event) (string, error) {
	beforeTokens := conv.TokenCount

	compactionPrompt := a.buildCompactionPrompt(conv)
	req := engine.ChatRequest{
		Model:    a.model,
		Messages: compactionPrompt,
	}

	events, err := a.provider.StreamChat(ctx, req)
	if err != nil {
		return "", fmt.Errorf("compaction stream chat: %w", err)
	}

	var summary strings.Builder
	for ev := range events {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		default:
		}
		switch ev.Kind {
		case engine.EventContentDelta:
			summary.WriteString(ev.Text)
		case engine.EventError:
			return "", fmt.Errorf("compaction provider error: %s", ev.Error.Message)
		}
	}

	result := summary.String()
	if result == "" {
		return "", fmt.Errorf("compaction returned empty summary")
	}

	a.rewriteMessages(conv, result)

	ch <- Event{
		Type: EventCompaction,
		Compaction: &CompactionEvent{
			Summary:       result,
			BeforeTokens:  beforeTokens,
			AfterTokens:   conv.TokenCount,
			CompactionNum: conv.CompactionCount,
		},
	}

	return result, nil
}
```

- [ ] **Step 6: Wire compaction into runStreaming**

In `runStreaming`, after `messages := a.buildMessages(conv)` and before `req := ...`, insert:

```go
			if a.isOverflow(conv) {
				ch <- Event{
					Type:       EventCompacting,
					Compacting: &CompactingEvent{SessionID: conv.ID},
				}
				if _, err := a.runCompaction(ctx, conv, ch); err != nil {
					// fallback: truncation to 25% token budget
					a.rewriteMessagesTruncate(conv)
					ch <- Event{
						Type: EventCompaction,
						Compaction: &CompactionEvent{
							BeforeTokens:  conv.TokenCount,
							AfterTokens:   a.estimateContextTokens(conv),
							CompactionNum: conv.CompactionCount,
							Summary:       "(truncated — compaction failed: " + err.Error() + ")",
						},
					}
				}
				messages = a.buildMessages(conv)
			}
```

Add truncation fallback:

```go
func (a *AgentLoop) rewriteMessagesTruncate(conv *Conversation) {
	limit := contextLimit(a.model)
	budget := int64(float64(limit) * 0.25)
	var running int64
	keepFrom := len(conv.Messages) - 1
	for i := len(conv.Messages) - 1; i >= 0; i-- {
		m := conv.Messages[i]
		running += int64(tokenizer.Count(m.Role) + tokenizer.Count(m.Content) + 4)
		if running > budget && i < len(conv.Messages)-1 {
			keepFrom = i + 1
			break
		}
	}
	// align to turn boundary
	for keepFrom < len(conv.Messages) && conv.Messages[keepFrom].Role != "user" {
		keepFrom++
	}
	if keepFrom >= len(conv.Messages) {
		keepFrom = len(conv.Messages) - 1
	}
	conv.Messages = conv.Messages[keepFrom:]
	conv.CompactionCount++
	conv.TokenCount = a.estimateContextTokens(conv)
}
```

Also update turn-0 token estimate to use `conv.TokenCount`:

After `estimateContextTokens` is called at turn 0, update:

```go
			if turn == 0 {
				conv.TokenCount = a.estimateContextTokens(conv)
				conv.TokenMax = contextLimit(a.model)
				ch <- Event{
					Type: EventUsage,
					Usage: UsageEvent{
						TotalTokens:   conv.TokenCount,
						ContextTokens: conv.TokenCount,
						MaxContext:    conv.TokenMax,
					},
				}
			}
```

- [ ] **Step 7: Verify compilation**

Run: `go build ./internal/agent/...`
Expected: compiles successfully

- [ ] **Step 8: Commit**

```bash
git add internal/agent/agent_loop.go
git commit -m "feat(agent): add compaction overflow detection and LLM summarization"
```

---

### Task 3: Add Go API plumbing

**Files:**
- Modify: `internal/api/types.go`
- Modify: `internal/api/app.go`
- Modify: `internal/api/session_manager.go`

- [ ] **Step 1: Update StreamEvent in types.go**

Add fields to `StreamEvent`:

```go
type StreamEvent struct {
	Type       string                  `json:"type"`
	Content    string                  `json:"content,omitempty"`
	SessionID  string                  `json:"session_id,omitempty"`
	Model      string                  `json:"model,omitempty"`
	Tool       *agent.ToolEvent        `json:"tool,omitempty"`
	AgentUsage *agent.UsageEvent       `json:"usage,omitempty"`
	FileChange *FileChangeEvent        `json:"file_change,omitempty"`
	Compacting *agent.CompactingEvent  `json:"compacting,omitempty"`
	Compaction *agent.CompactionEvent  `json:"compaction,omitempty"`
}
```

- [ ] **Step 2: Add handleAgentEvent cases in app.go**

Add to the switch in `handleAgentEvent`:

```go
	case agent2.EventCompacting:
		se.Type = "compacting"
		se.Compacting = ev.Compacting
	case agent2.EventCompaction:
		se.Type = "compaction"
		se.Compaction = ev.Compaction
```

- [ ] **Step 3: Sync token/compaction fields after agent loop in app.go**

Replace `s.Messages = conv.Messages` with:

```go
			s.Messages = conv.Messages
			s.TokenCount = conv.TokenCount
			s.TokenMax = conv.TokenMax
			s.CompactionCount = conv.CompactionCount
```

- [ ] **Step 4: Add Session fields in session_manager.go**

Update `Session` struct:

```go
type Session struct {
	ID              string               `json:"id"`
	Title           string               `json:"title"`
	ProjectDir      string               `json:"project_dir"`
	Messages        []engine.ChatMessage `json:"messages"`
	Model           string               `json:"model"`
	Provider        string               `json:"provider"`
	Status          string               `json:"status"`
	CreatedAt       time.Time            `json:"created_at"`
	UpdatedAt       time.Time            `json:"updated_at"`
	TokenCount      int64                `json:"token_count,omitempty"`
	TokenMax        int64                `json:"token_max,omitempty"`
	CompactionCount int                  `json:"compaction_count,omitempty"`
	ArchivedMessages []engine.ChatMessage `json:"archived_messages,omitempty"`
}
```

Update `SessionInfo` in types.go:

```go
type SessionInfo struct {
	ID              string `json:"id"`
	Title           string `json:"title"`
	Status          string `json:"status"`
	UpdatedAt       string `json:"updated_at"`
	TokenCount      int64  `json:"token_count,omitempty"`
	TokenMax        int64  `json:"token_max,omitempty"`
}
```

In session_manager.go `List()`, propagate token fields:

```go
			infos = append(infos, SessionInfo{
				ID:         s.ID,
				Title:      s.Title,
				Status:     s.Status,
				UpdatedAt:  s.UpdatedAt.Format(time.RFC3339),
				TokenCount: s.TokenCount,
				TokenMax:   s.TokenMax,
			})
```

- [ ] **Step 5: Verify full build**

Run: `go build .`
Expected: compiles successfully

- [ ] **Step 6: Commit**

```bash
git add internal/api/types.go internal/api/app.go internal/api/session_manager.go
git commit -m "feat(api): add compaction event plumbing and session token persistence"
```

---

### Task 4: Write Go tests for compaction

**Files:**
- Create: `internal/agent/agent_loop_compaction_test.go`

- [ ] **Step 1: Write test for isOverflow**

```go
func TestIsOverflow(t *testing.T) {
	// Create loop with a model that has known context limit
	loop := &AgentLoop{model: "gpt-4"}
	// gpt-4 has 8K limit, output 4K, buffer 20K -> usable is 8K-4K-20K negative -> fallback to 4K
	conv := &Conversation{Messages: []engine.ChatMessage{
		{Role: "user", Content: "hello"},
	}}
	// Single short message is well under 4K
	if loop.isOverflow(conv) {
		t.Error("short conversation should not overflow")
	}
	// Build a large conversation that exceeds the limit
	largeContent := strings.Repeat("x", 5000)
	conv2 := &Conversation{Messages: []engine.ChatMessage{
		{Role: "user", Content: largeContent},
	}}
	if !loop.isOverflow(conv2) {
		t.Error("large conversation should overflow")
	}
}
```

- [ ] **Step 2: Write test for rewriteMessages**

```go
func TestRewriteMessages_TurnAlignment(t *testing.T) {
	loop := &AgentLoop{model: "deepseek-chat"} // 128K model
	conv := &Conversation{
		Messages: []engine.ChatMessage{
			{Role: "user", Content: "first question"},
			{Role: "assistant", Content: "first answer", ToolCalls: []engine.ToolCall{{ID: "t1", Function: engine.ToolCallFunc{Name: "grep"}}}},
			{Role: "tool", Content: "result1", ToolCallID: "t1"},
			{Role: "user", Content: "second question"},
			{Role: "assistant", Content: "second answer"},
		},
	}
	summary := "## Goal\nTest compaction"
	loop.rewriteMessages(conv, summary)

	// first message should be the summary
	if conv.Messages[0].Content != summary {
		t.Errorf("first message should be summary, got: %s", conv.Messages[0].Content)
	}
	if conv.Messages[0].Name != "compaction_summary" {
		t.Error("summary message should have name=compaction_summary")
	}
	// recent messages should include the last turn
	found := false
	for _, m := range conv.Messages {
		if m.Content == "second question" {
			found = true
			break
		}
	}
	if !found {
		t.Error("retained messages should include last user message")
	}
	if conv.CompactionCount != 1 {
		t.Errorf("compaction count should be 1, got %d", conv.CompactionCount)
	}
}
```

- [ ] **Step 3: Run tests**

Run: `go test -run "TestIsOverflow|TestRewriteMessages" ./internal/agent/ -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add internal/agent/agent_loop_compaction_test.go
git commit -m "test(agent): add compaction unit tests"
```

---

### Task 5: Update frontend store

**Files:**
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: Add new state fields and interface types**

Update `Message` interface role to include `'compaction'`:

```typescript
interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error' | 'compaction'
  content: string
  thinking?: string
  tools?: ToolCall[]
  model?: string
  duration?: number
  startedAt?: number
  compactionNum?: number
  beforeTokens?: number
  afterTokens?: number
}
```

Add to `AppState`:

```typescript
  compactingSessionId: string
  sessionTokens: Record<string, { count: number; max: number }>
```

Add to the interface (action signatures):

```typescript
  setCompacting: (sid: string, compacting: boolean) => void
  addCompactionMessage: (sid: string, data: { summary: string; beforeTokens: number; afterTokens: number; compactionNum: number }) => void
  addTokens: (sid: string, tokens: number, max?: number) => void
```

- [ ] **Step 2: Add initial values**

```typescript
  compactingSessionId: '',
  sessionTokens: {},
```

- [ ] **Step 3: Implement new actions**

`addTokens` — replace existing implementation:

```typescript
  addTokens: (sid, t, max) => set((s) => ({
    tokenCount: s.activeSessionId === sid ? t : s.tokenCount,
    tokenMax: s.activeSessionId === sid ? Math.max(s.tokenMax, max ?? 0) : s.tokenMax,
    sessionTokens: {
      ...s.sessionTokens,
      [sid]: { count: t, max: Math.max(s.sessionTokens[sid]?.max ?? 0, max ?? 0) },
    },
  })),
```

`setCompacting`:

```typescript
  setCompacting: (sid, compacting) => set((s) => ({
    compactingSessionId: compacting ? sid : (s.compactingSessionId === sid ? '' : s.compactingSessionId),
  })),
```

`addCompactionMessage`:

```typescript
  addCompactionMessage: (sid, data) => {
    const msg: Message = {
      id: crypto.randomUUID(),
      role: 'compaction',
      content: data.summary,
      compactionNum: data.compactionNum,
      beforeTokens: data.beforeTokens,
      afterTokens: data.afterTokens,
    }
    set((s) => ({
      sessionMessages: {
        ...s.sessionMessages,
        [sid]: [...(s.sessionMessages[sid] || []), msg],
      },
      messages: s.activeSessionId === sid ? [...s.messages, msg] : s.messages,
    }))
  },
```

- [ ] **Step 4: Update switchSessionTab to restore tokens**

Change token reset to use sessionTokens:

```typescript
  switchSessionTab: (id) => {
    set((s) => {
      if (id === s.activeSessionId) return {}
      if (!s.openSessions.some((t) => t.id === id)) return {}
      const currentCache = { ...s.sessionMessages }
      if (s.activeSessionId) {
        const bgUpdated = s.sessionMessages[s.activeSessionId]
        currentCache[s.activeSessionId] = bgUpdated || s.messages
      }
      const restored = currentCache[id] || []
      const tokens = s.sessionTokens[id] || { count: 0, max: 0 }
      return {
        activeSessionId: id,
        sessionMessages: currentCache,
        messages: restored,
        tokenCount: tokens.count,
        tokenMax: tokens.max,
      }
    })
  },
```

Also update `openSessionTab` to initialize `sessionTokens`:

```typescript
      ...
      activeSessionId: id,
      messages: [],
      tokenCount: s.sessionTokens[id]?.count ?? 0,
      tokenMax: s.sessionTokens[id]?.max ?? 0,
```

- [ ] **Step 5: Update setupWailsEvents for new event types**

Add `'usage'` case — update to pass sid:

```typescript
      case 'usage':
        if (data.usage) {
          store.addTokens(sid, data.usage.total_tokens || 0, data.usage.max_context)
        }
        break
```

Add two new cases after `'turn_start'`:

```typescript
      case 'compacting':
        store.setCompacting(sid, true)
        break

      case 'compaction':
        store.setCompacting(sid, false)
        if (data.compaction) {
          store.addCompactionMessage(sid, {
            summary: data.compaction.summary || '',
            beforeTokens: data.compaction.before_tokens || 0,
            afterTokens: data.compaction.after_tokens || 0,
            compactionNum: data.compaction.compaction_num || 1,
          })
        }
        break
```

- [ ] **Step 6: Update loadSessionMessages for compaction role**

Add handling before the final `else` block:

```typescript
    } else if (m.role === 'assistant' && m.name === 'compaction_summary') {
      result.push({
        id: crypto.randomUUID(),
        role: 'compaction',
        content: m.content || '',
      })
      i++
    } else if (m.role === 'tool') {
```

- [ ] **Step 7: Verify TypeScript compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat(frontend): add per-session token state and compaction event handling"
```

---

### Task 6: Add compaction variant to MessageBubble

**Files:**
- Modify: `frontend/src/components/Chat/MessageBubble.tsx`

- [ ] **Step 1: Add ROLE_LABEL entry and CompactionCard component**

Add label:

```typescript
const ROLE_LABEL: Record<string, { text: string; color: string }> = {
  user:        { text: 'You',       color: 'var(--text-dim)' },
  assistant:   { text: 'Assistant', color: 'var(--text-dim)' },
  error:       { text: 'Error',     color: 'var(--red)' },
  compaction:  { text: 'Compacted', color: '#c6902f' },
}
```

Add `CompactionCard` component before `MessageBubble`:

```tsx
function CompactionCard({ message }: { message: Message }) {
  const [open, setOpen] = useState(true)

  const beforeStr = message.beforeTokens ? formatTokens(message.beforeTokens) : ''
  const afterStr = message.afterTokens ? formatTokens(message.afterTokens) : ''
  const reduction = message.beforeTokens && message.afterTokens
    ? Math.round((1 - message.afterTokens / message.beforeTokens) * 100)
    : 0

  return (
    <MsgBlock
      accent="#c6902f"
      background="var(--bg-sidebar)"
      header={
        <button
          className="flex items-center gap-1.5 cursor-pointer w-full text-left"
          onClick={() => setOpen(!open)}
        >
          <IconChevronDown
            size={10}
            className="transition-transform duration-200"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(-90deg)', color: '#c6902f' }}
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em]" style={{ color: '#c6902f' }}>
            Conversation Compacted
          </span>
          {message.compactionNum != null && message.compactionNum > 1 && (
            <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
              #{message.compactionNum}
            </span>
          )}
          <span className="text-[10px] ml-auto" style={{ color: 'var(--text-dim)' }}>
            {beforeStr} → {afterStr}
            {reduction > 0 && ` (-${reduction}%)`}
          </span>
        </button>
      }
    >
      {open && <MarkdownBlock content={message.content} muted />}
    </MsgBlock>
  )
}
```

Needs `formatTokens` import or inline — add at top of file:

```typescript
function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}
```

- [ ] **Step 2: Route compaction role in MessageBubble**

Add in the router function before `role === 'system'`:

```tsx
  if (role === 'compaction') {
    return (
      <div className="flex flex-col gap-1.5 mb-1.5">
        <RoleLabel role="compaction" />
        <CompactionCard message={message} />
      </div>
    )
  }
```

Update `Message` interface in this file to include new optional fields:

```typescript
interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error' | 'compaction'
  content: string
  thinking?: string
  tools?: ToolCall[]
  model?: string
  duration?: number
  startedAt?: number
  compactionNum?: number
  beforeTokens?: number
  afterTokens?: number
}
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Chat/MessageBubble.tsx
git commit -m "feat(frontend): add compaction message variant with collapsible summary card"
```

---

### Task 7: Update ChatInput for compacting state and per-session tokens

**Files:**
- Modify: `frontend/src/components/Chat/ChatInput.tsx`
- Modify: `frontend/src/components/Chat/ChatArea.tsx`

- [ ] **Step 1: Add compacting prop to ChatInput**

Update function signature:

```tsx
function ChatInput({ onSend, onStop, disabled, compacting }: {
  onSend: (text: string) => void
  onStop: () => void
  disabled: boolean
  compacting: boolean
}) {
```

Read tokens per-session:

```typescript
  const activeSessionId = useStore((s) => s.activeSessionId)
  const sessionTokens = useStore((s) => s.sessionTokens)
  const tokens = sessionTokens[activeSessionId] || { count: 0, max: 0 }
  const tokenCount = tokens.count
  const tokenMax = tokens.max
```

Update placeholder logic:

```typescript
          placeholder={
            compacting ? 'Compacting...'
            : disabled ? 'Generating...'
            : 'Send a message... (Enter to submit, Shift+Enter for newline)'
          }
```

And `disabled` prop on textarea should be `disabled || compacting`.

Similarly disable send button when compacting:

```typescript
            if (value.trim() && !disabled && !compacting) { onSend(value); setValue('') }
```

- [ ] **Step 2: Pass compacting prop from ChatArea**

In `ChatArea.tsx`, read `compactingSessionId`:

```typescript
  const compactingSessionId = useStore((s) => s.compactingSessionId)
```

Pass to ChatInput:

```tsx
        <ChatInput
          onSend={handleSend}
          onStop={handleStop}
          disabled={generatingSessionId !== ''}
          compacting={compactingSessionId !== ''}
        />
```

Also update `handleKeyDown` to ignore input during compacting:

Check `if (value.trim() && !disabled && !compacting)` in the Enter handler.

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Chat/ChatInput.tsx frontend/src/components/Chat/ChatArea.tsx
git commit -m "feat(frontend): add compacting state to ChatInput with per-session token display"
```

---

### Task 8: Regenerate Wails bindings and verify end-to-end

**Files:**
- Auto-generated: `frontend/bindings/monika/`

- [ ] **Step 1: Regenerate Wails bindings**

Run: `wails3 task bindings`
Expected: generates updated TypeScript bindings with new StreamEvent fields

- [ ] **Step 2: Full build verification**

```bash
cd frontend && npm run build && cd ..
go build .
```

Expected: build succeeds

- [ ] **Step 3: Run all tests**

```bash
go test ./...
cd frontend && npx tsc --noEmit && cd ..
```

Expected: all tests pass, no type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/bindings/
git commit -m "chore: regenerate Wails bindings with compaction event types"
```

---

### Task 9: Manual verification checklist

- [ ] Start a long conversation with an agent, verify token count accumulates per-session
- [ ] Verify compaction triggers when tokens exceed threshold (check console logs)
- [ ] Verify compaction card appears in chat with summary text and statistics
- [ ] Verify ChatInput shows "Compacting..." during compaction
- [ ] Verify switching sessions preserves per-session token counts
- [ ] Verify session reload after compaction shows summary message correctly
- [ ] Verify compaction failure gracefully truncates instead
