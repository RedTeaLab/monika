package agent

import (
	"context"
	"encoding/json"
	"fmt"

	"monika/internal/tool"
	"monika/pkg/engine"
)

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

		result := parseResult(events)
		if result.Error != nil {
			return nil, result.Error
		}

		totalUsage.InputTokens += result.Usage.InputTokens
		totalUsage.OutputTokens += result.Usage.OutputTokens
		totalUsage.TotalTokens += result.Usage.TotalTokens

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
