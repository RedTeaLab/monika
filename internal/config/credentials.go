package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

type CredentialEntry struct {
	Env     map[string]string `json:"env,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
	URLAuth string            `json:"url_auth,omitempty"`
	DSN     string            `json:"dsn,omitempty"`
}

func (c CredentialEntry) Empty() bool {
	return len(c.Env) == 0 && len(c.Headers) == 0 && c.URLAuth == "" && c.DSN == ""
}

type CredentialStore struct {
	Entries map[string]CredentialEntry `json:"entries"`
}

var urlAuthRe = regexp.MustCompile(`(://)([^/@]+)@`)

func SplitURL(rawURL string) (cleanURL, auth string) {
	m := urlAuthRe.FindStringSubmatch(rawURL)
	if m == nil {
		return rawURL, ""
	}
	clean := urlAuthRe.ReplaceAllString(rawURL, "${1}")
	return clean, m[2]
}

func JoinURL(cleanURL, auth string) string {
	if auth == "" {
		return cleanURL
	}
	idx := strings.Index(cleanURL, "://")
	if idx < 0 {
		return cleanURL
	}
	return cleanURL[:idx+3] + auth + "@" + cleanURL[idx+3:]
}

var (
	pgPasswordRe = regexp.MustCompile(`(?i)password=[^\s]+`)
	mysqlGoDSNRe = regexp.MustCompile(`[\w-]+:[^@\s]+@tcp\(`)
)

// MaskDSN removes credentials from a DSN string for safe storage.
// Handles URL-based DSNs (postgres/redis/mongo), PostgreSQL key=value,
// and MySQL Go-driver format.
func MaskDSN(dsn string) string {
	if clean, auth := SplitURL(dsn); auth != "" {
		return clean
	}
	if pgPasswordRe.MatchString(dsn) {
		return pgPasswordRe.ReplaceAllString(dsn, "password=***")
	}
	if mysqlGoDSNRe.MatchString(dsn) {
		return mysqlGoDSNRe.ReplaceAllString(dsn, "***@tcp(")
	}
	return dsn
}

// HasDSNCredentials checks whether a DSN contains embedded credentials.
func HasDSNCredentials(dsn string) bool {
	_, auth := SplitURL(dsn)
	return auth != "" || pgPasswordRe.MatchString(dsn) || mysqlGoDSNRe.MatchString(dsn)
}

func StripCredentials(entry *MCPServerEntry) CredentialEntry {
	cred := CredentialEntry{
		Env:     entry.Env,
		Headers: entry.Headers,
	}
	entry.Env = nil
	entry.Headers = nil

	if entry.URL != "" {
		clean, auth := SplitURL(entry.URL)
		if auth != "" {
			cred.URLAuth = auth
			entry.URL = clean
		}
	}
	for i, arg := range entry.Args {
		if HasDSNCredentials(arg) {
			cred.DSN = arg
			entry.Args[i] = MaskDSN(arg)
			break
		}
	}

	return cred
}

func ApplyCredentials(entry *MCPServerEntry, cred CredentialEntry) {
	if len(cred.Env) > 0 {
		entry.Env = cred.Env
	}
	if len(cred.Headers) > 0 {
		entry.Headers = cred.Headers
	}
	if cred.URLAuth != "" && entry.URL != "" {
		entry.URL = JoinURL(entry.URL, cred.URLAuth)
	}
	if cred.DSN != "" {
		masked := MaskDSN(cred.DSN)
		for i, arg := range entry.Args {
			if arg == masked {
				entry.Args[i] = cred.DSN
				break
			}
		}
	}
}

func ApplyCredentialsStore(cfg *Config, store CredentialStore) {
	for i := range cfg.MCP.Servers {
		if cred, ok := store.Entries[cfg.MCP.Servers[i].ID]; ok {
			ApplyCredentials(&cfg.MCP.Servers[i], cred)
		}
	}
}

func LoadCredentials(path string) (CredentialStore, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return CredentialStore{Entries: make(map[string]CredentialEntry)}, nil
		}
		return CredentialStore{}, err
	}
	var store CredentialStore
	if err := json.Unmarshal(data, &store); err != nil {
		return CredentialStore{}, fmt.Errorf("%s: %w", path, err)
	}
	if store.Entries == nil {
		store.Entries = make(map[string]CredentialEntry)
	}
	return store, nil
}

func SaveCredentials(path string, store CredentialStore) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func UpdateCredentials(path string, serverID string, cred CredentialEntry) error {
	store, err := LoadCredentials(path)
	if err != nil {
		store = CredentialStore{Entries: make(map[string]CredentialEntry)}
	}
	if cred.Empty() {
		delete(store.Entries, serverID)
	} else {
		store.Entries[serverID] = cred
	}
	if len(store.Entries) == 0 {
		if _, err := os.Stat(path); err == nil {
			return os.Remove(path)
		}
		return nil
	}
	return SaveCredentials(path, store)
}

func DeleteCredentials(path string, serverID string) error {
	store, err := LoadCredentials(path)
	if err != nil {
		return nil
	}
	delete(store.Entries, serverID)
	if len(store.Entries) == 0 {
		if _, err := os.Stat(path); err == nil {
			return os.Remove(path)
		}
		return nil
	}
	return SaveCredentials(path, store)
}

// MigrateInlineCredentials scans a config file for MCP servers with inline
// credentials (env, headers, URL auth) and moves them to credentials.json.
// Handles both JSON and YAML config files. Returns the number of servers migrated.
// This is idempotent: if no inline credentials are found, it does nothing.
func MigrateInlineCredentials(configPath, credPath string) int {
	data, err := os.ReadFile(configPath)
	if err != nil {
		return 0
	}

	var cfg Config
	isYAML := strings.HasSuffix(configPath, ".yaml") || strings.HasSuffix(configPath, ".yml")
	if isYAML {
		if err := yaml.Unmarshal(data, &cfg); err != nil {
			return 0
		}
	} else {
		if err := json.Unmarshal(data, &cfg); err != nil {
			return 0
		}
	}

	if len(cfg.MCP.Servers) == 0 {
		return 0
	}

	store, _ := LoadCredentials(credPath)
	if store.Entries == nil {
		store.Entries = make(map[string]CredentialEntry)
	}

	var migrated int
	for i := range cfg.MCP.Servers {
		cred := StripCredentials(&cfg.MCP.Servers[i])
		if !cred.Empty() {
			store.Entries[cfg.MCP.Servers[i].ID] = cred
			migrated++
		}
	}

	if migrated == 0 {
		return 0
	}

	var out []byte
	if isYAML {
		out, err = yaml.Marshal(cfg)
	} else {
		out, err = json.MarshalIndent(cfg, "", "  ")
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "[monika] credential migration: marshal: %v\n", err)
		return 0
	}
	if err := os.WriteFile(configPath, out, 0o600); err != nil {
		fmt.Fprintf(os.Stderr, "[monika] credential migration: write config: %v\n", err)
		return 0
	}

	if err := SaveCredentials(credPath, store); err != nil {
		fmt.Fprintf(os.Stderr, "[monika] credential migration: write credentials: %v\n", err)
		return 0
	}

	fmt.Fprintf(os.Stderr, "[monika] migrated %d MCP credential(s) from %s to %s\n",
		migrated, filepath.Base(configPath), filepath.Base(credPath))
	return migrated
}
