# Task Planning — Design Spec

Agent 自动判断任务复杂度，创建 todo 列表，按计划推进，前端只读展示。

## 1. Architecture & Data Flow

```
User message → AgentLoop.RunStreaming()
                    │
                    ├── system prompt (PromptPlanning 指导 agent 何时规划)
                    ▼
               LLM 判断复杂度，调用 TaskCreate
                    │
                    ▼
               TaskCreate.Execute() → SessionManager.CreateTasks(sessionId, tasks)
                    │                        │
                    │                        ├── 更新内存 map[sessionId][]Task
                    │                        ├── 持久化到 session JSON
                    │                        └── EventBus.Push("task_updated", payload)
                    │                                    │
                    ▼                                    ▼
               TaskUpdate.Execute()               前端 Zustand store
               (update status)                        │
                    │                                 ▼
                    ▼                            TodoPanel 重渲染
               TaskList.Execute()
               (read current, no mutation)
```

核心原则：tools 仅操作数据，SessionManager 是状态的真实来源，EventBus 驱动 UI。

## 2. Tool Definitions

### TaskCreate

创建或覆盖当前 session 的 todo 列表。总是全量替换。

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| tasks | array | yes | Task 对象数组 |

每个 task 对象：

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Agent 自定 ID |
| subject | string | yes | 任务标题 |
| description | string | no | 任务描述 |
| status | string | yes | `pending` / `in_progress` / `completed` |
| blockedBy | []string | no | 依赖的其他 task ID |

### TaskUpdate

更新单个 task 的部分字段。仅更新传入的字段，其余保持不变。

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| taskId | string | yes | 目标 task ID |
| status | string | no | 新状态 |
| subject | string | no | 新标题 |
| description | string | no | 新描述 |
| addBlockedBy | []string | no | merge 到现有 blockedBy |

### TaskList

返回当前 session 的全部 task。无参数，纯查询。

## 3. System Prompt

新增 `PromptPlanning` 常量，插入 `PromptToolUsage` 之后：

```
## Task Planning

Use TaskCreate/TaskUpdate/TaskList to manage a structured task list for
complex multi-step work. Before any non-trivial task, assess complexity:

- Simple (single-file edit, typo fix, small query) → skip planning
- Medium (2-3 files, one concern) → optional, brief plan
- Complex (new feature, refactor, multi-system change) → MUST create plan

Plan rules:
- Create task list BEFORE implementation via TaskCreate
- Each task must be discrete and verifiable — one clear outcome
- Mark one task in_progress at a time; complete it before starting the next
- Call TaskUpdate immediately when you start or finish a task
- BlockedBy expresses hard dependencies: task can't start before blockedBy tasks complete
- Read current status with TaskList before deciding next step
- A new TaskCreate call replaces the entire previous list
```

## 4. Storage & Session Binding

### Data Structures (Go)

```go
// SessionInfo 扩展 (internal/api/session_manager.go)
type SessionInfo struct {
    // ... existing fields ...
    Tasks []Task `json:"tasks,omitempty"`
}

type Task struct {
    ID          string   `json:"id"`
    Subject     string   `json:"subject"`
    Description string   `json:"description,omitempty"`
    Status      string   `json:"status"`       // pending | in_progress | completed
    BlockedBy   []string `json:"blockedBy,omitempty"`
}
```

### Persistence

复用现有 session JSON 文件，`tasks` 作为附加字段。路径：`~/.monika/projects/<slug>/sessions/<id>.json`

### Session Constraints

- 一个 session 一个 todo 列表，TaskCreate 覆盖写入
- 切换会话时，TodoPanel 展示 `activeSessionId` 对应的 tasks
- 无 task 的 session 不展示 TodoPanel

## 5. Frontend

### Component Layout

```
Sidebar
├── SessionList (上)
│   └── 现有 session 条目
└── TodoPanel (下，新增)
    └── task rows: [status icon] [subject] (+ blockedBy 缩进)
```

### TodoPanel Behavior

- 无 task → 面板不渲染（SessionList 撑满侧边栏）
- 有 task → 自动展开，最大高度不超过侧边栏 40%，超出滚动
- 只读：无点击、拖拽、编辑交互
- `in_progress` item 高亮背景，`completed` item 划线 + 半透明
- 依赖通过左缩进表达（blockedBy 深度）

### Zustand Store

```typescript
// 新增
tasks: Record<string, Task[]>  // sessionId → Task[]

// 新增 action
setSessionTasks(sessionId: string, tasks: Task[])
```

### Event Flow

```
SessionManager.Push("task_updated", {session_id, tasks})
  → 前端 Events.On("task_updated", payload =>
      store.setSessionTasks(payload.session_id, payload.tasks))
    → TodoPanel selector: useStore(s => s.tasks[activeSessionId])
```

### Session Switching

- TodoPanel 绑定 `activeSessionId`，切换自然跟随
- `generatingSessionId`（TabBar 状态指示器）独立运作

## 6. Implementation Scope

### New Files

| File | Purpose |
|------|---------|
| `internal/tool/builtin/task_create.go` | TaskCreate tool |
| `internal/tool/builtin/task_update.go` | TaskUpdate tool |
| `internal/tool/builtin/task_list.go` | TaskList tool |
| `frontend/src/components/TodoPanel/TodoPanel.tsx` | Todo UI 组件 |

### Modified Files

| File | Change |
|------|--------|
| `internal/tool/builtin/register.go` | 注册 3 个 task tools |
| `internal/api/session_manager.go` | SessionInfo 加 Tasks 字段 + CRUD 方法 + EventBus 推送 |
| `internal/agent/system_prompt.go` | 新增 PromptPlanning 常量 |
| `main.go` | 组装 system prompt 时插入 PromptPlanning |
| `internal/agent/event.go` | 可选新增 EventTaskUpdated 事件类型 |
| `frontend/src/store/index.ts` | tasks 字段 + setSessionTasks action |
| `frontend/src/App.tsx` | 侧边栏拆分 SessionList + TodoPanel |

## 7. Non-Goals

- 用户手动创建/编辑/删除 task
- 跨 session 的 task 关联
- Task 执行时间追踪
- Task 优先级排序（agent 通过 blockedBy + 顺序表达）

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Agent 过度使用 TaskCreate（简单任务也创建） | Prompt 明确复杂度判断标准 |
| Task 列表过长导致侧边栏体验差 | 40% 高度上限 + scroll |
| 旧 session JSON 无 tasks 字段 | `omitempty` + nil check 保证向后兼容 |
