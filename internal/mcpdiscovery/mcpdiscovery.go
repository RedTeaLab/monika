package mcpdiscovery

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type DiscoveredServer struct {
	ID      string            `json:"id"`
	Type    string            `json:"type"`
	Command string            `json:"command,omitempty"`
	Args    []string          `json:"args,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
	URL     string            `json:"url,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
	Source  string            `json:"source"`
}

var scanTargets = []string{
	".cursor/mcp.json",
	".claude/mcp.json",
	"mcp.json",
}

func Scan(projectDir string) ([]DiscoveredServer, error) {
	var all []DiscoveredServer
	seen := make(map[string]bool)

	for _, rel := range scanTargets {
		path := filepath.Join(projectDir, rel)
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		servers, err := parseMCPConfig(data, rel)
		if err != nil {
			fmt.Fprintf(os.Stderr, "[monika] mcpdiscovery: parse %s: %v\n", rel, err)
			continue
		}
		for _, s := range servers {
			if !seen[s.ID] {
				seen[s.ID] = true
				all = append(all, s)
			}
		}
	}

	return all, nil
}

func parseMCPConfig(data []byte, sourceName string) ([]DiscoveredServer, error) {
	var raw struct {
		McpServers map[string]json.RawMessage `json:"mcpServers"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("%s: %w", sourceName, err)
	}
	if len(raw.McpServers) == 0 {
		return nil, nil
	}

	var result []DiscoveredServer
	for name, rawCfg := range raw.McpServers {
		var cfg struct {
			Command string            `json:"command"`
			Args    []string          `json:"args"`
			Env     map[string]string `json:"env"`
			URL     string            `json:"url"`
			Headers map[string]string `json:"headers"`
			Type    string            `json:"type"`
		}
		if err := json.Unmarshal(rawCfg, &cfg); err != nil {
			continue
		}
		srvType := cfg.Type
		if srvType == "" {
			if cfg.URL != "" {
				srvType = "http"
			} else {
				srvType = "stdio"
			}
		}
		result = append(result, DiscoveredServer{
			ID:      name,
			Type:    srvType,
			Command: cfg.Command,
			Args:    cfg.Args,
			Env:     cfg.Env,
			URL:     cfg.URL,
			Headers: cfg.Headers,
			Source:  sourceName,
		})
	}
	return result, nil
}

func FilterExisting(servers []DiscoveredServer, existingIDs []string) []DiscoveredServer {
	existing := make(map[string]bool, len(existingIDs))
	for _, id := range existingIDs {
		existing[id] = true
	}
	var result []DiscoveredServer
	for _, s := range servers {
		if !existing[s.ID] {
			result = append(result, s)
		}
	}
	return result
}

func FormatSummary(servers []DiscoveredServer) string {
	if len(servers) == 0 {
		return ""
	}
	var parts []string
	for _, s := range servers {
		detail := s.Type
		if s.Command != "" {
			detail = s.Command
			if len(s.Args) > 0 {
				detail += " " + strings.Join(s.Args, " ")
			}
		} else if s.URL != "" {
			detail = s.URL
		}
		parts = append(parts, fmt.Sprintf("- %s (%s) [from %s]", s.ID, detail, s.Source))
	}
	return strings.Join(parts, "\n")
}
