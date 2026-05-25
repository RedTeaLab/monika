package bootstrap

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"monika/internal/config"
	"monika/pkg/engine"
)

type Result struct {
	Providers map[string]engine.ProviderEngine
	Model     string
	Config    config.Config
}

func InitProvider(ctx context.Context, home, cwd, modelOverride string) (*Result, error) {
	cfg, err := config.Load(config.Options{HomeDir: home, ProjectDir: cwd})
	if err != nil {
		return nil, fmt.Errorf("config: %w", err)
	}

	yamlPath := filepath.Join(home, ".monika", "config.yaml")
	jsonPath := filepath.Join(home, ".monika", "config.json")
	if _, err := os.Stat(yamlPath); err == nil {
		if _, err := os.Stat(jsonPath); err == nil {
			fmt.Fprintf(os.Stderr, "[monika] config migrated from config.yaml to config.json\n")
		}
	}

	if len(cfg.ModelProviders) == 0 {
		fmt.Fprintf(os.Stderr, "[monika] no providers configured; open Settings > Providers to add one\n")
		return &Result{
			Providers: make(map[string]engine.ProviderEngine),
			Model:     "",
			Config:    cfg,
		}, nil
	}

	providers := make(map[string]engine.ProviderEngine)
	for providerID, providerCfg := range cfg.ModelProviders {
		engineID := providerCfg.WireAPI
		if engineID == "" {
			engineID = providerID
		}
		eng, err := engine.EngineByID(engineID)
		if err != nil {
			fmt.Fprintf(os.Stderr, "[monika] skipping provider %q: engine %q not registered\n", providerID, engineID)
			continue
		}
		initCfg := map[string]any{
			"base_url": providerCfg.BaseURL,
			"api_key":  providerCfg.APIKey,
			"models":   providerCfg.Models,
		}
		if err := eng.Init(ctx, initCfg); err != nil {
			fmt.Fprintf(os.Stderr, "[monika] skipping provider %q: init failed: %v\n", providerID, err)
			continue
		}
		providerEng, ok := eng.(engine.ProviderEngine)
		if !ok {
			fmt.Fprintf(os.Stderr, "[monika] skipping provider %q: not a provider engine\n", providerID)
			continue
		}
		providers[providerID] = providerEng
	}
	if len(providers) == 0 {
		return nil, fmt.Errorf("no providers could be initialized; check your config at %s", filepath.Join(home, ".monika", "config.yaml"))
	}

	model := modelOverride
	if model == "" {
		model = cfg.Model
	}

	return &Result{
		Providers: providers,
		Model:     model,
		Config:    cfg,
	}, nil
}
