package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestSplitJoinURL(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		clean    string
		auth     string
		rejoined string
	}{
		{"user_pass", "postgres://admin:s3cr3t@host:5432/db", "postgres://host:5432/db", "admin:s3cr3t", "postgres://admin:s3cr3t@host:5432/db"},
		{"user_only", "redis://:pass@cache:6379", "redis://cache:6379", ":pass", "redis://:pass@cache:6379"},
		{"no_creds", "http://host:8080/path", "http://host:8080/path", "", "http://host:8080/path"},
		{"token", "https://token@host/api", "https://host/api", "token", "https://token@host/api"},
		{"empty", "", "", "", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			clean, auth := SplitURL(tt.input)
			if clean != tt.clean {
				t.Errorf("clean: got %q, want %q", clean, tt.clean)
			}
			if auth != tt.auth {
				t.Errorf("auth: got %q, want %q", auth, tt.auth)
			}
			rejoined := JoinURL(clean, auth)
			if tt.rejoined != "" && rejoined != tt.rejoined {
				t.Errorf("rejoined: got %q, want %q", rejoined, tt.rejoined)
			}
		})
	}
}

func TestStripApplyCredentials(t *testing.T) {
	entry := MCPServerEntry{
		ID:      "mydb",
		Type:    "http",
		URL:     "postgres://admin:s3cr3t@host:5432/db",
		Env:     map[string]string{"API_KEY": "sk-xxx"},
		Headers: map[string]string{"Authorization": "Bearer token123"},
		Command: "some-cmd",
		Args:    []string{"--port", "5432"},
	}

	cred := StripCredentials(&entry)

	if entry.URL != "postgres://host:5432/db" {
		t.Errorf("URL after strip: got %q, want postgres://host:5432/db", entry.URL)
	}
	if entry.Env != nil {
		t.Errorf("Env after strip: expected nil, got %v", entry.Env)
	}
	if entry.Headers != nil {
		t.Errorf("Headers after strip: expected nil, got %v", entry.Headers)
	}
	if entry.Command != "some-cmd" {
		t.Errorf("Command should be preserved: got %q", entry.Command)
	}
	if cred.URLAuth != "admin:s3cr3t" {
		t.Errorf("cred.URLAuth: got %q, want admin:s3cr3t", cred.URLAuth)
	}
	if cred.Env["API_KEY"] != "sk-xxx" {
		t.Errorf("cred.Env[API_KEY]: got %q", cred.Env["API_KEY"])
	}
	if cred.Headers["Authorization"] != "Bearer token123" {
		t.Errorf("cred.Headers[Authorization]: got %q", cred.Headers["Authorization"])
	}

	ApplyCredentials(&entry, cred)

	if entry.URL != "postgres://admin:s3cr3t@host:5432/db" {
		t.Errorf("URL after apply: got %q", entry.URL)
	}
	if entry.Env["API_KEY"] != "sk-xxx" {
		t.Errorf("Env after apply: got %v", entry.Env)
	}
	if entry.Headers["Authorization"] != "Bearer token123" {
		t.Errorf("Headers after apply: got %v", entry.Headers)
	}
}

func TestStripCredentials_NoSensitive(t *testing.T) {
	entry := MCPServerEntry{
		ID:      "simple",
		Type:    "stdio",
		Command: "echo",
		Args:    []string{"hello"},
	}
	cred := StripCredentials(&entry)
	if !cred.Empty() {
		t.Errorf("expected empty credential, got %+v", cred)
	}
}

func TestSaveLoadCredentials(t *testing.T) {
	tmp := t.TempDir()
	credPath := filepath.Join(tmp, "credentials.json")

	store := CredentialStore{
		Entries: map[string]CredentialEntry{
			"mydb": {
				Env:     map[string]string{"KEY": "val"},
				URLAuth: "user:pass",
			},
		},
	}
	if err := SaveCredentials(credPath, store); err != nil {
		t.Fatal(err)
	}

	loaded, err := LoadCredentials(credPath)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Entries["mydb"].Env["KEY"] != "val" {
		t.Errorf("env not loaded correctly")
	}
	if loaded.Entries["mydb"].URLAuth != "user:pass" {
		t.Errorf("urlAuth not loaded correctly")
	}
}

func TestUpdateCredentials(t *testing.T) {
	tmp := t.TempDir()
	credPath := filepath.Join(tmp, "credentials.json")

	if err := UpdateCredentials(credPath, "srv1", CredentialEntry{
		Env: map[string]string{"A": "B"},
	}); err != nil {
		t.Fatal(err)
	}
	store, _ := LoadCredentials(credPath)
	if store.Entries["srv1"].Env["A"] != "B" {
		t.Fatal("first update failed")
	}

	if err := UpdateCredentials(credPath, "srv2", CredentialEntry{
		URLAuth: "token",
	}); err != nil {
		t.Fatal(err)
	}
	store, _ = LoadCredentials(credPath)
	if len(store.Entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(store.Entries))
	}

	if err := UpdateCredentials(credPath, "srv1", CredentialEntry{}); err != nil {
		t.Fatal(err)
	}
	store, _ = LoadCredentials(credPath)
	if _, exists := store.Entries["srv1"]; exists {
		t.Fatal("srv1 should have been deleted")
	}
	if len(store.Entries) != 1 {
		t.Fatalf("expected 1 entry after delete, got %d", len(store.Entries))
	}
}

func TestUpdateCredentials_RemovesEmptyFile(t *testing.T) {
	tmp := t.TempDir()
	credPath := filepath.Join(tmp, "credentials.json")

	UpdateCredentials(credPath, "srv1", CredentialEntry{Env: map[string]string{"A": "B"}})
	UpdateCredentials(credPath, "srv1", CredentialEntry{})

	if _, err := os.Stat(credPath); !os.IsNotExist(err) {
		t.Fatal("credentials.json should have been removed when empty")
	}
}

func TestApplyCredentialsStore(t *testing.T) {
	cfg := Config{
		MCP: MCPConfig{
			Servers: []MCPServerEntry{
				{ID: "a", URL: "http://host"},
				{ID: "b", URL: "http://clean"},
			},
		},
	}
	store := CredentialStore{
		Entries: map[string]CredentialEntry{
			"a": {URLAuth: "admin:pass", Env: map[string]string{"K": "V"}},
		},
	}
	ApplyCredentialsStore(&cfg, store)

	if cfg.MCP.Servers[0].URL != "http://admin:pass@host" {
		t.Errorf("server a URL: got %q", cfg.MCP.Servers[0].URL)
	}
	if cfg.MCP.Servers[0].Env["K"] != "V" {
		t.Errorf("server a Env not applied")
	}
	if cfg.MCP.Servers[1].URL != "http://clean" {
		t.Errorf("server b URL should be unchanged: got %q", cfg.MCP.Servers[1].URL)
	}
}

func TestMigrateInlineCredentials_JSON(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "config.json")
	credPath := filepath.Join(dir, "credentials.json")

	cfgJSON := `{
  "mcp": {
    "servers": [
      {"id": "srv1", "type": "stdio", "command": "npx", "args": ["-y", "foo"], "env": {"API_KEY": "sk-secret"}},
      {"id": "srv2", "type": "http", "url": "https://user:pass@host/api", "headers": {"Authorization": "Bearer tok"}}
    ]
  }
}`
	os.WriteFile(configPath, []byte(cfgJSON), 0o600)

	migrated := MigrateInlineCredentials(configPath, credPath)
	if migrated != 2 {
		t.Fatalf("migrated: got %d, want 2", migrated)
	}

	store, _ := LoadCredentials(credPath)
	if store.Entries["srv1"].Env["API_KEY"] != "sk-secret" {
		t.Errorf("srv1 env not migrated to credentials")
	}
	if store.Entries["srv2"].URLAuth != "user:pass" {
		t.Errorf("srv2 URL auth not migrated: got %q", store.Entries["srv2"].URLAuth)
	}
	if store.Entries["srv2"].Headers["Authorization"] != "Bearer tok" {
		t.Errorf("srv2 headers not migrated")
	}

	data, _ := os.ReadFile(configPath)
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		t.Fatal(err)
	}
	for _, s := range cfg.MCP.Servers {
		if len(s.Env) > 0 {
			t.Errorf("server %q still has env in config", s.ID)
		}
		if len(s.Headers) > 0 {
			t.Errorf("server %q still has headers in config", s.ID)
		}
	}
	if cfg.MCP.Servers[1].URL != "https://host/api" {
		t.Errorf("srv2 URL not cleaned: got %q", cfg.MCP.Servers[1].URL)
	}
}

func TestMigrateInlineCredentials_Idempotent(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "config.json")
	credPath := filepath.Join(dir, "credentials.json")

	cfgJSON := `{"mcp":{"servers":[{"id":"s","command":"npx","args":["x"],"env":{"K":"V"}}]}}`
	os.WriteFile(configPath, []byte(cfgJSON), 0o600)

	n1 := MigrateInlineCredentials(configPath, credPath)
	if n1 != 1 {
		t.Fatalf("first migration: got %d, want 1", n1)
	}
	n2 := MigrateInlineCredentials(configPath, credPath)
	if n2 != 0 {
		t.Fatalf("second migration: got %d, want 0", n2)
	}
}

func TestMigrateInlineCredentials_NoServers(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "config.json")
	credPath := filepath.Join(dir, "credentials.json")
	os.WriteFile(configPath, []byte(`{"model":"gpt-4"}`), 0o600)

	n := MigrateInlineCredentials(configPath, credPath)
	if n != 0 {
		t.Errorf("expected 0 migrations, got %d", n)
	}
}

func TestDeleteCredentials(t *testing.T) {
	tmp := t.TempDir()
	credPath := filepath.Join(tmp, "credentials.json")

	UpdateCredentials(credPath, "srv1", CredentialEntry{Env: map[string]string{"A": "B"}})
	UpdateCredentials(credPath, "srv2", CredentialEntry{URLAuth: "tok"})

	if err := DeleteCredentials(credPath, "srv1"); err != nil {
		t.Fatal(err)
	}
	store, _ := LoadCredentials(credPath)
	if _, exists := store.Entries["srv1"]; exists {
		t.Fatal("srv1 should have been deleted")
	}
	if _, exists := store.Entries["srv2"]; !exists {
		t.Fatal("srv2 should still exist")
	}

	if err := DeleteCredentials(credPath, "srv2"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(credPath); !os.IsNotExist(err) {
		t.Fatal("credentials.json should have been removed when empty")
	}
}

func TestMaskDSN(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		masked  string
		hasCred bool
	}{
		{"postgres_url", "postgres://user:pass@host:5432/db", "postgres://host:5432/db", true},
		{"mysql_url", "mysql://root:secret@host:3306/db", "mysql://host:3306/db", true},
		{"redis_url", "redis://:pass@host:6379/0", "redis://host:6379/0", true},
		{"mongo_url", "mongodb://user:pass@host:27017/db", "mongodb://host:27017/db", true},
		{"pg_keyvalue", "host=localhost password=s3cr3t dbname=mydb", "host=localhost password=*** dbname=mydb", true},
		{"mysql_go", "myuser:mypass@tcp(localhost:3306)/mydb", "***@tcp(localhost:3306)/mydb", true},
		{"sqlite_path", "/data/myapp.db", "/data/myapp.db", false},
		{"no_creds_url", "postgres://host:5432/db", "postgres://host:5432/db", false},
		{"empty", "", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			masked := MaskDSN(tt.input)
			if masked != tt.masked {
				t.Errorf("MaskDSN: got %q, want %q", masked, tt.masked)
			}
			hasCred := HasDSNCredentials(tt.input)
			if hasCred != tt.hasCred {
				t.Errorf("HasDSNCredentials: got %v, want %v", hasCred, tt.hasCred)
			}
		})
	}
}
