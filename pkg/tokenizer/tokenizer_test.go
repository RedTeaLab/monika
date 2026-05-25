package tokenizer

import (
	"strings"
	"testing"
)

func TestCount(t *testing.T) {
	n := Count("Hello, world!")
	// "Hello, world!" is 13 chars, chars/4 = 4 tokens
	if n != 4 {
		t.Errorf("expected 4 tokens for 'Hello, world!', got %d", n)
	}
}

func TestCountEmpty(t *testing.T) {
	if n := Count(""); n != 0 {
		t.Errorf("expected 0 for empty string, got %d", n)
	}
}

func TestCountRatio(t *testing.T) {
	text := strings.Repeat("hello world ", 100) // 1200 chars
	n := Count(text)
	// chars/4 = 300
	if n != 300 {
		t.Errorf("expected 300 tokens, got %d", n)
	}
}

func TestCountMessages(t *testing.T) {
	msgs := []Message{
		{Role: "system", Content: "You are a helpful assistant."},
		{Role: "user", Content: "Hello!"},
	}
	n := CountMessages(msgs)
	// system: 6+29 = 35 chars of content + 6 role + 4 overhead = 45 -> /4 = 11
	// user: 5+6 = 11 + 5 + 4 = 20 -> /4 = 5
	// total ~16 + 2 (priming) = 18
	if n < 12 {
		t.Errorf("expected at least 12 tokens for 2 messages, got %d", n)
	}
}

func TestCountMessagesWithReasoning(t *testing.T) {
	msgs := []Message{
		{Role: "system", Content: "You are helpful."},
		{Role: "assistant", Content: "OK", ReasoningContent: strings.Repeat("thinking ", 100)},
	}
	withoutReasoning := CountMessages([]Message{
		{Role: "system", Content: "You are helpful."},
		{Role: "assistant", Content: "OK"},
	})
	withReasoning := CountMessages(msgs)
	if withReasoning <= withoutReasoning {
		t.Errorf("messages with reasoning content should have more tokens: %d <= %d",
			withReasoning, withoutReasoning)
	}
}

func TestCountMessagesEmpty(t *testing.T) {
	if n := CountMessages(nil); n != 0 {
		t.Errorf("expected 0 for nil messages, got %d", n)
	}
}
