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
	Plugins  map[string]PluginConfig `yaml:"plugins"`  // Per-plugin configuration keyed by plugin ID.
	Provider ProviderConfig          `yaml:"provider"` // Active provider selection and parameters.
}

// PluginConfig holds configuration for a single provider plugin.
type PluginConfig struct {
	Config map[string]any `yaml:"config"` // Arbitrary key-value pairs passed to the plugin.
}

// ProviderConfig describes the active provider and its parameters.
type ProviderConfig struct {
	Plugin string         `yaml:"plugin"` // Name of the provider plugin to activate.
	ID     string         `yaml:"id"`     // Provider ID within the plugin.
	Model  string         `yaml:"model"`  // Model name to use.
	Config map[string]any `yaml:"config"` // Provider-specific parameters (e.g. base_url).
}

// Load reads and merges configuration from the home and project directories.
// Home config is loaded first; project config overlays on top.
// Missing config files are silently skipped.
func Load(opts Options) (Config, error) {
	var cfg Config
	cfg.Plugins = map[string]PluginConfig{}
	cfg.Provider.Config = map[string]any{}

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
	if dst.Plugins == nil {
		dst.Plugins = map[string]PluginConfig{}
	}
	for id, plugin := range src.Plugins {
		current := dst.Plugins[id]
		current.Config = mergeMap(current.Config, plugin.Config)
		dst.Plugins[id] = current
	}

	if src.Provider.Plugin != "" {
		dst.Provider.Plugin = src.Provider.Plugin
	}
	if src.Provider.ID != "" {
		dst.Provider.ID = src.Provider.ID
	}
	if src.Provider.Model != "" {
		dst.Provider.Model = src.Provider.Model
	}
	dst.Provider.Config = mergeMap(dst.Provider.Config, src.Provider.Config)
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
