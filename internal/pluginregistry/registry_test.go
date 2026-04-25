package pluginregistry

import (
	"os"
	"path/filepath"
	"testing"
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
