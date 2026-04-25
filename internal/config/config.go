package config

import (
	"errors"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

type Options struct {
	HomeDir    string
	ProjectDir string
}

type Config struct {
	Plugins  map[string]PluginConfig `yaml:"plugins"`
	Provider ProviderConfig          `yaml:"provider"`
}

type PluginConfig struct {
	Config map[string]any `yaml:"config"`
}

type ProviderConfig struct {
	Plugin string         `yaml:"plugin"`
	ID     string         `yaml:"id"`
	Model  string         `yaml:"model"`
	Config map[string]any `yaml:"config"`
}

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
		return err
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
	if dst == nil {
		dst = map[string]any{}
	}
	for key, value := range src {
		dst[key] = value
	}
	return dst
}
