package agent

import (
	"regexp"
	"strings"
	"unicode/utf8"
)

// sanitizeCompactionOutput cleans the raw LLM response from the compaction agent.
// Replaces the old cleanCompactionSummary function.
func sanitizeCompactionOutput(raw string) string {
	// Remove <think>...</think> blocks (DeepSeek reasoning)
	re := regexp.MustCompile(`(?s)<think>.*?</think>`)
	s := re.ReplaceAllString(raw, "")

	// Strip leading/trailing ``` fences
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "```markdown")
	s = strings.TrimPrefix(s, "```md")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	s = strings.TrimSpace(s)

	// If output doesn't start with ##, scan forward to first heading
	if !strings.HasPrefix(s, "## ") {
		if idx := strings.Index(s, "## "); idx > 0 {
			s = s[idx:]
		}
	}
	s = strings.TrimSpace(s)

	if s == "" {
		s = raw // fallback: don't lose content
	}
	return s
}

// buildCompactionPromptFromConv serializes conversation messages into a
// text dump for the compaction agent to summarize. Individual message content
// is capped to prevent the compaction prompt from exceeding model context limits.
func buildCompactionPromptFromConv(conv *Conversation) string {
	const maxPerContent = 6000 // chars per message
	msgs := conv.Messages
	if conv.CompactionFrom > 0 && conv.CompactionFrom < len(msgs) {
		msgs = msgs[conv.CompactionFrom:]
	}
	var b strings.Builder
	for _, m := range msgs {
		if m.ReasoningContent != "" {
			writeTruncated(&b, "["+m.Role+" reasoning]: ", m.ReasoningContent, maxPerContent)
		}
		writeTruncated(&b, "["+m.Role+"]: ", m.Content, maxPerContent)
		for _, tc := range m.ToolCalls {
			writeTruncated(&b, "  [tool_call "+tc.Function.Name+"]: ", tc.Function.Arguments, maxPerContent)
		}
	}
	return b.String()
}

func writeTruncated(b *strings.Builder, prefix, content string, maxContent int) {
	if content == "" {
		return
	}
	if len(content) <= maxContent {
		b.WriteString(prefix + content + "\n")
	} else {
		end := maxContent
		for end > 0 && !utf8.RuneStart(content[end]) {
			end--
		}
		b.WriteString(prefix + content[:end] + "\n... (truncated)\n")
	}
}
