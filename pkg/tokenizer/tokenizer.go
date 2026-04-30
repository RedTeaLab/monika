package tokenizer

import (
	"sync"

	"github.com/pkoukk/tiktoken-go"
)

var (
	once     sync.Once
	enc      *tiktoken.Tiktoken
	initErr  error
)

func getEncoder() (*tiktoken.Tiktoken, error) {
	once.Do(func() {
		enc, initErr = tiktoken.GetEncoding("cl100k_base")
	})
	return enc, initErr
}

// Count estimates the number of tokens in the given text using tiktoken's
// cl100k_base encoding (used by GPT-4, GPT-3.5-turbo, and most modern models).
// Falls back to chars/4 if the encoder cannot be initialized.
func Count(text string) int {
	e, err := getEncoder()
	if err != nil || e == nil {
		return fallback(text)
	}
	tokens := e.Encode(text, nil, nil)
	return len(tokens)
}

// CountMessages estimates the total tokens for a list of chat messages,
// including the per-message overhead tokens used by OpenAI's chat format.
// Each message consumes ~4 tokens of formatting overhead.
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

func fallback(text string) int {
	if len(text) == 0 {
		return 0
	}
	return (len(text) + 3) / 4
}
