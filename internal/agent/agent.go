// Package agent defines the core agent interface and streaming provider
// client abstraction used by monika to invoke AI providers.
package agent

import "context"

// Agent is the core abstraction for a monika coding agent. It accepts a
// user message and returns the assistant response.
type Agent interface {
	Invoke(ctx context.Context, message string) (string, error)
}

// ProviderClient is the streaming interface that AI provider plugins
// must implement to be used by the agent.
type ProviderClient interface {
	StreamChat(ctx context.Context, req ChatRequest) ([]ChatEvent, error)
}

// ChatRequest is a streaming request sent to a provider.
type ChatRequest struct {
	Messages []Message
}

// Message represents a single turn in a chat conversation.
type Message struct {
	Role    string // "user" or "assistant"
	Content string // The message body.
}

// AgentOption holds the provider client that backs an agent.
type AgentOption struct {
	Provider ProviderClient
}

// NewAgent creates an Agent backed by the given provider client.
func NewAgent(provider ProviderClient) Agent {
	return &AgentOption{Provider: provider}
}

// Invoke sends a user message to the backing provider, collects streaming
// events, and returns the aggregated assistant response.
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
