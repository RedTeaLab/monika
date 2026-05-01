package openai

import (
	"context"
	"testing"

	"monika/internal/config"
	"monika/pkg/engine"
)

func TestOpenAIRegisters(t *testing.T) {
	engine.Reset()
	engine.Register(&OpenAIProvider{})
	got, err := engine.EngineByID("openai")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID() != "openai" {
		t.Fatalf("expected openai, got %s", got.ID())
	}
}

func TestOpenAIDefaultBaseURL(t *testing.T) {
	p := &OpenAIProvider{}
	_ = p.Init(context.Background(), map[string]any{
		"api_key": "sk-test",
	})
	cfg := p.resolveConfig(engine.ChatRequest{})
	if cfg.BaseURL != "" {
		t.Fatalf("expected empty BaseURL for default, got %s", cfg.BaseURL)
	}
}

func TestOpenAIDefaultModel(t *testing.T) {
	p := &OpenAIProvider{}
	_ = p.Init(context.Background(), nil)
	cfg := p.resolveConfig(engine.ChatRequest{})
	if cfg.Model != "gpt-4o" {
		t.Fatalf("expected gpt-4o, got %s", cfg.Model)
	}
}

func TestOpenAIListModels(t *testing.T) {
	t.Run("returns empty without config", func(t *testing.T) {
		p := &OpenAIProvider{}
		models, err := p.ListModels(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		if len(models) != 0 {
			t.Fatalf("expected 0 models without config, got %d", len(models))
		}
	})

	t.Run("returns configured models", func(t *testing.T) {
		p := &OpenAIProvider{}
		_ = p.Init(context.Background(), map[string]any{
			"models": []config.ModelEntry{
				{ID: "gpt-4o", DisplayName: "GPT-4o"},
				{ID: "gpt-4o-mini", DisplayName: "GPT-4o Mini"},
			},
		})
		models, err := p.ListModels(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		if len(models) != 2 {
			t.Fatalf("expected 2 models, got %d", len(models))
		}
	})
}
