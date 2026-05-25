package tokenizer

// Count estimates tokens using chars/4. This is used exclusively for internal
// compaction calculations (tail selection / preserve budget). Overflow detection
// uses API-reported token counts as the single source of truth.
func Count(text string) int {
	if len(text) == 0 {
		return 0
	}
	return (len(text) + 3) / 4
}

// CountMessages estimates the total tokens for a list of chat messages,
// including per-message overhead (~4 tokens each).
func CountMessages(messages []Message) int {
	total := 0
	for _, m := range messages {
		total += Count(m.Role)
		total += Count(m.Content)
		total += Count(m.ReasoningContent)
		total += 4 // per-message overhead
	}
	if total > 0 {
		total += 2 // reply priming
	}
	return total
}

type Message struct {
	Role             string
	Content          string
	ReasoningContent string
}
