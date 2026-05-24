package engine

import (
	"context"
	"encoding/json"
)

type MCPServerConfig struct {
	ID      string
	Type    string // "stdio" or "http"
	Command string
	Args    []string
	Env     map[string]string
	URL     string
	Headers map[string]string
}

type MCPServerConnection interface {
	ListTools(ctx context.Context) ([]MCPTool, error)
	CallTool(ctx context.Context, name string, args json.RawMessage) (json.RawMessage, error)
}

type MCPTool struct {
	Name        string
	Description string
	InputSchema json.RawMessage
}

type MCPEngine interface {
	Engine
	ConnectServer(ctx context.Context, config MCPServerConfig) (MCPServerConnection, error)
	DisconnectServer(ctx context.Context, serverID string) error
	IsConnected(serverID string) bool
}
