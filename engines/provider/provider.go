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

func (e *ProviderEngine) StreamChat(ctx context.Context, req engine.ChatRequest) ([]engine.ChatEvent, error) {
	e.mu.RLock()
	backend, ok := e.backends[req.Provider]
	e.mu.RUnlock()
	if !ok {
		e.mu.RLock()
		for _, b := range e.backends {
			backend = b
			ok = true
			break
		}
		e.mu.RUnlock()
	}
	if !ok {
		return nil, fmt.Errorf("provider engine: no backend configured")
	}
	return callStreamChat(backend, req)
}

func (e *ProviderEngine) ListModels(_ context.Context) ([]engine.Model, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	var models []engine.Model
	for id, b := range e.backends {
		models = append(models, engine.Model{ID: id, DisplayName: b.Name})
	}
	return models, nil
}

func (e *ProviderEngine) Backend(id string) (Backend, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	b, ok := e.backends[id]
	return b, ok
}
