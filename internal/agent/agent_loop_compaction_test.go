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

func TestCompactionSplit(t *testing.T) {
	// With 4 user turns, tail should keep last 2
	conv := &Conversation{
		Messages: []engine.ChatMessage{
			{Role: "user", Content: "q1"},
			{Role: "assistant", Content: "a1"},
			{Role: "user", Content: "q2"},
			{Role: "assistant", Content: "a2"},
			{Role: "user", Content: "q3"},
			{Role: "assistant", Content: "a3"},
			{Role: "user", Content: "q4"},
			{Role: "assistant", Content: "a4"},
		},
	}
	tailStart := compactionSplit(conv, 131072)

	// q3 starts at index 4, so tailStart should be 4
	if tailStart != 4 {
		t.Errorf("expected tailStart=4, got %d", tailStart)
	}

	// Head: q1, a1, q2, a2
	// Tail: q3, a3, q4, a4
	if conv.Messages[tailStart].Content != "q3" {
		t.Errorf("tail should start at q3, got %s", conv.Messages[tailStart].Content)
	}
}

func TestCompactionSplit_SmallConversation(t *testing.T) {
	// Only 1 user turn — can't split
	conv := &Conversation{
		Messages: []engine.ChatMessage{
			{Role: "user", Content: "only question"},
			{Role: "assistant", Content: "only answer"},
		},
	}
	tailStart := compactionSplit(conv, 131072)
	if tailStart != 0 {
		t.Errorf("with only 1 turn, tailStart should be 0, got %d", tailStart)
	}
}

func TestCompactionSplit_WithCompactionFrom(t *testing.T) {
	conv := &Conversation{
		CompactionFrom: 2,
		Messages: []engine.ChatMessage{
			{Role: "assistant", Name: "compaction_summary", Content: "old summary"},
			{Role: "user", Content: "old"},
			{Role: "user", Content: "q1"},
			{Role: "assistant", Content: "a1"},
			{Role: "user", Content: "q2"},
			{Role: "assistant", Content: "a2"},
			{Role: "user", Content: "q3"},
			{Role: "assistant", Content: "a3"},
		},
	}
	tailStart := compactionSplit(conv, 131072)
	// Effective messages: q1(2), a1(3), q2(4), a2(5), q3(6), a3(7)
	// 3 user turns, keep last 2 -> q2 at index 4
	if tailStart != 4 {
		t.Errorf("expected tailStart=4, got %d", tailStart)
	}
}

func TestTruncateToolOutput(t *testing.T) {
	result := truncateToolOutput("short", 10)
	if result != "short" {
		t.Errorf("short text should not be truncated, got: %s", result)
	}

	long := strings.Repeat("x", 5000)
	result = truncateToolOutput(long, 2000)
	if len(result) > 2100 { // allow some slack for the truncation notice
		t.Errorf("long text should be truncated, got len=%d", len(result))
	}
	if !strings.Contains(result, "truncated") {
		t.Error("truncated text should contain truncation notice")
	}
}

func TestBuildCompactionMessages_ToolTruncation(t *testing.T) {
	conv := &Conversation{
		Messages: []engine.ChatMessage{
			{Role: "user", Content: "run grep"},
			{Role: "assistant", Content: "", ToolCalls: []engine.ToolCall{{ID: "t1", Function: engine.ToolCallFunc{Name: "grep"}}}},
			{Role: "tool", Content: strings.Repeat("line\n", 500), ToolCallID: "t1"},
			{Role: "user", Content: "thanks"},
			{Role: "assistant", Content: "done"},
		},
	}

	// tailStart = 3 (last 1 user turn at index 3, since only 2 turns and we force 1)
	// Actually with 2 turns we'd keep last 1 as tail (since tailTurns=2 but only 2 total, falls to 1)
	msgs := buildCompactionMessages(conv, 3)
	// Head is messages 0..2
	for _, m := range msgs {
		if m.Role == "tool" && len(m.Content) > 2100 {
			t.Errorf("tool output should be truncated in head messages, got len=%d", len(m.Content))
		}
	}
}

func TestBuildCompactionPrompt_Structure(t *testing.T) {
	loop := &AgentLoop{model: "test", modelContextLimit: 131072, modelOutputLimit: 8192}
	conv := &Conversation{
		Messages: []engine.ChatMessage{
			{Role: "user", Content: "q1"},
			{Role: "assistant", Content: "a1"},
			{Role: "user", Content: "q2"},
			{Role: "assistant", Content: "a2"},
			{Role: "user", Content: "q3"},
			{Role: "assistant", Content: "a3"},
			{Role: "user", Content: "q4"},
			{Role: "assistant", Content: "a4"},
		},
	}

	prompt, err := loop.buildCompactionPrompt(conv)
	if err != nil {
		t.Fatalf("buildCompactionPrompt returned error: %v", err)
	}

	// Should have head messages + final instruction
	if len(prompt) < 2 {
		t.Fatalf("expected at least 2 messages, got %d", len(prompt))
	}

	// Last message should contain the template
	lastMsg := prompt[len(prompt)-1]
	if lastMsg.Role != "user" {
		t.Errorf("last message should be user role, got %s", lastMsg.Role)
	}
	if !strings.Contains(lastMsg.Content, "## Goal") {
		t.Error("last message should contain summary template with ## Goal")
	}
	if !strings.Contains(lastMsg.Content, "Create a new anchored summary") {
		t.Error("first compaction should say 'Create a new anchored summary'")
	}
}

func TestBuildCompactionPrompt_WithPreviousSummary(t *testing.T) {
	loop := &AgentLoop{model: "test", modelContextLimit: 131072, modelOutputLimit: 8192}
	conv := &Conversation{
		Messages: []engine.ChatMessage{
			{Role: "assistant", Name: "compaction_summary", Content: "## Goal\nOld goal"},
			{Role: "user", Content: "q1"},
			{Role: "assistant", Content: "a1"},
			{Role: "user", Content: "q2"},
			{Role: "assistant", Content: "a2"},
			{Role: "user", Content: "q3"},
			{Role: "assistant", Content: "a3"},
		},
	}

	prompt, err := loop.buildCompactionPrompt(conv)
	if err != nil {
		t.Fatalf("buildCompactionPrompt returned error: %v", err)
	}
	lastMsg := prompt[len(prompt)-1]
	if !strings.Contains(lastMsg.Content, "<previous-summary>") {
		t.Error("should contain <previous-summary> when there is a previous summary")
	}
	if !strings.Contains(lastMsg.Content, "Update the anchored summary") {
		t.Error("should say 'Update the anchored summary' for subsequent compactions")
	}
}
