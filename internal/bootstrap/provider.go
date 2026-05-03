package bootstrap

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"monika/internal/config"
	"monika/pkg/engine"

	"gopkg.in/yaml.v3"
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
	if len(cfg.ModelProviders) == 0 {
		if err := setupConfig(home); err != nil {
			return nil, err
		}
		fmt.Println()
		cfg, err = config.Load(config.Options{HomeDir: home, ProjectDir: cwd})
		if err != nil {
			return nil, fmt.Errorf("config reload: %w", err)
		}
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

var providerDefaults = map[string]struct {
	baseURL, model string
	models         []config.ModelEntry
}{
	"deepseek": {
		"https://api.deepseek.com",
		"deepseek-v4-pro",
		[]config.ModelEntry{
			{ID: "deepseek-v4-pro", DisplayName: "DeepSeek V4 Pro"},
			{ID: "deepseek-v4-flash", DisplayName: "DeepSeek V4 Flash"},
		},
	},
	"openai": {
		"https://api.openai.com/v1",
		"gpt-4o",
		[]config.ModelEntry{
			{ID: "gpt-4o", DisplayName: "GPT-4o"},
			{ID: "gpt-4o-mini", DisplayName: "GPT-4o Mini"},
		},
	},
}

type writeConfig struct {
	ModelProvider  string                  `yaml:"model_provider"`
	Model          string                  `yaml:"model"`
	ModelProviders map[string]providerItem `yaml:"model_providers"`
}

type providerItem struct {
	Name    string             `yaml:"name"`
	BaseURL string             `yaml:"base_url"`
	APIKey  string             `yaml:"api_key"`
	Models  []config.ModelEntry `yaml:"models"`
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
		def = struct {
			baseURL, model string
			models         []config.ModelEntry
		}{model: providerName}
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

	defModels := []config.ModelEntry{}
	if d, ok := providerDefaults[providerName]; ok {
		defModels = d.models
	}

	cfg := writeConfig{
		ModelProvider: providerName,
		Model:         model,
		ModelProviders: map[string]providerItem{
			providerName: {
				Name:    providerName,
				BaseURL: baseURL,
				APIKey:  apiKey,
				Models:  defModels,
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
