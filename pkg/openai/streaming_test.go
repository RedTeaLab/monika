package openai

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"monika/pkg/engine"
)

func TestStreamChatStreaming(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("missing auth header")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		io.WriteString(w, "data: {\"id\":\"test\",\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n")
		io.WriteString(w, "data: {\"id\":\"test\",\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n")
		io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	events, err := StreamChat(context.Background(), server.URL, "test-key", "test-model", []engine.ChatMessage{
		{Role: "user", Content: "hi"},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}

	var text string
	for ev := range events {
		if ev.Kind == engine.EventContentDelta {
			text += ev.Text
		}
	}
	if text != "Hello world" {
		t.Fatalf("expected 'Hello world', got '%s'", text)
	}
}

func TestParseSSEStreamToolCalls(t *testing.T) {
	input := `data: {"id":"test","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"bash","arguments":"{\"cmd\":\"ls\"}"}}]}}]}` + "\n\n" +
		`data: {"id":"test","choices":[{"finish_reason":"tool_calls"}]}` + "\n\n" +
		`data: [DONE]` + "\n\n"

	ch := make(chan engine.ChatEvent, 16)
	if err := parseSSEStream(context.Background(), strings.NewReader(input), ch); err != nil {
		t.Fatal(err)
	}
	close(ch)

	var toolCalls []engine.ToolCall
	for ev := range ch {
		if ev.Kind == engine.EventToolCallEnd {
			toolCalls = append(toolCalls, *ev.ToolCall)
		}
	}
	if len(toolCalls) != 1 {
		t.Fatalf("expected 1 tool call, got %d", len(toolCalls))
	}
	if toolCalls[0].Function.Name != "bash" {
		t.Fatalf("tool name = %q", toolCalls[0].Function.Name)
	}
}

func TestStreamChatToolCalls(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		io.WriteString(w, `data: {"id":"test","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"bash","arguments":"{\"cmd\":\"ls\"}"}}]}}]}`+"\n\n")
		io.WriteString(w, `data: {"id":"test","choices":[{"finish_reason":"tool_calls"}]}`+"\n\n")
		io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	events, err := StreamChat(context.Background(), server.URL, "test-key", "test-model", nil, nil)
	if err != nil {
		t.Fatal(err)
	}

	var toolCalls []engine.ToolCall
	for ev := range events {
		if ev.Kind == engine.EventToolCallEnd {
			toolCalls = append(toolCalls, *ev.ToolCall)
		}
	}
	if len(toolCalls) != 1 {
		t.Fatalf("expected 1 tool call, got %d", len(toolCalls))
	}
	if toolCalls[0].Function.Name != "bash" {
		t.Fatalf("tool name = %q", toolCalls[0].Function.Name)
	}
	if toolCalls[0].Function.Arguments != `{"cmd":"ls"}` {
		t.Fatalf("tool args = %q", toolCalls[0].Function.Arguments)
	}
}

func TestStreamChatToolCallsAccumulatesArguments(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		io.WriteString(w, `data: {"id":"test","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"bash","arguments":"{\"cmd\":\""}}]}}]}`+"\n\n")
		io.WriteString(w, `data: {"id":"test","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ls"}}]}}]}`+"\n\n")
		io.WriteString(w, `data: {"id":"test","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"}"}}]}}]}`+"\n\n")
		io.WriteString(w, `data: {"id":"test","choices":[{"finish_reason":"tool_calls"}]}`+"\n\n")
		io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	events, err := StreamChat(context.Background(), server.URL, "test-key", "test-model", nil, nil)
	if err != nil {
		t.Fatal(err)
	}

	var toolCalls []engine.ToolCall
	for ev := range events {
		if ev.Kind == engine.EventToolCallEnd {
			toolCalls = append(toolCalls, *ev.ToolCall)
		}
	}
	if len(toolCalls) != 1 {
		t.Fatalf("expected 1 tool call, got %d", len(toolCalls))
	}
	if toolCalls[0].Function.Arguments != `{"cmd":"ls"}` {
		t.Fatalf("tool args = %q", toolCalls[0].Function.Arguments)
	}
}

func TestStreamChatToolCallsMultipleTools(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		io.WriteString(w, `data: {"id":"test","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"bash","arguments":"{\"cmd\":\"ls\"}"}},{"index":1,"id":"call_2","type":"function","function":{"name":"grep","arguments":"{\"pattern\":\"foo\"}"}}]}}]}`+"\n\n")
		io.WriteString(w, `data: {"id":"test","choices":[{"finish_reason":"tool_calls"}]}`+"\n\n")
		io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	events, err := StreamChat(context.Background(), server.URL, "test-key", "test-model", nil, nil)
	if err != nil {
		t.Fatal(err)
	}

	var toolCalls []engine.ToolCall
	for ev := range events {
		if ev.Kind == engine.EventToolCallEnd {
			toolCalls = append(toolCalls, *ev.ToolCall)
		}
	}
	if len(toolCalls) != 2 {
		t.Fatalf("expected 2 tool calls, got %d", len(toolCalls))
	}
}

func TestStreamChatError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
	}))
	defer server.Close()

	_, err := StreamChat(context.Background(), server.URL, "bad-key", "test-model", nil, nil)
	if err == nil {
		t.Fatal("expected error for 401")
	}
}
