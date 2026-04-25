package pluginregistry

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestResolveProviderWithPlugin(t *testing.T) {
	registry := Registry{Plugins: []Plugin{{
		ID:        "openai-family",
		Binary:    "monika-provider-openai",
		Providers: []ProviderEntry{{ID: "openai-compatible", Name: "OpenAI Compatible"}},
	}}}

	plugin, provider, err := registry.ResolveProvider("openai-family", "openai-compatible")
	if err != nil {
		t.Fatal(err)
	}
	if plugin.ID != "openai-family" || provider.ID != "openai-compatible" {
		t.Fatalf("resolved %#v %#v", plugin, provider)
	}
}

func TestResolveProviderRequiresPluginWhenIDIsAmbiguous(t *testing.T) {
	registry := Registry{Plugins: []Plugin{
		{ID: "a", Providers: []ProviderEntry{{ID: "openai-compatible"}}},
		{ID: "b", Providers: []ProviderEntry{{ID: "openai-compatible"}}},
	}}

	_, _, err := registry.ResolveProvider("", "openai-compatible")
	if err == nil {
		t.Fatal("expected ambiguity error")
	}
}

func TestLoadAndSaveRegistry(t *testing.T) {
	path := filepath.Join(t.TempDir(), "providers.json")
	want := Registry{Plugins: []Plugin{{ID: "deepseek", BinaryPath: "bin"}}}
	if err := Save(path, want); err != nil {
		t.Fatal(err)
	}
	got, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Plugins) != 1 || got.Plugins[0].ID != "deepseek" {
		t.Fatalf("registry = %#v", got)
	}
}

func TestLoadMissingRegistryReturnsEmpty(t *testing.T) {
	got, err := Load(filepath.Join(t.TempDir(), "missing.json"))
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Plugins) != 0 {
		t.Fatalf("registry = %#v", got)
	}
}

func TestSaveCreatesParentDirectory(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "providers.json")
	if err := Save(path, Registry{}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatal(err)
	}
}

func TestResolveProviderEmptyProviderID(t *testing.T) {
	registry := Registry{Plugins: []Plugin{{
		ID: "a", Providers: []ProviderEntry{{ID: "x"}},
	}}}

	_, _, err := registry.ResolveProvider("a", "")
	if err == nil {
		t.Fatal("expected error for empty providerID")
	}
	if !strings.Contains(err.Error(), "providerID must not be empty") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestResolveProviderWithEmptyPluginID(t *testing.T) {
	registry := Registry{Plugins: []Plugin{{
		ID:        "the-plugin",
		Providers: []ProviderEntry{{ID: "unique-provider", Name: "Unique"}},
	}}}

	plugin, provider, err := registry.ResolveProvider("", "unique-provider")
	if err != nil {
		t.Fatal(err)
	}
	if plugin.ID != "the-plugin" || provider.ID != "unique-provider" {
		t.Fatalf("resolved %#v %#v", plugin, provider)
	}
}

func TestResolveProviderNotFound(t *testing.T) {
	registry := Registry{Plugins: []Plugin{{
		ID:        "a",
		Providers: []ProviderEntry{{ID: "known"}},
	}}}

	_, _, err := registry.ResolveProvider("", "nonexistent")
	if err == nil {
		t.Fatal("expected error for not-found provider")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestLoadAndSaveRegistryFull(t *testing.T) {
	path := filepath.Join(t.TempDir(), "providers.json")
	installedAt := time.Date(2026, 1, 15, 10, 30, 0, 0, time.UTC)
	want := Registry{Plugins: []Plugin{{
		ID:          "deepseek",
		Version:     "1.2.3",
		InstalledAt: installedAt,
		Providers: []ProviderEntry{
			{ID: "deepseek-chat", Name: "DeepSeek Chat", Capabilities: []string{"chat", "stream"}},
			{ID: "deepseek-reasoner", Name: "DeepSeek Reasoner", Capabilities: []string{"chat", "tools"}},
		},
	}}}
	if err := Save(path, want); err != nil {
		t.Fatal(err)
	}
	got, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Plugins) != 1 {
		t.Fatalf("registry = %#v", got)
	}
	p := got.Plugins[0]
	if p.ID != "deepseek" || p.Version != "1.2.3" || !p.InstalledAt.Equal(installedAt) {
		t.Fatalf("plugin = %#v", p)
	}
	if len(p.Providers) != 2 || p.Providers[0].ID != "deepseek-chat" || len(p.Providers[0].Capabilities) != 2 {
		t.Fatalf("providers = %#v", p.Providers)
	}
}
