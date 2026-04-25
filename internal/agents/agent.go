package agents

import "context"

type Agent interface {
	Invoke(ctx context.Context, message string) (string, error)
}

type ProviderClient interface {
	StreamChat(ctx context.Context, req ChatRequest) ([]ChatEvent, error)
}

type ChatRequest struct {
	Messages []Message
}

type Message struct {
	Role    string
	Content string
}

type AgentOption struct {
	Provider ProviderClient
}

func NewAgent(provider ProviderClient) Agent {
	return &AgentOption{Provider: provider}
}

func (a *AgentOption) Invoke(ctx context.Context, message string) (string, error) {
	events, err := a.Provider.StreamChat(ctx, ChatRequest{Messages: []Message{{Role: "user", Content: message}}})
	if err != nil {
		return "", err
	}
	assistant, err := AggregateEvents(events)
	if err != nil {
		return "", err
	}
	return assistant.Content, nil
}
