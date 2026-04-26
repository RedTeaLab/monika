package agent

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"monika/internal/tool"
	"monika/pkg/engine"
)

type fakeProvider struct {
	streamFn func(context.Context, engine.ChatRequest) ([]engine.ChatEvent, error)
}

func (f *fakeProvider) ID() string                                     { return "fake" }
func (f *fakeProvider) Init(_ context.Context, _ map[string]any) error { return nil }
func (f *fakeProvider) Capabilities() []engine.Capability {
	return []engine.Capability{engine.CapProvider}
}
func (f *fakeProvider) Shutdown(_ context.Context) error { return nil }
func (f *fakeProvider) ListModels(_ context.Context) ([]engine.Model, error) {
	return nil, nil
}

func (f *fakeProvider) StreamChat(ctx context.Context, req engine.ChatRequest) ([]engine.ChatEvent, error) {
	if f.streamFn != nil {
		return f.streamFn(ctx, req)
	}
	return nil, nil
}

func staticProvider(events []engine.ChatEvent, err error) *fakeProvider {
	return &fakeProvider{
		streamFn: func(context.Context, engine.ChatRequest) ([]engine.ChatEvent, error) {
			return events, err
		},
	}
}

type fakeTool struct {
	name        string
	description string
	params      map[string]any
	result      tool.ExecutionResult
}

func (t *fakeTool) Name() string               { return t.name }
func (t *fakeTool) Description() string        { return t.description }
func (t *fakeTool) Parameters() map[string]any { return t.params }
func (t *fakeTool) Execute(_ context.Context, _ json.RawMessage) (tool.ExecutionResult, error) {
	return t.result, nil
}

func TestLoopRunReturnsContent(t *testing.T) {
	provider := staticProvider([]engine.ChatEvent{
		{Kind: engine.EventContentDelta, Text: "hello"},
		{Kind: engine.EventMessageEnd, Text: "stop"},
	}, nil)
	loop := NewLoop(provider, tool.NewRegistry())

	result, err := loop.Run(context.Background(), nil, "hi")
	if err != nil {
		t.Fatal(err)
	}
	if result.Content != "hello" {
		t.Fatalf("content = %q, want %q", result.Content, "hello")
	}
	if len(result.Conversation.Messages) < 2 {
		t.Fatalf("expected at least 2 messages in conversation, got %d", len(result.Conversation.Messages))
	}
}

func TestLoopRunPropagatesProviderError(t *testing.T) {
	sentinel := errors.New("connection refused")
	provider := staticProvider(nil, sentinel)
	loop := NewLoop(provider, tool.NewRegistry())

	_, err := loop.Run(context.Background(), nil, "hi")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestLoopRunToolCallLoop(t *testing.T) {
	events := [][]engine.ChatEvent{
		{
			{Kind: engine.EventToolCallStart, ToolCall: &engine.ToolCall{ID: "1", Type: "function", Function: engine.ToolCallFunc{Name: "test_tool"}}},
			{Kind: engine.EventToolCallDelta, ToolCall: &engine.ToolCall{ID: "1", Type: "function", Function: engine.ToolCallFunc{Name: "test_tool", Arguments: `{"key":"value"}`}}},
			{Kind: engine.EventToolCallEnd, ToolCall: &engine.ToolCall{ID: "1", Type: "function", Function: engine.ToolCallFunc{Name: "test_tool", Arguments: `{"key":"value"}`}}},
			{Kind: engine.EventMessageEnd, Text: "tool_calls"},
		},
		{
			{Kind: engine.EventContentDelta, Text: "done"},
			{Kind: engine.EventMessageEnd, Text: "stop"},
		},
	}
	callCount := 0
	provider := &fakeProvider{
		streamFn: func(_ context.Context, _ engine.ChatRequest) ([]engine.ChatEvent, error) {
			idx := callCount
			callCount++
			if idx >= len(events) {
				return nil, errors.New("too many calls")
			}
			return events[idx], nil
		},
	}

	registry := tool.NewRegistry()
	registry.Register(&fakeTool{
		name:        "test_tool",
		description: "a test tool",
		params:      map[string]any{"type": "object", "properties": map[string]any{}},
		result:      tool.ExecutionResult{Content: "tool result"},
	})

	loop := NewLoop(provider, registry)

	result, err := loop.Run(context.Background(), nil, "hi")
	if err != nil {
		t.Fatal(err)
	}
	if result.Content != "done" {
		t.Fatalf("content = %q, want %q", result.Content, "done")
	}
	if callCount != 2 {
		t.Fatalf("expected 2 StreamChat calls, got %d", callCount)
	}
}

func TestLoopRunExceedsMaxTurns(t *testing.T) {
	provider := &fakeProvider{
		streamFn: func(_ context.Context, _ engine.ChatRequest) ([]engine.ChatEvent, error) {
			return []engine.ChatEvent{
				{Kind: engine.EventToolCallEnd, ToolCall: &engine.ToolCall{ID: "1", Type: "function", Function: engine.ToolCallFunc{Name: "test_tool", Arguments: "{}"}}},
				{Kind: engine.EventMessageEnd, Text: "tool_calls"},
			}, nil
		},
	}

	registry := tool.NewRegistry()
	registry.Register(&fakeTool{
		name:   "test_tool",
		params: map[string]any{"type": "object", "properties": map[string]any{}},
		result: tool.ExecutionResult{Content: "result"},
	})

	loop := NewLoop(provider, registry, WithMaxTurns(3))

	_, err := loop.Run(context.Background(), nil, "hi")
	if err == nil {
		t.Fatal("expected error for exceeding max turns")
	}
}

func TestLoopRunToolNotFound(t *testing.T) {
	events := [][]engine.ChatEvent{
		{
			{Kind: engine.EventToolCallEnd, ToolCall: &engine.ToolCall{ID: "1", Type: "function", Function: engine.ToolCallFunc{Name: "missing", Arguments: "{}"}}},
			{Kind: engine.EventMessageEnd, Text: "tool_calls"},
		},
		{
			{Kind: engine.EventContentDelta, Text: "fallback"},
			{Kind: engine.EventMessageEnd, Text: "stop"},
		},
	}
	callCount := 0
	provider := &fakeProvider{
		streamFn: func(_ context.Context, _ engine.ChatRequest) ([]engine.ChatEvent, error) {
			idx := callCount
			callCount++
			if idx >= len(events) {
				return nil, nil
			}
			return events[idx], nil
		},
	}

	loop := NewLoop(provider, tool.NewRegistry())

	result, err := loop.Run(context.Background(), nil, "hi")
	if err != nil {
		t.Fatal(err)
	}
	if callCount != 2 {
		t.Fatalf("expected 2 calls (tool result feedback loop), got %d", callCount)
	}
	if result.Content != "fallback" {
		t.Fatalf("content = %q", result.Content)
	}
}

func TestParseResultContent(t *testing.T) {
	result := parseResult([]engine.ChatEvent{
		{Kind: engine.EventContentDelta, Text: "hel"},
		{Kind: engine.EventContentDelta, Text: "lo"},
		{Kind: engine.EventUsage, Usage: engine.Usage{InputTokens: 2, OutputTokens: 1, TotalTokens: 3}},
		{Kind: engine.EventMessageEnd, Text: "stop"},
	})

	if result.Content != "hello" {
		t.Fatalf("content = %q", result.Content)
	}
	if result.Usage.TotalTokens != 3 {
		t.Fatalf("usage = %v", result.Usage)
	}
}

func TestParseResultToolCalls(t *testing.T) {
	result := parseResult([]engine.ChatEvent{
		{Kind: engine.EventToolCallEnd, ToolCall: &engine.ToolCall{ID: "1", Type: "function", Function: engine.ToolCallFunc{Name: "bash", Arguments: `{"cmd":"ls"}`}}},
		{Kind: engine.EventToolCallEnd, ToolCall: &engine.ToolCall{ID: "2", Type: "function", Function: engine.ToolCallFunc{Name: "grep", Arguments: `{"pattern":"foo"}`}}},
		{Kind: engine.EventMessageEnd, Text: "tool_calls"},
	})

	if len(result.ToolCalls) != 2 {
		t.Fatalf("expected 2 tool calls, got %d", len(result.ToolCalls))
	}
	if result.ToolCalls[0].Function.Name != "bash" {
		t.Fatalf("first tool = %q", result.ToolCalls[0].Function.Name)
	}
	if result.ToolCalls[1].Function.Name != "grep" {
		t.Fatalf("second tool = %q", result.ToolCalls[1].Function.Name)
	}
}

func TestParseResultError(t *testing.T) {
	result := parseResult([]engine.ChatEvent{
		{Kind: engine.EventError, Error: engine.ProviderError{Code: "rate_limit", Message: "too many"}},
	})

	if result.Error == nil {
		t.Fatal("expected error")
	}
}

func TestParseResultEmpty(t *testing.T) {
	result := parseResult([]engine.ChatEvent{})
	if result.Content != "" {
		t.Fatalf("content = %q, want empty", result.Content)
	}
	if len(result.ToolCalls) != 0 {
		t.Fatalf("tool calls = %v, want empty", result.ToolCalls)
	}
}
