# Session Compaction Design

## Overview

当会话 token 使用量接近模型上下文窗口上限时，自动对早期对话进行 LLM 摘要压缩，同时保留近期消息原文。采用 OpenCode 风格的混合策略：结构化摘要 + 工具输出裁剪 + 保留窗口。

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|--------------|
| 纯截断（滑动窗口） | 丢失早期设计决策和 bug 发现等关键上下文 |
| 仅裁剪工具输出 | 不解决对话消息本身的 token 增长 |
| 用户手动触发 | 用户不会主动关注 token 用量，自动触发减少认知负担 |
| 用更便宜的模型做摘要 | 增加配置复杂度；先用当前模型，后续可配置化 |

选择 LLM 摘要 + 保留窗口的混合策略，因为它在保留关键上下文和节省 token 之间提供了最佳平衡。

## Strategy

- **混合压缩**：对早期消息做 LLM 摘要，近期消息保留原文
- **自动触发**：每次 agent turn 前检测，无需用户操作
- **非流式摘要**：复用当前会话的 provider，通过收集 `StreamChat` channel 的所有事件来模拟同步调用（不需要修改 `ProviderEngine` 接口）
- **失败兜底**：摘要调用失败时降级为简单截断

## Trigger

```
usableContext = modelContextLimit - OUTPUT_TOKEN_MAX(model) - COMPACTION_BUFFER(20K)
overflow = currentTokens > usableContext  // 128K 模型约 59%，200K 模型约 74%
```

- `modelContextLimit`：从 `modelContextLimits` 映射表查询
- `currentTokens`：由 `estimateContextTokens()` 提供，基于 tiktoken 估算。每个 turn 调用前重新估算
- `COMPACTION_BUFFER`：20K tokens，确保压缩过程自身有执行空间（包含摘要 prompt + 全量对话输入 + 摘要输出）
- `OUTPUT_TOKEN_MAX(model)`：按模型的最大输出 token 数 —— 从新增的 `modelOutputLimits` 映射表查询（Claude Sonnet=8K, GPT-4o=16K, DeepSeek=32K）

检查时机：`RunStreaming()` 每个 turn 调用 LLM 之前（`buildMessages` 之后、`StreamChat` 之前）。

## Compaction Flow

```
RunStreaming() turn:
  1. buildMessages(conv)
  2. estimateContextTokens(conv) -> isOverflow?
     └─ YES:
        a. emit EventCompacting  // 通知前端进入 compacting 状态
        b. buildCompactionPrompt(conv) -> 构造摘要 prompt
        c. collectResponse(StreamChat(prompt)) -> 收集 channel 事件获取摘要文本
        d. rewriteMessages(conv, summary)
           conv.Messages = [summary] + [preserved recent]
        e. updateConversationMeta(conv)  // 更新 TokenCount/CompactionCount
        f. emit EventCompaction(summary, beforeTokens, afterTokens)
        g. 继续后续流程
  3. StreamChat(buildMessages(conv))
  ...
```

新增 `EventCompacting` 事件类型，区别于 `EventThinking`（后者表示 LLM 推理内容）。前端收到 `EventCompacting` 时设置 `compactingSessionId`，ChatInput 据此显示 "Compacting..."。

**非流式调用实现**：复用现有 `StreamChat()`，将 channel 中 `ContentDelta` 事件的文本拼接为完整摘要字符串。不修改 `ProviderEngine` 接口，避免破坏所有 provider 实现。

## Compaction Prompt

```
You are a conversation summarizer. Summarize the conversation below.
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
- If these cannot fit, prioritize goals > decisions > discoveries
```

> Quality gate: 用 `max_tokens` 参数限制摘要长度，确保不超过 compaction buffer。

## Message Rewriting

压缩后 `conv.Messages` 结构：

```
[summary message]         // role="assistant", name="compaction_summary"
[recent msg N-3]          // 保留窗口内原文
[recent msg N-2]
[recent msg N-1]
[recent msg N]            // 最后一条用户消息
```

> `conv.Messages` 只被改写为 `[summary] + [recent ...]`。system prompt 不在 conv.Messages 中，由 `buildMessages()` 单独 prepend。

**Summary 角色选择**：使用 `role="assistant", name="compaction_summary"` 而非 `role="user"`。避免 LLM 将摘要中的指令性内容误认为用户指令执行，同时前端可通过 `name` 字段区分摘要消息与普通 assistant 消息来渲染 compaction 卡片。

**保留窗口**：模型上下文窗口的 25%（`preserveRecentRatio = 0.25`），最小保证最后 1 轮完整对话不被裁剪。保留窗口以 token 为度量单位（与触发阈值一致）。

**工具输出处理**：保留窗口边界必须对齐到完整 turn 边界（user message → assistant response → tool results）。在保留窗口之外的相关 assistant tool_calls 和 tool results 一并丢弃；在窗口内的保留完整的 assistant+tool 消息对。不可分割 tool call/tool result 配对。

**错误兜底的截断**同样使用 token 维度 25% 保留，最小保证最后 1 个完整 turn。

## Session Persistence

`Session` 结构体新增字段（`internal/api/session_manager.go`）：

```go
TokenCount      int64 `json:"token_count,omitempty"`
TokenMax        int64 `json:"token_max,omitempty"`
CompactionCount int   `json:"compaction_count,omitempty"`
```

### Token 写入路径

`Conversation` 结构体新增对应字段，agent loop 在每次 turn 后更新：

```go
type Conversation struct {
    ID             string
    Messages       []engine.ChatMessage
    TokenCount     int64  // 新增
    TokenMax       int64  // 新增
    CompactionCount int   // 新增
}
```

`app.go` 的 `s.Messages = conv.Messages` 处同步更新 session 的 token/compaction 字段。`TokenCount` 在 session load 时通过 `estimateContextTokens()` 重新计算以确保准确性，持久化值仅用于 switch session 时的即时显示。

### 消息归档

压缩前的原始消息写入 `ArchivedMessages []engine.ChatMessage` 字段（新增），JSON 持久化时 `omitempty`。Session JSON 文件体积增长风险通过以下方式控制：仅保留最近一次压缩的归档，下一次压缩时覆盖。

## Event Plumbing

### Go 端

`agent.Event` 新增字段和类型：

```go
const (
    EventCompacting EventType = iota + 10  // 新增
    EventCompaction                         // 新增
)

type Event struct {
    Type       EventType
    Content    string
    Tool       *ToolEvent
    Usage      UsageEvent
    Compacting *CompactingEvent   // 新增
    Compaction *CompactionEvent   // 新增
}

type CompactingEvent struct {
    SessionID string `json:"session_id"`
}

type CompactionEvent struct {
    Summary        string `json:"summary"`
    BeforeTokens   int64  `json:"before_tokens"`
    AfterTokens    int64  `json:"after_tokens"`
    CompactionNum  int    `json:"compaction_num"`
}
```

`api.StreamEvent` 同步新增 `Compacting *agent.CompactingEvent` 和 `Compaction *agent.CompactionEvent`。

`api.app.go` 的 `handleAgentEvent()` 新增两个 case：
- `EventCompacting` → `se.Type = "compacting"; se.SessionID = sid; se.Compacting = ev.Compacting`
- `EventCompaction` → `se.Type = "compaction"; se.Compaction = ev.Compaction`

### 前端端

`setupWailsEvents` 新增两个 case：
- `'compacting'` → `store.setCompacting(sid, true)`
- `'compaction'` → `store.setCompacting(sid, false); store.addCompactionMessage(sid, data)`

### 前端 Store 新增字段和 Actions

```typescript
// 新增 state 字段
compactingSessionId: string
sessionTokens: Record<string, { count: number; max: number }>

// 新增 actions
setCompacting: (sid: string, compacting: boolean) => void
addCompactionMessage: (sid: string, data: CompactionEventData) => void
```

`addTokens` 改为接收 `sessionId` 参数，写入 `sessionTokens[sid]`。ChatInput 从 `sessionTokens[activeSessionId]` 读取 token 显示。

**ChatInput 状态**：接收 `compacting={compactingSessionId !== ''}` prop，当 compacting 为 true 时显示 "Compacting..." 占位文本（区别于 "Generating..."）。

### Wails Bindings 重新生成

Go struct 变更后必须运行 `wails3 task bindings` 重新生成 `frontend/bindings/monika/internal/api/models.ts`。

## Frontend

- `MessageBubble` 新增 `compaction` variant，作为消息卡片展示在聊天流中
- 卡片**默认展开**，使用 amber/orange 色调区别于 assistant thinking 的 `#a68432`
- 卡片头点击切换折叠（复用 ThinkingBlock 的 button+chevron 模式，天然支持键盘操作）
- 卡片内容：摘要文本 + 压缩统计（tokens before/after, compaction #）
- 压缩过程中 ChatInput 显示 "Compacting..."，`compactingSessionId` 非空时阻塞输入

## Error Handling

- 摘要调用失败 → 降级为 token 维度截断，保留最近 25% 上下文窗口的 token
- 截断同样对齐到完整 turn 边界，保证最后 1 个完整 turn 不被裁剪
- 压缩后仍然溢出 → 发出 `EventError` 并停止 agent loop
- 所有错误路径确保 `conv.Messages` 处于一致状态后才继续

## Files to Modify

| File | Change |
|------|--------|
| `internal/agent/agent_loop.go` | 新增 `isOverflow()`, `runCompaction()`, `rewriteMessages()`, `buildCompactionPrompt()`；`Conversation` 新增 token/compaction 字段；每 turn 调用 `estimateContextTokens()` |
| `internal/agent/event.go` | 新增 `EventCompacting`/`EventCompaction` 类型；`Event` 新增 `Compacting`/`Compaction` 字段 |
| `internal/agent/stream.go` | 移除 `parseResult()` 条目（摘要结果不经过 ChatEvent 管道） |
| `internal/api/types.go` | `StreamEvent` 新增 `Compacting`/`Compaction` 字段 |
| `internal/api/app.go` | `handleAgentEvent` 新增 `EventCompacting`/`EventCompaction` case；`s.Messages = conv.Messages` 处同步 token/compaction 字段 |
| `internal/api/session_manager.go` | `Session` 新增 `TokenCount`/`TokenMax`/`CompactionCount`/`ArchivedMessages`；`SessionInfo` 同步 token 字段 |
| `frontend/bindings/` | 重新生成 Wails bindings（`wails3 task bindings`） |
| `frontend/src/store/index.ts` | 新增 `compactingSessionId`/`sessionTokens`；新增 `setCompacting`/`addCompactionMessage` action；`addTokens` 改为 per-session；`loadSessionMessages` 支持 `compaction` 角色 |
| `frontend/src/components/Chat/MessageBubble.tsx` | 新增 `compaction` variant 渲染（amber 色调、默认展开、button+chevron 折叠） |
| `frontend/src/components/Chat/ChatInput.tsx` | 新增 `compacting` prop，显示 "Compacting..." 状态；token 显示从 `sessionTokens[activeSessionId]` 读取 |
