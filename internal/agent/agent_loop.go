package agent

import (
	"context"
	"encoding/json"
	"fmt"

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

func contextLimit(model string) int64 {
	if limit, ok := modelContextLimits[model]; ok {
		return limit
	}
	return 128000
}

type Conversation struct {
	ID       string
	Messages []engine.ChatMessage
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
	maxTurns     int
	model        string
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

func WithMaxTurns(n int) LoopOption {
	return func(a *AgentLoop) {
		a.maxTurns = n
	}
}

func WithModel(model string) LoopOption {
	return func(a *AgentLoop) {
		a.model = model
	}
}

func NewLoop(provider engine.ProviderEngine, tools *tool.ToolRegistry, opts ...LoopOption) *AgentLoop {
	a := &AgentLoop{
		provider: provider,
		tools:    tools,
		maxTurns: 25,
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

	for turn := 0; turn < a.maxTurns; turn++ {
		messages := a.buildMessages(conv)

		req := engine.ChatRequest{
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

			execResult, err := t.Execute(ctx, json.RawMessage(tc.Function.Arguments))
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

	return nil, fmt.Errorf("agent: exceeded maximum turns (%d)", a.maxTurns)
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

	for turn := 0; turn < a.maxTurns; turn++ {
		select {
		case <-ctx.Done():
			ch <- Event{Type: EventError, Content: "cancelled"}
			return
		default:
		}

		messages := a.buildMessages(conv)
		req := engine.ChatRequest{
			Model:    a.model,
			Messages: messages,
			Tools:    tools,
		}

		if turn == 0 {
			estimated := a.estimateContextTokens(conv)
			limit := contextLimit(a.model)
			ch <- Event{
				Type: EventUsage,
				Usage: UsageEvent{
					TotalTokens: estimated,
					ContextTokens: estimated,
					MaxContext:  limit,
				},
			}
		}

		events, err := a.provider.StreamChat(ctx, req)
		if err != nil {
			ch <- Event{Type: EventError, Content: fmt.Sprintf("stream chat: %v", err)}
			return
		}

		var collected []engine.ChatEvent
		for ev := range events {
			collected = append(collected, ev)
			switch ev.Kind {
			case engine.EventContentDelta:
				if ev.ReasoningContent != "" {
					ch <- Event{Type: EventThinking, Content: ev.ReasoningContent}
				} else {
					ch <- Event{Type: EventTextDelta, Content: ev.Text}
				}
			case engine.EventToolCallStart:
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
				ch <- Event{Type: EventError, Content: ev.Error.Message}
			}
		}

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

			execResult, err := t.Execute(ctx, json.RawMessage(tc.Function.Arguments))
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

	ch <- Event{Type: EventError, Content: fmt.Sprintf("agent: exceeded maximum turns (%d)", a.maxTurns)}
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
		messages = append(messages, engine.ChatMessage{
			Role:    "system",
			Content: a.systemPrompt,
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
