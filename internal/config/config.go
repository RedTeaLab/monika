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

// ContextLimit is an optional token limit override for a model.
type ContextLimit int64

// Int64 returns the context limit as an int64, or 0 if unset.
func (c ContextLimit) Int64() int64 { return int64(c) }

// UnmarshalYAML implements yaml.Unmarshaler so that human-readable strings
// like "128k" and "1m" are accepted alongside plain integers.
func (c *ContextLimit) UnmarshalYAML(value *yaml.Node) error {
	switch value.Kind {
	case yaml.ScalarNode:
		if value.Tag == "!!int" {
			var n int64
			if err := value.Decode(&n); err != nil {
				return err
			}
			*c = ContextLimit(n)
			return nil
		}
		// string — parse human-readable suffix
		var s string
		if err := value.Decode(&s); err != nil {
			return err
		}
		n, err := parseSize(s)
		if err != nil {
			return err
		}
		*c = ContextLimit(n)
		return nil
	}
	return fmt.Errorf("ContextLimit: expected scalar, got kind %d", value.Kind)
}

func parseSize(s string) (int64, error) {
	if s == "" {
		return 0, fmt.Errorf("empty size string")
	}
	// Strip optional 'b' or 'B' suffix (e.g. "128kb" → "128k")
	if len(s) > 1 && (s[len(s)-1] == 'b' || s[len(s)-1] == 'B') {
		s = s[:len(s)-1]
	}
	if len(s) == 0 {
		return 0, fmt.Errorf("empty size string")
	}
	last := s[len(s)-1]
	var mult int64 = 1
	var numStr string
	switch last {
	case 'k', 'K':
		mult = 1000
		numStr = s[:len(s)-1]
	case 'm', 'M':
		mult = 1000000
		numStr = s[:len(s)-1]
	case 'g', 'G':
		mult = 1000000000
		numStr = s[:len(s)-1]
	default:
		numStr = s
	}
	var val int64
	if _, err := fmt.Sscanf(numStr, "%d", &val); err != nil {
		return 0, fmt.Errorf("cannot parse %q as size: %w", s, err)
	}
	if val < 0 {
		return 0, fmt.Errorf("negative size: %s", s)
	}
	return val * mult, nil
}

type ModelEntry struct {
	ID           string       `yaml:"id" json:"id"`
	DisplayName  string       `yaml:"name" json:"name"`
	ContextLimit ContextLimit `yaml:"context_limit,omitempty" json:"context_limit,omitempty"`
}

type ProviderConfig struct {
	Name    string       `yaml:"name" json:"name"`
	BaseURL string       `yaml:"base_url" json:"base_url"`
	APIKey  string       `yaml:"api_key" json:"api_key"`
	WireAPI string       `yaml:"wire_api" json:"wire_api"`
	Models  []ModelEntry `yaml:"models" json:"models"`
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
	Command string            `yaml:"command" json:"command"`
	Args    []string          `yaml:"args" json:"args"`
	Env     map[string]string `yaml:"env" json:"env"`
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
				current.Models = provider.Models
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

