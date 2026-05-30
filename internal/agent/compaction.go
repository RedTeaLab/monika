package agent

import (
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"

	"monika/pkg/engine"
	"monika/pkg/tokenizer"
)

const (
	compactionToolOutputMaxChars = 2000
	defaultTailTurns             = 2
)

var thinkRe = regexp.MustCompile(`(?s)<think.*?</think\s*>`)

// sanitizeCompactionOutput cleans the raw LLM response from the compaction agent.
func sanitizeCompactionOutput(raw string) string {
	s := thinkRe.ReplaceAllString(raw, "")

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
		s = raw
	}
	return s
}

// compactionSplit identifies the head/tail boundary for compaction.
// It returns the index where the tail begins. Messages before tailStart
// form the "head" (to be summarized); messages from tailStart onward
// are kept verbatim and NOT sent to the compaction agent.
//
// The tail covers the last defaultTailTurns user turns, bounded by a
// token budget of 25% of usable context (clamped to 2K–8K tokens).
func compactionSplit(conv *Conversation, contextLimit int64) int {
	msgs := conv.Messages
	start := conv.CompactionFrom
	if start < 0 {
		start = 0
	}
	effective := msgs[start:]
	if len(effective) == 0 {
		return start
	}

	tailTurns := defaultTailTurns
	if tailTurns <= 0 {
		return start
	}

	// Compute tail token budget: 25% of usable, clamped [2000, 8000]
	outputMax := int64(32768)
	tailBudget := int64(2000)
	if usable := contextLimit - outputMax - int64(20000); usable > 0 {
		tailBudget = usable / 4
		if tailBudget < 2000 {
			tailBudget = 2000
		}
		if tailBudget > 8000 {
			tailBudget = 8000
		}
	}

	// Find user-turn boundaries in effective messages
	type turnBound struct {
		localStart int // index within effective
		localEnd   int
	}
	var turns []turnBound
	for i := 0; i < len(effective); i++ {
		if effective[i].Role == "user" {
			turns = append(turns, turnBound{localStart: i, localEnd: len(effective)})
		}
	}
	// Set end of each turn to start of next
	for i := 0; i < len(turns)-1; i++ {
		turns[i].localEnd = turns[i+1].localStart
	}

	if len(turns) <= tailTurns {
		// All turns fit within tail — not enough turns for a turn-based split.
		if len(turns) > 1 {
			tailTurns = 1
		} else if len(turns) == 1 && len(effective) > 3 {
			// Single turn with many messages: split within the turn.
			// Walk backwards from the end, accumulating tokens up to tailBudget.
			turn := turns[0]
			var suffixTokens int64
			splitAt := len(effective)
			for j := len(effective) - 1; j > turn.localStart+1; j-- {
				msgTokens := int64(tokenizer.Count(effective[j].Content) + tokenizer.Count(effective[j].ReasoningContent) + tokenizer.Count(effective[j].Role) + 4)
				if suffixTokens+msgTokens > tailBudget {
					break
				}
				suffixTokens += msgTokens
				splitAt = j
			}
			if splitAt > turn.localStart+1 {
				return start + splitAt
			}
			return start
		} else {
			return start
		}
	}

	// Take the last tailTurns turns as candidate tail
	recent := turns[len(turns)-tailTurns:]

	// Walk backwards through recent turns, accumulating token size
	var totalTokens int64
	var splitLocalIdx int = len(effective) // default: all effective is tail

	for i := len(recent) - 1; i >= 0; i-- {
		turn := recent[i]
		var turnTokens int64
		for _, m := range effective[turn.localStart:turn.localEnd] {
			turnTokens += int64(tokenizer.Count(m.Content) + tokenizer.Count(m.ReasoningContent) + tokenizer.Count(m.Role) + 4)
		}
		if totalTokens+turnTokens <= tailBudget {
			totalTokens += turnTokens
			splitLocalIdx = turn.localStart
		} else {
			// This turn doesn't fit — try splitting: keep assistant+tool responses
			// from later in the turn if the beginning doesn't fit
			if turn.localEnd-turn.localStart > 1 {
				for s := turn.localStart + 1; s < turn.localEnd; s++ {
					var suffixTokens int64
					for _, m := range effective[s:turn.localEnd] {
						suffixTokens += int64(tokenizer.Count(m.Content) + tokenizer.Count(m.ReasoningContent) + tokenizer.Count(m.Role) + 4)
					}
					if suffixTokens <= tailBudget-totalTokens {
						splitLocalIdx = s
						break
					}
				}
			}
			break
		}
	}

	if splitLocalIdx <= 0 {
		return start
	}
	return start + splitLocalIdx
}

// truncateToolOutput truncates a tool result string to maxChars.
func truncateToolOutput(text string, maxChars int) string {
	if maxChars <= 0 || len(text) <= maxChars {
		return text
	}
	end := maxChars
	for end > 0 && !utf8.RuneStart(text[end]) {
		end--
	}
	omitted := len(text) - end
	return text[:end] + fmt.Sprintf("\n[Tool output truncated for compaction: omitted %d chars]", omitted)
}

// buildCompactionMessages converts head messages into []engine.ChatMessage
// with tool outputs truncated. Previous compaction summaries are excluded
// because they are already injected via <previous-summary> in the instruction.
func buildCompactionMessages(conv *Conversation, headEnd int) []engine.ChatMessage {
	start := conv.CompactionFrom
	if start < 0 {
		start = 0
	}
	if headEnd > len(conv.Messages) {
		headEnd = len(conv.Messages)
	}
	src := conv.Messages[start:headEnd]
	result := make([]engine.ChatMessage, 0, len(src))
	for _, m := range src {
		if m.Name == "compaction_summary" {
			continue
		}
		cp := m
		if cp.Role == "tool" {
			cp.Content = truncateToolOutput(cp.Content, compactionToolOutputMaxChars)
		}
		result = append(result, cp)
	}
	return result
}
