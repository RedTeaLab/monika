# Task Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add agent-driven task planning with TaskCreate/TaskUpdate/TaskList tools, TaskStore with independent locking, and read-only TodoPanel in the sidebar.

**Architecture:** TaskStore holds per-session tasks with its own sync.RWMutex. Tools access it via context (WithTaskStore pattern). Changes flow through agent events → handleAgentEvent → StreamEvent → Wails stream → frontend Zustand → TodoPanel re-render. Session struct carries Tasks for persistence.

**Tech Stack:** Go 1.25+, React 18 + TypeScript 5 + Zustand v5 + Tailwind CSS v4, Wails v3

---

## File Structure

| File | Purpose |
|------|---------|
| `internal/tool/builtin/task_store.go` | **New** — TaskStore: independent state, locking, change callback |
| `internal/tool/builtin/task_create.go` | **New** — TaskCreate tool |
| `internal/tool/builtin/task_update.go` | **New** — TaskUpdate tool |
| `internal/tool/builtin/task_list.go` | **New** — TaskList tool |
| `internal/tool/context.go` | **Modify** — Add WithSessionID, WithTaskStore, extractors |
| `internal/tool/builtin/register.go` | **Modify** — Register task tools (accept TaskStore param) |
| `internal/api/session_manager.go` | **Modify** — Session.Tasks field; Save/Load bridge to TaskStore |
| `internal/api/types.go` | **Modify** — StreamEvent.Tasks field |
| `internal/agent/event.go` | **Modify** — EventTaskUpdated constant |
| `internal/agent/system_prompt.go` | **Modify** — PromptPlanning constant |
| `internal/api/app.go` | **Modify** — handleAgentEvent case; SendMessage context wiring |
| `main.go` | **Modify** — system prompt assembly; TaskStore creation |
| `frontend/src/store/index.ts` | **Modify** — tasks field, setSessionTasks, task_updated case |
| `frontend/src/components/TodoPanel/TodoPanel.tsx` | **New** — TodoPanel component |
| `frontend/src/App.tsx` | **Modify** — Sidebar split: SessionList + TodoPanel |

---

### Task 1: Add context keys for sessionID and TaskStore

**Files:**
- Modify: `internal/tool/context.go`

- [ ] **Step 1: Add context keys and helpers**

```go
package tool

import "context"

type projectDirKeyType struct{}
type sessionIDKeyType struct{}
type taskStoreKeyType struct{}

var (
	projectDirKey projectDirKeyType
	sessionIDKey  sessionIDKeyType
	taskStoreKey  taskStoreKeyType
)

// WithProjectDir returns a child context carrying the project directory.
func WithProjectDir(ctx context.Context, dir string) context.Context {
	return context.WithValue(ctx, projectDirKey, dir)
}

// ProjectDirFromContext extracts the project directory from context, or empty string.
func ProjectDirFromContext(ctx context.Context) string {
	dir, _ := ctx.Value(projectDirKey).(string)
	return dir
}

// ProjectDirOrDefault returns the project directory from context, or the fallback.
func ProjectDirOrDefault(ctx context.Context, fallback string) string {
	if dir := ProjectDirFromContext(ctx); dir != "" {
		return dir
	}
	return fallback
}

// WithSessionID returns a child context carrying the session ID.
func WithSessionID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, sessionIDKey, id)
}

// SessionIDFromContext extracts the session ID from context, or empty string.
func SessionIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(sessionIDKey).(string)
	return id
}

// TaskStore is the interface task tools depend on.
type TaskStore interface {
	Replace(sessionID string, tasks []Task) error
	Update(sessionID, taskID string, fields TaskUpdateFields) error
	List(sessionID string) []Task
}

// WithTaskStore returns a child context carrying the TaskStore.
func WithTaskStore(ctx context.Context, ts TaskStore) context.Context {
	return context.WithValue(ctx, taskStoreKey, ts)
}

// TaskStoreFromContext extracts the TaskStore from context, or nil.
func TaskStoreFromContext(ctx context.Context) TaskStore {
	ts, _ := ctx.Value(taskStoreKey).(TaskStore)
	return ts
}

// Task and TaskUpdateFields are defined here so tools can import them
// without depending on the builtin package.

type Task struct {
	ID          string   `json:"id"`
	Subject     string   `json:"subject"`
	Description string   `json:"description,omitempty"`
	Status      string   `json:"status"`
	BlockedBy   []string `json:"blockedBy,omitempty"`
}

type TaskUpdateFields struct {
	Status      *string  `json:"status,omitempty"`
	Subject     *string  `json:"subject,omitempty"`
	Description *string  `json:"description,omitempty"`
	AddBlockedBy []string `json:"addBlockedBy,omitempty"`
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./internal/tool/...`
Expected: builds clean

- [ ] **Step 3: Commit**

```bash
git add internal/tool/context.go
git commit -m "feat: add sessionID and TaskStore context keys to tool package"
```

---

### Task 2: Create TaskStore

**Files:**
- Create: `internal/tool/builtin/task_store.go`

- [ ] **Step 1: Write TaskStore implementation**

```go
package builtin

import (
	"fmt"
	"strings"
	"sync"

	"monika/internal/tool"
)

type taskStore struct {
	mu       sync.RWMutex
	tasks    map[string][]tool.Task
	onChange func(sessionID string, tasks []tool.Task)
}

func NewTaskStore(onChange func(sessionID string, tasks []tool.Task)) tool.TaskStore {
	return &taskStore{
		tasks:    make(map[string][]tool.Task),
		onChange: onChange,
	}
}

var validStatuses = map[string]bool{
	"pending":     true,
	"in_progress": true,
	"completed":   true,
	"cancelled":   true,
}

func (ts *taskStore) Replace(sessionID string, tasks []tool.Task) error {
	for i, t := range tasks {
		if strings.TrimSpace(t.ID) == "" {
			return fmt.Errorf("validation: task %d: id must not be empty", i)
		}
		if strings.TrimSpace(t.Subject) == "" {
			return fmt.Errorf("validation: task %d (%q): subject must not be empty", i, t.ID)
		}
		if !validStatuses[t.Status] {
			return fmt.Errorf("validation: task %d (%q): invalid status %q, must be one of pending/in_progress/completed/cancelled", i, t.ID, t.Status)
		}
	}
	ids := make(map[string]bool, len(tasks))
	for _, t := range tasks {
		ids[t.ID] = true
	}
	for i, t := range tasks {
		for _, dep := range t.BlockedBy {
			if !ids[dep] {
				return fmt.Errorf("validation: task %d (%q): blockedBy %q does not reference any task in the list", i, t.ID, dep)
			}
		}
	}

	ts.mu.Lock()
	ts.tasks[sessionID] = tasks
	ts.mu.Unlock()

	if ts.onChange != nil {
		ts.onChange(sessionID, tasks)
	}
	return nil
}

func (ts *taskStore) Update(sessionID, taskID string, fields tool.TaskUpdateFields) error {
	ts.mu.Lock()
	defer ts.mu.Unlock()

	list, ok := ts.tasks[sessionID]
	if !ok || len(list) == 0 {
		return fmt.Errorf("no tasks for session %s", sessionID)
	}

	idx := -1
	for i, t := range list {
		if t.ID == taskID {
			idx = i
			break
		}
	}
	if idx < 0 {
		validIDs := make([]string, len(list))
		for i, t := range list {
			validIDs[i] = t.ID
		}
		return fmt.Errorf("task not found: %s. valid ids: [%s]", taskID, strings.Join(validIDs, ", "))
	}

	t := &list[idx]
	if fields.Status != nil {
		if !validStatuses[*fields.Status] {
			return fmt.Errorf("validation: invalid status %q", *fields.Status)
		}
		t.Status = *fields.Status
	}
	if fields.Subject != nil {
		t.Subject = *fields.Subject
	}
	if fields.Description != nil {
		t.Description = *fields.Description
	}
	if len(fields.AddBlockedBy) > 0 {
		t.BlockedBy = append(t.BlockedBy, fields.AddBlockedBy...)
	}

	if ts.onChange != nil {
		ts.onChange(sessionID, list)
	}
	return nil
}

func (ts *taskStore) List(sessionID string) []tool.Task {
	ts.mu.RLock()
	defer ts.mu.RUnlock()

	list := ts.tasks[sessionID]
	if len(list) == 0 {
		return nil
	}
	out := make([]tool.Task, len(list))
	copy(out, list)
	return out
}

// Snapshot returns all session→tasks for persistence.
func (ts *taskStore) Snapshot() map[string][]tool.Task {
	ts.mu.RLock()
	defer ts.mu.RUnlock()

	out := make(map[string][]tool.Task, len(ts.tasks))
	for sid, list := range ts.tasks {
		copied := make([]tool.Task, len(list))
		copy(copied, list)
		out[sid] = copied
	}
	return out
}

// Restore loads persisted tasks into the store.
func (ts *taskStore) Restore(sessionID string, tasks []tool.Task) {
	ts.mu.Lock()
	ts.tasks[sessionID] = tasks
	ts.mu.Unlock()
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./internal/tool/builtin/...`
Expected: builds clean

- [ ] **Step 3: Commit**

```bash
git add internal/tool/builtin/task_store.go
git commit -m "feat: add TaskStore with independent locking"
```

---

### Task 3: Create TaskCreate tool

**Files:**
- Create: `internal/tool/builtin/task_create.go`

- [ ] **Step 1: Write TaskCreate tool**

```go
package builtin

import (
	"context"
	"encoding/json"
	"fmt"

	"monika/internal/tool"
)

type taskCreateTool struct {
	store tool.TaskStore
}

func NewTaskCreate(store tool.TaskStore) tool.Tool {
	return &taskCreateTool{store: store}
}

func (t *taskCreateTool) Name() string { return "TaskCreate" }

func (t *taskCreateTool) Description() string {
	return "Create or replace the task list for the current session. " +
		"Use this to create a structured plan before starting complex multi-step work. " +
		"Calling this again replaces the entire previous list."
}

func (t *taskCreateTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"tasks": map[string]any{
				"type": "array",
				"description": "Task objects. Each must have id, subject, and status.",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"id":          map[string]any{"type": "string", "description": "Numeric or kebab-case ID, max 64 chars, alphanumeric + hyphens"},
						"subject":     map[string]any{"type": "string", "description": "Task title"},
						"description": map[string]any{"type": "string", "description": "Optional task description"},
						"status":      map[string]any{"type": "string", "description": "pending / in_progress / completed / cancelled"},
						"blockedBy":   map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "Task IDs this task depends on"},
					},
					"required": []string{"id", "subject", "status"},
				},
			},
		},
		"required": []string{"tasks"},
	}
}

func (t *taskCreateTool) Execute(ctx context.Context, args json.RawMessage) (tool.ExecutionResult, error) {
	sessionID := tool.SessionIDFromContext(ctx)
	if sessionID == "" {
		return tool.ExecutionResult{IsError: true, Content: "no session ID in context"}, nil
	}

	var params struct {
		Tasks []tool.Task `json:"tasks"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return tool.ExecutionResult{IsError: true, Content: fmt.Sprintf("invalid arguments: %v", err)}, nil
	}

	if err := t.store.Replace(sessionID, params.Tasks); err != nil {
		return tool.ExecutionResult{IsError: true, Content: err.Error()}, nil
	}

	list := t.store.List(sessionID)
	data, _ := json.Marshal(list)
	return tool.ExecutionResult{Content: string(data)}, nil
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./internal/tool/builtin/...`
Expected: builds clean

- [ ] **Step 3: Commit**

```bash
git add internal/tool/builtin/task_create.go
git commit -m "feat: add TaskCreate tool"
```

---

### Task 4: Create TaskUpdate tool

**Files:**
- Create: `internal/tool/builtin/task_update.go`

- [ ] **Step 1: Write TaskUpdate tool**

```go
package builtin

import (
	"context"
	"encoding/json"
	"fmt"

	"monika/internal/tool"
)

type taskUpdateTool struct {
	store tool.TaskStore
}

func NewTaskUpdate(store tool.TaskStore) tool.Tool {
	return &taskUpdateTool{store: store}
}

func (t *taskUpdateTool) Name() string { return "TaskUpdate" }

func (t *taskUpdateTool) Description() string {
	return "Update a single task's fields. Only provided fields are updated; others remain unchanged. " +
		"Use this to mark tasks in_progress, completed, or cancelled as you work."
}

func (t *taskUpdateTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"taskId":      map[string]any{"type": "string", "description": "Target task ID"},
			"status":      map[string]any{"type": "string", "description": "pending / in_progress / completed / cancelled"},
			"subject":     map[string]any{"type": "string", "description": "New title"},
			"description": map[string]any{"type": "string", "description": "New description"},
			"addBlockedBy": map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "Task IDs to add to blockedBy"},
		},
		"required": []string{"taskId"},
	}
}

func (t *taskUpdateTool) Execute(ctx context.Context, args json.RawMessage) (tool.ExecutionResult, error) {
	sessionID := tool.SessionIDFromContext(ctx)
	if sessionID == "" {
		return tool.ExecutionResult{IsError: true, Content: "no session ID in context"}, nil
	}

	var params struct {
		TaskID      string   `json:"taskId"`
		Status      *string  `json:"status"`
		Subject     *string  `json:"subject"`
		Description *string  `json:"description"`
		AddBlockedBy []string `json:"addBlockedBy"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return tool.ExecutionResult{IsError: true, Content: fmt.Sprintf("invalid arguments: %v", err)}, nil
	}

	if err := t.store.Update(sessionID, params.TaskID, tool.TaskUpdateFields{
		Status:       params.Status,
		Subject:      params.Subject,
		Description:  params.Description,
		AddBlockedBy: params.AddBlockedBy,
	}); err != nil {
		return tool.ExecutionResult{IsError: true, Content: err.Error()}, nil
	}

	list := t.store.List(sessionID)
	data, _ := json.Marshal(list)
	return tool.ExecutionResult{Content: string(data)}, nil
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./internal/tool/builtin/...`
Expected: builds clean

- [ ] **Step 3: Commit**

```bash
git add internal/tool/builtin/task_update.go
git commit -m "feat: add TaskUpdate tool"
```

---

### Task 5: Create TaskList tool

**Files:**
- Create: `internal/tool/builtin/task_list.go`

- [ ] **Step 1: Write TaskList tool**

```go
package builtin

import (
	"context"
	"encoding/json"

	"monika/internal/tool"
)

type taskListTool struct {
	store tool.TaskStore
}

func NewTaskList(store tool.TaskStore) tool.Tool {
	return &taskListTool{store: store}
}

func (t *taskListTool) Name() string { return "TaskList" }

func (t *taskListTool) Description() string {
	return "List all tasks for the current session. Use this to check progress before deciding the next step."
}

func (t *taskListTool) Parameters() map[string]any {
	return map[string]any{
		"type":       "object",
		"properties": map[string]any{},
	}
}

func (t *taskListTool) Execute(ctx context.Context, _ json.RawMessage) (tool.ExecutionResult, error) {
	sessionID := tool.SessionIDFromContext(ctx)
	if sessionID == "" {
		return tool.ExecutionResult{IsError: true, Content: "no session ID in context"}, nil
	}

	list := t.store.List(sessionID)
	if list == nil {
		list = []tool.Task{}
	}
	data, _ := json.Marshal(list)
	return tool.ExecutionResult{Content: string(data)}, nil
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./internal/tool/builtin/...`
Expected: builds clean

- [ ] **Step 3: Commit**

```bash
git add internal/tool/builtin/task_list.go
git commit -m "feat: add TaskList tool"
```

---

### Task 6: Register task tools

**Files:**
- Modify: `internal/tool/builtin/register.go`

- [ ] **Step 1: Add task tool registration**

After the existing `bash` registration:

```go
package builtin

import "monika/internal/tool"

func RegisterDefaults(r *tool.ToolRegistry, projectDir string) error {
	r.Register(NewFileRead(projectDir))
	r.Register(NewFileWrite(projectDir))
	r.Register(NewFileEdit(projectDir))
	r.Register(NewFileList(projectDir))
	r.Register(NewGlob(projectDir))
	r.Register(NewGrep(projectDir))
	sh, err := NewBash(projectDir)
	if err != nil {
		return err
	}
	r.Register(sh)
	return nil
}

// RegisterTasks registers the three task planning tools.
// Called separately after TaskStore is created in main.
func RegisterTasks(r *tool.ToolRegistry, store tool.TaskStore) {
	r.Register(NewTaskCreate(store))
	r.Register(NewTaskUpdate(store))
	r.Register(NewTaskList(store))
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./internal/tool/builtin/...`
Expected: builds clean

- [ ] **Step 3: Commit**

```bash
git add internal/tool/builtin/register.go
git commit -m "feat: add RegisterTasks for task planning tools"
```

---

### Task 7: Add Tasks to Session struct and bridge persistence

**Files:**
- Modify: `internal/api/session_manager.go`

- [ ] **Step 1: Extend Session, add Save/Load bridging**

Add `Tasks` to `Session`:

```go
type Session struct {
	ID         string               `json:"id"`
	Title      string               `json:"title"`
	ProjectDir string               `json:"project_dir"`
	Messages   []engine.ChatMessage `json:"messages"`
	Model      string               `json:"model"`
	Provider   string               `json:"provider"`
	Status     string               `json:"status"`
	CreatedAt  time.Time            `json:"created_at"`
	UpdatedAt  time.Time            `json:"updated_at"`
	Tasks      []Task               `json:"tasks,omitempty"`
}
```

Add `Task` type at the top of the file:

```go
type Task struct {
	ID          string   `json:"id"`
	Subject     string   `json:"subject"`
	Description string   `json:"description,omitempty"`
	Status      string   `json:"status"`
	BlockedBy   []string `json:"blockedBy,omitempty"`
}
```

Add `SessionManager` field for TaskStore reference:

```go
type SessionManager struct {
	mu          sync.Mutex
	home        string
	projectDir  string
	sessionsDir string
	taskStore   TaskStoreAccessor
}

type TaskStoreAccessor interface {
	Snapshot() map[string][]Task
	Restore(sessionID string, tasks []Task)
}
```

Update `NewSessionManager` to accept the optional accessor:

```go
func NewSessionManager(home, projectDir string) *SessionManager {
	sessionsDir := filepath.Join(home, ".monika", "projects", projectSlug(projectDir), "sessions")
	return &SessionManager{
		home:        home,
		projectDir:  projectDir,
		sessionsDir: sessionsDir,
	}
}

func (sm *SessionManager) SetTaskStore(ts TaskStoreAccessor) {
	sm.taskStore = ts
}
```

Update `Save` to include tasks:

```go
func (sm *SessionManager) Save(s *Session) error {
	s.UpdatedAt = time.Now()
	if sm.taskStore != nil {
		snapshot := sm.taskStore.Snapshot()
		if tasks, ok := snapshot[s.ID]; ok {
			s.Tasks = tasks
		}
	}
	p := filepath.Join(sm.sessionsDir, s.ID+".json")
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0o644)
}
```

Update `Load` to restore tasks:

```go
func (sm *SessionManager) Load(id string) (*Session, error) {
	p := filepath.Join(sm.sessionsDir, id+".json")
	data, err := os.ReadFile(p)
	if err != nil {
		return nil, err
	}
	var s Session
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	if s.Status == "" {
		s.Status = StatusIdle
	}
	// Restore persisted tasks to TaskStore
	if sm.taskStore != nil && len(s.Tasks) > 0 {
		sm.taskStore.Restore(s.ID, s.Tasks)
	}
	return &s, nil
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./internal/api/...`
Expected: builds clean

- [ ] **Step 3: Commit**

```bash
git add internal/api/session_manager.go internal/api/types.go
git commit -m "feat: add Tasks to Session struct with TaskStore persistence bridge"
```

> **Note:** `Task` type can live in `session_manager.go` alongside `Session` since they're co-located. The `types.go` `SessionInfo` stays lightweight (no Tasks).

---

### Task 8: Add PromptPlanning constant

**Files:**
- Modify: `internal/agent/system_prompt.go`

- [ ] **Step 1: Add PromptPlanning constant**

After `PromptToolUsage`:

```go
const PromptPlanning = `## Task Planning

Use TaskCreate/TaskUpdate/TaskList to manage a structured task list for
complex multi-step work. Before any non-trivial task, assess complexity:

- Simple (single-file edit, typo fix, small query) → skip planning
- Medium (2-3 files, one concern) → optional, brief plan
- Complex (new feature, refactor, multi-system change) → MUST create plan

Plan rules:
- Create task list BEFORE implementation via TaskCreate
- Each task must be discrete and verifiable — one clear outcome
- Mark one task in_progress at a time; complete it before starting the next
- When a task becomes irrelevant, mark it ` + "`cancelled`" + ` rather than silently abandoning it
- Call TaskUpdate immediately when you start, finish, or cancel a task
- BlockedBy expresses hard dependencies: task can't start before blockedBy tasks complete
- Read current status with TaskList before deciding next step
- A new TaskCreate call replaces the entire previous list`
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./internal/agent/...`
Expected: builds clean

- [ ] **Step 3: Commit**

```bash
git add internal/agent/system_prompt.go
git commit -m "feat: add PromptPlanning constant to system prompt"
```

---

### Task 9: Add EventTaskUpdated to agent events

**Files:**
- Modify: `internal/agent/event.go`

- [ ] **Step 1: Add event type and helper**

```go
const (
	EventTextDelta EventType = iota
	EventThinking
	EventToolStart
	EventToolOutput
	EventToolDone
	EventUsage
	EventError
	EventDone
	EventSessionUpdated
	EventTurnStart
	EventTaskUpdated
)

type Event struct {
	Type    EventType
	Content string
	Tool    *ToolEvent
	Usage   UsageEvent
	Tasks   []TaskItem
}

type TaskItem struct {
	ID          string   `json:"id"`
	Subject     string   `json:"subject"`
	Description string   `json:"description,omitempty"`
	Status      string   `json:"status"`
	BlockedBy   []string `json:"blockedBy,omitempty"`
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./internal/agent/...`
Expected: builds clean

- [ ] **Step 3: Commit**

```bash
git add internal/agent/event.go
git commit -m "feat: add EventTaskUpdated and TaskItem to agent events"
```

---

### Task 10: Add Tasks to StreamEvent

**Files:**
- Modify: `internal/api/types.go`

- [ ] **Step 1: Add Tasks field**

```go
type StreamEvent struct {
	Type       string            `json:"type"`
	Content    string            `json:"content,omitempty"`
	SessionID  string            `json:"session_id,omitempty"`
	Model      string            `json:"model,omitempty"`
	Tool       *agent.ToolEvent  `json:"tool,omitempty"`
	AgentUsage *agent.UsageEvent `json:"usage,omitempty"`
	FileChange *FileChangeEvent  `json:"file_change,omitempty"`
	Tasks      []agent.TaskItem  `json:"tasks,omitempty"`
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./internal/api/...`
Expected: builds clean

- [ ] **Step 3: Commit**

```bash
git add internal/api/types.go
git commit -m "feat: add Tasks field to StreamEvent"
```

---

### Task 11: Update handleAgentEvent and wire SendMessage context

**Files:**
- Modify: `internal/api/app.go`

- [ ] **Step 1: Add EventTaskUpdated case to handleAgentEvent**

After the `EventTurnStart` case:

```go
case agent2.EventTaskUpdated:
	se.Type = "task_updated"
	se.Tasks = ev.Tasks
```

- [ ] **Step 2: Wire taskStore and sessionID into tool context in SendMessage**

In `SendMessage`, after the existing context creation for tools, add sessionID and taskStore injection. The `App` struct needs a `taskStore` field:

Add to `App` struct:

```go
type App struct {
	// ... existing fields ...
	taskStore   *builtin2.TaskStoreRef
}
```

The `builtin2.TaskStoreRef` wraps the task store's change callback. Actually, since the taskStore's onChange wraps back through agent events, we need a simpler approach: have the TaskStore's onChange call a method on App that emits the event.

In `NewApp`, accept an optional task store:

```go
func NewApp(home, cwd string, cfg config2.Config, provider engine2.ProviderEngine, model string, registry *tool2.ToolRegistry, loopOpts []agent2.LoopOption, onTaskChange func(sessionID string, tasks []agent2.TaskItem)) *App {
	return &App{
		// ... existing fields ...
		onTaskChange: onTaskChange,
	}
}
```

Add field:

```go
onTaskChange func(sessionID string, tasks []agent2.TaskItem)
```

In `SendMessage`, inject sessionID into tool context:

```go
// After line 231 (loop creation), add sessionID to loop context
// We inject it through loopOpts since the agent loop builds the tool context.

// Actually, the simplest path: add WithSessionID option to LoopOption.
```

**Simpler approach:** Add a `WithSessionID` loop option:

In `internal/agent/agent_loop.go`, add to `AgentLoop`:

```go
type AgentLoop struct {
	// ... existing ...
	sessionID string
}
```

In the tool execution block (line 180), change:

```go
toolCtx := tool.WithProjectDir(ctx, a.projectDir)
if a.sessionID != "" {
	toolCtx = tool.WithSessionID(toolCtx, a.sessionID)
}
```

Add option:

```go
func WithSessionID(id string) LoopOption {
	return func(a *AgentLoop) { a.sessionID = id }
}
```

In `SendMessage`, pass `WithSessionID`:

```go
opts := append([]agent2.LoopOption{}, a.loopOpts...)
opts = append(opts, agent2.WithProjectDir(projectPath), agent2.WithModel(model), agent2.WithSessionID(sessionID))
```

After the gen loop completes, if there's an `onTaskChange`, check for pending task events:

Actually, the cleanest approach: the TaskStore's onChange callback should directly emit the event through App. Let us modify the design slightly:

In `main.go`, when creating the TaskStore, the onChange callback will reference a function on App that emits the event. Since App is created after tools, we need a two-step init:

```go
// main.go
var taskStore tool.TaskStore

registry := tool.NewRegistry()
builtin.RegisterDefaults(registry, cwd)

taskStore = builtin.NewTaskStore(nil) // placeholder callback, set after App creation

// ... create appService ...

// Set the onTaskChange callback on the TaskStore
builtin.SetTaskStoreCallback(taskStore, func(sessionID string, tasks []tool.Task) {
	taskItems := make([]agent.TaskItem, len(tasks))
	for i, t := range tasks {
		taskItems[i] = agent.TaskItem{
			ID: t.ID, Subject: t.Subject, Description: t.Description,
			Status: t.Status, BlockedBy: t.BlockedBy,
		}
	}
	appService.EmitTaskEvent(sessionID, taskItems)
})
```

Add `EmitTaskEvent` to App:

```go
func (a *App) EmitTaskEvent(sessionID string, tasks []agent2.TaskItem) {
	a.handleAgentEvent(sessionID, a.model, agent2.Event{
		Type:  agent2.EventTaskUpdated,
		Tasks: tasks,
	})
}
```

And add `SetTaskStoreCallback` to the builtin package:

```go
// In task_store.go
func SetTaskStoreCallback(ts tool.TaskStore, cb func(sessionID string, tasks []tool.Task)) {
	if ts2, ok := ts.(*taskStore); ok {
		ts2.onChange = cb
	}
}
```

This is a cleaner approach. The key changes in app.go are:

1. NewApp accepts no task-related fields
2. Add `EmitTaskEvent` method
3. SendMessage passes sessionID to the agent loop via WithSessionID

- [ ] **Step 3: Verify compilation**

Run: `go build ./...`
Expected: builds clean

- [ ] **Step 4: Commit**

```bash
git add internal/api/app.go internal/agent/agent_loop.go
git commit -m "feat: wire task events through handleAgentEvent and inject sessionID into tool context"
```

---

### Task 12: Update main.go

**Files:**
- Modify: `main.go`

- [ ] **Step 1: Add PromptPlanning to system prompt parts, create TaskStore, wire callback**

```go
package main

import (
	// ... existing imports ...
	"monika/internal/agent"
	"monika/internal/api"
	"monika/internal/bootstrap"
	"monika/internal/tool"
	"monika/internal/tool/builtin"

	_ "monika/internal/engines/mcp"
	_ "monika/internal/engines/provider/deepseek"
	_ "monika/internal/engines/skill"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed frontend/dist
var embeddedAssets embed.FS

func main() {
	home, err := os.UserHomeDir()
	if err != nil {
		fmt.Fprintln(os.Stderr, "cannot determine home directory:", err)
		os.Exit(1)
	}
	cwd, err := os.Getwd()
	if err != nil {
		fmt.Fprintln(os.Stderr, "cannot determine working directory:", err)
		os.Exit(1)
	}

	ctx := context.Background()
	pr, err := bootstrap.InitProvider(ctx, home, cwd, "")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	registry := tool.NewRegistry()
	builtin.RegisterDefaults(registry, cwd)

	taskStore := builtin.NewTaskStore(nil)
	builtin.RegisterTasks(registry, taskStore)

	application.RegisterEvent[api.StreamEvent]("stream")

	systemParts := []string{
		fmt.Sprintf("OS Version: %s\nWorking directory: {{WorkingDirectory}}", runtime.GOOS),
		agent.PromptIdentity,
		agent.PromptToolUsage,
		agent.PromptPlanning,  // inserted after PromptToolUsage
		agent.PromptCodeQuality,
		agent.PromptResponseStyle,
		agent.PromptSafetyBoundaries,
		agent.PromptRemember,
	}
	if p := loadSystemPrompt(cwd); p != "" {
		systemParts = append(systemParts, p)
	}
	loopOpts := []agent.LoopOption{
		agent.WithProjectDir(cwd),
		agent.WithModel(pr.Model),
		agent.WithSystemPrompt(strings.Join(systemParts, "\n\n")),
	}

	appService := api.NewApp(home, cwd, pr.Config, pr.Provider, pr.Model, registry, loopOpts)

	// Wire task change callback after App is created
	builtin.SetTaskStoreCallback(taskStore, func(sessionID string, tasks []tool.Task) {
		taskItems := make([]agent.TaskItem, len(tasks))
		for i, t := range tasks {
			taskItems[i] = agent.TaskItem{
				ID: t.ID, Subject: t.Subject, Description: t.Description,
				Status: t.Status, BlockedBy: t.BlockedBy,
			}
		}
		appService.EmitTaskEvent(sessionID, taskItems)
	})

	// Wire TaskStore into SessionManagers (via per-project lookup in app.go or a setter)
	// This is done in app.go when getSessionManager creates or returns a manager.

	assets, err := fs.Sub(embeddedAssets, "frontend/dist")
	if err != nil {
		fmt.Fprintln(os.Stderr, "failed to extract embedded assets:", err)
		os.Exit(1)
	}

	app := application.New(application.Options{
		Name:        "monika",
		Description: "Agentic coding editor",
		Services: []application.Service{
			application.NewService(appService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:     "Monika",
		Width:     1400,
		Height:    900,
		MinWidth:  900,
		MinHeight: 600,
		Frameless: true,
	})

	if err := app.Run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func loadSystemPrompt(projectDir string) string {
	// ... unchanged ...
}
```

- [ ] **Step 2: Also update App to set TaskStore on SessionManager**

Add to `App`:

```go
type App struct {
	// ... existing ...
	taskStore tool2.TaskStore
}

// Add to NewApp:
func NewApp(..., taskStore tool2.TaskStore) *App {
	return &App{
		// ...
		taskStore: taskStore,
	}
}
```

In `getSessionManager`, call `sm.SetTaskStore(a.taskStore)` after creating the manager.

- [ ] **Step 3: Verify compilation**

Run: `go build .`
Expected: builds clean

- [ ] **Step 4: Commit**

```bash
git add main.go internal/api/app.go internal/api/session_manager.go
git commit -m "feat: integrate task planning into main and App wiring"
```

---

### Task 13: Add tasks to Zustand store and event handling

**Files:**
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: Add tasks field and setSessionTasks action**

Add to `AppState` interface (near other `Record<string, ...>` fields):

```typescript
tasks: Record<string, TaskItem[]>
```

Add `TaskItem` type:

```typescript
export interface TaskItem {
  id: string
  subject: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  blockedBy?: string[]
}
```

In initial state:

```typescript
tasks: {},
```

Add action:

```typescript
setSessionTasks: (sessionId: string, tasks: TaskItem[]) => {
  set((s) => ({ tasks: { ...s.tasks, [sessionId]: tasks } }))
},
```

- [ ] **Step 2: Add task_updated case to setupWailsEvents**

After the `turn_start` case in the switch:

```typescript
case 'task_updated':
  if (data.tasks) {
    store.setSessionTasks(sid, data.tasks as TaskItem[])
    store.addConsoleLine(`[task] plan updated (${data.tasks.length} tasks)`)
  }
  break
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat: add task state and task_updated event handler to Zustand store"
```

---

### Task 14: Create TodoPanel component

**Files:**
- Create: `frontend/src/components/TodoPanel/TodoPanel.tsx`

- [ ] **Step 1: Write TodoPanel component**

```tsx
import { useStore, TaskItem } from '../../store'

const STATUS_ICONS: Record<string, string> = {
  pending: '⏳',
  in_progress: '🔄',
  completed: '✅',
  cancelled: '❌',
}

function computeDepth(task: TaskItem, allTasks: TaskItem[]): number {
  if (!task.blockedBy || task.blockedBy.length === 0) return 0
  let maxDepth = 0
  for (const depId of task.blockedBy) {
    const dep = allTasks.find((t) => t.id === depId)
    if (dep) {
      maxDepth = Math.max(maxDepth, 1 + computeDepth(dep, allTasks))
    }
  }
  return Math.min(maxDepth, 3)
}

function isBlocked(task: TaskItem, allTasks: TaskItem[]): boolean {
  if (!task.blockedBy || task.blockedBy.length === 0) return false
  return task.blockedBy.some((depId) => {
    const dep = allTasks.find((t) => t.id === depId)
    return dep && dep.status !== 'completed' && dep.status !== 'cancelled'
  })
}

export default function TodoPanel() {
  const activeSessionId = useStore((s) => s.activeSessionId)
  const tasks = useStore((s) => (activeSessionId ? s.tasks[activeSessionId] : undefined))

  if (!activeSessionId || !tasks || tasks.length === 0) return null

  return (
    <div
      className="flex flex-col border-t border-[var(--border)]"
      style={{ maxHeight: '40%', overflowY: 'auto' }}
      role="list"
      aria-label="Task list"
    >
      <div
        className="px-3 py-2 text-[11px] uppercase tracking-wider font-semibold"
        style={{ opacity: 0.6 }}
      >
        Todo
      </div>
      <div aria-live="polite" className="sr-only">
        {tasks.filter((t) => t.status === 'completed').length} of {tasks.length} tasks complete
      </div>
      {tasks.map((task) => {
        const depth = computeDepth(task, tasks)
        const blocked = isBlocked(task, tasks)
        const allDepsDone =
          task.blockedBy &&
          task.blockedBy.length > 0 &&
          task.blockedBy.every((depId) => {
            const dep = tasks.find((t) => t.id === depId)
            return dep && (dep.status === 'completed' || dep.status === 'cancelled')
          })

        let rowStyle: React.CSSProperties = {
          paddingLeft: `${8 + depth * 16}px`,
          paddingRight: '8px',
          paddingTop: '4px',
          paddingBottom: '4px',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }

        if (task.status === 'in_progress') {
          rowStyle.background = 'var(--accent-bg, rgba(137,180,250,0.15))'
        }
        if (task.status === 'completed') {
          rowStyle.textDecoration = 'line-through'
          rowStyle.opacity = 0.6
        }
        if (task.status === 'cancelled') {
          rowStyle.textDecoration = 'line-through'
          rowStyle.opacity = 0.3
        }
        if (allDepsDone && task.status === 'pending') {
          rowStyle.borderLeft = '2px solid var(--accent, #89b4fa)'
        }

        return (
          <div key={task.id} role="listitem" style={rowStyle} title={task.subject}>
            <span aria-hidden="true">{STATUS_ICONS[task.status] || STATUS_ICONS.pending}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span className="sr-only">{task.status === 'in_progress' ? 'In progress:' : task.status === 'completed' ? 'Completed:' : task.status === 'cancelled' ? 'Cancelled:' : 'Pending:'} </span>
              {task.subject}
            </span>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors (may need to adjust import path for TaskItem)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TodoPanel/TodoPanel.tsx
git commit -m "feat: add TodoPanel component"
```

---

### Task 15: Integrate TodoPanel into App.tsx sidebar

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Import and render TodoPanel below SessionList**

Find the sidebar section where `SessionList` is rendered and add `TodoPanel` below it:

```tsx
import TodoPanel from './components/TodoPanel/TodoPanel'
```

In the sidebar:

```tsx
{/* Inside the sidebar flex column, after SessionList */}
<SessionList ... />
<TodoPanel />
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Build frontend**

Run: `cd frontend && npm run build`
Expected: builds clean

- [ ] **Step 4: Final Go build verification**

Run: `go build .`
Expected: builds clean

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: integrate TodoPanel into sidebar layout"
```

---

### Task 16: End-to-end verification

- [ ] **Step 1: Run all Go tests**

Run: `go test ./...`
Expected: all pass

- [ ] **Step 2: Run TypeScript type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Build release binary**

Run: `cd frontend && npm run build && cd .. && go build .`
Expected: binary produced

- [ ] **Step 4: Commit final state**

```bash
git add -A
git commit -m "chore: final verification after task planning implementation"
```
