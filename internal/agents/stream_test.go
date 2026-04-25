package agents

import "testing"

func TestAggregateEventsCollectsContentAndUsage(t *testing.T) {
	events := []ChatEvent{
		{Kind: ContentDelta, Text: "hello"},
		{Kind: ContentDelta, Text: " world"},
		{Kind: UsageEvent, Usage: Usage{InputTokens: 2, OutputTokens: 3, TotalTokens: 5}},
		{Kind: MessageEnd, FinishReason: "stop"},
	}

	msg, err := AggregateEvents(events)
	if err != nil {
		t.Fatal(err)
	}
	if msg.Content != "hello world" {
		t.Fatalf("content = %q", msg.Content)
	}
	if msg.Usage.TotalTokens != 5 {
		t.Fatalf("usage = %#v", msg.Usage)
	}
	if msg.FinishReason != "stop" {
		t.Fatalf("finish reason = %q", msg.FinishReason)
	}
}

func TestAggregateEventsReturnsProviderError(t *testing.T) {
	_, err := AggregateEvents([]ChatEvent{{Kind: ErrorEvent, ProviderError: ProviderError{Code: "auth_failed", Message: "missing key"}}})
	if err == nil {
		t.Fatal("expected provider error")
	}
}
