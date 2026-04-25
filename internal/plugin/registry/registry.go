// Package registry manages the JSON-based plugin registry that tracks
// installed provider plugin binaries and their exposed AI providers.
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
	Package              string          `json:"package"`                         // Go module path without version.
	PackageRef           string          `json:"package_ref"`                     // Original install reference (may include @version).
	Binary               string          `json:"binary"`                          // Logical binary name.
	BinaryPath           string          `json:"binary_path"`                     // Filesystem path to the installed binary.
	Checksum             string          `json:"checksum"`                        // Binary checksum for integrity verification.
	Version              string          `json:"version"`                         // Resolved semantic version.
	ProtocolVersion      string          `json:"protocol_version"`                // go-plugin protocol version supported by the plugin.
	InstalledAt          time.Time       `json:"installed_at"`                    // When the plugin was installed.
	CapabilitiesSnapshot json.RawMessage `json:"capabilities_snapshot,omitempty"` // Captured gRPC capabilities response.
	Providers            []ProviderEntry `json:"providers"`                       // AI providers exposed by this plugin.
}

// ProviderEntry describes a single AI provider exposed by a plugin.
type ProviderEntry struct {
	ID           string   `json:"id"`           // Unique provider identifier within the plugin.
	Name         string   `json:"name"`         // Human-readable provider name.
	Capabilities []string `json:"capabilities"` // Features supported by this provider (e.g. "chat", "stream").
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
