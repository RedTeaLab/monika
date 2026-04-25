package agents

import (
	"context"
	"testing"
)

type fakeProviderClient struct {
	events []ChatEvent
}

func (f fakeProviderClient) StreamChat(ctx context.Context, req ChatRequest) ([]ChatEvent, error) {
	return f.events, nil
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
