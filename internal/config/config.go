package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"

	"monika/internal/lsp"
)

type Options struct {
	HomeDir    string
	ProjectDir string
}

type Config struct {
	ModelProvider  string                         `yaml:"model_provider" json:"model_provider"`
	Model          string                         `yaml:"model" json:"model"`
	ModelProviders map[string]ProviderConfig      `yaml:"model_providers" json:"model_providers"`
	Agents         []AgentEntry                   `yaml:"agents" json:"agents"`
	Skill          SkillConfig                    `yaml:"skill" json:"skill"`
	MCP            MCPConfig                      `yaml:"mcp" json:"mcp"`
	Tools          ToolsConfig                    `yaml:"tools" json:"tools"`
	LSP            LSPConfig                      `yaml:"lsp" json:"lsp"`
	Formatters     map[string]lsp.FormatterConfig `yaml:"formatters" json:"formatters"`
	Proxy          ProxyConfig                    `yaml:"proxy" json:"proxy"`
}

type ProxyConfig struct {
	Enabled bool   `yaml:"enabled" json:"enabled"`
	URL     string `yaml:"url" json:"url"`
}

// AgentEntry defines a configurable agent that can be referenced by name.
type AgentEntry struct {
	Name         string            `yaml:"name" json:"name"`
	Description  string            `yaml:"description,omitempty" json:"description,omitempty"`
	Model        string            `yaml:"model,omitempty" json:"model,omitempty"`
	SystemPrompt string            `yaml:"system_prompt,omitempty" json:"systemPrompt,omitempty"`
	Temperature  *float64          `yaml:"temperature,omitempty" json:"temperature,omitempty"`
	Hidden       bool              `yaml:"hidden,omitempty" json:"hidden,omitempty"`
	Disabled     bool              `yaml:"disabled,omitempty" json:"disabled,omitempty"`
	Permission   map[string]string `yaml:"permission,omitempty" json:"permission,omitempty"`
}

type ModelEntry struct {
	ID              string   `yaml:"id" json:"id"`
	DisplayName     string   `yaml:"name" json:"name"`
	ContextLimit    int64    `yaml:"context_limit,omitempty" json:"context_limit,omitempty"`
	OutputLimit     int64    `yaml:"output_limit,omitempty" json:"output_limit,omitempty"`
	Enabled         bool     `yaml:"enabled" json:"enabled"`
	SupportedInputs []string `yaml:"supported_inputs,omitempty" json:"supported_inputs,omitempty"`
}

type ProviderConfig struct {
	Name              string       `yaml:"name" json:"name"`
	BaseURL           string       `yaml:"base_url" json:"base_url"`
	APIKey            string       `yaml:"api_key" json:"api_key"`
	WireAPI           string       `yaml:"wire_api" json:"wire_api"`
	ModelsDevProvider string       `yaml:"modelsdev_provider,omitempty" json:"modelsdev_provider,omitempty"`
	Models            []ModelEntry `yaml:"models" json:"models"`
	RefreshToken      string       `yaml:"refresh_token,omitempty" json:"refresh_token,omitempty"`
	TokenExpiresAt    int64        `yaml:"token_expires_at,omitempty" json:"token_expires_at,omitempty"`
}

type SkillConfig struct {
	Paths          []string `yaml:"paths" json:"paths"`
	DisabledSkills []string `yaml:"disabled_skills,omitempty" json:"disabled_skills,omitempty"`
}

type MCPConfig struct {
	Servers []MCPServerEntry `yaml:"servers" json:"servers"`
}

type MCPServerEntry struct {
	ID      string            `yaml:"id" json:"id"`
	Type    string            `yaml:"type,omitempty" json:"type,omitempty"`
	Command string            `yaml:"command,omitempty" json:"command,omitempty"`
	Args    []string          `yaml:"args,omitempty" json:"args,omitempty"`
	Env     map[string]string `yaml:"env,omitempty" json:"env,omitempty"`
	URL     string            `yaml:"url,omitempty" json:"url,omitempty"`
	Headers map[string]string `yaml:"headers,omitempty" json:"headers,omitempty"`
}

type RuleConfig struct {
	Tool     string `yaml:"tool" json:"tool"`
	Pattern  string `yaml:"pattern" json:"pattern"`
	Decision string `yaml:"decision" json:"decision"`
}

type ToolsConfig struct {
	Confirm  []string     `yaml:"confirm" json:"confirm"`
	Disallow []string     `yaml:"disallow" json:"disallow"`
	Rules    []RuleConfig `yaml:"rules" json:"rules"`
}

type LSPConfig struct {
	Servers map[string]lsp.ServerConfig `yaml:"servers" json:"servers"`
}

func Load(opts Options) (Config, error) {
	var cfg Config

	// Migrate inline credentials from config files before loading
	if opts.HomeDir != "" {
		credPath := filepath.Join(opts.HomeDir, ".monika", "credentials.json")
		jsonPath := filepath.Join(opts.HomeDir, ".monika", "config.json")
		yamlPath := filepath.Join(opts.HomeDir, ".monika", "config.yaml")
		if _, err := os.Stat(jsonPath); err == nil {
			MigrateInlineCredentials(jsonPath, credPath)
		} else if _, err := os.Stat(yamlPath); err == nil {
			MigrateInlineCredentials(yamlPath, credPath)
		}
	}
	if opts.ProjectDir != "" {
		credPath := filepath.Join(opts.ProjectDir, ".monika", "credentials.json")
		jsonPath := filepath.Join(opts.ProjectDir, ".monika", "config.json")
		yamlPath := filepath.Join(opts.ProjectDir, ".monika", "config.yaml")
		if _, err := os.Stat(jsonPath); err == nil {
			MigrateInlineCredentials(jsonPath, credPath)
		} else if _, err := os.Stat(yamlPath); err == nil {
			MigrateInlineCredentials(yamlPath, credPath)
		}
	}

	if opts.HomeDir != "" {
		jsonPath := filepath.Join(opts.HomeDir, ".monika", "config.json")
		yamlPath := filepath.Join(opts.HomeDir, ".monika", "config.yaml")
		if _, err := os.Stat(jsonPath); err == nil {
			if err := mergeFileJSON(&cfg, jsonPath); err != nil {
				return Config{}, err
			}
		} else if _, err := os.Stat(yamlPath); err == nil {
			if err := mergeFile(&cfg, yamlPath); err != nil {
				return Config{}, err
			}
			migrateToJSON(jsonPath, cfg)
		}
	}
	if opts.ProjectDir != "" {
		jsonPath := filepath.Join(opts.ProjectDir, ".monika", "config.json")
		yamlPath := filepath.Join(opts.ProjectDir, ".monika", "config.yaml")
		if _, err := os.Stat(jsonPath); err == nil {
			if err := mergeFileJSON(&cfg, jsonPath); err != nil {
				return Config{}, err
			}
		} else if _, err := os.Stat(yamlPath); err == nil {
			if err := mergeFile(&cfg, yamlPath); err != nil {
				return Config{}, err
			}
			migrateToJSON(jsonPath, cfg)
		}
	}
	if opts.ProjectDir != "" {
		projectJSON := filepath.Join(opts.ProjectDir, ".monika", "config.json")
		if err := migrateLSPJSON(opts.ProjectDir); err != nil {
			fmt.Fprintf(os.Stderr, "[monika] lsp.json migration: %v\n", err)
		} else if _, err := os.Stat(projectJSON); err == nil {
			// Re-read migrated LSP servers into in-memory config
			migratedData, err := os.ReadFile(projectJSON)
			if err == nil {
				var migratedCfg Config
				if err := json.Unmarshal(migratedData, &migratedCfg); err == nil && len(migratedCfg.LSP.Servers) > 0 {
					if cfg.LSP.Servers == nil {
						cfg.LSP.Servers = make(map[string]lsp.ServerConfig)
					}
					for name, srv := range migratedCfg.LSP.Servers {
						cfg.LSP.Servers[name] = srv
					}
				}
			}
		}
	}

	if opts.HomeDir != "" {
		credPath := filepath.Join(opts.HomeDir, ".monika", "credentials.json")
		if store, err := LoadCredentials(credPath); err == nil {
			ApplyCredentialsStore(&cfg, store)
		}
	}
	if opts.ProjectDir != "" {
		credPath := filepath.Join(opts.ProjectDir, ".monika", "credentials.json")
		if store, err := LoadCredentials(credPath); err == nil {
			ApplyCredentialsStore(&cfg, store)
		}
	}

	return cfg, nil
}

func mergeFile(dst *Config, path string) error {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}

	var src Config
	if err := yaml.Unmarshal(data, &src); err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}
	Merge(dst, src)
	return nil
}

func mergeFileJSON(dst *Config, path string) error {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	var src Config
	if err := json.Unmarshal(data, &src); err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}
	Merge(dst, src)
	return nil
}

func Merge(dst *Config, src Config) {
	if src.ModelProvider != "" {
		dst.ModelProvider = src.ModelProvider
	}
	if src.Model != "" {
		dst.Model = src.Model
	}
	if len(src.ModelProviders) > 0 {
		if dst.ModelProviders == nil {
			dst.ModelProviders = make(map[string]ProviderConfig, len(src.ModelProviders))
		}
		for key, provider := range src.ModelProviders {
			current, exists := dst.ModelProviders[key]
			if !exists {
				dst.ModelProviders[key] = provider
				continue
			}
			if provider.Name != "" {
				current.Name = provider.Name
			}
			if provider.BaseURL != "" {
				current.BaseURL = provider.BaseURL
			}
			if provider.APIKey != "" {
				current.APIKey = provider.APIKey
			}
			if provider.WireAPI != "" {
				current.WireAPI = provider.WireAPI
			}
			if len(provider.Models) > 0 {
				// Merge model entries: src updates context/output limits,
				// but preserves user-set Enabled from the existing entry.
				existingModels := make(map[string]int, len(current.Models))
				for i, m := range current.Models {
					existingModels[m.ID] = i
				}
				for _, srcModel := range provider.Models {
					if idx, ok := existingModels[srcModel.ID]; ok {
						target := &current.Models[idx]
						if srcModel.DisplayName != "" {
							target.DisplayName = srcModel.DisplayName
						}
						if srcModel.ContextLimit > 0 {
							target.ContextLimit = srcModel.ContextLimit
						}
						if srcModel.OutputLimit > 0 {
							target.OutputLimit = srcModel.OutputLimit
						}
						if len(srcModel.SupportedInputs) > 0 {
							target.SupportedInputs = srcModel.SupportedInputs
						}
						// Enabled stays as-is (user's choice)
					} else {
						current.Models = append(current.Models, srcModel)
					}
				}
			}
			dst.ModelProviders[key] = current
		}
	}
	if len(src.Skill.Paths) > 0 {
		dst.Skill.Paths = append(dst.Skill.Paths, src.Skill.Paths...)
	}
	if len(src.MCP.Servers) > 0 {
		existing := make(map[string]int, len(dst.MCP.Servers))
		for i, s := range dst.MCP.Servers {
			existing[s.ID] = i
		}
		for _, s := range src.MCP.Servers {
			if idx, ok := existing[s.ID]; ok {
				dst.MCP.Servers[idx] = s // src (project) overrides dst (global)
			} else {
				dst.MCP.Servers = append(dst.MCP.Servers, s)
			}
		}
	}
	if len(src.Tools.Confirm) > 0 || len(src.Tools.Disallow) > 0 {
		dst.Tools.Confirm = src.Tools.Confirm
		dst.Tools.Disallow = src.Tools.Disallow
	}
	if len(src.Tools.Rules) > 0 {
		dst.Tools.Rules = append(dst.Tools.Rules, src.Tools.Rules...)
	}
	if len(src.Agents) > 0 {
		existingByName := make(map[string]int)
		for i, a := range dst.Agents {
			existingByName[a.Name] = i
		}
		for _, a := range src.Agents {
			if idx, ok := existingByName[a.Name]; ok {
				target := &dst.Agents[idx]
				if a.Description != "" {
					target.Description = a.Description
				}
				if a.Model != "" {
					target.Model = a.Model
				}
				if a.SystemPrompt != "" {
					target.SystemPrompt = a.SystemPrompt
				}
				if a.Temperature != nil {
					target.Temperature = a.Temperature
				}
				target.Hidden = a.Hidden
				target.Disabled = a.Disabled
				if a.Permission != nil {
					target.Permission = a.Permission
				}
			} else {
				dst.Agents = append(dst.Agents, a)
			}
		}
	}
	if len(src.LSP.Servers) > 0 {
		if dst.LSP.Servers == nil {
			dst.LSP.Servers = make(map[string]lsp.ServerConfig, len(src.LSP.Servers))
		}
		for name, srv := range src.LSP.Servers {
			dst.LSP.Servers[name] = srv
		}
	}
	if len(src.Formatters) > 0 {
		if dst.Formatters == nil {
			dst.Formatters = make(map[string]lsp.FormatterConfig, len(src.Formatters))
		}
		for lang, fc := range src.Formatters {
			dst.Formatters[lang] = fc
		}
	}
}

func migrateToJSON(path string, cfg Config) {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return
	}
	os.WriteFile(path, data, 0600)
}
