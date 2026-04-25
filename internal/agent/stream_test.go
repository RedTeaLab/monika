package agent

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

func TestAggregateEventsEmptySlice(t *testing.T) {
	msg, err := AggregateEvents([]ChatEvent{})
	if err != nil {
		t.Fatal(err)
	}
	if msg.Content != "" {
		t.Fatalf("content = %q, want empty", msg.Content)
	}
	if msg.FinishReason != "" {
		t.Fatalf("finish reason = %q, want empty", msg.FinishReason)
	}
}

func TestAggregateEventsContentOnly(t *testing.T) {
	msg, err := AggregateEvents([]ChatEvent{
		{Kind: ContentDelta, Text: "just"},
		{Kind: ContentDelta, Text: " "},
		{Kind: ContentDelta, Text: "text"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if msg.Content != "just text" {
		t.Fatalf("content = %q", msg.Content)
	}
	if msg.Usage.TotalTokens != 0 {
		t.Fatalf("usage = %#v, want zero", msg.Usage)
	}
	if msg.FinishReason != "" {
		t.Fatalf("finish reason = %q, want empty", msg.FinishReason)
	}
}

func TestAggregateEventsLastUsageWins(t *testing.T) {
	msg, err := AggregateEvents([]ChatEvent{
		{Kind: UsageEvent, Usage: Usage{InputTokens: 1, OutputTokens: 2, TotalTokens: 3}},
		{Kind: UsageEvent, Usage: Usage{InputTokens: 4, OutputTokens: 5, TotalTokens: 9}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if msg.Usage.TotalTokens != 9 {
		t.Fatalf("usage total = %d, want 9", msg.Usage.TotalTokens)
	}
}

func TestAggregateEventsLastFinishWins(t *testing.T) {
	msg, err := AggregateEvents([]ChatEvent{
		{Kind: MessageEnd, FinishReason: "length"},
		{Kind: MessageEnd, FinishReason: "stop"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if msg.FinishReason != "stop" {
		t.Fatalf("finish reason = %q, want stop", msg.FinishReason)
	}
}

func TestAggregateEventsErrorEmptyCode(t *testing.T) {
	_, err := AggregateEvents([]ChatEvent{{Kind: ErrorEvent, ProviderError: ProviderError{Code: "", Message: "something happened"}}})
	if err == nil {
		t.Fatal("expected provider error")
	}
}
