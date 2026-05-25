package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

type Options struct {
	HomeDir    string
	ProjectDir string
}

type Config struct {
	ModelProvider  string                    `yaml:"model_provider" json:"model_provider"`
	Model          string                    `yaml:"model" json:"model"`
	ModelProviders map[string]ProviderConfig `yaml:"model_providers" json:"model_providers"`
	Agents         []AgentEntry              `yaml:"agents" json:"agents"`
	Skill          SkillConfig               `yaml:"skill" json:"skill"`
	MCP            MCPConfig                 `yaml:"mcp" json:"mcp"`
	Tools          ToolsConfig               `yaml:"tools" json:"tools"`
}

// AgentEntry defines a configurable agent that can be referenced by name.
type AgentEntry struct {
	Name         string            `yaml:"name" json:"name"`
	Description  string            `yaml:"description,omitempty" json:"description,omitempty"`
	Model        string            `yaml:"model,omitempty" json:"model,omitempty"`
	SystemPrompt string            `yaml:"system_prompt,omitempty" json:"system_prompt,omitempty"`
	Temperature  *float64          `yaml:"temperature,omitempty" json:"temperature,omitempty"`
	Hidden       bool              `yaml:"hidden,omitempty" json:"hidden,omitempty"`
	Disabled     bool              `yaml:"disabled,omitempty" json:"disabled,omitempty"`
	Permission   map[string]string `yaml:"permission,omitempty" json:"permission,omitempty"`
}

type ModelEntry struct {
	ID           string `yaml:"id" json:"id"`
	DisplayName  string `yaml:"name" json:"name"`
	ContextLimit int64  `yaml:"context_limit,omitempty" json:"context_limit,omitempty"`
	OutputLimit  int64  `yaml:"output_limit,omitempty" json:"output_limit,omitempty"`
	Enabled      bool   `yaml:"enabled" json:"enabled"`
}

type ProviderConfig struct {
	Name              string       `yaml:"name" json:"name"`
	BaseURL           string       `yaml:"base_url" json:"base_url"`
	APIKey            string       `yaml:"api_key" json:"api_key"`
	WireAPI           string       `yaml:"wire_api" json:"wire_api"`
	ModelsDevProvider string       `yaml:"modelsdev_provider,omitempty" json:"modelsdev_provider,omitempty"`
	Models            []ModelEntry `yaml:"models" json:"models"`
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

func Load(opts Options) (Config, error) {
	var cfg Config

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
	merge(dst, src)
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
	merge(dst, src)
	return nil
}

func merge(dst *Config, src Config) {
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
		dst.MCP.Servers = append(dst.MCP.Servers, src.MCP.Servers...)
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
}

func migrateToJSON(path string, cfg Config) {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return
	}
	os.WriteFile(path, data, 0600)
}
