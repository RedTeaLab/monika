package provider

import (
	"context"
	"fmt"
	"sync"

	"monika/engine"
)

func init() {
	engine.Register(&ProviderEngine{})
}

type ProviderEngine struct {
	mu       sync.RWMutex
	backends map[string]Backend
}

type Backend struct {
	Name    string
	BaseURL string
	APIKey  string
	WireAPI string
}

func (e *ProviderEngine) ID() string { return "provider" }

func (e *ProviderEngine) Capabilities() []engine.Capability {
	return []engine.Capability{engine.CapProvider}
}

func (e *ProviderEngine) Init(_ context.Context, cfg map[string]any) error {
	e.backends = make(map[string]Backend)
	providers, ok := cfg["model_providers"]
	if !ok {
		return nil
	}
	providersMap, ok := providers.(map[string]any)
	if !ok {
		return nil
	}
	for id, val := range providersMap {
		fields, ok := val.(map[string]any)
		if !ok {
			continue
		}
		b := Backend{}
		if v, ok := fields["name"].(string); ok {
			b.Name = v
		}
		if v, ok := fields["base_url"].(string); ok {
			b.BaseURL = v
		}
		if v, ok := fields["api_key"].(string); ok {
			b.APIKey = v
		}
		if v, ok := fields["wire_api"].(string); ok {
			b.WireAPI = v
		}
		e.backends[id] = b
	}
	return nil
}

func (e *ProviderEngine) Shutdown(_ context.Context) error {
	return nil
}

func (e *ProviderEngine) StreamChat(_ context.Context, _ engine.ChatRequest) ([]engine.ChatEvent, error) {
	return nil, fmt.Errorf("provider engine: StreamChat not yet implemented")
}

func (e *ProviderEngine) ListModels(_ context.Context) ([]engine.Model, error) {
	return nil, fmt.Errorf("provider engine: ListModels not yet implemented")
}

func (e *ProviderEngine) Backend(id string) (Backend, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	b, ok := e.backends[id]
	return b, ok
}
