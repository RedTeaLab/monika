package agent

import (
	"context"
	"errors"
	"testing"
)

type fakeProviderClient struct {
	events []ChatEvent
	err    error
}

func (f fakeProviderClient) StreamChat(ctx context.Context, req ChatRequest) ([]ChatEvent, error) {
	return f.events, f.err
}

func TestAgentInvokeAggregatesProviderStream(t *testing.T) {
	agent := NewAgent(fakeProviderClient{events: []ChatEvent{
		{Kind: ContentDelta, Text: "hi"},
		{Kind: MessageEnd, FinishReason: "stop"},
	}})

	got, err := agent.Invoke(context.Background(), "hello")
	if err != nil {
		t.Fatal(err)
	}
	if got != "hi" {
		t.Fatalf("response = %q", got)
	}
}

func TestAgentInvokePropagatesStreamChatError(t *testing.T) {
	sentinel := errors.New("connection refused")
	agent := NewAgent(fakeProviderClient{err: sentinel})

	_, err := agent.Invoke(context.Background(), "hello")
	if err == nil {
		t.Fatal("expected error from StreamChat, got nil")
	}
	if !errors.Is(err, sentinel) {
		t.Fatalf("error = %v, want %v", err, sentinel)
	}
}

func TestAgentInvokeBubblesAggregateError(t *testing.T) {
	agent := NewAgent(fakeProviderClient{events: []ChatEvent{
		{Kind: ErrorEvent, ProviderError: ProviderError{Code: "rate_limit", Message: "too many requests"}},
	}})

	_, err := agent.Invoke(context.Background(), "hello")
	if err == nil {
		t.Fatal("expected error from AggregateEvents, got nil")
	}
}

func TestAgentInvokeMessageEndOnlyReturnsEmptyContent(t *testing.T) {
	agent := NewAgent(fakeProviderClient{events: []ChatEvent{
		{Kind: MessageEnd, FinishReason: "stop"},
	}})

	got, err := agent.Invoke(context.Background(), "hello")
	if err != nil {
		t.Fatal(err)
	}
	if got != "" {
		t.Fatalf("response = %q, want empty", got)
	}
}
