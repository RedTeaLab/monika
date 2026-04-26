package provider

import (
	"context"

	"monika/pkg/engine"
)

type adapterConfig struct {
	BaseURL string
	APIKey  string
	Model   string
}

type Adapter interface {
	StreamChat(ctx context.Context, cfg adapterConfig, messages []engine.ChatMessage) ([]engine.ChatEvent, error)
	ListModels(ctx context.Context, cfg adapterConfig) ([]engine.Model, error)
}

type baseAdapter struct {
	call func(ctx context.Context, cfg adapterConfig, messages []engine.ChatMessage) ([]engine.ChatEvent, error)
	list func(ctx context.Context, cfg adapterConfig) ([]engine.Model, error)
}

func (a baseAdapter) StreamChat(ctx context.Context, cfg adapterConfig, messages []engine.ChatMessage) ([]engine.ChatEvent, error) {
	return a.call(ctx, cfg, messages)
}

func (a baseAdapter) ListModels(ctx context.Context, cfg adapterConfig) ([]engine.Model, error) {
	return a.list(ctx, cfg)
}
