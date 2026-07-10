package mcpdiscovery

import (
	"os"
	"path/filepath"
	"testing"
)

func TestScanCursorMCP(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".cursor"), 0o755)
	os.WriteFile(filepath.Join(dir, ".cursor", "mcp.json"), []byte(`{
		"mcpServers": {
			"web-search": {
				"command": "npx",
				"args": ["-y", "@anthropic/mcp-web-search"],
				"env": { "API_KEY": "sk-test" }
			}
		}
	}`), 0o644)

	servers, err := Scan(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(servers) != 1 {
		t.Fatalf("expected 1 server, got %d", len(servers))
	}
	if servers[0].ID != "web-search" {
		t.Errorf("ID: got %q", servers[0].ID)
	}
	if servers[0].Command != "npx" {
		t.Errorf("Command: got %q", servers[0].Command)
	}
	if servers[0].Env["API_KEY"] != "sk-test" {
		t.Errorf("Env not parsed")
	}
}

func TestScanClaudeMCP(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude"), 0o755)
	os.WriteFile(filepath.Join(dir, ".claude", "mcp.json"), []byte(`{
		"mcpServers": {
			"mydb": {
				"url": "http://localhost:5432/mcp",
				"headers": { "Authorization": "Bearer token123" }
			}
		}
	}`), 0o644)

	servers, err := Scan(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(servers) != 1 {
		t.Fatalf("expected 1 server, got %d", len(servers))
	}
	if servers[0].Type != "http" {
		t.Errorf("Type: got %q, want http", servers[0].Type)
	}
	if servers[0].URL != "http://localhost:5432/mcp" {
		t.Errorf("URL: got %q", servers[0].URL)
	}
}

func TestScanRootMCPJson(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "mcp.json"), []byte(`{
		"mcpServers": {
			"filesystem": { "command": "npx", "args": ["-y", "@anthropic/mcp-filesystem"] }
		}
	}`), 0o644)

	servers, err := Scan(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(servers) != 1 {
		t.Fatalf("expected 1 server, got %d", len(servers))
	}
	if servers[0].ID != "filesystem" {
		t.Errorf("ID: got %q", servers[0].ID)
	}
}

func TestScanDedup(t *testing.T) {
	dir := t.TempDir()
	config := []byte(`{"mcpServers": {"shared": {"command": "echo"}}}`)

	os.MkdirAll(filepath.Join(dir, ".cursor"), 0o755)
	os.WriteFile(filepath.Join(dir, ".cursor", "mcp.json"), config, 0o644)

	os.MkdirAll(filepath.Join(dir, ".claude"), 0o755)
	os.WriteFile(filepath.Join(dir, ".claude", "mcp.json"), config, 0o644)

	os.WriteFile(filepath.Join(dir, "mcp.json"), config, 0o644)

	servers, err := Scan(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(servers) != 1 {
		t.Fatalf("expected 1 deduplicated server, got %d", len(servers))
	}
}

func TestScanEmpty(t *testing.T) {
	dir := t.TempDir()
	servers, err := Scan(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(servers) != 0 {
		t.Fatalf("expected 0 servers, got %d", len(servers))
	}
}

func TestFilterExisting(t *testing.T) {
	servers := []DiscoveredServer{
		{ID: "a", Source: "mcp.json"},
		{ID: "b", Source: "mcp.json"},
		{ID: "c", Source: ".cursor/mcp.json"},
	}
	existing := []string{"a", "c"}
	result := FilterExisting(servers, existing)
	if len(result) != 1 {
		t.Fatalf("expected 1 new, got %d", len(result))
	}
	if result[0].ID != "b" {
		t.Errorf("expected b, got %s", result[0].ID)
	}
}

func TestFormatSummary(t *testing.T) {
	servers := []DiscoveredServer{
		{ID: "web", Type: "stdio", Command: "npx", Args: []string{"-y", "pkg"}, Source: ".cursor/mcp.json"},
	}
	summary := FormatSummary(servers)
	if summary == "" {
		t.Fatal("expected non-empty summary")
	}
}
