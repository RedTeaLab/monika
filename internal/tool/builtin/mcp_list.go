package builtin

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"monika/internal/tool"
)

type MCPServerInfo struct {
	ID      string            `json:"id"`
	Type    string            `json:"type"`
	Command string            `json:"command"`
	Args    []string          `json:"args"`
	Env     map[string]string `json:"env"`
	URL     string            `json:"url"`
	Status  string            `json:"status"`
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
			detail = "http: " + s.URL
		}
		lines = append(lines, fmt.Sprintf("- %s (%s) [%s]", s.ID, detail, s.Status))
	}

	return tool.ExecutionResult{
		Content: fmt.Sprintf("Configured MCP servers (%d):\n%s", len(servers), strings.Join(lines, "\n")),
	}, nil
}
