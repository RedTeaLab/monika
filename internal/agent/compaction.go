package agent

import (
	"regexp"
	"strings"
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
// text dump for the compaction agent to summarize.
func buildCompactionPromptFromConv(conv *Conversation) string {
	var b strings.Builder
	for _, m := range conv.Messages {
		if m.ReasoningContent != "" {
			b.WriteString("[" + m.Role + " reasoning]: " + m.ReasoningContent + "\n")
		}
		b.WriteString("[" + m.Role + "]: " + m.Content + "\n")
		for _, tc := range m.ToolCalls {
			b.WriteString("  [tool_call " + tc.Function.Name + "]: " + tc.Function.Arguments + "\n")
		}
	}
	return b.String()
}
