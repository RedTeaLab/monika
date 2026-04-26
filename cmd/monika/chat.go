package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
	"monika/internal/agent"
	"monika/internal/config"
	"monika/internal/tool"
	"monika/internal/tool/builtin"
	"monika/pkg/engine"

	"github.com/spf13/cobra"
)

var chatModel string

var chatCmd = &cobra.Command{
	Use:   `chat [message]`,
	Short: "Send a message to the AI",
	Long:  "Send a message to the configured AI provider.\nConfigure provider in .monika/config.yaml.",
	Args:  cobra.MinimumNArgs(1),
	RunE:  runChat,
}

func init() {
	chatCmd.Flags().StringVarP(&chatModel, "model", "m", "", "Model override (takes precedence over config)")
	rootCmd.AddCommand(chatCmd)
}

func runChat(cmd *cobra.Command, args []string) error {
	message := strings.Join(args, " ")
	ctx := context.Background()

	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("cannot determine home directory: %w", err)
	}
	cwd, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("cannot determine working directory: %w", err)
	}

	cfg, err := config.Load(config.Options{HomeDir: home, ProjectDir: cwd})
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}

	if cfg.ModelProvider == "" {
		if err := setupConfig(home); err != nil {
			return err
		}
		fmt.Println()
		cfg, err = config.Load(config.Options{HomeDir: home, ProjectDir: cwd})
		if err != nil {
			return fmt.Errorf("config reload: %w", err)
		}
	}

	providerName := cfg.ModelProvider

	eng, err := engine.EngineByID(providerName)
	if err != nil {
		return fmt.Errorf("provider %q not registered; run 'monika engines' to list available", providerName)
	}

	providerCfg, ok := cfg.ModelProviders[providerName]
	if !ok {
		return fmt.Errorf("no config for provider %q in model_providers", providerName)
	}

	initCfg := map[string]any{
		"base_url": providerCfg.BaseURL,
		"api_key":  providerCfg.APIKey,
	}

	if err := eng.Init(ctx, initCfg); err != nil {
		return fmt.Errorf("init %s: %w", providerName, err)
	}

	providerEng, ok := eng.(engine.ProviderEngine)
	if !ok {
		return fmt.Errorf("engine %q is not a provider engine", providerName)
	}

	model := chatModel
	if model == "" {
		model = cfg.Model
	}

	registry := tool.NewRegistry()
	if err := builtin.RegisterDefaults(registry, cwd); err != nil {
		return fmt.Errorf("register tools: %w", err)
	}

	loopOpts := []agent.LoopOption{
		agent.WithProjectDir(cwd),
		agent.WithModel(model),
	}

	if prompt := loadSystemPrompt(cwd); prompt != "" {
		loopOpts = append(loopOpts, agent.WithSystemPrompt(prompt))
	}

	loop := agent.NewLoop(providerEng, registry, loopOpts...)

	result, err := loop.Run(ctx, nil, message)
	if err != nil {
		return err
	}

	fmt.Fprint(cmd.OutOrStdout(), result.Content)
	fmt.Fprintln(cmd.OutOrStdout())
	if result.Usage.TotalTokens > 0 {
		fmt.Fprintf(os.Stderr, "[tokens: in=%d out=%d total=%d]\n",
			result.Usage.InputTokens, result.Usage.OutputTokens, result.Usage.TotalTokens)
	}
	return nil
}

func loadSystemPrompt(projectDir string) string {
	paths := []string{
		filepath.Join(projectDir, "AGENTS.md"),
		filepath.Join(projectDir, ".monika", "AGENTS.md"),
	}
	for _, p := range paths {
		if data, err := os.ReadFile(p); err == nil {
			return string(data)
		}
	}
	return ""
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
