package modelsdev

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const apiURL = "https://models.dev/api.json"

// ProviderEntry maps model IDs to their limits within a provider.
type ProviderEntry struct {
	ID     string               `json:"id"`
	Name   string               `json:"name"`
	Npm    string               `json:"npm"`
	API    string               `json:"api"`
	Models map[string]ModelData `json:"models"`
}

// ModelData holds model data extracted from models.dev.
type ModelData struct {
	Name  string     `json:"name"`
	Limit ModelLimit `json:"limit"`
}

// ModelLimit holds the context window and output token limits.
type ModelLimit struct {
	Context int64 `json:"context"`
	Output  int64 `json:"output"`
}

// Catalog returns the full models.dev provider-indexed catalog.
// It fetches from the API or reads from a local cache file.
func Catalog(homeDir string) (map[string]ProviderEntry, error) {
	cachePath := filepath.Join(homeDir, ".monika", "models.json")
	data, err := os.ReadFile(cachePath)
	if err != nil {
		// No cache — fetch from API.
		data, err = fetch()
		if err != nil {
			return nil, err
		}
		_ = os.MkdirAll(filepath.Dir(cachePath), 0755)
		_ = os.WriteFile(cachePath, data, 0644)
	}

	var catalog map[string]ProviderEntry
	if err := json.Unmarshal(data, &catalog); err != nil {
		return nil, fmt.Errorf("models.dev parse: %w", err)
	}
	return catalog, nil
}

// LookupLimit searches the local models.dev cache for the given model ID.
func LookupLimit(homeDir, modelID string) (contextTokens, outputTokens int64) {
	catalog, err := Catalog(homeDir)
	if err != nil {
		return 0, 0
	}
	for _, p := range catalog {
		if md, ok := p.Models[modelID]; ok {
			return md.Limit.Context, md.Limit.Output
		}
	}
	return 0, 0
}

// Refresh fetches the latest models.dev data and writes it to the cache file.
func Refresh(homeDir string) error {
	data, err := fetch()
	if err != nil {
		return err
	}
	cachePath := filepath.Join(homeDir, ".monika", "models.json")
	_ = os.MkdirAll(filepath.Dir(cachePath), 0755)
	return os.WriteFile(cachePath, data, 0644)
}

func fetch() ([]byte, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(apiURL)
	if err != nil {
		return nil, fmt.Errorf("models.dev fetch: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("models.dev fetch: HTTP %d", resp.StatusCode)
	}

	return io.ReadAll(resp.Body)
}
