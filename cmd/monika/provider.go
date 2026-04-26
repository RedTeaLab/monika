package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
	"monika/internal/config"
	"monika/pkg/engine"
)

type providerResult struct {
	provider engine.ProviderEngine
	model    string
	config   config.Config
}

func initProvider(ctx context.Context, home, cwd, modelOverride string) (*providerResult, error) {
	cfg, err := config.Load(config.Options{HomeDir: home, ProjectDir: cwd})
	if err != nil {
		return nil, fmt.Errorf("config: %w", err)
	}
	if cfg.ModelProvider == "" {
		if err := setupConfig(home); err != nil {
			return nil, err
		}
		fmt.Println()
		cfg, err = config.Load(config.Options{HomeDir: home, ProjectDir: cwd})
		if err != nil {
			return nil, fmt.Errorf("config reload: %w", err)
		}
	}

	eng, err := engine.EngineByID(cfg.ModelProvider)
	if err != nil {
		return nil, fmt.Errorf("provider %q not registered; run 'monika engines' to list available", cfg.ModelProvider)
	}
	providerCfg, ok := cfg.ModelProviders[cfg.ModelProvider]
	if !ok {
		return nil, fmt.Errorf("no config for provider %q in model_providers", cfg.ModelProvider)
	}
	initCfg := map[string]any{
		"base_url": providerCfg.BaseURL,
		"api_key":  providerCfg.APIKey,
	}
	if err := eng.Init(ctx, initCfg); err != nil {
		return nil, fmt.Errorf("init %s: %w", cfg.ModelProvider, err)
	}
	providerEng, ok := eng.(engine.ProviderEngine)
	if !ok {
		return nil, fmt.Errorf("engine %q is not a provider engine", cfg.ModelProvider)
	}

	model := modelOverride
	if model == "" {
		model = cfg.Model
	}

	return &providerResult{
		provider: providerEng,
		model:    model,
		config:   cfg,
	}, nil
}

var providerDefaults = map[string]struct{ baseURL, model string }{
	"deepseek": {"https://api.deepseek.com", "deepseek-chat"},
	"openai":   {"https://api.openai.com/v1", "gpt-4o"},
}

type writeConfig struct {
	ModelProvider  string                  `yaml:"model_provider"`
	Model          string                  `yaml:"model"`
	ModelProviders map[string]providerItem `yaml:"model_providers"`
}

type providerItem struct {
	Name    string `yaml:"name"`
	BaseURL string `yaml:"base_url"`
	APIKey  string `yaml:"api_key"`
}

func setupConfig(home string) error {
	var providerIDs []string
	for _, e := range engine.Engines() {
		for _, cap := range e.Capabilities() {
			if cap == engine.CapProvider {
				providerIDs = append(providerIDs, e.ID())
				break
			}
		}
	}
	if len(providerIDs) == 0 {
		return fmt.Errorf("no provider engines available; run 'monika engines'")
	}

	stderr := os.Stderr
	stdin := bufio.NewReader(os.Stdin)

	fmt.Fprint(stderr, "\nNo provider configured. Let's set one up.\n\n")
	fmt.Fprintln(stderr, "Available providers:")
	for i, id := range providerIDs {
		fmt.Fprintf(stderr, "  %d. %s\n", i+1, id)
	}

	choice := 0
	for {
		fmt.Fprint(stderr, "\nChoose a provider [1]: ")
		input, _ := stdin.ReadString('\n')
		input = strings.TrimSpace(input)
		if input == "" {
			choice = 1
			break
		}
		n, err := fmt.Sscanf(input, "%d", &choice)
		if err == nil && n == 1 && choice >= 1 && choice <= len(providerIDs) {
			break
		}
		fmt.Fprintln(stderr, "Invalid choice.")
	}

	providerName := providerIDs[choice-1]
	def, known := providerDefaults[providerName]
	if !known {
		def = struct{ baseURL, model string }{model: providerName}
	}

	fmt.Fprintf(stderr, "\nAPI key for %s: ", providerName)
	apiKey, _ := stdin.ReadString('\n')
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return fmt.Errorf("API key is required")
	}

	fmt.Fprintf(stderr, "Base URL [%s]: ", def.baseURL)
	baseURL, _ := stdin.ReadString('\n')
	baseURL = strings.TrimSpace(baseURL)
	if baseURL == "" {
		baseURL = def.baseURL
	}

	fmt.Fprintf(stderr, "Default model [%s]: ", def.model)
	model, _ := stdin.ReadString('\n')
	model = strings.TrimSpace(model)
	if model == "" {
		model = def.model
	}

	cfg := writeConfig{
		ModelProvider: providerName,
		Model:         model,
		ModelProviders: map[string]providerItem{
			providerName: {
				Name:    providerName,
				BaseURL: baseURL,
				APIKey:  apiKey,
			},
		},
	}

	configDir := filepath.Join(home, ".monika")
	if err := os.MkdirAll(configDir, 0o700); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}

	data, err := yaml.Marshal(&cfg)
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}

	configPath := filepath.Join(configDir, "config.yaml")
	if err := os.WriteFile(configPath, data, 0o600); err != nil {
		return fmt.Errorf("write config: %w", err)
	}

	fmt.Fprintf(stderr, "Config saved to %s\n", configPath)
	return nil
}
