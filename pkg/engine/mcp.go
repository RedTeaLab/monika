package engine

import (
	"context"
	"encoding/json"
	"sync"
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

// MCPRegistry provides thread-safe access to MCP connections and tools.
type MCPRegistry struct {
	mu          sync.RWMutex
	connections map[string]MCPServerConnection
	tools       []MCPTool
}

func NewMCPRegistry() *MCPRegistry {
	return &MCPRegistry{
		connections: make(map[string]MCPServerConnection),
	}
}

func (r *MCPRegistry) AddServer(id string, conn MCPServerConnection, tools []MCPTool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.connections[id] = conn
	r.tools = append(r.tools, tools...)
}

func (r *MCPRegistry) GetConnections() map[string]MCPServerConnection {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make(map[string]MCPServerConnection, len(r.connections))
	for k, v := range r.connections {
		out[k] = v
	}
	return out
}

func (r *MCPRegistry) GetTools() []MCPTool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]MCPTool, len(r.tools))
	copy(out, r.tools)
	return out
}

func (r *MCPRegistry) LenTools() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.tools)
}
