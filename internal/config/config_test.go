package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestLoadMergesModelProviderAndModel(t *testing.T) {
	tmp := t.TempDir()
	home := filepath.Join(tmp, "home")
	project := filepath.Join(tmp, "project")
	mustWrite(t, filepath.Join(home, ".monika", "config.yaml"), []byte(`model_provider: openai
model: gpt-4
`))
	mustWrite(t, filepath.Join(project, ".monika", "config.yaml"), []byte(`model: gpt-4o
`))

	cfg, err := Load(Options{HomeDir: home, ProjectDir: project})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ModelProvider != "openai" {
		t.Fatalf("model_provider = %q", cfg.ModelProvider)
	}
	if cfg.Model != "gpt-4o" {
		t.Fatalf("model = %q", cfg.Model)
	}
}

func TestLoadMergesModelProviders(t *testing.T) {
	tmp := t.TempDir()
	home := filepath.Join(tmp, "home")
	project := filepath.Join(tmp, "project")
	mustWrite(t, filepath.Join(home, ".monika", "config.yaml"), []byte(`model_providers:
  openai:
    name: openai
    base_url: https://api.openai.com
    api_key: sk-home
`))
	mustWrite(t, filepath.Join(project, ".monika", "config.yaml"), []byte(`model_providers:
  openai:
    base_url: https://custom.openai.com
  anthropic:
    name: anthropic
    base_url: https://api.anthropic.com
`))

	cfg, err := Load(Options{HomeDir: home, ProjectDir: project})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ModelProviders["openai"].BaseURL != "https://custom.openai.com" {
		t.Fatalf("openai base_url = %q", cfg.ModelProviders["openai"].BaseURL)
	}
	if cfg.ModelProviders["openai"].Name != "openai" {
		t.Fatalf("openai name = %q", cfg.ModelProviders["openai"].Name)
	}
	if cfg.ModelProviders["openai"].APIKey != "sk-home" {
		t.Fatalf("openai api_key = %q", cfg.ModelProviders["openai"].APIKey)
	}
	if cfg.ModelProviders["anthropic"].Name != "anthropic" {
		t.Fatalf("anthropic name = %q", cfg.ModelProviders["anthropic"].Name)
	}
}

func TestLoadAppendsSkillPaths(t *testing.T) {
	tmp := t.TempDir()
	home := filepath.Join(tmp, "home")
	project := filepath.Join(tmp, "project")
	mustWrite(t, filepath.Join(home, ".monika", "config.yaml"), []byte(`skill:
  paths:
    - /home/skills
`))
	mustWrite(t, filepath.Join(project, ".monika", "config.yaml"), []byte(`skill:
  paths:
    - /project/skills
`))

	cfg, err := Load(Options{HomeDir: home, ProjectDir: project})
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Skill.Paths) != 2 {
		t.Fatalf("skill paths = %v", cfg.Skill.Paths)
	}
	if cfg.Skill.Paths[0] != "/home/skills" {
		t.Fatalf("skill paths[0] = %q", cfg.Skill.Paths[0])
	}
	if cfg.Skill.Paths[1] != "/project/skills" {
		t.Fatalf("skill paths[1] = %q", cfg.Skill.Paths[1])
	}
}

func TestLoadAppendsMCPServers(t *testing.T) {
	tmp := t.TempDir()
	home := filepath.Join(tmp, "home")
	project := filepath.Join(tmp, "project")
	mustWrite(t, filepath.Join(home, ".monika", "config.yaml"), []byte(`mcp:
  servers:
    - id: home-server
      command: home-mcp
`))
	mustWrite(t, filepath.Join(project, ".monika", "config.yaml"), []byte(`mcp:
  servers:
    - id: project-server
      command: project-mcp
`))

	cfg, err := Load(Options{HomeDir: home, ProjectDir: project})
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.MCP.Servers) != 2 {
		t.Fatalf("mcp servers = %v", cfg.MCP.Servers)
	}
	if cfg.MCP.Servers[0].ID != "home-server" {
		t.Fatalf("mcp servers[0].id = %q", cfg.MCP.Servers[0].ID)
	}
	if cfg.MCP.Servers[1].ID != "project-server" {
		t.Fatalf("mcp servers[1].id = %q", cfg.MCP.Servers[1].ID)
	}
}

func TestLoadToolsReplaces(t *testing.T) {
	tmp := t.TempDir()
	home := filepath.Join(tmp, "home")
	project := filepath.Join(tmp, "project")
	mustWrite(t, filepath.Join(home, ".monika", "config.yaml"), []byte(`tools:
  confirm:
    - bash
  disallow:
    - rm
`))
	mustWrite(t, filepath.Join(project, ".monika", "config.yaml"), []byte(`tools:
  confirm:
    - edit
`))

	cfg, err := Load(Options{HomeDir: home, ProjectDir: project})
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Tools.Confirm) != 1 || cfg.Tools.Confirm[0] != "edit" {
		t.Fatalf("tools confirm = %v", cfg.Tools.Confirm)
	}
	if len(cfg.Tools.Disallow) != 0 {
		t.Fatalf("tools disallow = %v", cfg.Tools.Disallow)
	}
}

func TestLoadAllowsMissingConfigFiles(t *testing.T) {
	tmp := t.TempDir()
	cfg, err := Load(Options{HomeDir: filepath.Join(tmp, "home"), ProjectDir: filepath.Join(tmp, "project")})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ModelProvider != "" {
		t.Fatalf("model_provider = %q", cfg.ModelProvider)
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

func TestLoadNewConfigFromYAML(t *testing.T) {
	tmp := t.TempDir()
	home := filepath.Join(tmp, "home")
	mustWrite(t, filepath.Join(home, ".monika", "config.yaml"), []byte(`model_provider: openai
model: gpt-4
model_providers:
  openai:
    name: openai
    base_url: https://api.openai.com
    api_key: sk-test
    wire_api: chat
skill:
  paths:
    - /skills
mcp:
  servers:
    - id: fs
      command: mcp-fs
      args:
        - /tmp
      env:
        KEY: val
tools:
  confirm:
    - bash
  disallow:
    - rm
`))

	cfg, err := Load(Options{HomeDir: home})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ModelProvider != "openai" {
		t.Fatalf("model_provider = %q", cfg.ModelProvider)
	}
	if cfg.Model != "gpt-4" {
		t.Fatalf("model = %q", cfg.Model)
	}
	if cfg.ModelProviders["openai"].WireAPI != "chat" {
		t.Fatalf("wire_api = %q", cfg.ModelProviders["openai"].WireAPI)
	}
	if len(cfg.Skill.Paths) != 1 || cfg.Skill.Paths[0] != "/skills" {
		t.Fatalf("skill paths = %v", cfg.Skill.Paths)
	}
	if cfg.MCP.Servers[0].Command != "mcp-fs" {
		t.Fatalf("mcp command = %q", cfg.MCP.Servers[0].Command)
	}
	if len(cfg.MCP.Servers[0].Args) != 1 || cfg.MCP.Servers[0].Args[0] != "/tmp" {
		t.Fatalf("mcp args = %v", cfg.MCP.Servers[0].Args)
	}
	if cfg.MCP.Servers[0].Env["KEY"] != "val" {
		t.Fatalf("mcp env = %v", cfg.MCP.Servers[0].Env)
	}
	if len(cfg.Tools.Confirm) != 1 || cfg.Tools.Confirm[0] != "bash" {
		t.Fatalf("tools confirm = %v", cfg.Tools.Confirm)
	}
	if len(cfg.Tools.Disallow) != 1 || cfg.Tools.Disallow[0] != "rm" {
		t.Fatalf("tools disallow = %v", cfg.Tools.Disallow)
	}
}

func TestLoadHomeOnlyKeysSurviveProjectMerge(t *testing.T) {
	tmp := t.TempDir()
	home := filepath.Join(tmp, "home")
	project := filepath.Join(tmp, "project")
	mustWrite(t, filepath.Join(home, ".monika", "config.yaml"), []byte(`model_provider: openai
model: gpt-4
model_providers:
  openai:
    name: openai
    api_key: sk-home
skill:
  paths:
    - /home/skills
`))
	mustWrite(t, filepath.Join(project, ".monika", "config.yaml"), []byte(`model: gpt-4o
`))

	cfg, err := Load(Options{HomeDir: home, ProjectDir: project})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ModelProvider != "openai" {
		t.Fatalf("model_provider should survive, got %q", cfg.ModelProvider)
	}
	if cfg.Model != "gpt-4o" {
		t.Fatalf("model should override, got %q", cfg.Model)
	}
	if cfg.ModelProviders["openai"].APIKey != "sk-home" {
		t.Fatalf("home-only provider config should survive, got %q", cfg.ModelProviders["openai"].APIKey)
	}
	if len(cfg.Skill.Paths) != 1 || cfg.Skill.Paths[0] != "/home/skills" {
		t.Fatalf("home-only skill paths should survive, got %v", cfg.Skill.Paths)
	}
}

func TestContextLimitUnmarshalYAML(t *testing.T) {
	tests := []struct {
		yaml     string
		expected int64
	}{
		{"context_limit: 128k", 128000},
		{"context_limit: 128K", 128000},
		{"context_limit: 1m", 1000000},
		{"context_limit: 1M", 1000000},
		{"context_limit: 200", 200},
		{"context_limit: 0", 0},
		{"context_limit: 2g", 2000000000},
	}
	for _, tt := range tests {
		var cfg struct {
			ContextLimit ContextLimit `yaml:"context_limit"`
		}
		if err := yaml.Unmarshal([]byte(tt.yaml), &cfg); err != nil {
			t.Errorf("%q: %v", tt.yaml, err)
			continue
		}
		if cfg.ContextLimit.Int64() != tt.expected {
			t.Errorf("%q: got %d, want %d", tt.yaml, cfg.ContextLimit.Int64(), tt.expected)
		}
	}
}

func TestParseSizeErrors(t *testing.T) {
	bad := []string{"", "abc", "-1", "-1k"}
	for _, s := range bad {
		if _, err := parseSize(s); err == nil {
			t.Errorf("%q: expected error", s)
		}
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
