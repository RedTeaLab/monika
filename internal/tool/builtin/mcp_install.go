package builtin

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"monika/internal/tool"
)

type mcpInstallTool struct {
	saveFn      func(args json.RawMessage) error
	reconnectFn func(args json.RawMessage) ([]string, error)
}

func NewMCPInstallTool(saveFn func(args json.RawMessage) error, reconnectFn func(args json.RawMessage) ([]string, error)) tool.Tool {
	return &mcpInstallTool{saveFn: saveFn, reconnectFn: reconnectFn}
}

func (t *mcpInstallTool) Name() string { return "install_mcp_server" }

func (t *mcpInstallTool) Description() string {
	return `Add (configure and connect) an MCP server.

Use this tool when the user asks to add, configure, or install an MCP server. MCP servers extend capabilities by providing additional tools (e.g., web search, database access, browser automation).

Provide either a command (for stdio servers) or a URL (for HTTP/SSE servers). The tool will save the config and attempt to connect.

Note: env vars, URL credentials, and headers are automatically extracted and stored in a separate credentials file (.monika/credentials.json) that is not readable by tools. Only the server ID, type, command, and sanitized URL appear in the main config.`
}

func (t *mcpInstallTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"id": map[string]any{
				"type":        "string",
				"description": "Unique identifier for this MCP server (e.g., 'my-server')",
			},
			"command": map[string]any{
				"type":        "string",
				"description": "Command to run the server (for stdio type, e.g., 'npx', 'python', 'node')",
			},
			"args": map[string]any{
				"type":        "array",
				"items":       map[string]any{"type": "string"},
				"description": "Command arguments (e.g., ['@some/mcp-server', '--port', '3000'])",
			},
			"env": map[string]any{
				"type":        "object",
				"additionalProperties": map[string]any{"type": "string"},
				"description": "Environment variables for the server process",
			},
			"url": map[string]any{
				"type":        "string",
				"description": "Server URL (for HTTP/SSE type)",
			},
			"headers": map[string]any{
				"type":        "object",
				"additionalProperties": map[string]any{"type": "string"},
				"description": "HTTP headers to send (for HTTP/SSE type)",
			},
			"scope": map[string]any{
				"type":        "string",
				"enum":        []string{"project", "global"},
				"description": "Where to store the config: \"project\" (default, in .monika/config.json) or \"global\" (~/.monika/config.json)",
			},
		},
		"required": []string{"id"},
	}
}

func (t *mcpInstallTool) Execute(_ context.Context, args json.RawMessage) (tool.ExecutionResult, error) {
	var params struct {
		ID      string            `json:"id"`
		Command string            `json:"command"`
		Args    []string          `json:"args"`
		Env     map[string]string `json:"env"`
		URL     string            `json:"url"`
		Headers map[string]string `json:"headers"`
		Scope   string            `json:"scope"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return tool.ExecutionResult{}, fmt.Errorf("install_mcp_server: invalid args: %w", err)
	}
	if params.ID == "" {
		return tool.ExecutionResult{Content: "Error: id is required", IsError: true}, nil
	}
	if params.Command == "" && params.URL == "" {
		return tool.ExecutionResult{Content: "Error: provide either 'command' (stdio) or 'url' (http)", IsError: true}, nil
	}

	// Determine type
	srvType := "stdio"
	if params.URL != "" && params.Command == "" {
		srvType = "http"
	}

	// Determine scope (default project)
	scope := params.Scope
	if scope != "global" {
		scope = "project"
	}

	// Build the save payload
	savePayload, _ := json.Marshal(map[string]any{
		"id":      params.ID,
		"type":    srvType,
		"command": params.Command,
		"args":    params.Args,
		"env":     params.Env,
		"url":     params.URL,
		"headers": params.Headers,
		"scope":   scope,
	})

	if err := t.saveFn(savePayload); err != nil {
		return tool.ExecutionResult{Content: fmt.Sprintf("Failed to save MCP server config: %s", err), IsError: true}, nil
	}

	// Attempt to connect
	reconnectPayload, _ := json.Marshal(map[string]string{"ID": params.ID})
	tools, err := t.reconnectFn(reconnectPayload)
	if err != nil {
		return tool.ExecutionResult{
			Content: fmt.Sprintf("MCP server %q saved to config but connection failed: %s\nThe server will be available on next restart.", params.ID, err),
		}, nil
	}

	return tool.ExecutionResult{
		Content: fmt.Sprintf("MCP server %q connected successfully. Available tools (%d): %s", params.ID, len(tools), strings.Join(tools, ", ")),
	}, nil
}
