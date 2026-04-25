package provider

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"monika/engine"
)

func TestProviderRegistersItself(t *testing.T) {
	engine.Reset()
	var e *ProviderEngine
	e = &ProviderEngine{}
	engine.Register(e)
	got, err := engine.EngineByID("provider")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID() != "provider" {
		t.Fatalf("expected provider, got %s", got.ID())
	}
}

func TestProviderCapabilities(t *testing.T) {
	e := &ProviderEngine{}
	caps := e.Capabilities()
	if len(caps) != 1 || caps[0] != engine.CapProvider {
		t.Fatalf("expected [provider], got %v", caps)
	}
}

func TestProviderInitParsesBackends(t *testing.T) {
	e := &ProviderEngine{}
	cfg := map[string]any{
		"model_providers": map[string]any{
			"openai": map[string]any{
				"name":     "OpenAI",
				"base_url": "https://api.openai.com/v1",
				"api_key":  "sk-test",
				"wire_api": "chat",
			},
		},
	}
	if err := e.Init(context.Background(), cfg); err != nil {
		t.Fatal(err)
	}
	b, ok := e.Backend("openai")
	if !ok {
		t.Fatal("expected openai backend")
	}
	if b.Name != "OpenAI" {
		t.Fatalf("expected OpenAI, got %s", b.Name)
	}
	if b.BaseURL != "https://api.openai.com/v1" {
		t.Fatalf("unexpected base_url: %s", b.BaseURL)
	}
	if b.APIKey != "sk-test" {
		t.Fatalf("unexpected api_key: %s", b.APIKey)
	}
}

func TestProviderStreamChatWithMockServer(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprintf(w, "data: {\"id\":\"test\",\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n")
		fmt.Fprintf(w, "data: {\"id\":\"test\",\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n")
		fmt.Fprintf(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	e := &ProviderEngine{}
	e.backends = map[string]Backend{
		"test": {Name: "Test", BaseURL: server.URL, WireAPI: "chat"},
	}

	events, err := e.StreamChat(context.Background(), engine.ChatRequest{Provider: "test", Model: "test-model"})
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

func TestProviderStreamChatNoBackend(t *testing.T) {
	e := &ProviderEngine{}
	_, err := e.StreamChat(context.Background(), engine.ChatRequest{})
	if err == nil {
		t.Fatal("expected error when no backend configured")
	}
}
