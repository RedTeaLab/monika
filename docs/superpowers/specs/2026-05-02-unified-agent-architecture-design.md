# Unified Agent Architecture Design

## Context

Monika's current architecture has two independent problems:

1. **Compaction is a special snowflake**: `runCompaction` / `EventCompacting` / `EventCompaction` are hardcoded in the agent loop. Adding any new background workflow (code review, test runner) would require more special-cased code. This is an internal code-quality concern — users don't experience compaction's implementation directly, but the special-casing blocks extensibility.
2. **No subtask capability**: The agent can't fork work to sub-agents. Every request is one flat conversation. This is a user-facing capability gap.

These two problems are **decoupled** — subtask dispatch can be added incrementally on top of the existing agent loop without touching compaction. The migration path reflects this: Phase 2 (subtask dispatch) ships before Phase 3 (compaction migration). Each phase delivers independent value and can be validated separately.

OpenCode models subtasks and compaction uniformly as "tasks" attached to user messages. This design takes the same insight: **everything is an Agent**. The main conversation loop, subtasks, compaction — all run on the same `AgentLoop`, differing only in configuration. But the unification is an architectural goal, not a coupling constraint — each component migrates independently.

## Core Abstraction

### Agent (static config)

```go
type Agent struct {
    Name         string   // unique identifier: "general", "explore", "compaction"
    Description  string   // shown to LLM for dispatch decisions
    SystemPrompt string   // injected as the system message
    Model        string   // model override; "" = inherit from parent
    Provider     string   // provider override; "" = inherit from parent
    Hidden       bool     // true = not shown in agent list (e.g. compaction)
}
```

The `Provider` field resolves the model-to-provider routing problem: child agents may need a different API backend than the parent (e.g., parent uses DeepSeek, compaction child uses OpenAI). When `Provider` is set, `AgentLoop` creates its own `ProviderEngine` for that provider; when empty, it inherits the parent's provider.

### AgentLoop (running instance)

```go
type AgentLoop struct {
    agent    Agent
    provider engine.ProviderEngine
    tools    *tool.ToolRegistry
    session  *Session              // child session for this loop
    conv     *Conversation          // in-memory conversation state (replaces scattered fields)
    parent   *AgentLoop             // nil = root; non-nil = child subtask

    // Internal channels populated during Run():
    streamCh   <-chan Event         // main LLM event stream (fed by existing runStreaming logic)
    bgNotifyCh <-chan Event         // fire-forget completion notifications

    // Child management (implementation details — defined in runner.go):
    // activeChildren() []*childHandle
    // mergeChildren([]*childHandle) <-chan Event
    // dispatchChild(SubTask) *childHandle
    // cancelAllChildren()
}
```

Every `AgentLoop` exposes the same interface:

```go
// Run replaces both the current Run() and RunStreaming().
// It accepts ctx + conversation + user message, matching the existing signature,
// but returns <-chan Event for streaming (same as RunStreaming today).
// The blocking Run() caller at api/app.go is updated in Phase 1.
func (a *AgentLoop) Run(ctx context.Context, conv *Conversation, userMessage string) <-chan Event
```

A root session is just `AgentLoop{parent: nil}`. A subtask is `AgentLoop{parent: root}`. Compaction is `AgentLoop{agent: compactAgent, parent: root}`. All run through `Run()`. No special cases.

### Session vs Conversation

- `Conversation` (existing, `agent_loop.go:63-71`): in-memory struct with `Messages`, `TokenCount`, `CompactionCount`. Owned by the AgentLoop for the duration of `Run()`.
- `Session` (existing, `api/session_manager.go:24-38`): persistent, file-backed struct with `Messages`, `Model`, `Provider`. Survives across restarts. A `Session` is serialized/deserialized to/from a `Conversation` at start/end of `Run()`.

For child AgentLoops, a new child `Session` is created with `ParentID` set. The child's `Conversation` is initialized from the child session (or from the task prompt for ephemeral tasks).

### SubTask type

```go
type TaskType string

const (
    TaskSubtask    TaskType = "subtask"     // user/LLM-initiated subtask
    TaskCompaction TaskType = "compaction"  // system-initiated compaction
)

type SubTask struct {
    ID          string   `json:"id"`
    Type        TaskType `json:"type"`
    Agent       string   `json:"agent"`        // agent name from registry
    Description string   `json:"description"`
    Prompt      string   `json:"prompt"`
    Model       string   `json:"model,omitempty"`     // override; "" = inherit
    Provider    string   `json:"provider,omitempty"`  // override; "" = inherit
    SessionID   string   `json:"session_id"`          // child session
    Status      string   `json:"status"`              // pending | running | done | error
    Result      string   `json:"result,omitempty"`
}
```

## Dispatch Modes

When the LLM calls `SpawnAgent`, it specifies a dispatch mode:

```go
type DispatchMode string
const (
    DispatchBlocking   DispatchMode = "blocking"    // parent waits for result
    DispatchFireForget DispatchMode = "fire_forget" // parent continues immediately
    DispatchStreaming  DispatchMode = "streaming"   // parent receives real-time events
)
```

| Mode | Parent behavior | Use case |
|------|----------------|----------|
| `blocking` | Pauses LLM stream, waits for child to complete, forwards result as tool output | Code analysis, file search, any subtask whose result is needed |
| `fire_forget` | Dispatches child goroutine, continues immediately. Child result delivered via background notification when done | Start HTTP server, monitor logs, long-running background work |
| `streaming` | Parent and child streams interleaved. Parent can react to child events mid-execution | Interactive debugging, progress reporting |

### Blocking dispatch (default)

```
Parent LLM → SpawnAgent(agent="explore", mode=blocking, prompt="find auth bugs")
                     │
                     ▼
          go child.Run(ctx, childConv, prompt)
                     │
  Parent Run():      │
    select {         │
    case ev :=       │
      <-resultCh: ───┘ child streams events
      forward ev     Parent forwards to user
    }
                     │
  child completes ──→ result written as tool output in parent conversation
  Parent LLM sees:   task_id: abc123
                     <task_result> ... </task_result>
  Parent continues   with subtask knowledge
```

### Fire-forget dispatch

```
Parent LLM → SpawnAgent(agent="http-server", mode=fire_forget,
                        prompt="start test server on :8080")
                     │
                     ▼
          go child.Run(ctx, childConv, prompt)
          // resultCh NOT registered in parent select
          // Parent continues immediately
                     │
  Parent LLM sees:   "task dispatched: <sessionID>"
  Parent continues   testing immediately
                     │
                     ▼  (later)
          child completes → notification via bgNotifyCh
          Parent sees:   "[http-server] server started on :8080 (pid 12345)"
```

### Streaming dispatch

```
Parent LLM → SpawnAgent(agent="load-tester", mode=streaming,
                        prompt="run 1000 req/s for 30 seconds")
                     │
                     ▼
          go child.Run(ctx, childConv, prompt)

  Parent Run():
    select {
    case ev := <-streamCh:       // main LLM stream
      forward ev
    case ev := <-resultCh:       // child real-time events
      forward ev                 // interleaved with parent output
    }
```

## Parent Select Loop

The parent select loop composes with the existing `runStreaming` inner event loop. The existing `runStreaming` logic (token buffering, thinking/text buffering, per-event-type dispatch at `agent_loop.go:554-631`) feeds into `streamCh`. The select loop adds child channel multiplexing on top:

```go
func (a *AgentLoop) Run(ctx context.Context, conv *Conversation, userMessage string) <-chan Event {
    ch := make(chan Event, 64)
    go func() {
        defer close(ch)
        defer a.cancelAllChildren()

        // Start existing runStreaming logic → feeds a.streamCh
        go a.runStreamingInner(ctx, conv, userMessage)

        for {
            // Collect active child channels
            children := a.activeChildren()

            select {
            case ev, ok := <-a.streamCh:
                if !ok {
                    // LLM stream ended — drain remaining children, then return
                    a.drainChildren(children, ch)
                    return
                }
                if isSpawnAgent(ev) {
                    child := a.dispatchChild(ev.SpawnAgent)
                    if child.Mode == DispatchBlocking || child.Mode == DispatchStreaming {
                        children = append(children, child)
                    }
                }
                ch <- ev

            case ev := <-a.mergeChildren(children):
                ch <- ev
                if ev.Type == EventDone {
                    // Write child result as tool output in parent conv
                    conv.Messages = append(conv.Messages, formatTaskResult(ev))
                }

            case ev := <-a.bgNotifyCh:
                ch <- ev  // fire-forget completion notice

            case <-ctx.Done():
                return
            }
        }
    }()
    return ch
}
```

### Error handling (shadow paths)

The dispatch path handles these failure modes:

| Failure | Handling |
|---------|----------|
| Invalid `subagent_type` (agent not in registry) | Return tool error: "agent X not found. Available: general, explore" |
| Child AgentLoop creation fails (e.g., provider init error) | Return tool error with cause, parent continues |
| Child `Run()` channel closes with `EventError` | Forward error event, write error tool output to parent conv |
| Context cancelled mid-child-execution | `childCtx` cancelled via `context.WithCancel`, child goroutine exits |
| Child `Run()` panics | `defer recover()` in dispatch wrapper, converted to `EventError` |
| Parent exits with fire-forget children running | `defer a.cancelAllChildren()` cancels all child contexts |
| Compaction agent overflows its own context | Compaction agent has `max_turns: 1` and no SpawnAgent tool; single-turn only, no recursion |

## Agent Registry

```go
var defaultAgents = []Agent{
    {
        Name:         "general",
        Description:  "General-purpose agent for research and multi-step tasks",
        SystemPrompt: generalPrompt,
        Model:        "",
        Provider:     "",
    },
    {
        Name:         "compaction",
        Description:  "Internal — conversation summarizer",
        SystemPrompt: compactionPrompt,
        Model:        "",  // configured via config.yaml models.compaction, defaults to cheapest available model
        Provider:     "",
        Hidden:       true,
    },
}

type AgentRegistry struct {
    agents map[string]Agent
}
func (r *AgentRegistry) Get(name string) (Agent, bool)
func (r *AgentRegistry) List(includeHidden bool) []Agent
```

The `explore` agent and user-configured agents from `config.yaml` are added in Phase 2 when the dispatch consumer exists. Phase 1 only registers agents with immediate consumers (`general` for the root loop, `compaction` for Phase 3).

## Compaction as an Agent

Compaction is no longer special-cased. When `isOverflow` triggers:

```go
// OLD (deleted in Phase 3):
//   runCompaction(ctx, conv, ch)
//   EventCompacting / EventCompaction

// NEW:
task := SubTask{
    Type:  TaskCompaction,
    Agent: "compaction",
    Prompt: "", // conv.Messages is passed via the child Conversation initialized from parent conv
}
child := a.dispatchChild(task)
// child runs compaction agent → structured summary
// result written to conv.Messages (archive + summary + recent tail)
// no EventCompacting / EventCompaction — just normal tool output
```

### Compaction output sanitization

The compaction agent's system prompt includes mandatory post-processing rules (replacing the deleted `cleanCompactionSummary` function):

```
Rules:
- Output ONLY the Markdown summary — no preamble, no commentary
- Do NOT wrap output in code fences (```) or XML tags
- The first line of your response MUST start with "## Goal"
- Do not include <think> or <thinking> blocks
```

Additionally, the child AgentLoop wrapper applies a lightweight sanitization pass on the raw LLM output before writing to conv.Messages:
- Strip `<think>.*?</think>` blocks (regex, same as current `cleanCompactionSummary`)
- Strip leading/trailing ``` fences if present
- If output doesn't start with `## `, scan forward to the first `## ` heading

### Compaction migration risk management

Phase 3 includes these safeguards:

1. **Shadow mode**: Before deleting old compaction code, run both old and new compaction on the same input and compare output structure (both produce `## Goal / ## Key Decisions / ## Progress / ## Next Steps / ## Relevant Files` sections)
2. **Behavioral equivalence**: Verify the new path produces the same `Conversation` state (archive messages, summary message, recent tail messages, CompactionCount increment, TokenCount update)
3. **Rollback**: Keep old functions behind a `//go:build !phase3` tag during validation; revert by flipping the build tag
4. **Error fallback**: If compaction agent call fails, fall back to `rewriteMessagesTruncate` (keep the existing truncation fallback, not deleted)

Deleted after validation: `runCompaction`, `buildCompactionPrompt`, `cleanCompactionSummary`, `rewriteMessages`, `EventCompacting`, `EventCompaction`, `CompactingEvent`, `CompactionEvent`. All replaced by the generic dispatch path.

## Concurrency Model

```go
type TaskRunner struct {
    sem chan struct{}  // max concurrent subtasks (default 4)
}

func (r *TaskRunner) Dispatch(ctx context.Context, a *AgentLoop, task SubTask) <-chan Event {
    resultCh := make(chan Event, 64)

    go func() {
        defer func() {
            if rec := recover(); rec != nil {
                // Convert panic to error event so parent doesn't hang
                resultCh <- Event{Type: EventError, Error: fmt.Errorf("child panic: %v", rec)}
                close(resultCh)
            }
        }()

        // Acquire semaphore slot
        select {
        case r.sem <- struct{}{}:
        case <-ctx.Done():
            return
        }
        defer func() { <-r.sem }()

        child := NewLoop(a.agent, task)
        childCtx, cancel := context.WithCancel(ctx)
        defer cancel()

        for ev := range child.Run(childCtx) {
            select {
            case resultCh <- ev:
            case <-ctx.Done():
                return
            }
        }
        close(resultCh)
    }()

    return resultCh
}
```

Key properties:
- **Goroutine per subtask**: natural Go concurrency
- **Semaphore cap**: `make(chan struct{}, MaxConcurrent)` limits parallelism
- **Context cascade**: cancel parent → cancel all children
- **Channel buffering**: `resultCh` buffer prevents goroutine leaks
- **Panic recovery**: child panics converted to error events, parent doesn't deadlock

## SpawnAgent Tool Parameters

The tool is named `SpawnAgent` to avoid collision with the existing `TaskCreate` tool (`internal/tool/builtin/task_create.go`) which manages structured todo lists with the `{tasks: [{id, subject, status}]}` schema.

```json
{
  "description": "A short description of the task",
  "prompt": "The task for the agent to perform",
  "subagent_type": "explore",
  "mode": "blocking",
  "resume_id": "optional session ID to resume a previous task"
}
```

The `resume_id` parameter allows resuming a previously dispatched subtask — useful for long-running background agents the user wants to check on.

**Coexistence with existing TaskCreate:** The existing `TaskCreate`/`TaskUpdate`/`TaskList` tools and the `TodoPanel` frontend continue to work unchanged. `SpawnAgent` is a separate tool for agent dispatch. The system prompt instructs the LLM to use `TaskCreate` for todo-list planning and `SpawnAgent` for delegating work to sub-agents.

## Tool Output Format

```text
task_id: <childSessionID>  (use with resume_id to continue this task)

<task_result>
## Goal
...

## Key Decisions
...

## Progress
...
</task_result>
```

The parent LLM receives this as a standard tool output, same as any other tool. No special event types.

## Frontend Display

### Design principle: tab-per-session, not nested inline

Subagent execution is NOT rendered as nested content inside the parent message. Instead, each subagent session gets its own tab — the same way OpenCode TUI navigates into child sessions. The parent conversation shows only a compact summary card; clicking it opens the subagent's full execution in a new tab.

### Parent session: SpawnAgent compact card

When the LLM calls `SpawnAgent`, the tool call renders as a compact card in the parent message's tool list:

```
┌─ SpawnAgent ───────────────────────────────────────────────┐
│  Analyze auth module for vulnerabilities                   │
│  [explore]  DeepSeek · 14.2s                       ✓ done  │
└────────────────────────────────────────────────────────────┘

┌─ SpawnAgent (running) ─────────────────────────────────────┐
│  Scan route handlers for input validation gaps             │
│  [general]  Claude Haiku                                   │
│  ● grep · pattern: `r\.(FormValue\|PostForm\|QueryParam)`  │
│                                          ● running          │
└────────────────────────────────────────────────────────────┘
```

- **Agent badge**: color-coded mono label (`explore`, `general`, `compaction`)
- **Status**: `● running` (yellow pulse), `✓ done` (green), `✗ error` (red)
- **Running detail**: current tool name + input summary, live-updated
- **Done detail**: model name + duration
- The entire card is clickable — navigates to the child session tab
- A `Ctrl+→ view subagents` hint appears below the assistant message when it contains SpawnAgent calls

### Child session: full conversation in a tab

Clicking a SpawnAgent card opens a new tab. The tab bar shows:

```
[🛡️ Security audit] [● explore · analyze auth] [+]
```

Inside the child session tab:

1. **Prompt message**: the subtask prompt rendered as the first message, with a purple left border and `Subtask · explore agent` role label (distinct from `User`)
2. **Full execution**: thinking blocks, tool calls, text output — all rendered by the same `MessageBubble` component, zero nesting
3. **SubagentFooter**: a bottom bar showing:
   - Agent name with purple dot
   - Position among siblings: `1 of 2`
   - Token usage / cost summary
   - Navigation buttons: `← Parent (Esc)`, `← Prev (Ctrl+←)`, `Next → (Ctrl+→)`

Child sessions have no prompt input — they are read-only views of completed (or running) subagent execution.

### Interaction flow

```
Parent session                    Child session tab
┌──────────────────┐    click     ┌──────────────────────────┐
│ Assistant:       │ ──────────→  │ Subtab · explore agent   │
│ ┌─ SpawnAgent ─┐ │              │                          │
│ │ analyze auth │ │              │ Thinking...              │
│ │ [explore] ✓  │ │              │ glob → grep → text       │
│ └──────────────┘ │              │                          │
│                  │              │ ┌─ SubagentFooter ─────┐ │
│ Ctrl+→ view      │              │ │ ← Parent  ←Prev Next→│ │
│                  │              │ └──────────────────────┘ │
└──────────────────┘              └──────────────────────────┘
```

### Compaction display (unchanged)

The existing `CompactionCard` component is retained with its gold styling, token reduction badge, and collapsible summary. Under the new system, the compaction result comes from the compaction child agent's tool output rather than `EventCompaction`, but the visual presentation is identical from the user's perspective.

### Implementation notes

- No new `Message` role needed — SpawnAgent is a `ToolCall` with `name: "SpawnAgent"`, rendered by a new `SpawnBlock` component (sibling to `ToolBlock`)
- Child session tabs reuse the existing `TabBar` / `openSessions` / `switchSessionTab` store mechanics
- `SubagentFooter` is conditionally rendered when `session.parentID` is set
- Compaction migration: remove `compacting`/`compaction` event handling from `setupWailsEvents()`, delete `CompactionCard`-specific data wiring, but keep the `CompactionCard` component itself

## Migration Path

### Phase 1: Agent registry + AgentLoop.Run refactor
- Add `Agent` type and `AgentRegistry` (with `general` and `compaction` builtins only)
- Refactor `AgentLoop` to use `Agent` struct instead of scattered fields
- Rename `RunStreaming` to `Run` (keep existing `Run` as `RunBlocking` for internal use)
- Update sole caller at `internal/api/app.go:259` from `RunStreaming` to `Run`
- Add `conv *Conversation` field to AgentLoop struct
- Add `SubTask` type and `TaskType` constants
- Existing behavior unchanged
- **Files**: `internal/agent/agent.go` (new), `internal/agent/subtask.go` (new), `internal/agent/agent_loop.go` (refactor), `internal/api/app.go` (update caller)

### Phase 2: SpawnAgent dispatch
- Add `SpawnAgent` tool (distinct from existing `TaskCreate` for todo lists)
- Add `TaskRunner` with goroutine dispatch
- Register `explore` agent in registry
- Add user-configured agent loading from `config.yaml`
- Blocking mode only, single child
- **Files**: `internal/agent/runner.go` (new), `internal/tool/builtin/spawn_agent.go` (new), `internal/config/config.go` (add agents section), `frontend/src/components/Chat/SpawnBlock.tsx` (new), `frontend/src/store/index.ts` (add SpawnAgent tool handling)

### Phase 3: Compaction migration
- Register `compaction` agent in registry (if not already from Phase 1)
- Replace `isOverflow` → `runCompaction` path with `dispatchChild(compactAgent)`
- Add compaction sanitization to child AgentLoop wrapper
- Shadow-mode validation: run old and new compaction side-by-side
- Delete all compaction-specific code after validation passes
- Update `internal/api/types.go` (remove `Compacting`/`Compaction` fields from `StreamEvent`)
- Update `internal/api/app.go` (remove `EventCompacting`/`EventCompaction` switch cases)
- Remove `compacting`/`compaction` event handling from `setupWailsEvents()` (compaction result now arrives as normal tool output)
- Keep `CompactionCard` component — same visuals, data source changes from `EventCompaction` to compaction child agent's tool output
- **Files**: `internal/agent/agent_loop.go` (replace compaction code), `internal/agent/compaction.go` (new, sanitization wrapper), `internal/api/types.go`, `internal/api/app.go`, `frontend/src/store/index.ts`, `frontend/src/components/Chat/MessageBubble.tsx`

### Phase 4: Advanced modes (deferred — separate design doc)
- `fire_forget` and `streaming` dispatch modes
- Multiple parallel children
- Persistent background agents
- These are explicitly deferred pending validation of the basic dispatch model in Phase 2

## Verification

1. `go build ./...` + `go test ./...` — compiles and passes at each phase
2. Manual test: "analyze the auth module" → explore subtask dispatches → result appears as tool output → parent LLM responds with findings
3. Manual test: long conversation → compaction agent dispatches → summary card appears → session continues
4. `go test -race ./internal/agent/...` — no data races in goroutine dispatch
5. Compaction equivalence: run identical long conversation through old and new compaction, diff the resulting `Conversation` state

## Appendix: Future Directions

The following patterns are enabled by the unified AgentLoop architecture but are explicitly out of scope for the current migration. They will be addressed in separate design documents when concrete use cases and user demand are established.

### Pipeline

Chain agents together — output of one becomes input of the next. The parent LLM sees explore result, decides to launch review-agent, sees review result, decides to launch fix-agent. No special pipeline engine needed — the parent LLM is the orchestrator.

### Competing Agents

Same problem, multiple agents with different strategies. Parent compares results and picks the best. No special competing engine — the parent LLM naturally compares and merges.

### Persistent Background Agent

A session-level agent that survives compaction and retains memory across turns. Runs in the background for the entire session, receiving file change events, user config updates, and compaction summaries.

### Supervisor Agent

Parent delegates execution entirely to sub-agents and only supervises — with timeout, retry, and arbitration logic. Just a more aggressive use of the existing dispatch primitives.
