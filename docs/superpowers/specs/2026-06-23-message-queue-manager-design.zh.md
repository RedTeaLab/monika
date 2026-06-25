# Session 消息队列管理器 — 设计文档

**日期:** 2026-06-23
**状态:** 已实现
**方案:** A — 队列嵌入 SessionManager

## 问题背景

当前 session 正在生成（generating）时，新消息会在前端（`ChatArea.tsx:190` 的 `generatingSessionIds` 检查）和后端（`app.go:678` 的 `cancelFuncs` 检查）被直接拒绝。用户无法在 agent 工作时排队后续消息，只能遵循严格的"发送-等待-再发送"流程，无法提前规划或批量发送。

## 解决方案

为每个 session 增加消息队列。agent 忙碌时发送的消息将被入队而非拒绝。队列在 agent 完成每条消息后自动执行下一条。用户可通过专用 UI 修改、排序和取消排队中的消息。

## 需求总结

| 项目 | 决定 |
|---|---|
| 执行模式 | 混合 — 默认自动执行，用户可暂停切换手动控制 |
| 持久化 | 队列作为 session JSON 的一部分保存到磁盘，重启后恢复 |
| UI 布局 | 聊天输入框上方的内联条（始终可见，自动/手动模式切换） |
| 队列范围 | 仅聊天消息（Shell 命令和 Compaction 在忙碌时仍然拒绝） |
| 错误处理 | 失败时暂停队列，用户决定：重试 / 跳过 / 编辑后重试 |
| 队列操作 | 修改文本、拖拽排序、取消、手动执行（手动模式） |

## 架构：方案 A（嵌入 SessionManager）

队列存储为现有 `Session` 结构体的一个字段，随 session JSON 一起持久化。复用现有 SessionManager 的 Lock/Load/Save 模式，新增基础设施最少。

## 1. 数据模型

### `QueuedMessage`（新增于 `internal/api/types.go`）

```go
type QueuedMessage struct {
    ID         string `json:"id"`                       // UUID
    Text       string `json:"text"`                     // 消息文本（可编辑）
    ProviderID string `json:"provider_id"`              // 发送时选择的 provider
    Model      string `json:"model"`                    // 发送时选择的 model
    Status     string `json:"status"`                   // "queued" | "executing" | "error"
    Error      string `json:"error,omitempty"`          // 失败原因
    CreatedAt  int64  `json:"created_at"`               // 时间戳，排序参考
}
```

### `Session` 变更（`internal/api/session_manager.go`）

```go
type Session struct {
    ...existing fields...
    Queue       []QueuedMessage `json:"queue,omitempty"`
    QueuePaused bool            `json:"queue_paused,omitempty"`
}
```

- 队列项通过现有的 Load/Save 随 session JSON 持久化。
- `QueuePaused` 标记是否暂停自动执行。
- 正在执行的消息 Status 为 `"executing"`，完成后从队列移除并进入 `Messages` 历史（现有行为）。

## 2. 后端队列逻辑

### `SendMessage` 流程变更（`internal/api/app.go`）

当前行为：如果 `cancelFuncs[sessionID]` 存在，返回错误 `"session is already generating"`。

新行为 — **始终入队**：

```
SendMessage(projectPath, sessionID, text, providerID, model):
  1. Lock session, Load
  2. 验证 provider 存在
  3. 创建 QueuedMessage{ID: uuid, Text, ProviderID, Model, Status: "queued", CreatedAt: now}
  4. 追加到 s.Queue
  5. Save session, Unlock
  6. Emit "queue_updated" 事件
  7. 如果 agent 空闲（cancelFuncs[sessionID] 不存在）且未暂停:
     → drainQueue(sm, sessionID)  // 立即拾取该消息
```

> **设计偏差说明：** 原始设计文档提出"忙碌时入队，空闲时直接执行"。实际实现采用**始终入队**策略，然后调用 `drainQueue`。这消除了条件分支，避免了 `cancelFuncs` 的 check-then-act 竞争。当 agent 空闲时，`drainQueue` 在毫秒级内拾取消息 — 用户感知为立即执行。当 agent 忙碌时，消息在队列中等待。

### 自动执行机制

在 `startAgentLoop` 的 goroutine 完成段（`app.go`），agent loop 结束后：

```
goroutine 清理（3 条路径）:
  1. 取消路径 (ctx.Err() != nil):
     → 从磁盘重新加载 session（保留并发修改）
     → 通过 copyConversationData() 复制会话数据
     → 设 StatusPending, Save
     → delete(cancelFuncs[sessionID])
     → return（不触发 drain）

  2. 错误路径 (hadError && queueItemID != ""):
     → 从磁盘重新加载 session
     → 复制会话数据
     → 设队列项 Status="error"
     → 设 QueuePaused = true
     → 设 StatusPending, Save
     → delete(cancelFuncs[sessionID])
     → Emit "queue_error"
     → return（不触发 drain — 队列已暂停）

  3. 正常完成路径:
     → 从磁盘重新加载 session
     → 复制会话数据
     → 移除已完成的队列项
     → 设 StatusPending, Save
     → 从 fresh 副本同步 s.Queue
     → Emit "queue_updated"
     → delete(cancelFuncs[sessionID])  // 在 drain 之前，使 drainQueue 看到空闲
     → drainQueue(sm, sessionID)       // 链式触发下一条
```

> **并发安全：** 三条路径在保存前都从磁盘重新加载 session（`sm.Load(sessionID)`），避免覆盖 `SendMessage`/`PauseQueue`/`CancelQueueItem` 的并发修改。`copyConversationData()` 辅助函数将 Messages/TokenCount/TokenMax/CompactionCount/CompactionFrom/Provider/Model 从 goroutine 的内存 session 复制到 fresh 磁盘副本。

### 暂停 / 恢复（自动 / 手动模式）

- `PauseQueue(sessionID)`：设 `QueuePaused = true`，Save。UI 显示 "Manual Mode"。
- `ResumeQueue(sessionID)`：设 `QueuePaused = false`，Save。UI 显示 "Auto Mode"。如果 session 空闲且队列有 "queued" 项 → 立即触发执行第一条。
- `ExecuteQueueItem(sessionID, itemID)`（仅手动模式）：将目标项移到队列前端，标记 "executing"，直接启动 agent loop。绕过正常 drain 顺序 — 用户选择下一条执行的消息。

### 错误处理

```
Agent loop 出错时:
  1. 找到 Queue 中 Status="executing" 的项
  2. 设 Status="error", Error=<错误信息>
  3. 设 QueuePaused = true
  4. Emit "queue_error" 事件

用户恢复选项:
  - 重试: RetryQueueItem（重置 Status 为 "queued" 且恢复队列）
  - 跳过: SkipQueueItem（移除该项且恢复队列）
  - 编辑: EditQueueItem（修改文本），然后 RetryQueueItem
```

## 3. Wails API 绑定

### 新增方法（`internal/api/app.go`）

| 方法 | 说明 |
|---|---|
| `GetQueue(projectPath, sessionID) []QueuedMessage` | 返回当前队列 |
| `EditQueueItem(projectPath, sessionID, itemID, newText)` | 编辑排队消息的文本 |
| `ReorderQueue(projectPath, sessionID, itemIDs [])` | 按给定 ID 顺序重排队列（保留未列出的项） |
| `CancelQueueItem(projectPath, sessionID, itemID)` | 取消/移除队列项（行为取决于状态，见下方取消行为） |
| `PauseQueue(projectPath, sessionID)` | 暂停自动执行（切换到手动模式） |
| `ResumeQueue(projectPath, sessionID)` | 恢复自动执行（空闲时立即触发） |
| `RetryQueueItem(projectPath, sessionID, itemID)` | 重置失败项为 "queued" 并恢复队列 |
| `SkipQueueItem(projectPath, sessionID, itemID)` | 移除失败项并恢复队列 |
| `ExecuteQueueItem(projectPath, sessionID, itemID)` | 手动模式：立即执行指定项（移到前端，绕过 drain 顺序） |

所有方法遵循 `sm.Lock() → Load → 修改 Queue → Save → Unlock` 模式，确保线程安全。

### 修改的现有方法

`SendMessage` — 始终入队，然后空闲时触发 `drainQueue`。无直接执行路径。入队前验证 provider。

`CancelGeneration` — 现在同时将 "executing" 状态的队列项重置为 "error"（Stop 按钮路径）。

### 通过 Wails EventEmit 发送的事件

| 事件 | 触发时机 |
|---|---|
| `queue_updated` | 队列变化（入队/移除/重排/状态变更） |
| `queue_item_started` | 队列项开始执行（事件 payload 包含消息文本、provider、model，供前端添加到聊天） |
| `queue_error` | 队列项执行失败，队列已暂停 |

## 4. 取消行为

两种不同的取消场景：

| 场景 | 行为 |
|---|---|
| **取消正在执行的消息** | 停止 agent loop（CancelGeneration）+ 设该项 Status="error", Error="cancelled by user" + **暂停整个队列**（`QueuePaused = true`）+ emit `queue_error`。用户必须手动 ResumeQueue 才能继续。 |
| **取消排队中的消息** | 直接从 Queue 移除。队列继续正常执行 — 不暂停。 |

`CancelQueueItem` 根据 item 的 Status 分支：

```
CancelQueueItem(sessionID, itemID):
  如果 item.Status == "executing":
    → CancelGeneration(sessionID)
    → item.Status = "error", Error = "cancelled by user"
    → QueuePaused = true
    → Emit "queue_error"
  如果 item.Status == "queued" 或 "error":
    → 从 Queue 移除
    → Emit "queue_updated"
```

## 5. 前端设计

### 新增组件

**`QueuePanel`**（聊天输入框上方的内联条，始终可见）
- 自动/手动模式切换按钮（绿色 "Auto Mode" / 黄色 "Manual Mode"）
- 有队列项时显示计数徽章
- 可展开的队列项列表

**`QueueItem`**（可复用单项组件）
- 点击进入内联编辑模式
- 拖拽手柄排序（HTML5 drag-and-drop）
- 状态指示器（queued / executing / error）
- 手动模式下显示 "Run" 按钮执行该项
- 错误状态下额外显示：重试/跳过按钮

### `ChatInput` 变更

- 新增 `isGenerating` prop：为 true 时输入框保持可编辑。同时显示停止按钮（取消 agent）和发送按钮（入队消息，黄色图标）。
- QueuePanel 渲染在输入框上方。

### Zustand Store 新增（`frontend/src/store/index.ts`）

```ts
// 新增状态
sessionQueues: Record<string, QueuedMessage[]>
queuePaused: Record<string, boolean>

// 新增 actions
setQueue(sessionId, items)
updateQueueItem(sessionId, itemId, changes)
removeQueueItem(sessionId, itemId)
reorderQueue(sessionId, itemIds)
toggleQueuePause(sessionId)
```

### 事件监听（在 `setupWailsEvents()` 中新增）

| 事件 | 前端处理 |
|---|---|
| `queue_updated` | 更新 `sessionQueues[sid]` |
| `queue_item_started` | 更新对应项状态为 executing，添加用户消息 + assistant 占位到聊天区（payload 包含 text/provider/model） |
| `queue_error` | 更新项状态为 error，设 `queuePaused[sid] = true` |

### 发送消息流程变更（`ChatArea.tsx`）

始终调用 `SendMessage`（无忙碌拦截）。后端始终入队。无乐观 UI — `queue_item_started` 事件在消息实际开始执行时才添加用户消息 + assistant 占位到聊天区。`queue_updated` 事件立即刷新 QueuePanel 显示入队项。

## 6. 边界情况与恢复

### 应用重启恢复

现有 `resetStaleSessions`（`app.go:1556`）将 `StatusGenerating` 重置为 `StatusPending`。新增：

- 扫描所有 session 的 `Queue` 字段
- 将 `Status="executing"` 的项重置为 `"queued"`（崩溃恢复 — 未完成的执行）
- 如果 session 空闲且 `QueuePaused=false` 且有 `"queued"` 项 → 自动触发执行第一条

### 并发安全

- 所有队列操作方法都走 `sm.Lock() → Load → 修改 Queue → Save → Unlock`，确保串行化。
- agent loop goroutine 与 `SendMessage`/`PauseQueue` 等并发运行。为避免覆盖过期数据，goroutine 在所有保存点都**从磁盘重新加载** session（`sm.Load(sessionID)`）。
- `cancelFuncs[sessionID]` 作为 "agent 忙碌" 指示器。在 goroutine 的每条返回路径中**显式删除**（在调用 `drainQueue` 之前），使 `drainQueue` 正确看到 session 空闲。
- `copyConversationData()` 辅助函数集中处理 7 个会话数据字段的复制，避免在 goroutine 的 3 条保存路径中重复。

### 按状态的操作权限

| 操作 | queued | executing | error |
|---|---|---|---|
| 编辑文本 | 可以 | 不可以 | 可以 |
| 拖拽排序 | 可以 | 不可以（固定位置） | 可以 |
| 取消/移除 | 可以（直接移除） | 可以（取消生成 + 暂停队列） | 可以（直接移除） |
| 重试 | — | — | 可以 |

## 7. 测试策略

### Go 后端

- 单元测试 `Session` 队列 save/load 往返
- 单元测试 `SendMessage` 忙碌时的入队行为（mock agent loop）
- 单元测试自动执行链（mock agent loop 完成 → 下一条开始）
- 单元测试 错误 → 暂停 → 重试/跳过 流程
- 单元测试 重启恢复（executing → queued 重置）
- 单元测试 并发 SendMessage（两个 goroutine，同一忙碌 session）

### 前端

- 通过 dev 模式手动测试（`wails3 dev`）
- 验证 QueuePanel 渲染、拖拽排序、内联编辑
- 验证事件驱动更新（queue_updated, queue_error）
- 验证溢出 → 全页面切换（超过 10 条时）
