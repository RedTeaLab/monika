package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"
	"unicode/utf8"

	"monika/internal/permission"
	"monika/internal/tool"
	"monika/pkg/engine"
	"monika/pkg/tokenizer"
)

// CompactionPrompt is the system prompt used by the compaction agent.
const CompactionPrompt = `You are an anchored context summarization assistant for coding sessions.

Summarize only the conversation history you are given. The newest turns are kept verbatim outside your summary, so focus on the older context that still matters for continuing the work.

If the prompt includes a <previous-summary> block, treat it as the current anchored summary. Update it with the new history by preserving still-true details, removing stale details, and merging in new facts.

Always follow the exact output structure requested by the user prompt. Keep every section, preserve exact file paths and identifiers when known, and prefer terse bullets over paragraphs.

Do not answer the conversation itself. Do not mention that you are summarizing, compacting, or merging context. Respond in the same language as the conversation.`

func (a *AgentLoop) modelLimit() (contextTokens, outputTokens int64) {
	if a.modelContextLimit > 0 {
		return a.modelContextLimit, a.modelOutputLimit
	}
	return 128000, 32768
}

func (a *AgentLoop) contextLimit() int64 {
	ctx, _ := a.modelLimit()
	return ctx
}

type Conversation struct {
	ID              string
	Messages        []engine.ChatMessage
	TokenCount      int64
	TokenMax        int64
	CompactionCount int
	CompactionFrom  int // index in Messages where effective context starts for LLM
}

const compactionBuffer = 20_000

func IsChildSession(sessionID string) bool {
	return strings.HasPrefix(sessionID, "call_") || strings.HasPrefix(sessionID, "sub_") || strings.HasPrefix(sessionID, "compact_")
}

func isChildSession(sessionID string) bool { return IsChildSession(sessionID) }

func (a *AgentLoop) isOverflow(conv *Conversation) bool {
	limit := a.contextLimit()
	outputMax := a.modelOutputLimit
	if outputMax <= 0 {
		outputMax = 32768
	}
	usable := limit - outputMax - compactionBuffer
	if usable <= 0 {
		usable = limit / 2
	}
	conv.TokenMax = limit
	return conv.TokenCount >= usable
}

const compactionSummaryTemplate = `Output exactly the Markdown structure shown inside <template> and keep the section order unchanged. Do not include the <template> tags in your response.
<template>
## Goal
- [single-sentence task summary]

## Constraints & Preferences
- [user constraints, preferences, specs, or "(none)"]

## Progress
### Done
- [completed work or "(none)"]

### In Progress
- [current work or "(none)"]

### Blocked
- [blockers or "(none)"]

## Key Decisions
- [decision and why, or "(none)"]

## Next Steps
- [ordered next actions or "(none)"]

## Critical Context
- [important technical facts, errors, open questions, or "(none)"]

## Relevant Files
- [file or directory path: why it matters, or "(none)"]
</template>

Rules:
- Keep every section, even when empty.
- Use terse bullets, not prose paragraphs.
- Preserve exact file paths, commands, error strings, and identifiers when known.
- Do not mention the summary process or that context was compacted.
- If these cannot fit, prioritize Goal > Key Decisions > Critical Context > Progress > Next Steps.`

func (a *AgentLoop) buildCompactionPrompt(conv *Conversation) ([]engine.ChatMessage, error) {
	tailStart := compactionSplit(conv, a.contextLimit())
	headMsgs := buildCompactionMessages(conv, tailStart)

	if len(headMsgs) == 0 {
		return nil, fmt.Errorf("not enough conversation history to compact (head is empty)")
	}

	// Find any previous compaction summary in the head
	var previousSummary string
	start := conv.CompactionFrom
	for i := start; i < tailStart && i < len(conv.Messages); i++ {
		if conv.Messages[i].Name == "compaction_summary" {
			previousSummary = conv.Messages[i].Content
			break
		}
	}

	// Build the final user instruction based on whether we have a previous summary
	var instruction string
	if previousSummary != "" {
		instruction = "Update the anchored summary below using the conversation history above.\nPreserve still-true details, remove stale details, and merge in the new facts.\n<previous-summary>\n" + previousSummary + "\n</previous-summary>"
	} else {
		instruction = "Create a new anchored summary from the conversation history above."
	}

	// Messages: [head conversations...] + final user instruction with template
	msgs := make([]engine.ChatMessage, 0, len(headMsgs)+1)
	msgs = append(msgs, headMsgs...)
	msgs = append(msgs, engine.ChatMessage{
		Role:    "user",
		Content: instruction + "\n\n" + compactionSummaryTemplate,
	})

	return msgs, nil
}

func (a *AgentLoop) rewriteMessages(conv *Conversation, summary string) {
	tailStart := compactionSplit(conv, a.contextLimit())

	summaryMsg := engine.ChatMessage{
		Role:    "assistant",
		Name:    "compaction_summary",
		Content: summary,
	}

	// Insert summary at head/tail boundary so buildMessages can skip the old head
	// (everything before CompactionFrom) and only send summary + tail to the LLM.
	newMsgs := make([]engine.ChatMessage, 0, len(conv.Messages)+1)
	newMsgs = append(newMsgs, conv.Messages[:tailStart]...)
	newMsgs = append(newMsgs, summaryMsg)
	newMsgs = append(newMsgs, conv.Messages[tailStart:]...)

	conv.Messages = newMsgs
	conv.CompactionFrom = tailStart
	conv.CompactionCount++
	conv.TokenCount = a.EstimateContextTokens(conv)
}

func (a *AgentLoop) RunCompaction(ctx context.Context, conv *Conversation, ch chan<- Event) error {
	beforeTokens := conv.TokenCount

	fmt.Fprintf(os.Stderr, "[monika] compaction: running (tokens=%d, messages=%d, compactCount=%d)\n",
		beforeTokens, len(conv.Messages), conv.CompactionCount)

	prompt, err := a.buildCompactionPrompt(conv)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[monika] compaction: buildCompactionPrompt failed: %v\n", err)
		return err
	}
	// Prepend the compaction system prompt for the direct (non-dispatch) path
	fullMessages := make([]engine.ChatMessage, 0, len(prompt)+1)
	fullMessages = append(fullMessages, engine.ChatMessage{
		Role:    "system",
		Content: CompactionPrompt,
	})
	fullMessages = append(fullMessages, prompt...)

	req := engine.ChatRequest{
		Provider: a.providerID,
		Model:    a.model,
		Messages: fullMessages,
	}

	events, err := a.provider.StreamChat(ctx, req)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[monika] compaction: stream error: %v\n", err)
		return fmt.Errorf("compaction stream chat: %w", err)
	}

	var summary strings.Builder
	for ev := range events {
		switch ev.Kind {
		case engine.EventContentDelta:
			summary.WriteString(ev.Text)
		case engine.EventError:
			fmt.Fprintf(os.Stderr, "[monika] compaction: provider error: %s\n", ev.Error.Message)
			return fmt.Errorf("compaction provider error: %s", ev.Error.Message)
		}
	}
	// Check if context was cancelled after the stream ended.
	if ctx.Err() != nil {
		return ctx.Err()
	}

	result := sanitizeCompactionOutput(summary.String())
	rawLen := summary.Len()
	if result == "" {
		fmt.Fprintf(os.Stderr, "[monika] compaction: empty summary (raw=%d chars)\n", rawLen)
		return fmt.Errorf("compaction returned empty summary")
	}

	a.rewriteMessages(conv, result)

	fmt.Fprintf(os.Stderr, "[monika] compaction: success (raw=%d chars, result=%d chars, afterTokens=%d)\n",
		rawLen, len(result), conv.TokenCount)

	ch <- Event{
		Type: EventCompaction,
		Compaction: &CompactionEvent{
			Summary:       result,
			BeforeTokens:  beforeTokens,
			AfterTokens:   conv.TokenCount,
			CompactionNum: conv.CompactionCount,
		},
	}

	return nil
}

type LoopResult struct {
	Conversation *Conversation
	Content      string
	Usage        engine.Usage
}

type AgentLoop struct {
	agent    Agent
	provider engine.ProviderEngine
	tools    *tool.ToolRegistry
	// conv is the in-memory conversation for this loop's run.
	conv *Conversation
	// parent is nil for root loops; non-nil for child subtasks.
	parent *AgentLoop

	sessionID         string
	systemPrompt      string
	pipeline          *permission.Pipeline
	projectDir        string
	model             string
	modelContextLimit  int64
	modelOutputLimit   int64
	providerID        string
	dispatchFn        func(ctx context.Context, task SubTask) <-chan Event
	mcpRegistry       *engine.MCPRegistry
	askUserFn         tool.AskUserFunc
}

// SetDispatchFn sets the child dispatch function for this loop.
// Used for compaction and other system-initiated subtasks.
func (a *AgentLoop) SetDispatchFn(fn func(ctx context.Context, task SubTask) <-chan Event) {
	a.dispatchFn = fn
}

type LoopOption func(*AgentLoop)

func WithSystemPrompt(prompt string) LoopOption {
	return func(a *AgentLoop) {
		a.systemPrompt = prompt
	}
}

func WithPermissionPipeline(p *permission.Pipeline) LoopOption {
	return func(a *AgentLoop) {
		a.pipeline = p
	}
}

func WithProjectDir(dir string) LoopOption {
	return func(a *AgentLoop) {
		a.projectDir = dir
	}
}

func WithModel(model string) LoopOption {
	return func(a *AgentLoop) {
		a.model = model
	}
}

// WithContextLimit sets the model's maximum context window (total tokens).
func WithContextLimit(n int64) LoopOption {
	return func(a *AgentLoop) {
		a.modelContextLimit = n
	}
}

// WithOutputLimit sets the model's maximum output tokens for overflow
// calculation.
func WithOutputLimit(n int64) LoopOption {
	return func(a *AgentLoop) {
		a.modelOutputLimit = n
	}
}

// WithProvider sets the provider ID (e.g. "deepseek", "openai") to use.
func WithProvider(id string) LoopOption {
	return func(a *AgentLoop) {
		a.providerID = id
	}
}

// WithSessionID sets the session ID injected into tool context.
func WithSessionID(id string) LoopOption {
	return func(a *AgentLoop) { a.sessionID = id }
}

func WithAgent(agent Agent) LoopOption {
	return func(a *AgentLoop) {
		a.agent = agent
		if agent.SystemPrompt != "" {
			a.systemPrompt = agent.SystemPrompt
		}
		if agent.Model != "" {
			a.model = agent.Model
		}
		if agent.Provider != "" {
			a.providerID = agent.Provider
		}
	}
}

func WithParent(parent *AgentLoop) LoopOption {
	return func(a *AgentLoop) { a.parent = parent }
}

func WithMCPRegistry(reg *engine.MCPRegistry) LoopOption {
	return func(a *AgentLoop) { a.mcpRegistry = reg }
}

func WithAskUserFunc(fn tool.AskUserFunc) LoopOption {
	return func(a *AgentLoop) { a.askUserFn = fn }
}

func NewLoop(provider engine.ProviderEngine, tools *tool.ToolRegistry, opts ...LoopOption) *AgentLoop {
	a := &AgentLoop{
		provider: provider,
		tools:    tools,
	}
	for _, opt := range opts {
		opt(a)
	}
	return a
}

func (a *AgentLoop) RunBlocking(ctx context.Context, conv *Conversation, userMessage string) (*LoopResult, error) {
	if conv == nil {
		conv = &Conversation{}
	}

	conv.Messages = append(conv.Messages, engine.ChatMessage{
		Role:    "user",
		Content: userMessage,
	})

	tools := a.buildToolDefs()
	var totalUsage engine.Usage

	for turn := 0; ; turn++ {
		_ = turn // reserved for future logging
		messages := a.buildMessages(conv)

		req := engine.ChatRequest{
			Provider: a.providerID,
			Model:    a.model,
			Messages: messages,
			Tools:    tools,
		}

		events, err := a.provider.StreamChat(ctx, req)
		if err != nil {
			return nil, fmt.Errorf("stream chat: %w", err)
		}

		var collected []engine.ChatEvent
		for ev := range events {
			collected = append(collected, ev)
		}

		result := parseResult(collected)
		if result.Error != nil {
			return nil, result.Error
		}

		totalUsage.InputTokens += result.Usage.InputTokens
		totalUsage.OutputTokens += result.Usage.OutputTokens
		totalUsage.TotalTokens += result.Usage.TotalTokens
		totalUsage.ReasoningTokens += result.Usage.ReasoningTokens
		totalUsage.CacheReadTokens += result.Usage.CacheReadTokens
		totalUsage.CacheWriteTokens += result.Usage.CacheWriteTokens

		if len(result.ToolCalls) == 0 {
			usage := result.Usage // copy per-turn usage
			conv.Messages = append(conv.Messages, engine.ChatMessage{
				Role:             "assistant",
				Content:          result.Content,
				ReasoningContent: result.ReasoningContent,
				TokenUsage:       &usage,
			})
			return &LoopResult{
				Conversation: conv,
				Content:      result.Content,
				Usage:        totalUsage,
			}, nil
		}

		usage := result.Usage // copy per-turn usage
		conv.Messages = append(conv.Messages, engine.ChatMessage{
			Role:             "assistant",
			ReasoningContent: result.ReasoningContent,
			ToolCalls:        result.ToolCalls,
			TokenUsage:       &usage,
		})

		for _, tc := range result.ToolCalls {
			t, ok := a.tools.Get(tc.Function.Name)
			if !ok {
				// Try MCP tools
				found := false
				if a.mcpRegistry != nil {
					for _, conn := range a.mcpRegistry.GetConnections() {
						tools, lerr := conn.ListTools(ctx)
						if lerr != nil {
							continue
						}
						for _, mt := range tools {
							if mt.Name == tc.Function.Name {
								result, cerr := conn.CallTool(ctx, tc.Function.Name, json.RawMessage(tc.Function.Arguments))
								if cerr != nil {
									conv.Messages = append(conv.Messages, engine.ChatMessage{
										Role:       "tool",
										Content:    fmt.Sprintf("MCP tool %s error: %s", tc.Function.Name, cerr),
										ToolCallID: tc.ID,
										Name:       tc.Function.Name,
									})
								} else {
									content := string(result)
									conv.Messages = append(conv.Messages, engine.ChatMessage{
										Role:       "tool",
										Content:    content,
										ToolCallID: tc.ID,
										Name:       tc.Function.Name,
									})
								}
								found = true
								break
							}
						}
						if found {
							break
						}
					}
				}
				if !found {
					conv.Messages = append(conv.Messages, engine.ChatMessage{
						Role:       "tool",
						Content:    fmt.Sprintf("tool %s not found", tc.Function.Name),
						ToolCallID: tc.ID,
					})
				}
				continue
			}

			if a.pipeline != nil {
				pctx := permission.CheckContext{
					ToolName:   tc.Function.Name,
					Args:       json.RawMessage(tc.Function.Arguments),
					SessionID:  a.sessionID,
					ProjectDir: a.projectDir,
				}
				if a.pipeline.Check(ctx, pctx) == permission.Deny {
					conv.Messages = append(conv.Messages, engine.ChatMessage{
						Role:       "tool",
						Content:    fmt.Sprintf("execution of %s was denied by user", tc.Function.Name),
						ToolCallID: tc.ID,
					})
					continue
				}
			}

			toolCtx := tool.WithProjectDir(ctx, a.projectDir)
			if a.sessionID != "" {
				toolCtx = tool.WithSessionID(toolCtx, a.sessionID)
			}
			if a.model != "" {
				toolCtx = tool.WithModel(toolCtx, a.model)
			}
			if a.providerID != "" {
				toolCtx = tool.WithProvider(toolCtx, a.providerID)
			}
			if a.askUserFn != nil {
				toolCtx = tool.WithAskUserFunc(toolCtx, a.askUserFn)
			}
			execResult, err := t.Execute(toolCtx, json.RawMessage(tc.Function.Arguments))
			if err != nil {
				conv.Messages = append(conv.Messages, engine.ChatMessage{
					Role:       "tool",
					Content:    fmt.Sprintf("error executing %s: %s", tc.Function.Name, err),
					ToolCallID: tc.ID,
					Name:       tc.Function.Name,
				})
				continue
			}

			content := execResult.Content
			if execResult.IsError {
				content = "error: " + content
			}

			conv.Messages = append(conv.Messages, engine.ChatMessage{
				Role:       "tool",
				Content:    content,
				ToolCallID: tc.ID,
				Name:       tc.Function.Name,
			})
		}
	}
}

func (a *AgentLoop) Run(ctx context.Context, conv *Conversation, userMessage string) <-chan Event {
	ch := make(chan Event, 128)
	a.conv = conv
	go func() {
		defer close(ch)
		a.runStreaming(ctx, conv, userMessage, ch)
	}()
	return ch
}

func (a *AgentLoop) runStreaming(ctx context.Context, conv *Conversation, userMessage string, ch chan<- Event) {
	if conv == nil {
		conv = &Conversation{}
	}

	// Only append a new user message if the conversation doesn't already have
	// pre-seeded messages (compaction uses pre-built messages from SubTask.Messages).
	if userMessage != "" {
		conv.Messages = append(conv.Messages, engine.ChatMessage{
			Role:    "user",
			Content: userMessage,
		})
	}

	tools := a.buildToolDefs()

	for turn := 0; ; turn++ {
		_ = turn // reserved for future logging
		select {
		case <-ctx.Done():
			ch <- Event{Type: EventError, Content: "cancelled"}
			return
		default:
		}

		messages := a.buildMessages(conv)

		if a.isOverflow(conv) && a.agent.Name != "compaction" {
			fmt.Fprintf(os.Stderr, "[monika] compaction: overflow detected (tokens=%d, limit=%d, messages=%d)\n",
				conv.TokenCount, a.contextLimit(), len(conv.Messages))
			if err := a.RunCompaction(ctx, conv, ch); err != nil {
				fmt.Fprintf(os.Stderr, "[monika] compaction: failed, proceeding with full context: %v\n", err)
			}
			messages = a.buildMessages(conv)
		}

		req := engine.ChatRequest{
			Provider: a.providerID,
			Model:    a.model,
			Messages: messages,
			Tools:    tools,
		}

		// Per-turn usage tracks tokens for this single API call.
		perTurnUsage := engine.Usage{}

		events, err := a.provider.StreamChat(ctx, req)
		if err != nil {
			ch <- Event{Type: EventError, Content: fmt.Sprintf("stream chat: %v", err)}
			return
		}

		var collected []engine.ChatEvent
		var textBuf strings.Builder
		var thinkingBuf strings.Builder
		flushTick := time.NewTicker(50 * time.Millisecond)
		defer flushTick.Stop()

		flushText := func() {
			if textBuf.Len() > 0 {
				ch <- Event{Type: EventTextDelta, Content: textBuf.String()}
				textBuf.Reset()
			}
		}
		flushThinking := func() {
			if thinkingBuf.Len() > 0 {
				ch <- Event{Type: EventThinking, Content: thinkingBuf.String()}
				thinkingBuf.Reset()
			}
		}
		flushAll := func() {
			flushThinking()
			flushText()
		}

		loop := true
		for loop {
			select {
			case <-ctx.Done():
				flushAll()
				ch <- Event{Type: EventError, Content: "cancelled"}
				return
			case <-flushTick.C:
				flushAll()
				continue
			case ev, ok := <-events:
				if !ok {
					loop = false
					break
				}
				collected = append(collected, ev)
				switch ev.Kind {
				case engine.EventContentDelta:
					if ev.ReasoningContent != "" {
						thinkingBuf.WriteString(ev.ReasoningContent)
					} else {
						textBuf.WriteString(ev.Text)
					}
					if utf8.RuneCountInString(textBuf.String()) >= 10 {
						flushText()
					}
					if utf8.RuneCountInString(thinkingBuf.String()) >= 10 {
						flushThinking()
					}
				case engine.EventToolCallStart:
						flushAll()
				case engine.EventToolCallEnd:
					flushAll()
					if ev.ToolCall != nil {
						ch <- Event{
							Type: EventToolDone,
							Tool: &ToolEvent{
								ID:    ev.ToolCall.ID,
								Name:  ev.ToolCall.Function.Name,
								Input: ev.ToolCall.Function.Arguments,
							},
						}
					}
				case engine.EventUsage:
					flushAll()
					perTurnUsage.InputTokens += ev.Usage.InputTokens
					perTurnUsage.OutputTokens += ev.Usage.OutputTokens
					perTurnUsage.TotalTokens += ev.Usage.TotalTokens
					perTurnUsage.ReasoningTokens += ev.Usage.ReasoningTokens
					perTurnUsage.CacheReadTokens += ev.Usage.CacheReadTokens
					perTurnUsage.CacheWriteTokens += ev.Usage.CacheWriteTokens
					conv.TokenCount = perTurnUsage.TotalTokens
					conv.TokenMax = a.contextLimit()
					ch <- Event{
						Type: EventUsage,
						Usage: UsageEvent{
							InputTokens:      perTurnUsage.InputTokens,
							OutputTokens:     perTurnUsage.OutputTokens,
							TotalTokens:      perTurnUsage.TotalTokens,
							ReasoningTokens:  perTurnUsage.ReasoningTokens,
							CacheReadTokens:  perTurnUsage.CacheReadTokens,
							CacheWriteTokens: perTurnUsage.CacheWriteTokens,
							ContextTokens:    perTurnUsage.TotalTokens,
							MaxContext:       a.contextLimit(),
						},
					}
				case engine.EventError:
					flushAll()
					ch <- Event{Type: EventError, Content: ev.Error.Message}
				case engine.EventMessageEnd:
					flushAll()
				}
			}
		}
		flushAll()

		result := parseResult(collected)
		if result.Error != nil {
			return
		}

		if len(result.ToolCalls) == 0 {
			usage := perTurnUsage // copy
			conv.Messages = append(conv.Messages, engine.ChatMessage{
				Role:             "assistant",
				Content:          result.Content,
				ReasoningContent: result.ReasoningContent,
				TokenUsage:       &usage,
			})
			ch <- Event{Type: EventDone}
			return
		}

		usage := perTurnUsage // copy
		conv.Messages = append(conv.Messages, engine.ChatMessage{
			Role:             "assistant",
			ReasoningContent: result.ReasoningContent,
			ToolCalls:        result.ToolCalls,
			TokenUsage:       &usage,
		})

		// Deduplicate tool calls within a turn: same name + same args
		// executes once and reuses the result for every duplicate ID.
		type dedupKey struct {
			name string
			args string
		}
		type cachedResult struct {
			output string
			status string
		}
		executed := make(map[dedupKey]cachedResult)

		for _, tc := range result.ToolCalls {
			select {
			case <-ctx.Done():
				return
			default:
			}

			dk := dedupKey{name: tc.Function.Name, args: tc.Function.Arguments}
			if cached, ok := executed[dk]; ok {
				ch <- Event{Type: EventToolOutput, Tool: &ToolEvent{
					ID: tc.ID, Name: tc.Function.Name,
					Input: tc.Function.Arguments, Output: cached.output, Status: cached.status,
				}}
				content := cached.output
				if cached.status == "error" {
					content = "error: " + content
				}
				conv.Messages = append(conv.Messages, engine.ChatMessage{
					Role: "tool", Content: content,
					ToolCallID: tc.ID, Name: tc.Function.Name,
				})
				continue
			}

			ch <- Event{
				Type: EventToolStart,
				Tool: &ToolEvent{
					ID: tc.ID, Name: tc.Function.Name,
					Input: tc.Function.Arguments,
				},
			}

			t, ok := a.tools.Get(tc.Function.Name)
			if !ok {
				// Try MCP tools
				found := false
				if a.mcpRegistry != nil {
					for _, conn := range a.mcpRegistry.GetConnections() {
						tools, lerr := conn.ListTools(ctx)
						if lerr != nil {
							continue
						}
						for _, mt := range tools {
							if mt.Name == tc.Function.Name {
								result, cerr := conn.CallTool(ctx, tc.Function.Name, json.RawMessage(tc.Function.Arguments))
								if cerr != nil {
									errMsg := fmt.Sprintf("MCP tool %s error: %s", tc.Function.Name, cerr)
									ch <- Event{
										Type: EventToolOutput,
										Tool: &ToolEvent{
											ID: tc.ID, Name: tc.Function.Name,
											Input: tc.Function.Arguments, Output: errMsg, Status: "error",
										},
									}
									executed[dk] = cachedResult{output: errMsg, status: "error"}
									conv.Messages = append(conv.Messages, engine.ChatMessage{
										Role: "tool", Content: errMsg,
										ToolCallID: tc.ID, Name: tc.Function.Name,
									})
								} else {
									content := string(result)
									ch <- Event{
										Type: EventToolOutput,
										Tool: &ToolEvent{
											ID: tc.ID, Name: tc.Function.Name,
											Input: tc.Function.Arguments, Output: content, Status: "done",
										},
									}
									executed[dk] = cachedResult{output: content, status: "done"}
									conv.Messages = append(conv.Messages, engine.ChatMessage{
										Role: "tool", Content: content,
										ToolCallID: tc.ID, Name: tc.Function.Name,
									})
								}
								found = true
								break
							}
						}
						if found {
							break
						}
					}
				}
				if !found {
					errMsg := fmt.Sprintf("tool %s not found", tc.Function.Name)
					ch <- Event{
						Type: EventToolOutput,
						Tool: &ToolEvent{
							ID: tc.ID, Name: tc.Function.Name,
							Input: tc.Function.Arguments, Output: errMsg, Status: "error",
						},
					}
					executed[dk] = cachedResult{output: errMsg, status: "error"}
					conv.Messages = append(conv.Messages, engine.ChatMessage{
						Role: "tool", Content: errMsg,
						ToolCallID: tc.ID,
					})
				}
				continue
			}

			if a.pipeline != nil {
				pctx := permission.CheckContext{
					ToolName:   tc.Function.Name,
					Args:       json.RawMessage(tc.Function.Arguments),
					SessionID:  a.sessionID,
					ProjectDir: a.projectDir,
				}
				if a.pipeline.Check(ctx, pctx) == permission.Deny {
					ch <- Event{
						Type: EventToolOutput,
						Tool: &ToolEvent{
							ID:     tc.ID,
							Name:   tc.Function.Name,
							Input:  tc.Function.Arguments,
							Output: "execution denied by user",
							Status: "denied",
						},
					}
					executed[dk] = cachedResult{output: "execution denied by user", status: "denied"}
					conv.Messages = append(conv.Messages, engine.ChatMessage{
						Role:       "tool",
						Content:    fmt.Sprintf("execution of %s was denied by user", tc.Function.Name),
						ToolCallID: tc.ID,
					})
					continue
				}
			}

			toolCtx := tool.WithProjectDir(ctx, a.projectDir)
			if a.sessionID != "" {
				toolCtx = tool.WithSessionID(toolCtx, a.sessionID)
			}
			toolCtx = tool.WithToolCallID(toolCtx, tc.ID)
			if a.model != "" {
				toolCtx = tool.WithModel(toolCtx, a.model)
			}
			if a.providerID != "" {
				toolCtx = tool.WithProvider(toolCtx, a.providerID)
			}
			if a.askUserFn != nil {
				toolCtx = tool.WithAskUserFunc(toolCtx, a.askUserFn)
			}
			// Check for streaming execution (e.g. SpawnAgent forwards child events)
			type streamingTool interface {
				ExecuteStreaming(ctx context.Context, args json.RawMessage) (<-chan Event, error)
			}
			if st, ok := t.(streamingTool); ok {
				eventCh, execErr := st.ExecuteStreaming(toolCtx, json.RawMessage(tc.Function.Arguments))
				if execErr != nil {
					ch <- Event{Type: EventToolOutput, Tool: &ToolEvent{
						ID: tc.ID, Name: tc.Function.Name,
						Input: tc.Function.Arguments, Output: execErr.Error(), Status: "error",
					}}
					executed[dk] = cachedResult{output: execErr.Error(), status: "error"}
					conv.Messages = append(conv.Messages, engine.ChatMessage{
						Role: "tool", Content: fmt.Sprintf("error: %s", execErr),
						ToolCallID: tc.ID, Name: tc.Function.Name,
					})
					continue
				}
				var streamOutput strings.Builder
				childSID := tc.ID // tool call ID = child session ID
			streamLoop:
				for ev := range eventCh {
					ev.SessionID = childSID // tag so frontend routes to child tab
					switch ev.Type {
					case EventToolStart:
						streamOutput.Reset()
						select {
						case ch <- ev:
						case <-ctx.Done():
							break streamLoop
						}
					case EventTextDelta:
						select {
						case ch <- ev:
						default:
						}
						streamOutput.WriteString(ev.Content)
					case EventThinking:
						select {
						case ch <- ev:
						case <-ctx.Done():
							break streamLoop
						}
					case EventToolDone, EventToolOutput:
						select {
						case ch <- ev:
						case <-ctx.Done():
							break streamLoop
						}
					case EventError:
						select {
						case ch <- ev:
						case <-ctx.Done():
							break streamLoop
						}
					default:
						select {
						case ch <- ev:
						case <-ctx.Done():
							break streamLoop
						}
					}
				}
				toolContent := streamOutput.String()
				if toolContent == "" {
					toolContent = "(subtask completed with no output)"
				}
				executed[dk] = cachedResult{output: toolContent, status: "done"}
				ch <- Event{Type: EventToolOutput, Tool: &ToolEvent{
					ID: tc.ID, Name: tc.Function.Name,
					Input: tc.Function.Arguments, Output: toolContent, Status: "done",
				}}
				conv.Messages = append(conv.Messages, engine.ChatMessage{
					Role: "tool", Content: toolContent,
					ToolCallID: tc.ID, Name: tc.Function.Name,
				})
				continue
			}
			execResult, err := t.Execute(toolCtx, json.RawMessage(tc.Function.Arguments))
			if err != nil {
				ch <- Event{
					Type: EventToolOutput,
					Tool: &ToolEvent{
						ID:     tc.ID,
						Input:  tc.Function.Arguments,
						Output: err.Error(),
						Status: "error",
					},
				}
				executed[dk] = cachedResult{output: err.Error(), status: "error"}
				conv.Messages = append(conv.Messages, engine.ChatMessage{
					Role:       "tool",
					Content:    fmt.Sprintf("error executing %s: %s", tc.Function.Name, err),
					ToolCallID: tc.ID,
					Name:       tc.Function.Name,
				})
				continue
			}

			toolContent := execResult.Content
			if execResult.IsError {
				toolContent = "error: " + toolContent
			}
			status := "done"
			if execResult.IsError {
				status = "error"
				executed[dk] = cachedResult{output: execResult.Content, status: "error"}
			} else {
				executed[dk] = cachedResult{output: execResult.Content, status: "done"}
			}
			ch <- Event{
				Type: EventToolOutput,
				Tool: &ToolEvent{
					ID:        tc.ID,
					Name:      tc.Function.Name,
					Input:     tc.Function.Arguments,
					Output:    execResult.Content,
					Status:    status,
					DiffLines: execResult.DiffLines,
				},
			}

			conv.Messages = append(conv.Messages, engine.ChatMessage{
				Role:       "tool",
				Content:    toolContent,
				ToolCallID: tc.ID,
				Name:       tc.Function.Name,
			})
		}

		ch <- Event{Type: EventTurnStart}
	}
}

// EstimateContextTokens runs a chars/4 estimate over all messages. This is only
// used for internal compaction calculations (tail selection / preserve budget).
// Overflow detection uses API-reported token counts.
func (a *AgentLoop) EstimateContextTokens(conv *Conversation) int64 {
	msgs := a.buildMessages(conv)
	tokenMsgs := make([]tokenizer.Message, len(msgs))
	for i, m := range msgs {
		tokenMsgs[i] = tokenizer.Message{
			Role:             m.Role,
			Content:          m.Content,
			ReasoningContent: m.ReasoningContent,
		}
	}
	return int64(tokenizer.CountMessages(tokenMsgs))
}

func (a *AgentLoop) buildMessages(conv *Conversation) []engine.ChatMessage {
	var messages []engine.ChatMessage

	msgs := conv.Messages
	if conv.CompactionFrom > 0 && conv.CompactionFrom < len(msgs) {
		msgs = msgs[conv.CompactionFrom:]
	}

	// Extract compaction summary from messages and inject into system prompt.
	// The compaction_summary is stored as an assistant message for display but
	// must not be sent as assistant to the LLM (breaks system->user ordering).
	var summaryContent string
	var filteredMsgs []engine.ChatMessage
	for _, m := range msgs {
		if m.Name == "compaction_summary" && m.Role == "assistant" {
			summaryContent = m.Content
			continue
		}
		filteredMsgs = append(filteredMsgs, m)
	}

	if a.systemPrompt != "" || summaryContent != "" {
		var parts []string
		if a.systemPrompt != "" {
			normalized := strings.ReplaceAll(a.projectDir, "\\", "/")
			parts = append(parts, strings.ReplaceAll(a.systemPrompt, "{{WorkingDirectory}}", normalized))
		}
		if summaryContent != "" {
			parts = append(parts, "\n\n<context-summary>\n"+summaryContent+"\n</context-summary>")
		}
		messages = append(messages, engine.ChatMessage{
			Role:    "system",
			Content: strings.Join(parts, ""),
		})
	}

	messages = append(messages, filteredMsgs...)
	return sanitizeToolCallPairs(messages)
}

// sanitizeToolCallPairs ensures every assistant message with tool_calls
// is followed by tool response messages for each tool_call_id.
// If the session was interrupted during tool execution, synthetic error
// responses are appended for any missing tool_call_ids.
func sanitizeToolCallPairs(messages []engine.ChatMessage) []engine.ChatMessage {
	if len(messages) == 0 {
		return messages
	}

	var result []engine.ChatMessage
	for i := 0; i < len(messages); i++ {
		msg := messages[i]
		result = append(result, msg)

		if msg.Role == "assistant" && len(msg.ToolCalls) > 0 {
			// Collect tool_call_ids that need responses
			needResponses := make(map[string]string) // id -> tool name
			for _, tc := range msg.ToolCalls {
				needResponses[tc.ID] = tc.Function.Name
			}

			// Scan subsequent tool messages to find which IDs are already answered
			for j := i + 1; j < len(messages) && len(needResponses) > 0; j++ {
				if messages[j].Role != "tool" {
					break
				}
				delete(needResponses, messages[j].ToolCallID)
			}

			// Append synthetic error responses for any missing IDs
			for id, name := range needResponses {
				result = append(result, engine.ChatMessage{
					Role:       "tool",
					Content:    fmt.Sprintf("Tool execution was interrupted before %s could complete.", name),
					ToolCallID: id,
					Name:       name,
				})
			}
		}
	}
	return result
}

func (a *AgentLoop) buildToolDefs() []engine.ToolDef {
	if a.agent.Name == "compaction" {
		return nil
	}
	tools := a.tools.List()
	mcpLen := 0
	if a.mcpRegistry != nil {
		mcpLen = a.mcpRegistry.LenTools()
	}
	n := len(tools) + mcpLen
	defs := make([]engine.ToolDef, 0, n)
	isChild := isChildSession(a.sessionID)
	for _, t := range tools {
		if isChild && (t.Name() == "spawn_agent" || t.Name() == "ask_user") {
			continue
		}
		defs = append(defs, engine.ToolDef{
			Type: "function",
			Function: engine.ToolFunction{
				Name:        t.Name(),
				Description: t.Description(),
				Parameters:  t.Parameters(),
			},
		})
	}
	// Append MCP tools
	if a.mcpRegistry != nil {
		for _, mt := range a.mcpRegistry.GetTools() {
			var params map[string]any
			if len(mt.InputSchema) > 0 {
				json.Unmarshal(mt.InputSchema, &params)
			}
			defs = append(defs, engine.ToolDef{
				Type: "function",
				Function: engine.ToolFunction{
					Name:        mt.Name,
					Description: mt.Description,
					Parameters:  params,
				},
			})
		}
	}
	return defs
}
