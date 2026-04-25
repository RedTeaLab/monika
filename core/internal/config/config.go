// Package config loads layered monika configuration from YAML files.
// Home directory config (~/.monika/config.yaml) is loaded first,
// then project directory config (.monika/config.yaml) is merged on top,
// with project values taking precedence.
package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// Options specifies the directories to load configuration from.
type Options struct {
	HomeDir    string // Path to the user home directory (usually ~/).
	ProjectDir string // Path to the project root directory.
}

// Config is the top-level monika configuration.
type Config struct {
	ModelProvider  string                    `yaml:"model_provider"`
	Model          string                    `yaml:"model"`
	ModelProviders map[string]ProviderConfig `yaml:"model_providers"`
	Skill          SkillConfig               `yaml:"skill"`
	MCP            MCPConfig                 `yaml:"mcp"`
	Tools          ToolsConfig               `yaml:"tools"`
}

// ProviderConfig describes a single LLM provider connection.
type ProviderConfig struct {
	Name    string `yaml:"name"`
	BaseURL string `yaml:"base_url"`
	APIKey  string `yaml:"api_key"`
	WireAPI string `yaml:"wire_api"`
}

// SkillConfig configures skill discovery paths.
type SkillConfig struct {
	Paths []string `yaml:"paths"`
}

// MCPConfig configures MCP server connections.
type MCPConfig struct {
	Servers []MCPServerEntry `yaml:"servers"`
}

// MCPServerEntry describes a single MCP server.
type MCPServerEntry struct {
	ID      string            `yaml:"id"`
	Command string            `yaml:"command"`
	Args    []string          `yaml:"args"`
	Env     map[string]string `yaml:"env"`
}

// ToolsConfig configures tool permission policies.
type ToolsConfig struct {
	Confirm  []string `yaml:"confirm"`
	Disallow []string `yaml:"disallow"`
}

// Load reads and merges configuration from the home and project directories.
// Home config is loaded first; project config overlays on top.
// Missing config files are silently skipped.
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
