package tokenizer

import (
	"strings"
	"testing"
)

func TestCount(t *testing.T) {
	n := Count("Hello, world!")
	// "Hello, world!" is about 4 tokens with cl100k_base
	if n < 3 || n > 6 {
		t.Errorf("expected 3-6 tokens for 'Hello, world!', got %d", n)
	}
}

func TestCountEmpty(t *testing.T) {
	if n := Count(""); n != 0 {
		t.Errorf("expected 0 for empty string, got %d", n)
	}
}

func TestCountRatio(t *testing.T) {
	text := strings.Repeat("hello world ", 100)
	n := Count(text)
	ratio := float64(len(text)) / float64(n)
	if ratio < 2.0 || ratio > 6.0 {
		t.Errorf("unexpected chars/token ratio: %.2f (len=%d, tokens=%d)", ratio, len(text), n)
	}
}

func TestCountMessages(t *testing.T) {
	msgs := []Message{
		{Role: "system", Content: "You are a helpful assistant."},
		{Role: "user", Content: "Hello!"},
	}
	n := CountMessages(msgs)
	if n < 15 {
		t.Errorf("expected at least 15 tokens for 2 messages, got %d", n)
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

func TestFallback(t *testing.T) {
	if n := fallback("abc"); n != 1 {
		t.Errorf("expected 1 for 'abc' (length 3), got %d", n)
	}
	if n := fallback("abcd"); n != 1 {
		t.Errorf("expected 1 for 'abcd' (length 4), got %d", n)
	}
	if n := fallback("abcde"); n != 2 {
		t.Errorf("expected 2 for 'abcde' (length 5), got %d", n)
	}
	if n := fallback(""); n != 0 {
		t.Errorf("expected 0 for empty, got %d", n)
	}
}

func TestCountMessagesEmpty(t *testing.T) {
	if n := CountMessages(nil); n != 0 {
		t.Errorf("expected 0 for nil messages, got %d", n)
	}
}
