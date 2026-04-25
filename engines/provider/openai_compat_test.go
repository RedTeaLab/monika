package provider

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"monika/engine"
)

func TestCallOpenAICompatStreaming(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("missing auth header")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprintf(w, "data: {\"id\":\"test\",\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n")
		fmt.Fprintf(w, "data: {\"id\":\"test\",\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n")
		fmt.Fprintf(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	events, err := CallOpenAICompat(context.Background(), server.URL, "test-key", "test-model", []engine.ChatMessage{
		{Role: "user", Content: "hi"},
	})
	if err != nil {
		t.Fatal(err)
	}

	var text string
	for _, ev := range events {
		if ev.Kind == engine.EventContentDelta {
			text += ev.Text
		}
	}
	if text != "Hello world" {
		t.Fatalf("expected 'Hello world', got '%s'", text)
	}
}

func TestCallOpenAICompatError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
	}))
	defer server.Close()

	_, err := CallOpenAICompat(context.Background(), server.URL, "bad-key", "test-model", nil)
	if err == nil {
		t.Fatal("expected error for 401")
	}
}
