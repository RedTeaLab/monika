package deepseek

import (
	"context"
	"fmt"

	"monika/engine"
	"monika/engines/provider"
)

func init() {
	engine.Register(&DeepSeekProvider{})
}

type DeepSeekProvider struct {
	config map[string]any
}

func (p *DeepSeekProvider) ID() string { return "deepseek" }

func (p *DeepSeekProvider) Capabilities() []engine.Capability {
	return []engine.Capability{engine.CapProvider}
}

func (p *DeepSeekProvider) Init(_ context.Context, cfg map[string]any) error {
	p.config = cfg
	return nil
}

func (p *DeepSeekProvider) Shutdown(_ context.Context) error {
	return nil
}

func (p *DeepSeekProvider) StreamChat(ctx context.Context, req engine.ChatRequest) ([]engine.ChatEvent, error) {
	cfg := p.resolveConfig(req)
	if cfg.BaseURL == "" {
		return nil, fmt.Errorf("deepseek: base_url not configured")
	}
	return provider.CallOpenAICompat(ctx, cfg.BaseURL, cfg.APIKey, cfg.Model, req.Messages)
}

func (p *DeepSeekProvider) ListModels(ctx context.Context) ([]engine.Model, error) {
	return []engine.Model{
		{ID: "deepseek-chat", DisplayName: "DeepSeek Chat"},
		{ID: "deepseek-reasoner", DisplayName: "DeepSeek Reasoner"},
	}, nil
}

type resolvedConfig struct {
	BaseURL string
	APIKey  string
	Model   string
}

func (p *DeepSeekProvider) resolveConfig(req engine.ChatRequest) resolvedConfig {
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
		cfg.Model = "deepseek-chat"
	}
	return cfg
}
