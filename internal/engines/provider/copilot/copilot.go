package copilot

import (
	"context"
	"fmt"

	"monika/internal/config"
	copilotapi "monika/pkg/copilot"
	"monika/pkg/engine"
)

func init() {
	engine.Register(&CopilotProvider{})
}

type CopilotProvider struct {
	config         map[string]any
	onTokenRefresh copilotapi.TokenRefreshCallback
}

func (p *CopilotProvider) ID() string                 { return "copilot" }
func (p *CopilotProvider) NewInstance() engine.Engine { return &CopilotProvider{} }
func (p *CopilotProvider) Capabilities() []engine.Capability {
	return []engine.Capability{engine.CapProvider}
}

func (p *CopilotProvider) Init(_ context.Context, cfg map[string]any) error {
	p.config = cfg
	return nil
}

func (p *CopilotProvider) Shutdown(_ context.Context) error { return nil }

// SetOnTokenRefresh injects a callback for persisting refreshed tokens.
func (p *CopilotProvider) SetOnTokenRefresh(cb copilotapi.TokenRefreshCallback) {
	p.onTokenRefresh = cb
}

func (p *CopilotProvider) StreamChat(ctx context.Context, req engine.ChatRequest) (<-chan engine.ChatEvent, error) {
	oauthToken := ""
	model := ""

	if p.config != nil {
		if v, ok := p.config["api_key"].(string); ok {
			oauthToken = v
		}
	}
	if req.Model != "" {
		model = req.Model
	} else if p.config != nil {
		if v, ok := p.config["model"].(string); ok {
			model = v
		}
	}

	if model == "" {
		model = "gpt-4o"
	}
	if oauthToken == "" {
		return nil, fmt.Errorf("copilot: no token configured")
	}

	hasVision := copilotapi.DetectVision(req.Messages)

	return copilotapi.StreamChat(ctx, oauthToken, model, req.Messages, req.Tools,
		copilotapi.WithVision(hasVision),
	)
}

func (p *CopilotProvider) ListModels(ctx context.Context) ([]engine.Model, error) {
	oauthToken := ""
	if p.config != nil {
		if v, ok := p.config["api_key"].(string); ok {
			oauthToken = v
		}
	}

	// Try fetching live model list from Copilot API.
	if oauthToken != "" {
		// Get a session token first, then fetch models from the dynamic endpoint.
		sess, err := copilotapi.ExchangeToken(ctx, oauthToken)
		if err == nil {
			apiModels, err := copilotapi.FetchModelsWithSession(ctx, sess.Token, sess.API)
			if err == nil && len(apiModels) > 0 {
				models := make([]engine.Model, 0, len(apiModels))
				for _, m := range apiModels {
					if !m.ModelPickerEnabled {
						continue
					}
					models = append(models, engine.Model{ID: m.ID, DisplayName: m.Name})
				}
				return models, nil
			}
		}
	}

	// Fallback to config models.
	if p.config != nil {
		if raw, ok := p.config["models"]; ok {
			if entries, ok := raw.([]config.ModelEntry); ok && len(entries) > 0 {
				models := make([]engine.Model, 0, len(entries))
				for _, e := range entries {
					if e.Enabled {
						models = append(models, engine.Model{ID: e.ID, DisplayName: e.DisplayName})
					}
				}
				return models, nil
			}
		}
	}
	return nil, nil
}
