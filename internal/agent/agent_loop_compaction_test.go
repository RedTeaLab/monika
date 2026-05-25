package agent

import (
	"strings"
	"testing"

	"monika/pkg/engine"
)

func TestIsOverflow(t *testing.T) {
	loop := &AgentLoop{model: "gpt-4", modelContextLimit: 8192, modelOutputLimit: 4096}
	// 8K context, 4K output, 20K buffer -> usable <= 0 -> fallback to context/2 = 4K
	conv := &Conversation{
		Messages: []engine.ChatMessage{
			{Role: "user", Content: "hello"},
		},
		TokenCount: 100, // API reports 100 total tokens for this turn
	}
	if loop.isOverflow(conv) {
		t.Error("short conversation should not overflow")
	}
	// Simulate API returning total tokens above the 4K fallback limit
	conv2 := &Conversation{
		Messages: []engine.ChatMessage{
			{Role: "user", Content: strings.Repeat("x", 35000)},
		},
		TokenCount: 5000, // API reports 5000 total tokens
	}
	if !loop.isOverflow(conv2) {
		t.Error("large conversation should overflow")
	}
}

func TestRewriteMessages_TurnAlignment(t *testing.T) {
	loop := &AgentLoop{model: "deepseek-chat", modelContextLimit: 131072, modelOutputLimit: 8192}
	conv := &Conversation{
		Messages: []engine.ChatMessage{
			{Role: "user", Content: "first question"},
			{Role: "assistant", Content: "first answer", ToolCalls: []engine.ToolCall{{ID: "t1", Function: engine.ToolCallFunc{Name: "grep"}}}},
			{Role: "tool", Content: "result1", ToolCallID: "t1"},
			{Role: "user", Content: "second question"},
			{Role: "assistant", Content: "second answer"},
			{Role: "user", Content: "third question"},
			{Role: "assistant", Content: "third answer"},
			{Role: "user", Content: "fourth question"},
			{Role: "assistant", Content: "fourth answer"},
		},
	}
	summary := "## Goal\nTest compaction"
	loop.rewriteMessages(conv, summary)

	// CompactionFrom should point to summary message
	from := conv.CompactionFrom
	if from >= len(conv.Messages) {
		t.Fatalf("CompactionFrom %d out of range", from)
	}
	if conv.Messages[from].Name != "compaction_summary" {
		t.Errorf("message at CompactionFrom should be summary, got name=%s content=%s",
			conv.Messages[from].Name, conv.Messages[from].Content)
	}
	if conv.Messages[from].Content != summary {
		t.Errorf("summary content mismatch, got: %s", conv.Messages[from].Content)
	}

	// Last 2 user turns should be preserved after summary
	for _, content := range []string{"third question", "fourth question"} {
		found := false
		for _, m := range conv.Messages {
			if m.Content == content {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("retained messages should include %q", content)
		}
	}

	// First question should be replaced by summary (not in preserved range)
	for _, m := range conv.Messages[from+1:] {
		if m.Content == "first question" {
			t.Error("first question should have been replaced by summary")
		}
	}

	if conv.CompactionCount != 1 {
		t.Errorf("compaction count should be 1, got %d", conv.CompactionCount)
	}
}
