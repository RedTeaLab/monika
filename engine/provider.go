package engine

import "context"

type ChatRequest struct {
	Provider string
	Model    string
	Messages []ChatMessage
}

type ChatMessage struct {
	Role    string
	Content string
}

type ChatEvent struct {
	Kind     EventKind
	Text     string
	ToolCall *ToolCall
	Usage    Usage
	Error    ProviderError
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
	ID        string
	Name      string
	Arguments string
}

type Usage struct {
	InputTokens  int64
	OutputTokens int64
	TotalTokens  int64
}

type ProviderError struct {
	Code    string
	Message string
}

type Model struct {
	ID          string
	DisplayName string
}

type ProviderEngine interface {
	Engine
	StreamChat(ctx context.Context, req ChatRequest) ([]ChatEvent, error)
	ListModels(ctx context.Context) ([]Model, error)
}
