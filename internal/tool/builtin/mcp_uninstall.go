package builtin

import (
	"context"
	"encoding/json"
	"fmt"

	"monika/internal/tool"
)

type mcpUninstallTool struct {
	deleteFn func(args json.RawMessage) error
}

func NewMCPUninstallTool(deleteFn func(args json.RawMessage) error) tool.Tool {
	return &mcpUninstallTool{deleteFn: deleteFn}
}

func (t *mcpUninstallTool) Name() string { return "uninstall_mcp_server" }

func (t *mcpUninstallTool) Description() string {
	return `Remove (disconnect and delete) an MCP server by its ID.

Use this tool when the user asks to remove, delete, or uninstall an MCP server.`
}

func (t *mcpUninstallTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"id": map[string]any{
				"type":        "string",
				"description": "The ID of the MCP server to remove",
			},
			"scope": map[string]any{
				"type":        "string",
				"enum":        []string{"project", "global"},
				"description": "Which config to remove from: \"project\" (default) or \"global\"",
			},
		},
		"required": []string{"id"},
	}
}

func (t *mcpUninstallTool) Execute(_ context.Context, args json.RawMessage) (tool.ExecutionResult, error) {
	var params struct {
		ID    string `json:"id"`
		Scope string `json:"scope"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return tool.ExecutionResult{}, fmt.Errorf("uninstall_mcp_server: invalid args: %w", err)
	}
	if params.ID == "" {
		return tool.ExecutionResult{Content: "Error: id is required", IsError: true}, nil
	}

	scope := params.Scope
	if scope != "global" {
		scope = "project"
	}
	payload, _ := json.Marshal(map[string]string{"id": params.ID, "scope": scope})
	if err := t.deleteFn(payload); err != nil {
		return tool.ExecutionResult{Content: fmt.Sprintf("Failed to remove MCP server: %s", err), IsError: true}, nil
	}

	return tool.ExecutionResult{
		Content: fmt.Sprintf("MCP server %q removed successfully.", params.ID),
	}, nil
}
