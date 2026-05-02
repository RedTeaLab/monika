# Unified Agent Architecture Design

## Context

Monika's current architecture has two problems:
1. **Compaction is a special snowflake**: `runCompaction` / `EventCompacting` / `EventCompaction` are hardcoded in the agent loop. Adding any new background workflow (code review, test runner) would require more special-cased code.
2. **No subtask capability**: The agent can't fork work to sub-agents. Every request is one flat conversation.

OpenCode models subtasks and compaction uniformly as "tasks" attached to user messages. This design generalizes that idea further: **everything is an Agent**. The main conversation loop, subtasks, compaction — all run on the same `AgentLoop`, differing only in configuration.

## Core Abstraction

### Agent (static config)

```go
type Agent struct {
    Name         string   // unique identifier: "general", "explore", "compaction"
    Description  string   // shown to LLM for dispatch decisions
    SystemPrompt string   // injected as the system message
    Model        string   // model override; "" = inherit from parent
    Hidden       bool     // true = not shown in agent list (e.g. compaction)
}
```

### AgentLoop (running instance)

```go
type AgentLoop struct {
    agent    Agent
    provider engine.ProviderEngine
    tools    *tool.ToolRegistry
    session  *Session
    parent   *AgentLoop   // nil = root; non-nil = child subtask
}
```

Every `AgentLoop` exposes the same interface:

```go
func (a *AgentLoop) Run(ctx context.Context) <-chan Event
```

A root session is just `AgentLoop{parent: nil}`. A subtask is `AgentLoop{parent: root}`. Compaction is `AgentLoop{agent: compactAgent, parent: root}`. All run through `Run()`. No special cases.

## Dispatch Modes

When the LLM calls `TaskCreate`, it specifies a dispatch mode:

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
Parent LLM → TaskCreate(agent="explore", mode=blocking, prompt="find auth bugs")
                     │
                     ▼
          go child.Run(ctx, resultCh)
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
Parent LLM → TaskCreate(agent="http-server", mode=fire_forget,
                        prompt="start test server on :8080")
                     │
                     ▼
          go child.Run(ctx, resultCh)
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
Parent LLM → TaskCreate(agent="load-tester", mode=streaming,
                        prompt="run 1000 req/s for 30 seconds")
                     │
                     ▼
          go child.Run(ctx, resultCh)

  Parent Run():
    select {
    case ev := <-streamCh:       // main LLM stream
      forward ev
    case ev := <-resultCh:       // child real-time events
      forward ev                 // interleaved with parent output
    }
```

## Parent Select Loop

```go
func (a *AgentLoop) Run(ctx context.Context) <-chan Event {
    ch := make(chan Event, 64)
    go func() {
        defer close(ch)
        for {
            // Collect active child channels
            children := a.activeChildren()

            select {
            case ev := <-a.streamCh:
                if isTaskCreate(ev) {
                    child := a.dispatchChild(ev.TaskCreate)
                    if child.Mode == DispatchBlocking || child.Mode == DispatchStreaming {
                        children = append(children, child)
                    }
                }
                ch <- ev

            case ev := <-a.mergeChildren(children):
                ch <- ev
                if ev.Type == EventDone {
                    // Write child result as tool output in parent conv
                    a.conv.Messages = append(a.conv.Messages, formatTaskResult(ev))
                }

            case ev := <-a.bgNotifyCh:
                ch <- ev  // fire-forget completion notice

            case <-ctx.Done():
                a.cancelAllChildren()
                return
            }
        }
    }()
    return ch
}
```

## Agent Registry

```go
var defaultAgents = []Agent{
    {
        Name:         "general",
        Description:  "General-purpose agent for research and multi-step tasks",
        SystemPrompt: generalPrompt,
        Model:        "",
    },
    {
        Name:         "explore",
        Description:  "Fast agent for exploring codebases. Read-only.",
        SystemPrompt: explorePrompt,
        Model:        "",
    },
    {
        Name:         "compaction",
        Description:  "Internal — conversation summarizer",
        SystemPrompt: compactionPrompt,
        Model:        cheapModel,
        Hidden:       true,
    },
    // ... user-configured agents from config.yaml
}

type AgentRegistry struct {
    agents map[string]Agent
}
func (r *AgentRegistry) Get(name string) (Agent, bool)
func (r *AgentRegistry) List(includeHidden bool) []Agent
```

## Compaction as an Agent

Compaction is no longer special-cased. When `isOverflow` triggers:

```go
// OLD (deleted):
//   runCompaction(ctx, conv, ch)
//   EventCompacting / EventCompaction

// NEW:
task := SubTask{
    Type:  TaskCompaction,
    Agent: "compaction",
    Prompt: "", // generated from conv.Messages internally
}
child := a.dispatchChild(task)
// child runs compaction agent → structured summary
// result written to conv.Messages (archive + summary + recent tail)
// no EventCompacting / EventCompaction — just normal tool output
```

Deleted: `runCompaction`, `buildCompactionPrompt`, `cleanCompactionSummary`, `rewriteMessages`, `rewriteMessagesTruncate`, `EventCompacting`, `EventCompaction`, `CompactingEvent`, `CompactionEvent`. All replaced by the generic dispatch path.

## Advanced Patterns

### 1. Pipeline

Chain agents together — output of one becomes input of the next.

```
explore-agent → review-agent → fix-agent
    (读代码)      (审发现问题)      (修)
```

The parent dispatches them sequentially, feeding each result into the next:

```go
result1 := dispatchChildSync(exploreAgent, prompt)
result2 := dispatchChildSync(reviewAgent, result1)
result3 := dispatchChildSync(fixAgent,    result2)
```

But simpler and more LLM-native: the parent LLM sees explore result, decides to launch review-agent, sees review result, decides to launch fix-agent. No special pipeline engine needed — the parent LLM is the orchestrator.

### 2. Competing Agents

Same problem, multiple agents with different strategies. Parent picks the best.

```
问题: "优化 login handler 性能"

agent-A (DeepSeek, aggressive refactor)
agent-B (Claude, conservative change)
agent-C (GPT-5,  TDD approach)

→ Parent compares 3 results, picks best or merges
```

```go
results := dispatchChildrenParallel([]Agent{agentA, agentB, agentC}, prompt)
// Parent LLM sees all 3 results and decides
```

No special competing engine. The parent LLM naturally compares and merges.

### 3. Persistent Background Agent

A session-level agent that survives compaction and retains memory across turns.

```go
type PersistentAgent struct {
    Agent
    State   map[string]any  // survives compaction
    History []string        // key memories, not cleared
}
```

Use cases:
- **File watcher**: monitors file changes throughout the session
- **User preference memory**: remembers "use testify", "don't use ORM"
- **Compaction memory**: feeds key context to compaction agent so nothing critical is lost

A persistent agent runs in the background for the entire session. It receives file change events, user config updates, and compaction summaries. It's never compacted — its state is preserved across all compaction cycles.

### 4. Supervisor Agent

Parent delegates execution entirely to sub-agents and only supervises.

```
Supervisor Agent:
  "Build a user auth system"

  → dispatch explore-agent   (3 min timeout)
  → dispatch plan-agent      (2 min timeout)
  → dispatch build-agent     (10 min timeout)
     build-agent fails at 7 min
     → dispatch debug-agent  (5 min timeout)
  → dispatch test-agent      (5 min timeout)
  → merge results, report
```

Supervisor logic:
```go
if child.Duration > timeout → cancel + switch strategy
if child.Result.Quality < threshold → retry with different agent
if two children disagree → arbitrate with tiebreaker agent
```

This is just a more aggressive use of the existing dispatch primitives. The "supervisor" is a parent agent that uses `TaskCreate` extensively and never calls tools itself.

## Concurrency Model

```go
type TaskRunner struct {
    sem chan struct{}  // max concurrent subtasks (default 4)
}

func (r *TaskRunner) Dispatch(ctx context.Context, a *AgentLoop, task SubTask) <-chan Event {
    resultCh := make(chan Event, 64)

    go func() {
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

## TaskCreate Tool Parameters

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

## Migration Path

### Phase 1: Agent registry + AgentLoop.Run refactor
- Add `Agent` type and `AgentRegistry`
- Refactor `AgentLoop` to use `Agent` struct instead of scattered fields
- Existing behavior unchanged
- **Files**: `internal/agent/agent.go` (new), `internal/agent/agent_loop.go` (refactor)

### Phase 2: TaskCreate dispatch
- Add `TaskRunner` with goroutine dispatch
- Add `TaskCreate` tool that spawns child `AgentLoop`
- Blocking mode only, single child
- **Files**: `internal/agent/runner.go` (new), `internal/tool/builtin/task_create.go` (update)

### Phase 3: Compaction migration
- Register `compaction` agent in registry
- Replace `isOverflow` → `runCompaction` path with `dispatchChild(compactAgent)`
- Delete all compaction-specific code
- **Files**: `internal/agent/agent_loop.go` (delete compaction code)

### Phase 4: Advanced modes
- `fire_forget` and `streaming` dispatch modes
- Multiple parallel children
- Persistent background agents
- **Files**: `internal/agent/runner.go` (extend)

## Verification

1. `go build ./...` + `go test ./...` — compiles and passes
2. Manual test: "analyze the auth module" → explore subtask dispatches → result appears as tool output → parent LLM responds with findings
3. Manual test: long conversation → compaction agent dispatches → summary card appears → session continues
4. `go test -race ./internal/agent/...` — no data races in goroutine dispatch
