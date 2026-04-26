package deepseek

import (
	"context"
	"testing"

	"monika/pkg/engine"
)

func TestDeepSeekRegisters(t *testing.T) {
	engine.Reset()
	engine.Register(&DeepSeekProvider{})
	got, err := engine.EngineByID("deepseek")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID() != "deepseek" {
		t.Fatalf("expected deepseek, got %s", got.ID())
	}
}

func TestDeepSeekCapabilities(t *testing.T) {
	p := &DeepSeekProvider{}
	caps := p.Capabilities()
	if len(caps) != 1 || caps[0] != engine.CapProvider {
		t.Fatalf("expected [provider], got %v", caps)
	}
}

func TestDeepSeekInitAndConfig(t *testing.T) {
	p := &DeepSeekProvider{}
	err := p.Init(context.Background(), map[string]any{
		"base_url": "https://api.deepseek.com",
		"api_key":  "sk-test",
		"model":    "deepseek-chat",
	})
	if err != nil {
		t.Fatal(err)
	}
	cfg := p.resolveConfig(engine.ChatRequest{})
	if cfg.BaseURL != "https://api.deepseek.com" {
		t.Fatalf("expected deepseek base_url, got %s", cfg.BaseURL)
	}
	if cfg.APIKey != "sk-test" {
		t.Fatalf("expected sk-test, got %s", cfg.APIKey)
	}
	if cfg.Model != "deepseek-chat" {
		t.Fatalf("expected deepseek-chat, got %s", cfg.Model)
	}
}

func TestDeepSeekDefaultModel(t *testing.T) {
	p := &DeepSeekProvider{}
	_ = p.Init(context.Background(), map[string]any{
		"base_url": "https://api.deepseek.com",
	})
	cfg := p.resolveConfig(engine.ChatRequest{})
	if cfg.Model != "deepseek-chat" {
		t.Fatalf("expected default deepseek-chat, got %s", cfg.Model)
	}
}

func TestDeepSeekModelOverride(t *testing.T) {
	p := &DeepSeekProvider{}
	_ = p.Init(context.Background(), map[string]any{
		"base_url": "https://api.deepseek.com",
		"model":    "deepseek-reasoner",
	})
	cfg := p.resolveConfig(engine.ChatRequest{Model: "deepseek-chat"})
	if cfg.Model != "deepseek-chat" {
		t.Fatalf("expected request override, got %s", cfg.Model)
	}
}

func TestDeepSeekListModels(t *testing.T) {
	p := &DeepSeekProvider{}
	models, err := p.ListModels(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(models) != 2 {
		t.Fatalf("expected 2 models, got %d", len(models))
	}
}

func TestDeepSeekNoBaseURL(t *testing.T) {
	p := &DeepSeekProvider{}
	_ = p.Init(context.Background(), nil)
	_, err := p.StreamChat(context.Background(), engine.ChatRequest{})
	if err == nil {
		t.Fatal("expected error when base_url not configured")
	}
}
