package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"sync"

	"monika/pkg/engine"
)

func init() {
	engine.Register(&MCPEngine{})
}

type MCPEngine struct {
	mu          sync.RWMutex
	connections map[string]*serverConnection
}

func (e *MCPEngine) ID() string { return "mcp" }

func (e *MCPEngine) Capabilities() []engine.Capability {
	return []engine.Capability{engine.CapMCP}
}

func (e *MCPEngine) Init(_ context.Context, _ map[string]any) error {
	e.connections = make(map[string]*serverConnection)
	return nil
}

func (e *MCPEngine) Shutdown(ctx context.Context) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	for id := range e.connections {
		_ = e.disconnectLocked(id)
	}
	return nil
}

func (e *MCPEngine) ConnectServer(ctx context.Context, config engine.MCPServerConfig) (engine.MCPServerConnection, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	if _, exists := e.connections[config.ID]; exists {
		return nil, fmt.Errorf("mcp: server %q already connected", config.ID)
	}

	cmd := exec.CommandContext(ctx, config.Command, config.Args...)
	hideWindow(cmd)
	for k, v := range config.Env {
		cmd.Env = append(cmd.Env, k+"="+v)
	}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("mcp: stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("mcp: stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("mcp: start server: %w", err)
	}

	conn := &serverConnection{
		id:     config.ID,
		cmd:    cmd,
		stdin:  stdin,
		stdout: stdout,
		enc:    json.NewEncoder(stdin),
		dec:    json.NewDecoder(stdout),
	}
	e.connections[config.ID] = conn
	return conn, nil
}

func (e *MCPEngine) DisconnectServer(_ context.Context, serverID string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.disconnectLocked(serverID)
}

func (e *MCPEngine) disconnectLocked(serverID string) error {
	conn, ok := e.connections[serverID]
	if !ok {
		return fmt.Errorf("mcp: server %q not found", serverID)
	}
	delete(e.connections, serverID)
	return conn.close()
}

type serverConnection struct {
	mu     sync.Mutex
	id     string
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser
	enc    *json.Encoder
	dec    *json.Decoder
	nextID int
}

func (c *serverConnection) ListTools(ctx context.Context) ([]engine.MCPTool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.nextID++
	req := jsonRPCRequest{
		JSONRPC: "2.0",
		ID:      c.nextID,
		Method:  "tools/list",
	}
	if err := c.enc.Encode(req); err != nil {
		return nil, err
	}

	var resp toolsListResponse
	if err := c.dec.Decode(&resp); err != nil {
		return nil, err
	}

	return resp.Result.Tools, nil
}

func (c *serverConnection) CallTool(ctx context.Context, name string, args json.RawMessage) (json.RawMessage, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.nextID++
	params, _ := json.Marshal(map[string]any{
		"name":      name,
		"arguments": json.RawMessage(args),
	})
	req := jsonRPCRequest{
		JSONRPC: "2.0",
		ID:      c.nextID,
		Method:  "tools/call",
		Params:  params,
	}
	if err := c.enc.Encode(req); err != nil {
		return nil, err
	}

	var resp callToolResponse
	if err := c.dec.Decode(&resp); err != nil {
		return nil, err
	}
	return resp.Result.Content, nil
}

func (c *serverConnection) close() error {
	_ = c.stdin.Close()
	_ = c.stdout.Close()
	return c.cmd.Process.Kill()
}

type jsonRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int             `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type toolsListResponse struct {
	Result struct {
		Tools []engine.MCPTool `json:"tools"`
	} `json:"result"`
}

type callToolResponse struct {
	Result struct {
		Content json.RawMessage `json:"content"`
	} `json:"result"`
}
