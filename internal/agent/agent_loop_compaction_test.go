package agent

import (
	"strings"
	"testing"

	"monika/pkg/engine"
)

func TestIsOverflow(t *testing.T) {
	loop := &AgentLoop{model: "gpt-4"}
	// gpt-4: 8K context, 4K output, 20K buffer -> usable <= 0 -> fallback to 4K
	conv := &Conversation{Messages: []engine.ChatMessage{
		{Role: "user", Content: "hello"},
	}}
	if loop.isOverflow(conv) {
		t.Error("short conversation should not overflow")
	}
	// Build a large conversation that exceeds the 4K fallback limit
	largeContent := strings.Repeat("x", 35000)
	conv2 := &Conversation{Messages: []engine.ChatMessage{
		{Role: "user", Content: largeContent},
	}}
	if !loop.isOverflow(conv2) {
		t.Error("large conversation should overflow")
	}
}

func TestRewriteMessages_TurnAlignment(t *testing.T) {
	loop := &AgentLoop{model: "deepseek-chat"} // 128K model
	conv := &Conversation{
		Messages: []engine.ChatMessage{
			{Role: "user", Content: "first question"},
			{Role: "assistant", Content: "first answer", ToolCalls: []engine.ToolCall{{ID: "t1", Function: engine.ToolCallFunc{Name: "grep"}}}},
			{Role: "tool", Content: "result1", ToolCallID: "t1"},
			{Role: "user", Content: "second question"},
			{Role: "assistant", Content: "second answer"},
		},
	}
	summary := "## Goal\nTest compaction"
	loop.rewriteMessages(conv, summary)

	if conv.Messages[0].Content != summary {
		t.Errorf("first message should be summary, got: %s", conv.Messages[0].Content)
	}
	if conv.Messages[0].Name != "compaction_summary" {
		t.Error("summary message should have name=compaction_summary")
	}
	found := false
	for _, m := range conv.Messages {
		if m.Content == "second question" {
			found = true
			break
		}
	}
	if !found {
		t.Error("retained messages should include last user message")
	}
	if conv.CompactionCount != 1 {
		t.Errorf("compaction count should be 1, got %d", conv.CompactionCount)
	}
	// ArchivedMessages should be non-empty (original messages saved)
	if len(conv.ArchivedMessages) == 0 {
		t.Error("ArchivedMessages should be populated")
	}
}
