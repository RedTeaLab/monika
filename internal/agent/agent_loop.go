package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"
	"unicode/utf8"

	"monika/internal/tool"
	"monika/pkg/engine"
	"monika/pkg/tokenizer"
)

// Model context window limits (in tokens). These are conservative defaults
// used for client-side estimation; the API response usage is authoritative.
var modelContextLimits = map[string]int64{
	"gpt-4o":              128000,
	"gpt-4o-mini":         128000,
	"gpt-4":               8192,
	"gpt-4-turbo":         128000,
	"gpt-3.5-turbo":       16385,
	"deepseek-chat":       131072,
	"deepseek-reasoner":   131072,
	"claude-3-opus":       200000,
	"claude-3.5-sonnet":   200000,
	"claude-3.7-sonnet":   200000,
}

var modelOutputLimits = map[string]int64{
	"gpt-4o":            16384,
	"gpt-4o-mini":       16384,
	"gpt-4-turbo":       4096,
	"gpt-4":             4096,
	"gpt-3.5-turbo":     4096,
	"deepseek-chat":     32768,
	"deepseek-reasoner": 32768,
	"claude-3-opus":     4096,
	"claude-3.5-sonnet": 8192,
	"claude-3.7-sonnet": 8192,
}

func outputLimit(model string) int64 {
	if limit, ok := modelOutputLimits[model]; ok {
		return limit
	}
	return 32768
}

func contextLimit(model string) int64 {
	if limit, ok := modelContextLimits[model]; ok {
		return limit
	}
	return 128000
}

type Conversation struct {
	ID               string
	Messages         []engine.ChatMessage
	ArchivedMessages []engine.ChatMessage
	TokenCount       int64
	TokenMax         int64
	CompactionCount  int
}

const compactionBuffer = 20_000

func (a *AgentLoop) isOverflow(conv *Conversation) bool {
	limit := contextLimit(a.model)
	outputMax := outputLimit(a.model)
	usable := limit - outputMax - compactionBuffer
	if usable <= 0 {
		usable = limit / 2
	}
	estimated := a.estimateContextTokens(conv)
	conv.TokenCount = estimated
	conv.TokenMax = limit
	return estimated > usable
}

func (a *AgentLoop) buildCompactionPrompt(conv *Conversation) []engine.ChatMessage {
	prompt := `You are a conversation summarizer. Summarize the conversation below.
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
- If these cannot fit, prioritize goals > decisions > discoveries`

	var b strings.Builder
	for _, m := range conv.Messages {
		if m.ReasoningContent != "" {
			b.WriteString(fmt.Sprintf("[%s reasoning]: %s\n", m.Role, m.ReasoningContent))
		}
		b.WriteString(fmt.Sprintf("[%s]: %s\n", m.Role, m.Content))
		for _, tc := range m.ToolCalls {
			b.WriteString(fmt.Sprintf("  [tool_call %s]: %s\n", tc.Function.Name, tc.Function.Arguments))
		}
	}

	return []engine.ChatMessage{
		{Role: "user", Content: prompt},
		{Role: "user", Content: "Here is the conversation to summarize:\n\n" + b.String()},
	}
}

func (a *AgentLoop) rewriteMessages(conv *Conversation, summary string) {
	// Archive original messages before compaction
	conv.ArchivedMessages = make([]engine.ChatMessage, len(conv.Messages))
	copy(conv.ArchivedMessages, conv.Messages)

	limit := contextLimit(a.model)
	preserveBudget := int64(float64(limit) * 0.25)

	// Walk backwards from end to find token-based retention window
	var keepFrom int
	var runningTokens int64
	for i := len(conv.Messages) - 1; i >= 0; i-- {
		m := conv.Messages[i]
		runningTokens += int64(tokenizer.Count(m.Role))
		runningTokens += int64(tokenizer.Count(m.Content))
		runningTokens += int64(tokenizer.Count(m.ReasoningContent))
		runningTokens += 4
		if runningTokens > preserveBudget && i < len(conv.Messages)-1 {
			keepFrom = i + 1
			// Align to turn boundary: find next user message
			for keepFrom < len(conv.Messages) && conv.Messages[keepFrom].Role != "user" {
				keepFrom++
			}
			if keepFrom >= len(conv.Messages) {
				keepFrom = len(conv.Messages) - 1
			}
			break
		}
	}

	// Ensure at least the last complete turn is preserved
	lastUserIdx := -1
	for i := len(conv.Messages) - 1; i >= 0; i-- {
		if conv.Messages[i].Role == "user" {
			lastUserIdx = i
			break
		}
	}
	if lastUserIdx >= 0 && keepFrom > lastUserIdx {
		keepFrom = lastUserIdx
	}

	summaryMsg := engine.ChatMessage{
		Role:    "assistant",
		Name:    "compaction_summary",
		Content: summary,
	}

	recent := make([]engine.ChatMessage, len(conv.Messages)-keepFrom)
	copy(recent, conv.Messages[keepFrom:])

	conv.Messages = append([]engine.ChatMessage{summaryMsg}, recent...)
	conv.CompactionCount++
	conv.TokenCount = a.estimateContextTokens(conv)
}

func (a *AgentLoop) runCompaction(ctx context.Context, conv *Conversation, ch chan<- Event) error {
	beforeTokens := conv.TokenCount

	prompt := a.buildCompactionPrompt(conv)
	req := engine.ChatRequest{
		Provider: a.providerID,
		Model:    a.model,
		Messages: prompt,
	}

	events, err := a.provider.StreamChat(ctx, req)
	if err != nil {
		return fmt.Errorf("compaction stream chat: %w", err)
	}

	var summary strings.Builder
	for ev := range events {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		switch ev.Kind {
		case engine.EventContentDelta:
			summary.WriteString(ev.Text)
		case engine.EventError:
			return fmt.Errorf("compaction provider error: %s", ev.Error.Message)
		}
	}

	result := summary.String()
	if result == "" {
		return fmt.Errorf("compaction returned empty summary")
	}

	a.rewriteMessages(conv, result)

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

func (a *AgentLoop) rewriteMessagesTruncate(conv *Conversation) {
	conv.ArchivedMessages = make([]engine.ChatMessage, len(conv.Messages))
	copy(conv.ArchivedMessages, conv.Messages)

	limit := contextLimit(a.model)
	budget := int64(float64(limit) * 0.25)
	var running int64
	keepFrom := len(conv.Messages) - 1
	for i := len(conv.Messages) - 1; i >= 0; i-- {
		m := conv.Messages[i]
		running += int64(tokenizer.Count(m.Role) + tokenizer.Count(m.Content) + tokenizer.Count(m.ReasoningContent) + 4)
		if running > budget && i < len(conv.Messages)-1 {
			keepFrom = i + 1
			break
		}
	}
	for keepFrom < len(conv.Messages) && conv.Messages[keepFrom].Role != "user" {
		keepFrom++
	}
	if keepFrom >= len(conv.Messages) {
		keepFrom = len(conv.Messages) - 1
	}
	conv.Messages = conv.Messages[keepFrom:]
	conv.CompactionCount++
	conv.TokenCount = a.estimateContextTokens(conv)
}

type LoopResult struct {
	Conversation *Conversation
	Content      string
	Usage        engine.Usage
}

type AgentLoop struct {
	provider     engine.ProviderEngine
	tools        *tool.ToolRegistry
	systemPrompt string
	confirmFn    func(tool.Tool, json.RawMessage) bool
	projectDir   string
	model        string
	sessionID    string
	providerID   string
}

type LoopOption func(*AgentLoop)

func WithSystemPrompt(prompt string) LoopOption {
	return func(a *AgentLoop) {
		a.systemPrompt = prompt
	}
}

func WithConfirmFunc(fn func(tool.Tool, json.RawMessage) bool) LoopOption {
	return func(a *AgentLoop) {
		a.confirmFn = fn
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


func (a *AgentLoop) Run(ctx context.Context, conv *Conversation, userMessage string) (*LoopResult, error) {
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
			conv.Messages = append(conv.Messages, engine.ChatMessage{
				Role:             "assistant",
				Content:          result.Content,
				ReasoningContent: result.ReasoningContent,
			})
			return &LoopResult{
				Conversation: conv,
				Content:      result.Content,
				Usage:        totalUsage,
			}, nil
		}

		conv.Messages = append(conv.Messages, engine.ChatMessage{
			Role:             "assistant",
			ReasoningContent: result.ReasoningContent,
			ToolCalls:        result.ToolCalls,
		})

		for _, tc := range result.ToolCalls {
			t, ok := a.tools.Get(tc.Function.Name)
			if !ok {
				conv.Messages = append(conv.Messages, engine.ChatMessage{
					Role:       "tool",
					Content:    fmt.Sprintf("tool %s not found", tc.Function.Name),
					ToolCallID: tc.ID,
				})
				continue
			}

			if a.confirmFn != nil && !a.confirmFn(t, json.RawMessage(tc.Function.Arguments)) {
				conv.Messages = append(conv.Messages, engine.ChatMessage{
					Role:       "tool",
					Content:    fmt.Sprintf("execution of %s was denied by user", tc.Function.Name),
					ToolCallID: tc.ID,
				})
				continue
			}

			toolCtx := tool.WithProjectDir(ctx, a.projectDir)
			if a.sessionID != "" {
				toolCtx = tool.WithSessionID(toolCtx, a.sessionID)
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

func (a *AgentLoop) RunStreaming(ctx context.Context, conv *Conversation, userMessage string) <-chan Event {
	ch := make(chan Event, 64)
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

	conv.Messages = append(conv.Messages, engine.ChatMessage{
		Role:    "user",
		Content: userMessage,
	})

	tools := a.buildToolDefs()
	var totalUsage engine.Usage

	for turn := 0; ; turn++ {
		_ = turn // reserved for future logging
		select {
		case <-ctx.Done():
			ch <- Event{Type: EventError, Content: "cancelled"}
			return
		default:
		}

		messages := a.buildMessages(conv)

		if a.isOverflow(conv) {
			ch <- Event{
				Type:       EventCompacting,
				Compacting: &CompactingEvent{},
			}
			if err := a.runCompaction(ctx, conv, ch); err != nil {
				beforeTokens := conv.TokenCount
				a.rewriteMessagesTruncate(conv)
				ch <- Event{
					Type: EventCompaction,
					Compaction: &CompactionEvent{
						BeforeTokens:  beforeTokens,
						AfterTokens:   a.estimateContextTokens(conv),
						CompactionNum: conv.CompactionCount,
						Summary:       "(truncated \u2014 compaction failed: " + err.Error() + ")",
					},
				}
			}
			messages = a.buildMessages(conv)
		}

		req := engine.ChatRequest{
			Provider: a.providerID,
			Model:    a.model,
			Messages: messages,
			Tools:    tools,
		}

		if turn == 0 {
			conv.TokenCount = a.estimateContextTokens(conv)
			conv.TokenMax = contextLimit(a.model)
			ch <- Event{
				Type: EventUsage,
				Usage: UsageEvent{
					TotalTokens:   conv.TokenCount,
					ContextTokens: conv.TokenCount,
					MaxContext:    conv.TokenMax,
				},
			}
		}

		events, err := a.provider.StreamChat(ctx, req)
		if err != nil {
			ch <- Event{Type: EventError, Content: fmt.Sprintf("stream chat: %v", err)}
			return
		}

		var collected []engine.ChatEvent
		var textBuf strings.Builder
		var thinkingBuf strings.Builder
		flushTick := time.NewTicker(30 * time.Millisecond)
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
					if ev.ToolCall != nil {
						ch <- Event{
							Type: EventToolStart,
							Tool: &ToolEvent{
								ID:    ev.ToolCall.ID,
								Name:  ev.ToolCall.Function.Name,
								Input: ev.ToolCall.Function.Arguments,
							},
						}
					}
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
					totalUsage.InputTokens += ev.Usage.InputTokens
					totalUsage.OutputTokens += ev.Usage.OutputTokens
					totalUsage.TotalTokens += ev.Usage.TotalTokens
					totalUsage.ReasoningTokens += ev.Usage.ReasoningTokens
					totalUsage.CacheReadTokens += ev.Usage.CacheReadTokens
					totalUsage.CacheWriteTokens += ev.Usage.CacheWriteTokens
					ch <- Event{
						Type: EventUsage,
						Usage: UsageEvent{
							InputTokens:      totalUsage.InputTokens,
							OutputTokens:     totalUsage.OutputTokens,
							TotalTokens:      totalUsage.TotalTokens,
							ReasoningTokens:  totalUsage.ReasoningTokens,
							CacheReadTokens:  totalUsage.CacheReadTokens,
							CacheWriteTokens: totalUsage.CacheWriteTokens,
							ContextTokens:    totalUsage.ContextTokens(),
							MaxContext:       contextLimit(a.model),
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
			conv.Messages = append(conv.Messages, engine.ChatMessage{
				Role:             "assistant",
				Content:          result.Content,
				ReasoningContent: result.ReasoningContent,
			})
			ch <- Event{Type: EventDone}
			return
		}

		conv.Messages = append(conv.Messages, engine.ChatMessage{
			Role:             "assistant",
			ReasoningContent: result.ReasoningContent,
			ToolCalls:        result.ToolCalls,
		})

		for _, tc := range result.ToolCalls {
			select {
			case <-ctx.Done():
				return
			default:
			}

			t, ok := a.tools.Get(tc.Function.Name)
			if !ok {
				ch <- Event{
					Type: EventToolOutput,
					Tool: &ToolEvent{
						ID:     tc.ID,
						Name:   tc.Function.Name,
						Input:  tc.Function.Arguments,
						Output: fmt.Sprintf("tool %s not found", tc.Function.Name),
						Status: "error",
					},
				}
				conv.Messages = append(conv.Messages, engine.ChatMessage{
					Role:       "tool",
					Content:    fmt.Sprintf("tool %s not found", tc.Function.Name),
					ToolCallID: tc.ID,
				})
				continue
			}

			if a.confirmFn != nil && !a.confirmFn(t, json.RawMessage(tc.Function.Arguments)) {
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
				conv.Messages = append(conv.Messages, engine.ChatMessage{
					Role:       "tool",
					Content:    fmt.Sprintf("execution of %s was denied by user", tc.Function.Name),
					ToolCallID: tc.ID,
				})
				continue
			}

			toolCtx := tool.WithProjectDir(ctx, a.projectDir)
			if a.sessionID != "" {
				toolCtx = tool.WithSessionID(toolCtx, a.sessionID)
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

			ch <- Event{
				Type: EventToolOutput,
				Tool: &ToolEvent{
					ID:     tc.ID,
					Name:   tc.Function.Name,
					Input:  tc.Function.Arguments,
					Output: execResult.Content,
					Status: "done",
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

// estimateContextTokens runs a client-side tiktoken estimate over all messages
// that will be sent to the model. This is the pre-flight estimate used when the
// API doesn't return usage data, or for context overflow warnings.
func (a *AgentLoop) estimateContextTokens(conv *Conversation) int64 {
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

	if a.systemPrompt != "" {
		normalized := strings.ReplaceAll(a.projectDir, "\\", "/")
		prompt := strings.ReplaceAll(a.systemPrompt, "{{WorkingDirectory}}", normalized)
		fmt.Fprintf(os.Stderr, "[monika DEBUG] buildMessages: a.projectDir=%q normalized=%q placeholderInPrompt=%v\n",
			a.projectDir, normalized, strings.Contains(a.systemPrompt, "{{WorkingDirectory}}"))
		messages = append(messages, engine.ChatMessage{
			Role:    "system",
			Content: prompt,
		})
	}

	messages = append(messages, conv.Messages...)
	return messages
}

func (a *AgentLoop) buildToolDefs() []engine.ToolDef {
	tools := a.tools.List()
	defs := make([]engine.ToolDef, 0, len(tools))
	for _, t := range tools {
		defs = append(defs, engine.ToolDef{
			Type: "function",
			Function: engine.ToolFunction{
				Name:        t.Name(),
				Description: t.Description(),
				Parameters:  t.Parameters(),
			},
		})
	}
	return defs
}
