package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"monika/pkg/engine"
)

// httpConnection implements MCPServerConnection for Streamable HTTP and legacy SSE MCP servers.
type httpConnection struct {
	mu        sync.Mutex
	id        string
	baseURL   string
	headers   map[string]string
	sessionID string
	client    *http.Client
	sseResp   *http.Response
	sseDone   chan struct{}
	nextID    int
}

func newHTTPConnection(ctx context.Context, config engine.MCPServerConfig) (*httpConnection, error) {
	client := &http.Client{Timeout: 60 * time.Second}
	conn := &httpConnection{
		id:      config.ID,
		baseURL: config.URL,
		headers: config.Headers,
		client:  client,
		sseDone: make(chan struct{}),
	}

	// Try Streamable HTTP first (POST-based).
	// If the server rejects GET-based SSE, we fall through to the streamable HTTP path.
	if err := conn.initStreamableHTTP(ctx); err != nil {
		return nil, err
	}
	return conn, nil
}

// initStreamableHTTP uses the MCP Streamable HTTP transport:
// POST initialize -> capture Mcp-Session-Id -> POST initialized notification.
func (c *httpConnection) initStreamableHTTP(ctx context.Context) error {
	if err := c.initialize(ctx); err != nil {
		return err
	}
	return c.sendInitialized(ctx)
}

func (c *httpConnection) initialize(ctx context.Context) error {
	c.nextID++
	initParams, _ := json.Marshal(map[string]any{
		"protocolVersion": "2024-11-05",
		"capabilities":    map[string]any{},
		"clientInfo": map[string]string{
			"name":    "monika",
			"version": "1.0",
		},
	})
	req := jsonRPCRequest{
		JSONRPC: "2.0",
		ID:      c.nextID,
		Method:  "initialize",
		Params:  initParams,
	}
	_, err := c.postRPC(ctx, req)
	return err
}

func (c *httpConnection) sendInitialized(ctx context.Context) error {
	notif, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"method":  "notifications/initialized",
	})
	body, err := json.Marshal(json.RawMessage(notif))
	if err != nil {
		return err
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL, strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	c.setHeaders(httpReq)

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return fmt.Errorf("send initialized notification: %w", err)
	}
	c.captureSession(resp)
	io.ReadAll(resp.Body)
	resp.Body.Close()
	return nil
}

func (c *httpConnection) postRPC(ctx context.Context, req jsonRPCRequest) (json.RawMessage, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL, strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	c.setHeaders(httpReq)

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("mcp: POST %s: %w", req.Method, err)
	}
	c.captureSession(resp)
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("mcp: read response: %w", err)
	}

	if resp.StatusCode != 200 && resp.StatusCode != 202 {
		return nil, fmt.Errorf("mcp: POST %s returned %d: %s", req.Method, resp.StatusCode, string(respBody))
	}

	ct := resp.Header.Get("Content-Type")

	// SSE stream response
	if strings.Contains(ct, "text/event-stream") {
		return parseSSEResponse(respBody, req.ID)
	}

	// Direct JSON response
	var rpcResp struct {
		Result json.RawMessage `json:"result"`
		Error  *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
		ID int `json:"id"`
	}
	if err := json.Unmarshal(respBody, &rpcResp); err != nil {
		return nil, fmt.Errorf("mcp: decode response: %w (body: %s)", err, string(respBody))
	}
	if rpcResp.Error != nil {
		return nil, fmt.Errorf("mcp: RPC error %d: %s", rpcResp.Error.Code, rpcResp.Error.Message)
	}
	return rpcResp.Result, nil
}

func (c *httpConnection) setHeaders(req *http.Request) {
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	for k, v := range c.headers {
		req.Header.Set(k, v)
	}
	if c.sessionID != "" {
		req.Header.Set("Mcp-Session-Id", c.sessionID)
	}
}

func (c *httpConnection) captureSession(resp *http.Response) {
	if sid := resp.Header.Get("Mcp-Session-Id"); sid != "" {
		c.sessionID = sid
	}
}

func parseSSEResponse(data []byte, requestID int) (json.RawMessage, error) {
	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	var currentData string
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "data:") {
			currentData = strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		}
		if line == "" && currentData != "" {
			var rpcResp struct {
				Result json.RawMessage `json:"result"`
				Error  *struct {
					Code    int    `json:"code"`
					Message string `json:"message"`
				} `json:"error"`
				ID int `json:"id"`
			}
			if err := json.Unmarshal([]byte(currentData), &rpcResp); err == nil && rpcResp.ID == requestID {
				if rpcResp.Error != nil {
					return nil, fmt.Errorf("mcp: RPC error %d: %s", rpcResp.Error.Code, rpcResp.Error.Message)
				}
				return rpcResp.Result, nil
			}
			currentData = ""
		}
	}
	return nil, fmt.Errorf("mcp: no response found in SSE stream for request %d", requestID)
}

func (c *httpConnection) ListTools(ctx context.Context) ([]engine.MCPTool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.nextID++
	req := jsonRPCRequest{
		JSONRPC: "2.0",
		ID:      c.nextID,
		Method:  "tools/list",
	}

	result, err := c.postRPC(ctx, req)
	if err != nil {
		return nil, err
	}

	var resp toolsListResponse
	if err := json.Unmarshal(result, &resp.Result); err != nil {
		return nil, fmt.Errorf("mcp: decode tools list: %w", err)
	}
	return resp.Result.Tools, nil
}

func (c *httpConnection) CallTool(ctx context.Context, name string, args json.RawMessage) (json.RawMessage, error) {
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

	result, err := c.postRPC(ctx, req)
	if err != nil {
		return nil, err
	}

	var toolResp callToolResponse
	if err := json.Unmarshal(result, &toolResp.Result); err != nil {
		return nil, fmt.Errorf("mcp: decode tool call result: %w", err)
	}
	return toolResp.Result.Content, nil
}

func (c *httpConnection) close() error {
	if c.sseResp != nil && c.sseResp.Body != nil {
		c.sseResp.Body.Close()
		<-c.sseDone
	}
	return nil
}
