package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadMergesGlobalAndProjectProviderConfig(t *testing.T) {
	tmp := t.TempDir()
	home := filepath.Join(tmp, "home")
	project := filepath.Join(tmp, "project")
	mustWrite(t, filepath.Join(home, ".monika", "config.yaml"), []byte(`provider:
  plugin: openai-family
  id: openai-compatible
  model: global-model
  config:
    base_url: http://global.example
plugins:
  openai-family:
    config:
      proxy: http://proxy.example
`))
	mustWrite(t, filepath.Join(project, ".monika", "config.yaml"), []byte(`provider:
  model: project-model
  config:
    base_url: http://project.example
`))

	cfg, err := Load(Options{HomeDir: home, ProjectDir: project})
	if err != nil {
		t.Fatal(err)
	}

	if cfg.Provider.Plugin != "openai-family" {
		t.Fatalf("plugin = %q", cfg.Provider.Plugin)
	}
	if cfg.Provider.ID != "openai-compatible" {
		t.Fatalf("id = %q", cfg.Provider.ID)
	}
	if cfg.Provider.Model != "project-model" {
		t.Fatalf("model = %q", cfg.Provider.Model)
	}
	if cfg.Provider.Config["base_url"] != "http://project.example" {
		t.Fatalf("base_url = %#v", cfg.Provider.Config["base_url"])
	}
	if cfg.Plugins["openai-family"].Config["proxy"] != "http://proxy.example" {
		t.Fatalf("proxy = %#v", cfg.Plugins["openai-family"].Config["proxy"])
	}
}

func TestLoadAllowsMissingConfigFiles(t *testing.T) {
	tmp := t.TempDir()
	cfg, err := Load(Options{HomeDir: filepath.Join(tmp, "home"), ProjectDir: filepath.Join(tmp, "project")})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Provider.ID != "" {
		t.Fatalf("provider id = %q", cfg.Provider.ID)
	}
}

func TestLoadYAMLErrorIncludesPath(t *testing.T) {
	tmp := t.TempDir()
	mustWrite(t, filepath.Join(tmp, ".monika", "config.yaml"), []byte(": bad yaml"))

	_, err := Load(Options{HomeDir: tmp})
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), ".monika") {
		t.Fatalf("error should contain file path, got: %v", err)
	}
}

func TestLoadHomeOnlyKeysSurviveProjectMerge(t *testing.T) {
	tmp := t.TempDir()
	home := filepath.Join(tmp, "home")
	project := filepath.Join(tmp, "project")
	mustWrite(t, filepath.Join(home, ".monika", "config.yaml"), []byte(`provider:
  id: home-only
  config:
    home_key: home_value
plugins:
  my-plugin:
    config:
      global_key: global_value
`))
	mustWrite(t, filepath.Join(project, ".monika", "config.yaml"), []byte(`provider:
  model: project-model
`))

	cfg, err := Load(Options{HomeDir: home, ProjectDir: project})
	if err != nil {
		t.Fatal(err)
	}

	if cfg.Provider.ID != "home-only" {
		t.Fatalf("home-only id should survive, got %q", cfg.Provider.ID)
	}
	if cfg.Provider.Model != "project-model" {
		t.Fatalf("project model should override, got %q", cfg.Provider.Model)
	}
	if cfg.Provider.Config["home_key"] != "home_value" {
		t.Fatalf("home-only config key should survive, got %#v", cfg.Provider.Config["home_key"])
	}
	if cfg.Plugins["my-plugin"].Config["global_key"] != "global_value" {
		t.Fatalf("home-only plugin config should survive, got %#v", cfg.Plugins["my-plugin"].Config["global_key"])
	}
}

func mustWrite(t *testing.T, path string, data []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
}
