package builtin

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"monika/internal/tool"
)

type MCPServerInfo struct {
	ID      string   `json:"id"`
	Type    string   `json:"type"`
	Command string   `json:"command"`
	Args    []string `json:"args"`
	URL     string   `json:"url"`
	Status  string   `json:"status"`
	Scope   string   `json:"scope"`
}

type mcpListTool struct {
	listFn func() []MCPServerInfo
}

func NewMCPListTool(listFn func() []MCPServerInfo) tool.Tool {
	return &mcpListTool{listFn: listFn}
}

func (t *mcpListTool) Name() string { return "list_mcp_servers" }

func (t *mcpListTool) Description() string {
	return `List all configured MCP servers and their connection status.

Use this tool when the user asks what MCP servers are configured or connected.`
}

func (t *mcpListTool) Parameters() map[string]any {
	return map[string]any{
		"type":       "object",
		"properties": map[string]any{},
	}
}

func (t *mcpListTool) Execute(_ context.Context, _ json.RawMessage) (tool.ExecutionResult, error) {
	servers := t.listFn()
	if len(servers) == 0 {
		return tool.ExecutionResult{Content: "No MCP servers configured."}, nil
	}

	var lines []string
	for _, s := range servers {
		detail := s.Type
		if s.Command != "" {
			parts := []string{s.Command}
			parts = append(parts, s.Args...)
			detail = "stdio: " + strings.Join(parts, " ")
		} else if s.URL != "" {
			detail = "http: " + maskURL(s.URL)
		}
		scope := s.Scope
		if scope == "" {
			scope = "project"
		}
		lines = append(lines, fmt.Sprintf("- %s (%s) [%s] {%s}", s.ID, detail, s.Status, scope))
	}

	return tool.ExecutionResult{
		Content: fmt.Sprintf("Configured MCP servers (%d):\n%s", len(servers), strings.Join(lines, "\n")),
	}, nil
}

// userinfoRe matches the "scheme://user[:pass]@" portion of a URL.
var userinfoRe = regexp.MustCompile(`(://)[^/@]*@`)

// maskURL redacts credentials embedded in a URL's userinfo
// (e.g. "postgres://user:pass@host:5432/db" → "postgres://***@host:5432/db").
func maskURL(raw string) string {
	return userinfoRe.ReplaceAllString(raw, "${1}***@")
}
