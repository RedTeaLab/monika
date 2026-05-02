# Unified Agent Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify subtask dispatch and compaction into a single AgentLoop architecture with tab-per-session frontend display.

**Architecture:** Three phases. Phase 1 adds Agent/AgentRegistry/SubTask types and renames RunStreaming→Run (zero behavior change). Phase 2 adds SpawnAgent tool + TaskRunner goroutine dispatch + SpawnBlock frontend. Phase 3 migrates compaction from special-cased events to generic dispatch.

**Tech Stack:** Go 1.22+, React 18 + TypeScript + Zustand, Wails v3

**Spec:** `docs/superpowers/specs/2026-05-02-unified-agent-architecture-design.md`

---
## Files Changed

| File | Action | Phase |
|------|--------|-------|
| `internal/agent/agent.go` | Create | 1 |
| `internal/agent/subtask.go` | Create | 1 |
| `internal/agent/agent_loop.go` | Modify | 1, 3 |
| `internal/agent/runner.go` | Create | 2 |
| `internal/agent/compaction.go` | Create | 3 |
| `internal/agent/event.go` | Modify | 3 |
| `internal/tool/builtin/spawn_agent.go` | Create | 2 |
| `internal/tool/builtin/register.go` | Modify | 2 |
| `internal/api/app.go` | Modify | 1, 2, 3 |
| `internal/api/types.go` | Modify | 3 |
| `internal/api/session_manager.go` | Modify | 2 |
| `internal/config/config.go` | Modify | 2 |
| `frontend/src/components/Chat/SpawnBlock.tsx` | Create | 2 |
| `frontend/src/components/Chat/SubagentFooter.tsx` | Create | 2 |
| `frontend/src/store/index.ts` | Modify | 2, 3 |
| `frontend/src/components/Chat/MessageBubble.tsx` | Modify | 2, 3 |
| `frontend/src/components/Chat/ChatArea.tsx` | Modify | 2 |

---

## Phase 1: Agent Registry + Refactor (backend, no user-visible change)

### Task 1: Create Agent type and AgentRegistry

**Files:** Create `internal/agent/agent.go`

- [ ] **Step 1: Write agent.go**

```go
package agent

type Agent struct {
    Name         string
    Description  string
    SystemPrompt string
    Model        string // "" = inherit from parent
    Provider     string // "" = inherit from parent
    Hidden       bool
}

type AgentRegistry struct {
    agents map[string]Agent
}

func NewAgentRegistry(agents []Agent) *AgentRegistry {
    r := &AgentRegistry{agents: make(map[string]Agent)}
    for _, a := range agents {
        r.agents[a.Name] = a
    }
    return r
}

func (r *AgentRegistry) Get(name string) (Agent, bool) {
    a, ok := r.agents[name]
    return a, ok
}

func (r *AgentRegistry) List(includeHidden bool) []Agent {
    var out []Agent
    for _, a := range r.agents {
        if !includeHidden && a.Hidden {
            continue
        }
        out = append(out, a)
    }
    return out
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./internal/agent/...`
Expected: compiles cleanly

- [ ] **Step 3: Commit**

```bash
git add internal/agent/agent.go
git commit -m "feat: add Agent type and AgentRegistry"
```

### Task 2: Create SubTask and DispatchMode types

**Files:** Create `internal/agent/subtask.go`

- [ ] **Step 1: Write subtask.go**

```go
package agent

type TaskType string

const (
    TaskSubtask    TaskType = "subtask"
    TaskCompaction TaskType = "compaction"
)

type DispatchMode string

const (
    DispatchBlocking   DispatchMode = "blocking"
    DispatchFireForget DispatchMode = "fire_forget"
    DispatchStreaming  DispatchMode = "streaming"
)

type SubTask struct {
    ID          string       `json:"id"`
    Type        TaskType     `json:"type"`
    Agent       string       `json:"agent"`
    Description string       `json:"description"`
    Prompt      string       `json:"prompt"`
    Model       string       `json:"model,omitempty"`
    Provider    string       `json:"provider,omitempty"`
    SessionID   string       `json:"session_id"`
    Status      string       `json:"status"`
    Result      string       `json:"result,omitempty"`
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./internal/agent/...`
Expected: compiles

- [ ] **Step 3: Commit**

```bash
git add internal/agent/subtask.go
git commit -m "feat: add SubTask, TaskType, and DispatchMode types"
```

### Task 3: Add Agent + conv + parent fields to AgentLoop

**Files:** Modify `internal/agent/agent_loop.go:300-309`

- [ ] **Step 1: Replace AgentLoop struct (lines 300-309)**

Replace:
```go
type AgentLoop struct {
	provider         engine.ProviderEngine
	tools            *tool.ToolRegistry
	systemPrompt     string
	confirmFn        func(tool.Tool, json.RawMessage) bool
	projectDir       string
	model            string
	sessionID        string
	modelContextLimit int64 // 0 = use hardcoded map + default
}
```

With:
```go
type AgentLoop struct {
	agent    Agent
	provider engine.ProviderEngine
	tools    *tool.ToolRegistry
	// conv is the in-memory conversation for this loop's run.
	conv *Conversation
	// parent is nil for root loops; non-nil for child subtasks.
	parent *AgentLoop

	sessionID        string
	systemPrompt     string
	confirmFn        func(tool.Tool, json.RawMessage) bool
	projectDir       string
	model            string
	modelContextLimit int64 // 0 = use hardcoded map + default
}
```

- [ ] **Step 2: Add WithAgent and WithParent options**

After `WithContextLimit` (line ~345), add:

```go
func WithAgent(agent Agent) LoopOption {
	return func(a *AgentLoop) {
		a.agent = agent
		if agent.SystemPrompt != "" {
			a.systemPrompt = agent.SystemPrompt
		}
		if agent.Model != "" {
			a.model = agent.Model
		}
	}
}

func WithParent(parent *AgentLoop) LoopOption {
	return func(a *AgentLoop) { a.parent = parent }
}
```

- [ ] **Step 3: Verify compilation**

Run: `go build ./internal/agent/... ./internal/api/...`
Expected: compiles

- [ ] **Step 4: Commit**

```bash
git add internal/agent/agent_loop.go
git commit -m "refactor: add Agent, conv, and parent fields to AgentLoop struct"
```

### Task 4: Rename RunStreaming to Run

**Files:** Modify `internal/agent/agent_loop.go:358, 472`, `internal/api/app.go:259`

- [ ] **Step 1: Rename existing Run to RunBlocking**

Line 358: change `func (a *AgentLoop) Run(` to `func (a *AgentLoop) RunBlocking(`

- [ ] **Step 2: Rename RunStreaming to Run**

Line 472: change `func (a *AgentLoop) RunStreaming(` to `func (a *AgentLoop) Run(`

- [ ] **Step 3: Update caller in app.go line 259**

Change `loop.RunStreaming(ctx, conv, text)` to `loop.Run(ctx, conv, text)`

- [ ] **Step 4: Verify build + tests**

Run: `go build ./... && go test ./internal/agent/...`
Expected: compiles, tests pass

- [ ] **Step 5: Commit**

```bash
git add internal/agent/agent_loop.go internal/api/app.go
git commit -m "refactor: rename RunStreaming to Run, Run to RunBlocking"
```

### Task 5: Store conv reference on AgentLoop during Run()

**Files:** Modify `internal/agent/agent_loop.go:472-479`

- [ ] **Step 1: Add a.conv = conv to Run()**

Replace lines 472-479:
```go
func (a *AgentLoop) Run(ctx context.Context, conv *Conversation, userMessage string) <-chan Event {
	ch := make(chan Event, 64)
	go func() {
		defer close(ch)
		a.runStreaming(ctx, conv, userMessage, ch)
	}()
	return ch
}
```

With:
```go
func (a *AgentLoop) Run(ctx context.Context, conv *Conversation, userMessage string) <-chan Event {
	ch := make(chan Event, 64)
	a.conv = conv
	go func() {
		defer close(ch)
		a.runStreaming(ctx, conv, userMessage, ch)
	}()
	return ch
}
```

- [ ] **Step 2: Verify build**

Run: `go build ./internal/agent/...`
Expected: compiles

- [ ] **Step 3: Commit**

```bash
git add internal/agent/agent_loop.go
git commit -m "refactor: store conv reference on AgentLoop during Run()"
```

---

## Phase 2: SpawnAgent Dispatch + Frontend

### Task 6: Create SpawnAgent tool

**Files:** Create `internal/tool/builtin/spawn_agent.go`, Modify `internal/tool/builtin/register.go`

- [ ] **Step 1: Write spawn_agent.go**

```go
package builtin

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"strings"

	"monika/internal/agent"
	"monika/internal/tool"
)

type spawnAgentTool struct {
	registry   *agent.AgentRegistry
	dispatchFn func(ctx context.Context, task agent.SubTask) <-chan agent.Event
}

func NewSpawnAgent(registry *agent.AgentRegistry, dispatchFn func(ctx context.Context, task agent.SubTask) <-chan agent.Event) tool.Tool {
	return &spawnAgentTool{registry: registry, dispatchFn: dispatchFn}
}

func (t *spawnAgentTool) Name() string { return "SpawnAgent" }

func (t *spawnAgentTool) Description() string {
	return `Launch a new agent to handle complex, multi-step tasks. Each agent type has specific capabilities and tools available to it.

Available agent types and the tools they have access to:
- explore: Fast agent specialized for exploring codebases. Use when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase.
- general: General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks.

Usage notes:
- Provide a clear, specific prompt describing what the subagent should do and what format you want the result in.
- Use "blocking" mode (default) when you need the subagent's result before continuing.
- The subagent returns its full findings as a tool result.`
}

func (t *spawnAgentTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"description": map[string]any{
				"type":        "string",
				"description": "A short description of the task (3-5 words)",
			},
			"prompt": map[string]any{
				"type":        "string",
				"description": "The task for the agent to perform. Be specific about what you want the agent to investigate or produce.",
			},
			"subagent_type": map[string]any{
				"type":        "string",
				"description": "The type of agent to dispatch. Available: 'explore', 'general'.",
			},
			"mode": map[string]any{
				"type":        "string",
				"enum":        []string{"blocking"},
				"description": "Dispatch mode. Only 'blocking' is supported — parent waits for result.",
			},
		},
		"required": []string{"description", "prompt", "subagent_type"},
	}
}

func (t *spawnAgentTool) Execute(ctx context.Context, args json.RawMessage) (tool.ExecutionResult, error) {
	var params struct {
		Description  string `json:"description"`
		Prompt       string `json:"prompt"`
		SubagentType string `json:"subagent_type"`
		Mode         string `json:"mode"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return tool.ExecutionResult{}, fmt.Errorf("invalid arguments: %w", err)
	}

	ag, ok := t.registry.Get(params.SubagentType)
	if !ok {
		var available []string
		for _, a := range t.registry.List(false) {
			available = append(available, a.Name)
		}
		return tool.ExecutionResult{
			Content: fmt.Sprintf("agent %q not found. Available: %v", params.SubagentType, available),
			IsError: true,
		}, nil
	}

	if params.Mode == "" {
		params.Mode = "blocking"
	}

	if t.dispatchFn == nil {
		return tool.ExecutionResult{
			Content: "subtask dispatch is not configured",
			IsError: true,
		}, nil
	}

	task := agent.SubTask{
		ID:          generateSubTaskID(),
		Type:        agent.TaskSubtask,
		Agent:       ag.Name,
		Description: params.Description,
		Prompt:      params.Prompt,
		Status:      "pending",
	}

	resultCh := t.dispatchFn(ctx, task)
	var output strings.Builder
	for ev := range resultCh {
		switch ev.Type {
		case agent.EventTextDelta:
			output.WriteString(ev.Content)
		case agent.EventError:
			return tool.ExecutionResult{
				Content: fmt.Sprintf("subtask failed: %s", ev.Content),
				IsError: true,
			}, nil
		}
	}

	result := output.String()
	if result == "" {
		result = "(subtask completed with no output)"
	}

	return tool.ExecutionResult{
		Content: fmt.Sprintf("task_id: %s\n\n<task_result>\n%s\n</task_result>", task.ID, result),
	}, nil
}

func generateSubTaskID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return fmt.Sprintf("sub_%x", b)
}
```

- [ ] **Step 2: Add RegisterSpawnAgent to register.go**

After `RegisterTasks` (line 26), add:

```go
func RegisterSpawnAgent(r *tool.ToolRegistry, registry *agent.AgentRegistry, dispatchFn func(ctx context.Context, task agent.SubTask) <-chan agent.Event) {
	r.Register(NewSpawnAgent(registry, dispatchFn))
}
```

Add `"context"` and `"monika/internal/agent"` to imports in register.go:
```go
import (
	"context"
	"monika/internal/agent"
	"monika/internal/tool"
)
```

- [ ] **Step 3: Verify build**

Run: `go build ./internal/tool/builtin/...`
Expected: compiles

- [ ] **Step 4: Commit**

```bash
git add internal/tool/builtin/spawn_agent.go internal/tool/builtin/register.go
git commit -m "feat: add SpawnAgent tool with registry-based agent dispatch"
```

### Task 7: Create TaskRunner with goroutine dispatch

**Files:** Create `internal/agent/runner.go`

- [ ] **Step 1: Write runner.go**

```go
package agent

import (
	"context"
	"fmt"

	"monika/internal/tool"
	"monika/pkg/engine"
)

const MaxConcurrentSubtasks = 4

type TaskRunner struct {
	registry *AgentRegistry
	provider engine.ProviderEngine
	tools    *tool.ToolRegistry
	sem      chan struct{}
}

func NewTaskRunner(registry *AgentRegistry, provider engine.ProviderEngine, tools *tool.ToolRegistry) *TaskRunner {
	return &TaskRunner{
		registry: registry,
		provider: provider,
		tools:    tools,
		sem:      make(chan struct{}, MaxConcurrentSubtasks),
	}
}

func (r *TaskRunner) Dispatch(ctx context.Context, task SubTask, parent *AgentLoop) <-chan Event {
	resultCh := make(chan Event, 64)

	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				resultCh <- Event{Type: EventError, Content: fmt.Sprintf("child panic: %v", rec)}
			}
			close(resultCh)
		}()

		select {
		case r.sem <- struct{}{}:
		case <-ctx.Done():
			resultCh <- Event{Type: EventError, Content: "cancelled before dispatch"}
			return
		}
		defer func() { <-r.sem }()

		ag, ok := r.registry.Get(task.Agent)
		if !ok {
			resultCh <- Event{Type: EventError, Content: fmt.Sprintf("agent %q not found", task.Agent)}
			return
		}

		child := NewLoop(r.provider, r.tools,
			WithAgent(ag),
			WithParent(parent),
			WithSessionID(task.SessionID),
		)
		childConv := &Conversation{ID: task.SessionID}

		childCtx, cancel := context.WithCancel(ctx)
		defer cancel()

		for ev := range child.Run(childCtx, childConv, task.Prompt) {
			select {
			case resultCh <- ev:
			case <-ctx.Done():
				return
			}
		}
	}()

	return resultCh
}
```

- [ ] **Step 2: Verify build**

Run: `go build ./internal/agent/...`
Expected: compiles

- [ ] **Step 3: Commit**

```bash
git add internal/agent/runner.go
git commit -m "feat: add TaskRunner with semaphore-limited goroutine dispatch"
```

### Task 8: Wire registry + runner in app.go

**Files:** Modify `internal/api/app.go:23-44` (struct), `:46` (NewApp), `:236-241` (loop opts), `:97-163` (main wiring)

Read `internal/api/app.go` fully before starting.

- [ ] **Step 1: Add fields to App struct** (app.go ~line 30)

Add after existing fields:
```go
agentRegistry *agent2.AgentRegistry
taskRunner    *agent2.TaskRunner
```

- [ ] **Step 2: Build builtin agents in NewApp** (app.go ~line 60, after tools registration)

```go
// Build agent registry
generalPrompt := /* existing system prompt from system_prompt.go */
compactionPrompt := /* existing compaction prompt from system_prompt.go or buildCompactionPrompt */

registry := agent2.NewAgentRegistry([]agent2.Agent{
    {
        Name:         "general",
        Description:  "General-purpose agent for research and multi-step tasks",
        SystemPrompt: generalPrompt,
    },
    {
        Name:         "explore",
        Description:  "Fast agent specialized for exploring codebases",
        SystemPrompt: generalPrompt, // reuses same prompt for Phase 2
    },
    {
        Name:         "compaction",
        Description:  "Internal — conversation summarizer",
        SystemPrompt: compactionPrompt,
        Hidden:       true,
    },
})

runner := agent2.NewTaskRunner(registry, provider, appRegistry)

// Store in App
app.agentRegistry = registry
app.taskRunner = runner
```

Note: `generalPrompt` is currently constructed in `internal/agent/system_prompt.go`. Export it or add a `DefaultSystemPrompt()` function. For Phase 2, both "general" and "explore" can use the same system prompt — differentiation comes from the tool set and agent name in the prompt.

- [ ] **Step 3: Register SpawnAgent tool** (app.go ~line 95, after RegisterTasks)

```go
// Register SpawnAgent tool
builtin.RegisterSpawnAgent(appRegistry, app.agentRegistry, func(ctx context.Context, task agent2.SubTask) <-chan agent2.Event {
    return app.taskRunner.Dispatch(ctx, task, nil) // nil parent for now
})
```

- [ ] **Step 4: Pass Agent to loop in SendMessage** (app.go ~line 236)

After creating loop opts, add `WithAgent`:

```go
generalAgent, _ := a.agentRegistry.Get("general")
loopOpts = append(loopOpts, agent2.WithAgent(generalAgent))
```

- [ ] **Step 5: Verify build + tests**

Run: `go build ./... && go test ./...`
Expected: compiles, all tests pass

- [ ] **Step 6: Commit**

```bash
git add internal/api/app.go
git commit -m "feat: wire AgentRegistry, TaskRunner, and SpawnAgent into App"
```

### Task 9: Add ParentID to Session

**Files:** Modify `internal/api/session_manager.go:24-38`

- [ ] **Step 1: Add ParentID field to Session struct** (line 38, before CreatedAt)

```go
ParentID string `json:"parent_id,omitempty"`
```

- [ ] **Step 2: Verify build**

Run: `go build ./internal/api/...`
Expected: compiles (new field has no consumers yet)

- [ ] **Step 3: Commit**

```bash
git add internal/api/session_manager.go
git commit -m "feat: add ParentID field to Session for child session tracking"
```

### Task 10: Create SpawnBlock frontend component

**Files:** Create `frontend/src/components/Chat/SpawnBlock.tsx`

- [ ] **Step 1: Write SpawnBlock.tsx**

```typescript
import { useMemo } from 'react'
import { useStore } from '../../store'

interface ToolCall {
  name: string
  input: string
  output?: string
  status: 'running' | 'done' | 'error'
}

function parseSpawnInput(input: string): {
  description: string
  subagent_type: string
} {
  try {
    const obj = JSON.parse(input)
    return {
      description: obj.description || 'Untitled task',
      subagent_type: obj.subagent_type || 'general',
    }
  } catch {
    return { description: input.slice(0, 60), subagent_type: 'general' }
  }
}

const AGENT_COLORS: Record<string, string> = {
  explore: '#7e70a8',
  general: '#6b8cff',
  compaction: '#c6902f',
}

interface SpawnBlockProps {
  tool: ToolCall
}

export default function SpawnBlock({ tool }: SpawnBlockProps) {
  const openSessionTab = useStore((s) => s.openSessionTab)
  const info = useMemo(() => parseSpawnInput(tool.input), [tool.input])
  const agentColor = AGENT_COLORS[info.subagent_type] || '#7e70a8'
  const isRunning = tool.status === 'running'

  const handleClick = () => {
    // Extract sessionID from tool output if available
    if (tool.output) {
      const m = tool.output.match(/task_id:\s*(\S+)/)
      if (m) {
        openSessionTab(m[1], `${info.subagent_type} · ${info.description}`)
      }
    }
  }

  return (
    <div
      className="rounded-lg border cursor-pointer"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04))')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-card)')}
      onClick={handleClick}
    >
      <div className="flex items-center gap-2.5 px-[14px] py-[8px]">
        <span
          className="text-[10px] font-semibold font-mono shrink-0 rounded px-1.5 py-0.5"
          style={{ color: agentColor, background: `${agentColor}1a` }}
        >
          {info.subagent_type}
        </span>
        <span className="text-[12px] font-semibold truncate">{info.description}</span>
        {isRunning && tool.output && (
          <span className="text-[10px] text-[var(--text-dim)] truncate font-mono">
            {tool.output}
          </span>
        )}
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.03em] shrink-0 ml-auto flex items-center gap-1.5"
          style={{ color: isRunning ? 'var(--yellow)' : tool.status === 'error' ? 'var(--red)' : 'var(--green)' }}
        >
          {isRunning ? (
            <>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--yellow)] motion-safe:animate-pulse" />
              running
            </>
          ) : tool.status === 'error' ? (
            'error'
          ) : (
            'done'
          )}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Chat/SpawnBlock.tsx
git commit -m "feat: add SpawnBlock component for compact subagent display"
```

### Task 11: Route SpawnAgent tools to SpawnBlock in MessageBubble

**Files:** Modify `frontend/src/components/Chat/MessageBubble.tsx`

- [ ] **Step 1: Import SpawnBlock** (add after existing imports, ~line 3)

```typescript
import SpawnBlock from './SpawnBlock'
```

- [ ] **Step 2: Route SpawnAgent tools to SpawnBlock** (~line 496)

In the tools mapping section, replace:
```typescript
{tools?.map((tool, i) => <ToolBlock key={i} tool={tool} />)}
```

With:
```typescript
{tools?.map((tool, i) =>
  tool.name === 'SpawnAgent' ? (
    <SpawnBlock key={i} tool={tool} />
  ) : (
    <ToolBlock key={i} tool={tool} />
  )
)}
```

- [ ] **Step 3: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Chat/MessageBubble.tsx
git commit -m "feat: route SpawnAgent tools to SpawnBlock component"
```

### Task 12: Create SubagentFooter + update ChatArea for child sessions

**Files:** Create `frontend/src/components/Chat/SubagentFooter.tsx`, Modify `frontend/src/components/Chat/ChatArea.tsx`

- [ ] **Step 1: Write SubagentFooter.tsx**

```typescript
import { useStore } from '../../store'

export default function SubagentFooter() {
  const switchSessionTab = useStore((s) => s.switchSessionTab)
  const activeSessionId = useStore((s) => s.activeSessionId)

  // Get parent session ID from the active session's metadata
  // For now, this is stored in a simple record. In production,
  // this would come from the session itself via Session.ParentID.
  const parentId = useStore((s) => {
    // Walk openSessions to find the parent — the tab that was active
    // before this child session was opened
    const sessions = s.openSessions
    const idx = sessions.findIndex(t => t.id === activeSessionId)
    if (idx > 0) return sessions[idx - 1].id
    return ''
  })

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 text-[11px]"
      style={{
        background: 'var(--bg-sidebar)',
        borderTop: '1px solid var(--border)',
      }}
    >
      <span className="flex items-center gap-1.5" style={{ color: '#a89cc4', fontWeight: 600 }}>
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: '#a89cc4' }} />
        subagent session
      </span>
      <span className="flex-1" />
      {parentId && (
        <button
          className="text-[10px] px-2.5 py-1 rounded border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] cursor-pointer"
          onClick={() => switchSessionTab(parentId)}
        >
          ← Parent (Esc)
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update ChatArea to hide input for child sessions, show SubagentFooter**

In `ChatArea.tsx`, import SubagentFooter:
```typescript
import SubagentFooter from './SubagentFooter'
```

Add a derived value (after `hasActiveSession` ~line 78):
```typescript
const isChildSession = false // TODO: detect from session metadata in Phase 2
```

Change the input rendering at the bottom (~line 135):
```typescript
{hasActiveSession && !isChildSession && (
  <ChatInput ... />
)}
{hasActiveSession && isChildSession && (
  <SubagentFooter />
)}
```

Note: `isChildSession` detection requires backend support (session.parentID in the SessionInfo response). Full implementation is deferred to a follow-up when the backend sends parentID in session list responses.

- [ ] **Step 3: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Chat/SubagentFooter.tsx frontend/src/components/Chat/ChatArea.tsx
git commit -m "feat: add SubagentFooter and child session mode to ChatArea"
```

### Task 13: Update store to track session parent relationships

**Files:** Modify `frontend/src/store/index.ts`

- [ ] **Step 1: Add sessionParentId to AppState** (~line 80)

```typescript
sessionParentId: ''
```

- [ ] **Step 2: Add setter** (~line 129)

```typescript
setSessionParentId: (id: string) => set({ sessionParentId: id }),
```

- [ ] **Step 3: Set parentId when opening child session tab**

In `openSessionTab`, detect that a SpawnAgent result was clicked and store the parent relationship. This is a lightweight placeholder — full parentID tracking comes when the backend exposes `Session.ParentID`.

```typescript
// In openSessionTab, before the early-return for existing tabs:
// If this session was opened from a SpawnAgent click, record the parent
const currentActive = get().activeSessionId
if (currentActive && id !== currentActive) {
  set({ sessionParentId: currentActive })
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat: add sessionParentId tracking for subagent navigation"
```

---

## Phase 3: Compaction Migration (deferred — implement after Phase 2 validated)

Phase 3 tasks are outlined with complete code in follow-up commits. The key steps:

1. **Create `internal/agent/compaction.go`** — `sanitizeCompactionOutput()`, `dispatchCompaction()`, `buildCompactionPromptFromConv()`
2. **Replace compaction code in agent_loop.go** — remove `runCompaction`/`buildCompactionPrompt`/`cleanCompactionSummary`/`rewriteMessages`, replace `isOverflow` path with `dispatchCompaction`
3. **Remove EventCompacting/EventCompaction** from `event.go` and `types.go`
4. **Remove compaction event handling** from `app.go` (switch cases for EventCompacting/EventCompaction)
5. **Update frontend store** — remove `compacting`/`compaction` case handling in `setupWailsEvents()`
6. **Keep CompactionCard component** — same visuals, data from tool output instead of EventCompaction
7. **Shadow-mode validation** — run old/new compaction side-by-side before deleting old code

---

## Verification

After each phase:

```
# Go build + test
go build ./... && go test ./...

# Race detection
go test -race ./internal/agent/...

# Frontend type check
cd frontend && npx tsc --noEmit
```

**Phase 2 manual test:**
1. Send: "analyze the auth module for security issues"
2. LLM calls SpawnAgent(agent="explore", prompt="find vulnerabilities in internal/auth/")
3. SpawnBlock appears in chat with running state
4. When done, click SpawnBlock → new tab opens with subagent's full execution
5. SubagentFooter shows "← Parent" button → clicking returns to parent session

**Phase 3 manual test:**
1. Send enough messages to trigger overflow
2. CompactionCard still appears with same gold styling and token reduction
3. Under the hood: compaction is now a child agent dispatch, not EventCompaction
