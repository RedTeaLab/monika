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

func TestSanitizeMessageSequence_TrimLeadingNonUser(t *testing.T) {
	// system → assistant → assistant → user → assistant
	// should become system → user → assistant
	msgs := []engine.ChatMessage{
		{Role: "system", Content: "sys"},
		{Role: "assistant", Content: "orphan assistant"},
		{Role: "assistant", Content: "another orphan"},
		{Role: "user", Content: "hello"},
		{Role: "assistant", Content: "hi"},
	}
	result := sanitizeMessageSequence(msgs)
	if len(result) != 3 {
		t.Fatalf("expected 3 messages, got %d", len(result))
	}
	if result[0].Role != "system" {
		t.Errorf("first should be system, got %s", result[0].Role)
	}
	if result[1].Role != "user" {
		t.Errorf("second should be user, got %s", result[1].Role)
	}
	if result[2].Role != "assistant" {
		t.Errorf("third should be assistant, got %s", result[2].Role)
	}
}

func TestSanitizeMessageSequence_TrimLeadingTool(t *testing.T) {
	// system → tool → user → assistant
	// should become system → user → assistant
	msgs := []engine.ChatMessage{
		{Role: "system", Content: "sys"},
		{Role: "tool", Content: "orphan tool", ToolCallID: "tc1"},
		{Role: "user", Content: "hello"},
		{Role: "assistant", Content: "hi"},
	}
	result := sanitizeMessageSequence(msgs)
	if len(result) != 3 {
		t.Fatalf("expected 3 messages, got %d", len(result))
	}
	if result[1].Role != "user" {
		t.Errorf("second should be user, got %s", result[1].Role)
	}
}

func TestSanitizeMessageSequence_RemoveOrphanTool(t *testing.T) {
	// tool with tool_call_id that has no matching assistant tool_calls
	msgs := []engine.ChatMessage{
		{Role: "system", Content: "sys"},
		{Role: "user", Content: "hello"},
		{Role: "tool", Content: "orphan result", ToolCallID: "missing_id"},
		{Role: "assistant", Content: "hi"},
	}
	result := sanitizeMessageSequence(msgs)
	for _, m := range result {
		if m.Role == "tool" && m.ToolCallID == "missing_id" {
			t.Error("orphan tool message should be removed")
		}
	}
	if len(result) != 3 {
		t.Fatalf("expected 3 messages (sys, user, assistant), got %d", len(result))
	}
}

func TestSanitizeMessageSequence_KeepValidTool(t *testing.T) {
	// tool with matching assistant tool_calls should be kept
	msgs := []engine.ChatMessage{
		{Role: "system", Content: "sys"},
		{Role: "user", Content: "hello"},
		{Role: "assistant", Content: "", ToolCalls: []engine.ToolCall{{ID: "tc1", Function: engine.ToolCallFunc{Name: "grep"}}}},
		{Role: "tool", Content: "result", ToolCallID: "tc1"},
		{Role: "assistant", Content: "done"},
	}
	result := sanitizeMessageSequence(msgs)
	if len(result) != 5 {
		t.Fatalf("expected 5 messages, got %d", len(result))
	}
	// tool message should be present
	found := false
	for _, m := range result {
		if m.Role == "tool" && m.ToolCallID == "tc1" {
			found = true
		}
	}
	if !found {
		t.Error("valid tool message should be kept")
	}
}

func TestSanitizeMessageSequence_NoSystem(t *testing.T) {
	// no system message, leading assistant should be trimmed
	msgs := []engine.ChatMessage{
		{Role: "assistant", Content: "orphan"},
		{Role: "user", Content: "hello"},
		{Role: "assistant", Content: "hi"},
	}
	result := sanitizeMessageSequence(msgs)
	if len(result) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(result))
	}
	if result[0].Role != "user" {
		t.Errorf("first should be user, got %s", result[0].Role)
	}
}

func TestSanitizeMessageSequence_Empty(t *testing.T) {
	result := sanitizeMessageSequence(nil)
	if len(result) != 0 {
		t.Errorf("expected empty, got %d", len(result))
	}
}

func TestSanitizeMessageSequence_PostCompaction(t *testing.T) {
	// Simulates the exact scenario after compaction within a turn:
	// system (with summary) → tool (orphan) → assistant → user → assistant
	// The tool is orphaned because its parent assistant was in the compacted head.
	msgs := []engine.ChatMessage{
		{Role: "system", Content: "system prompt\n<context-summary>\nsummary\n</context-summary>"},
		{Role: "tool", Content: "orphan tool result", ToolCallID: "tc_old"},
		{Role: "assistant", Content: "partial response"},
		{Role: "user", Content: "latest question"},
		{Role: "assistant", Content: "latest answer"},
	}
	result := sanitizeMessageSequence(msgs)

	// Leading tool and assistant (before first user) should be trimmed
	if len(result) != 3 {
		t.Fatalf("expected 3 messages, got %d", len(result))
	}
	if result[0].Role != "system" {
		t.Errorf("first should be system, got %s", result[0].Role)
	}
	if result[1].Content != "latest question" {
		t.Errorf("second should be latest question, got %s", result[1].Content)
	}
	if result[2].Content != "latest answer" {
		t.Errorf("third should be latest answer, got %s", result[2].Content)
	}
}
