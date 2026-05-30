package openai

import (
	"context"
	"fmt"

	"monika/internal/config"
	"monika/pkg/engine"
	oaiclient "monika/pkg/openai"
)

func init() {
	engine.Register(&OpenAIProvider{})
}

type OpenAIProvider struct {
	config map[string]any
}

func (p *OpenAIProvider) ID() string { return "openai" }

func (p *OpenAIProvider) NewInstance() engine.Engine { return &OpenAIProvider{} }

func (p *OpenAIProvider) Capabilities() []engine.Capability {
	return []engine.Capability{engine.CapProvider}
}

func (p *OpenAIProvider) Init(_ context.Context, cfg map[string]any) error {
	p.config = cfg
	return nil
}

func (p *OpenAIProvider) Shutdown(_ context.Context) error {
	return nil
}

func (p *OpenAIProvider) StreamChat(ctx context.Context, req engine.ChatRequest) (<-chan engine.ChatEvent, error) {
	cfg := p.resolveConfig(req)
	if cfg.BaseURL == "" {
		return nil, fmt.Errorf("openai: base_url not configured")
	}
	return oaiclient.StreamChat(ctx, cfg.BaseURL, cfg.APIKey, cfg.Model, req.Messages, req.Tools)
}

func (p *OpenAIProvider) ListModels(ctx context.Context) ([]engine.Model, error) {
	if p.config != nil {
		if raw, ok := p.config["models"]; ok {
			entries, ok := raw.([]config.ModelEntry)
			if ok && len(entries) > 0 {
				models := make([]engine.Model, len(entries))
				for i, e := range entries {
					models[i] = engine.Model{ID: e.ID, DisplayName: e.DisplayName}
				}
				return models, nil
			}
		}
	}
	return nil, nil
}

func (p *OpenAIProvider) resolveConfig(req engine.ChatRequest) resolvedConfig {
	cfg := resolvedConfig{}
	if p.config != nil {
		if v, ok := p.config["base_url"].(string); ok {
			cfg.BaseURL = v
		}
		if v, ok := p.config["api_key"].(string); ok {
			cfg.APIKey = v
		}
	}
	if req.Model != "" {
		cfg.Model = req.Model
	} else if p.config != nil {
		if v, ok := p.config["model"].(string); ok {
			cfg.Model = v
		}
	}
	if cfg.Model == "" {
		cfg.Model = "gpt-4o"
	}
	return cfg
}

type resolvedConfig struct {
	BaseURL string
	APIKey  string
	Model   string
}
