package engine

import "context"

type ChatRequest struct {
	Provider string
	Model    string
	Messages []ChatMessage
	Tools    []ToolDef
}

type ChatMessage struct {
	Role             string     `json:"role"`
	Content          string     `json:"content"`
	ReasoningContent string     `json:"reasoning_content"`
	ToolCalls        []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID       string     `json:"tool_call_id,omitempty"`
	Name             string     `json:"name,omitempty"`
}

type ChatEvent struct {
	Kind             EventKind
	Text             string
	ReasoningContent string
	ToolCall         *ToolCall
	Usage            Usage
	Error            ProviderError
}

type EventKind int

const (
	EventContentDelta EventKind = iota
	EventToolCallStart
	EventToolCallDelta
	EventToolCallEnd
	EventUsage
	EventError
	EventMessageEnd
)

type ToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function ToolCallFunc `json:"function"`
}

type ToolCallFunc struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type Usage struct {
	InputTokens      int64
	OutputTokens     int64
	TotalTokens      int64
	ReasoningTokens  int64
	CacheReadTokens  int64
	CacheWriteTokens int64
}

// ContextTokens returns the effective context usage (input minus cache reads).
func (u Usage) ContextTokens() int64 {
	if u.CacheReadTokens > u.InputTokens {
		return 0
	}
	return u.InputTokens - u.CacheReadTokens
}

type ProviderError struct {
	Code    string
	Message string
}

type Model struct {
	ID          string
	DisplayName string
}

type ToolDef struct {
	Type     string       `json:"type"`
	Function ToolFunction `json:"function"`
}

type ToolFunction struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

type ProviderEngine interface {
	Engine
	StreamChat(ctx context.Context, req ChatRequest) (<-chan ChatEvent, error)
	ListModels(ctx context.Context) ([]Model, error)
}
