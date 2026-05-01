# Task Planning — Design Spec

Agent 自动判断任务复杂度，创建 todo 列表，按计划推进，前端只读展示。

## 1. Architecture & Data Flow

```
User message → AgentLoop.RunStreaming()
                    │
                    ├── system prompt (PromptPlanning 指导 agent 何时规划)
                    │
                    ├── toolCtx = WithSessionID(WithProjectDir(ctx), sessionId)
                    │   (context 注入，复用 existing WithProjectDir 模式)
                    ▼
               LLM 判断复杂度，调用 TaskCreate
                    │
                    ▼
               TaskCreate.Execute(toolCtx, args)
                    │  → taskStore := TaskStoreFromContext(ctx)
                    │  → taskStore.Replace(sessionId, tasks)   // 独立锁，不碰 SessionManager
                    │  → taskStore.OnChange → agent event
                    ▼
               TaskUpdate.Execute(toolCtx, args)
                    │  → taskStore.Update(sessionId, taskId, fields)
                    │
                    ▼
               TaskList.Execute(toolCtx, args)
                    │  → taskStore.List(sessionId)
                    │
                    ▼ (存储持久化)
               SessionManager.Save(session)
                    │  → tasks := taskStore.List(sessionId)
                    │  → 写入 session JSON 的 tasks 字段
                    │
                    ▼ (事件流 — 经 handleAgentEvent 路由)
               taskStore.OnChange(sessionId, tasks)
                    │
                    ▼
               agent loop 生成 EventTaskUpdated
                    │
                    ▼
               handleAgentEvent 映射为 StreamEvent{
                   Type: "task_updated",
                   Tasks: tasks,
                   SessionID: sessionId
               }
                    │
                    ├── EventBus.Emit(se)
                    └── Wails application.Event.Emit('stream', se)
                              │
                              ▼
                         前端 Events.On('stream', payload =>
                           setupWailsEvents: case 'task_updated' →
                             store.setSessionTasks(payload.SessionID, payload.Tasks))
                              │
                              ▼
                         TodoPanel selector: useStore(s => s.tasks[activeSessionId])
                              │
                              ▼
                         TodoPanel 重渲染
```

核心原则：tools 仅操作数据，TaskStore 是 task 状态的真实来源（独立锁，不阻塞 SendMessage），EventBus + Wails stream 驱动 UI。

## 2. Tool Definitions

### TaskCreate

创建或覆盖当前 session 的 todo 列表。总是全量替换。

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| tasks | array | yes | Task 对象数组 |

每个 task 对象：

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | 数字 ID 或 kebab-case，max 64 字符，alphanumeric + hyphens |
| subject | string | yes | 任务标题 |
| description | string | no | 任务描述 |
| status | string | yes | `pending` / `in_progress` / `completed` / `cancelled` |
| blockedBy | []string | no | 依赖的其他 task ID |

**验证规则**（服务端强制执行）:
- `id` / `subject` 非空字符串，`status` 必须在 enum 内
- `blockedBy` 中的 ID 必须引 tasks 数组内的其他 task ID，悬挂引用返回 error
- `tasks` 为空数组视为清空 plan
- 不会对已有非空 task 列表的 session 做"确认"拦截 — 覆盖是设计意图

**错误响应**: 验证失败返回 `ExecutionResult{IsError: true, Content: "validation: <detail>"}`

### TaskUpdate

更新单个 task 的部分字段。仅更新传入的字段，其余保持不变。

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| taskId | string | yes | 目标 task ID |
| status | string | no | 新状态 (`pending` / `in_progress` / `completed` / `cancelled`) |
| subject | string | no | 新标题 |
| description | string | no | 新描述 |
| addBlockedBy | []string | no | merge 到现有 blockedBy |

**错误响应**: `taskId` 不存在返回 `ExecutionResult{IsError: true, Content: "task not found: <id>. valid ids: [id1, id2, ...]"}`

### TaskList

返回当前 session 的全部 task。无参数，纯查询。无 task 的 session 返回空数组，非 error。

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
- When a task becomes irrelevant, mark it `cancelled` rather than silently abandoning it
- Call TaskUpdate immediately when you start, finish, or cancel a task
- BlockedBy expresses hard dependencies: task can't start before blockedBy tasks complete
- Read current status with TaskList before deciding next step
- A new TaskCreate call replaces the entire previous list
```

## 4. Storage & Session Binding

### Data Structures (Go)

```go
// TaskStore — 独立 task 状态管理 (internal/tool/builtin/task_store.go)
// 独立 sync.RWMutex，不依赖 SessionManager 锁
type TaskStore struct {
    mu     sync.RWMutex
    tasks  map[string][]Task  // sessionId → []Task
    onChange func(sessionId string, tasks []Task)  // 变更回调（触发热事件）
}

// Session 扩展 (internal/api/session_manager.go)
// 注意：Tasks 加在 Session 上（JSON 持久化的 struct），不是 SessionInfo（view model）
type Session struct {
    // ... existing fields ...
    Tasks []Task `json:"tasks,omitempty"`
}

type Task struct {
    ID          string   `json:"id"`
    Subject     string   `json:"subject"`
    Description string   `json:"description,omitempty"`
    Status      string   `json:"status"`       // pending | in_progress | completed | cancelled
    BlockedBy   []string `json:"blockedBy,omitempty"`
}
```

### Persistence

- 运行时：TaskStore 内存中维护 `map[sessionId][]Task`，task tools 通过 context 获取 TaskStore 引用
- 持久化：SessionManager.Save() 时从 TaskStore 拉取 tasks 写入 session JSON 文件
- 加载：SessionManager.Load() 时从 session JSON 恢复 tasks 到 TaskStore
- 路径：`~/.monika/projects/<slug>/sessions/<id>.json`

### 锁模型

TaskStore 持有独立的 `sync.RWMutex`。SendMessage 的 `sm.Lock()` 不覆盖 task 操作：
- TaskCreate/TaskUpdate/TaskList 只锁 TaskStore
- SessionManager.Save() 内部分两步：先 TaskStore.RLock() 读 tasks，再写 session JSON
- 避免 SendMessage 全生成周期持锁导致的死锁

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
- 缩进：16px 每级 blockedBy 深度，max 3 级可见嵌套，超出展平 + 文字标注
- 长标题：truncate + ellipsis，hover tooltip 显示完整文字
- `in_progress` item 高亮背景，`completed` item 划线 + 半透明，`cancelled` item 划线 + 更低不透明度
- 最近 15 分钟内未更新的 `in_progress` task 视觉衰减（不透明度降低），提示可能偏离 plan
- 被所有 blockedBy 依赖满足的 task 显示 subtle "ready" 边框标识
- 无 task 的 session：面板不渲染
- 有 task 但列表为空（plan 已清空）：面板折叠

### Accessibility

- Task list 使用 `role="list"` + `role="listitem"`
- 状态变更通过 `aria-live="polite"` 区域播报
- `in_progress` / `completed` 除颜色外有文本标签（非纯色传达信息）

### Zustand Store

```typescript
// 新增
tasks: Record<string, Task[]>  // sessionId → Task[]

// 新增 action
setSessionTasks(sessionId: string, tasks: Task[])
```

### Event Flow

```
TaskStore.OnChange(sessionId, tasks)
  → agent loop 产生 agent.EventTaskUpdated
    → handleAgentEvent (app.go) 映射为 StreamEvent{
        Type:      "task_updated",
        Tasks:     tasks,
        SessionID: sessionId,
      }
      → EventBus.Emit(se)
      → application.Get().Event.Emit('stream', se)
        → 前端 Events.On('stream', payload =>
            setupWailsEvents switch case 'task_updated':
              store.setSessionTasks(payload.SessionID, payload.Tasks))
          → TodoPanel selector: useStore(s => s.tasks[activeSessionId])
```

**涉及的类型扩展**:
- `StreamEvent` (internal/api/types.go) 加 `Tasks []Task` 字段
- `agent.EventType` (internal/agent/event.go) 加 `EventTaskUpdated` 常量
- `handleAgentEvent` (internal/api/app.go) 加 `case EventTaskUpdated` 分支
- 前端 `setupWailsEvents` (store/index.ts) 加 `case 'task_updated'` 分支

### Session Switching

- TodoPanel 绑定 `activeSessionId`，切换自然跟随
- `generatingSessionId`（TabBar 状态指示器）独立运作

## 6. Implementation Scope

### New Files

| File | Purpose |
|------|---------|
| `internal/tool/builtin/task_store.go` | TaskStore — 独立锁、内存 map、变更回调 |
| `internal/tool/builtin/task_create.go` | TaskCreate tool |
| `internal/tool/builtin/task_update.go` | TaskUpdate tool |
| `internal/tool/builtin/task_list.go` | TaskList tool |
| `frontend/src/components/TodoPanel/TodoPanel.tsx` | Todo UI 组件 |

### Modified Files

| File | Change |
|------|--------|
| `internal/tool/context.go` | 新增 WithSessionID / WithTaskStore / TaskStoreFromContext |
| `internal/tool/builtin/register.go` | 注册 3 个 task tools（接收 TaskStore 构造参数） |
| `internal/api/session_manager.go` | Session 加 Tasks 字段；Save/Load 时读/写 TaskStore |
| `internal/api/types.go` | StreamEvent 加 Tasks 字段 |
| `internal/agent/event.go` | 新增 EventTaskUpdated 事件类型（必选，非可选） |
| `internal/agent/system_prompt.go` | 新增 PromptPlanning 常量 |
| `internal/api/app.go` | handleAgentEvent 加 EventTaskUpdated case；SendMessage 中注入 sessionId 到 tool context |
| `main.go` | 组装 system prompt 时插入 PromptPlanning；创建 TaskStore 实例 |
| `frontend/src/store/index.ts` | tasks 字段 + setSessionTasks action + setupWailsEvents 加 task_updated case |
| `frontend/src/App.tsx` | 侧边栏拆分 SessionList + TodoPanel |

## 7. Success Criteria

- 复杂多步任务中（>3 文件改动、跨 package），agent 自动创建 task plan 并在 UI 可见
- Agent 在 task 状态变更时（pending → in_progress → completed）通过 TaskUpdate 反映在 TodoPanel
- 会话切换时 TodoPanel 正确切换对应 session 的 task 列表
- 旧 session JSON 加载无 tasks 字段时报错，向后兼容

## 8. Non-Goals

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
| Agent 偏离 plan 不更新 task 状态 | TodoPanel 显示 task 时间戳；长时间未更新的 `in_progress` 在 UI 上视觉衰减（15 分钟阈值） |
| TaskCreate 误调用覆盖完整 plan | `cancelled` status 保留历史；TaskStore 保留最近一次替换前的快照（1 层回退） |
| LLM 复杂度误判（简单任务创建 plan / 复杂任务不创建） | Prompt 复杂度判断标准 + 未来可加程序化触发（tool call 次数 > N 且无 TaskCreate → hint） |
| 缩进渲染 DAG 依赖不准确 | blockedBy 限单 entry 以保证 tree 结构；对需要 DAG 的场景用 badge 文字标注依赖 ID |
