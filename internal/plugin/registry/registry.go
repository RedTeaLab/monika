package registry

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Registry holds the set of installed provider plugins and their exposed providers.
type Registry struct {
	Plugins []Plugin `json:"plugins"`
}

// Plugin describes a single installed provider plugin binary.
type Plugin struct {
	ID                   string          `json:"plugin_id"`
	Package              string          `json:"package"`
	PackageRef           string          `json:"package_ref"`
	Binary               string          `json:"binary"`
	BinaryPath           string          `json:"binary_path"`
	Checksum             string          `json:"checksum"`
	Version              string          `json:"version"`
	ProtocolVersion      string          `json:"protocol_version"`
	InstalledAt          time.Time       `json:"installed_at"`
	CapabilitiesSnapshot json.RawMessage `json:"capabilities_snapshot,omitempty"`
	Providers            []ProviderEntry `json:"providers"`
}

// ProviderEntry describes a single AI provider exposed by a plugin.
type ProviderEntry struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Capabilities []string `json:"capabilities"`
}

// Load reads a plugin registry from the JSON file at path.
// If the file does not exist, it returns an empty Registry without an error.
func Load(path string) (Registry, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return Registry{}, nil
	}
	if err != nil {
		return Registry{}, err
	}
	var registry Registry
	if err := json.Unmarshal(data, &registry); err != nil {
		return Registry{}, err
	}
	return registry, nil
}

// Save writes the plugin registry to the JSON file at path, creating parent
// directories as needed.
func Save(path string, registry Registry) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(registry, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o644)
}

// ResolveProvider looks up a provider by its ID. If pluginID is non-empty,
// only that plugin is searched; otherwise all plugins are searched and an
// error is returned when the provider name is found in more than one plugin.
func (r Registry) ResolveProvider(pluginID, providerID string) (Plugin, ProviderEntry, error) {
	if providerID == "" {
		return Plugin{}, ProviderEntry{}, fmt.Errorf("providerID must not be empty")
	}

	var matches []struct {
		plugin   Plugin
		provider ProviderEntry
	}

	for _, plugin := range r.Plugins {
		if pluginID != "" && plugin.ID != pluginID {
			continue
		}
		for _, provider := range plugin.Providers {
			if provider.ID == providerID {
				matches = append(matches, struct {
					plugin   Plugin
					provider ProviderEntry
				}{plugin: plugin, provider: provider})
			}
		}
	}

	if len(matches) == 0 {
		return Plugin{}, ProviderEntry{}, fmt.Errorf("provider %q not found", providerID)
	}
	if len(matches) > 1 {
		return Plugin{}, ProviderEntry{}, fmt.Errorf("provider %q is registered by multiple plugins", providerID)
	}
	return matches[0].plugin, matches[0].provider, nil
}
