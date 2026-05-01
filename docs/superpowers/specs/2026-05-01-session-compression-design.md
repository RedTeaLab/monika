# Session Compression Design

## Overview

当会话 token 使用量接近模型上下文窗口上限时，自动对早期对话进行 LLM 摘要压缩，同时保留近期消息原文。采用 OpenCode 风格的混合策略：结构化摘要 + 工具输出裁剪 + 保留窗口。

## Strategy

- **混合压缩**：对早期消息做 LLM 摘要，近期消息保留原文
- **自动触发**：每次 agent turn 前检测，无需用户操作
- **非流式摘要**：复用当前会话的 provider 做一次非流式调用
- **失败兜底**：摘要调用失败时降级为简单截断

## Trigger

```
usableContext = modelContextLimit - OUTPUT_TOKEN_MAX(32K) - COMPACTION_BUFFER(20K)
overflow = currentTokens > usableContext  // 约 80% 上下文窗口
```

- `modelContextLimit`：从 `modelContextLimits` 映射表查询
- `currentTokens`：由 `estimateContextTokens()` 提供，基于 tiktoken 估算
- `COMPACTION_BUFFER`：20K tokens，确保压缩过程自身有执行空间

检查时机：`RunStreaming()` 每个 turn 调用 LLM 之前（`buildMessages` 之后、`StreamChat` 之前）。

## Compaction Flow

```
RunStreaming() turn:
  1. buildMessages(conv)
  2. estimateContextTokens(conv) -> isOverflow?
     └─ YES:
        a. emit EventThinking("Compacting conversation...")
        b. buildCompactionPrompt(conv) -> 构造摘要 prompt
        c. callProvider(prompt) -> 非流式同步调用，获取摘要文本
        d. rewriteMessages(conv, summary)
           conv.Messages = [system] + [summary] + [preserved recent]
        e. emit EventCompaction(summary, beforeTokens, afterTokens)
        f. 继续后续流程
  3. StreamChat(messages)
  ...
```

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
```

## Message Rewriting

压缩后 `conv.Messages` 结构：

```
[system prompt]           // buildMessages() 单独 prepend，不受压缩影响
[summary message]         // role="user", 摘要内容 (写入 conv.Messages 头部)
[recent msg N-3]          // 保留窗口内原文
[recent msg N-2]
[recent msg N-1]
[recent msg N]            // 最后一条用户消息
```

> `conv.Messages` 只被改写为 `[summary] + [recent ...]`。system prompt 不在 conv.Messages 中。

**保留窗口**：模型上下文窗口的 25%（`preserveRecentRatio = 0.25`），最小保证最后 1 轮完整对话不被裁剪。

**工具输出处理**：在保留窗口之外的工具消息直接丢弃；在窗口内的保留。

## Session Persistence

`Session` 结构体新增字段（`internal/api/session_manager.go`）：

```go
TokenCount      int64 `json:"token_count,omitempty"`
TokenMax        int64 `json:"token_max,omitempty"`
CompactionCount int   `json:"compaction_count,omitempty"`
```

token 数据随 session JSON 文件持久化，切换会话时自然恢复，无需前端单独缓存。

## New Event Type

`EventCompaction` — 压缩完成事件：

```go
type CompactionEvent struct {
    Summary       string `json:"summary"`        // 摘要文本
    BeforeTokens  int64  `json:"before_tokens"`  // 压缩前 token 数
    AfterTokens   int64  `json:"after_tokens"`   // 压缩后 token 数
    CompactionNum int    `json:"compaction_num"` // 第几次压缩
}
```

## Frontend

- `MessageBubble` 新增 `compaction` variant，作为消息卡片展示在聊天流中
- 卡片内容：摘要文本（可折叠） + 压缩统计（tokens before/after, compaction #）
- 压缩过程中 ChatInput 显示 "Compacting..." 状态
- Token 显示从当前 session 的 `TokenCount`/`TokenMax` 读取

## Error Handling

- 摘要调用失败 → 降级为简单截断，保留最近 25% 消息
- 压缩后仍然溢出 → 发出 `EventError` 并停止 agent loop
- 所有错误路径确保 `conv.Messages` 处于一致状态后才继续

## Files to Modify

| File | Change |
|------|--------|
| `internal/agent/agent_loop.go` | 新增 `isOverflow()`, `runCompaction()`, `rewriteMessages()`, `buildCompactionPrompt()` |
| `internal/agent/event.go` | 新增 `EventCompaction` 类型和 `CompactionEvent` 结构体 |
| `internal/agent/stream.go` | `parseResult()` 处理压缩结果 |
| `internal/api/types.go` | `StreamEvent` 支持 compaction 负载 |
| `internal/api/session_manager.go` | `Session` 新增 token/compaction 字段，`SessionInfo` 同步 |
| `frontend/src/store/index.ts` | 移除全局 `tokenCount`，从 session 读取 |
| `frontend/src/components/Chat/MessageBubble.tsx` | 新增 compaction variant 渲染 |
| `frontend/src/components/Chat/ChatInput.tsx` | token 显示改为从 session 读取 |
