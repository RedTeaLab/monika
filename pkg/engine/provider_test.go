package engine

import (
	"encoding/json"
	"testing"
)

func TestChatMessageWithQuotedMessages(t *testing.T) {
	msg := ChatMessage{
		Role:    "user",
		Content: "hello",
		QuotedMessages: []QuotedMessage{
			{ID: "msg-1", Role: "assistant", Content: "quoted content"},
		},
	}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded ChatMessage
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if len(decoded.QuotedMessages) != 1 {
		t.Fatalf("expected 1 quoted message, got %d", len(decoded.QuotedMessages))
	}
	if decoded.QuotedMessages[0].Content != "quoted content" {
		t.Fatalf("unexpected content: %q", decoded.QuotedMessages[0].Content)
	}
}

func TestChatMessageWithoutQuotedMessages(t *testing.T) {
	msg := ChatMessage{Role: "user", Content: "hello"}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	if string(data) != `{"role":"user","content":"hello","reasoning_content":""}` {
		t.Fatalf("unexpected JSON: %s", string(data))
	}
}
