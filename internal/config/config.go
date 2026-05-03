package config

import (
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
	ModelProvider  string                    `yaml:"model_provider"`
	Model          string                    `yaml:"model"`
	ModelProviders map[string]ProviderConfig `yaml:"model_providers"`
	Skill          SkillConfig               `yaml:"skill"`
	MCP            MCPConfig                 `yaml:"mcp"`
	Tools          ToolsConfig               `yaml:"tools"`
}

// ContextLimit is an optional token limit override for a model.
type ContextLimit int64

// Int64 returns the context limit as an int64, or 0 if unset.
func (c ContextLimit) Int64() int64 { return int64(c) }

type ModelEntry struct {
	ID           string       `yaml:"id"`
	DisplayName  string       `yaml:"name"`
	ContextLimit ContextLimit `yaml:"context_limit,omitempty"`
}

type ProviderConfig struct {
	Name    string       `yaml:"name"`
	BaseURL string       `yaml:"base_url"`
	APIKey  string       `yaml:"api_key"`
	WireAPI string       `yaml:"wire_api"`
	Models  []ModelEntry `yaml:"models"`
}

type SkillConfig struct {
	Paths []string `yaml:"paths"`
}

type MCPConfig struct {
	Servers []MCPServerEntry `yaml:"servers"`
}

type MCPServerEntry struct {
	ID      string            `yaml:"id"`
	Command string            `yaml:"command"`
	Args    []string          `yaml:"args"`
	Env     map[string]string `yaml:"env"`
}

type ToolsConfig struct {
	Confirm  []string `yaml:"confirm"`
	Disallow []string `yaml:"disallow"`
}

func Load(opts Options) (Config, error) {
	var cfg Config

	if opts.HomeDir != "" {
		if err := mergeFile(&cfg, filepath.Join(opts.HomeDir, ".monika", "config.yaml")); err != nil {
			return Config{}, err
		}
	}
	if opts.ProjectDir != "" {
		if err := mergeFile(&cfg, filepath.Join(opts.ProjectDir, ".monika", "config.yaml")); err != nil {
			return Config{}, err
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
		dst.Tools = src.Tools
	}
}

func mergeMap(dst, src map[string]any) map[string]any {
	if dst == nil && len(src) == 0 {
		return dst
	}
	if dst == nil {
		dst = make(map[string]any, len(src))
	}
	for key, value := range src {
		dst[key] = value
	}
	return dst
}
