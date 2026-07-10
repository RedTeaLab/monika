# GitHub Copilot Provider Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub Copilot as a provider with OAuth Device Flow login, token auto-refresh, and Copilot-specific request headers.

**Architecture:** A new `pkg/copilot/` package handles Device Flow auth and Copilot API streaming. A new `internal/engines/provider/copilot/` engine registers as `wire_api: "copilot"` and delegates to `pkg/copilot`. The Settings UI detects OAuth providers by `env` field and renders a login button instead of an API key input. Token refresh happens transparently on 401 responses.

**Tech Stack:** Go 1.25, Wails v3, React 18 + TypeScript, Zustand, Tailwind CSS v4

**Design doc:** `docs/copilot-integration-design.md`

**Client ID:** `Iv23litrxstEvvTWUeTd`

---

## File Structure

| File | Operation | Responsibility |
|------|-----------|----------------|
| `pkg/copilot/types.go` | Create | Data types for Device Flow responses, token, models |
| `pkg/copilot/auth.go` | Create | Device Flow requests + token refresh + model fetch |
| `pkg/copilot/streaming.go` | Create | Copilot streaming client (injects headers, handles 401 refresh) |
| `pkg/openai/sse.go` | Create | Extracted public SSE parsing functions |
| `pkg/openai/streaming.go` | Modify | Use extracted functions from sse.go |
| `internal/engines/provider/copilot/copilot.go` | Create | CopilotProvider engine |
| `internal/config/config.go` | Modify | ProviderConfig += RefreshToken, TokenExpiresAt |
| `internal/bootstrap/provider.go` | Modify | Pass new fields in initCfg |
| `pkg/modelsdev/modelsdev.go` | Modify | ProviderEntry += Env field |
| `internal/api/types.go` | Modify | AvailableProviderInfo += Env; ProviderInfo += TokenExpiresAt; new Copilot types |
| `internal/api/app.go` | Modify | 3 new methods; modify GetAvailableProviders, GetProviders, SaveProvider, NewApp |
| `main.go` | Modify | Blank import + inject token refresh callbacks |
| `frontend/src/store/index.ts` | Modify | Types + state + actions for Copilot login |
| `frontend/src/components/Settings/CopilotLogin.tsx` | Create | Device Flow login UI component |
| `frontend/src/components/Settings/ModelsTab.tsx` | Modify | Conditional rendering + list label |

---

## Task 1: Extract public SSE functions from pkg/openai

**Files:**
- Create: `pkg/openai/sse.go`
- Modify: `pkg/openai/streaming.go`

The existing `pkg/openai/streaming.go` has private functions for SSE parsing, HTTP client caching, and error classification. We extract them to a separate file and export them so `pkg/copilot` can reuse them.

- [ ] **Step 1: Create `pkg/openai/sse.go` with exported wrappers**

Create `pkg/openai/sse.go`:

```go
package openai

import (
	"context"
	"io"
	"net/http"

	"monika/pkg/engine"
)

// ParseSSEStream parses an SSE stream into ChatEvents.
func ParseSSEStream(ctx context.Context, r io.Reader, ch chan<- engine.ChatEvent) error {
	return parseSSEStream(ctx, r, ch)
}

// ParseSSEStreamInGoroutine wraps ParseSSEStream with body cleanup and context cancellation.
func ParseSSEStreamInGoroutine(ctx context.Context, resp *http.Response, ch chan<- engine.ChatEvent) error {
	return parseSSEStreamInGoroutine(ctx, resp, ch)
}

// SendError sends a provider error event, non-blocking.
func SendError(ch chan<- engine.ChatEvent, err error) {
	sendError(ch, err)
}

// HTTPClientFor returns a cached HTTP client for the given base URL.
func HTTPClientFor(baseURL string) *http.Client {
	return httpClientFor(baseURL)
}

// RetryableHTTPError checks if an HTTP error is transient.
func RetryableHTTPError(err error) bool {
	return retryableHTTPError(err)
}

// ChatRequest is the request body for a chat completion.
type ChatRequest = chatRequest

// StreamOptions is the stream_options field.
type StreamOptions = streamOptions

// BuildChatRequest builds the JSON body for a chat completion request.
func BuildChatRequest(model string, messages []engine.ChatMessage, tools []engine.ToolDef, includeStreamOptions bool) ([]byte, error) {
	body := chatRequest{
		Model:    model,
		Messages: messages,
		Stream:   true,
		Tools:    tools,
	}
	if includeStreamOptions {
		body.StreamOptions = &streamOptions{IncludeUsage: true}
	}
	return marshalBody(body)
}

// marshalBody marshals a chatRequest to JSON.
func marshalBody(body chatRequest) ([]byte, error) {
	return jsonMarshal(body)
}

// jsonMarshal is a thin wrapper to avoid importing encoding/json in callers.
func jsonMarshal(body chatRequest) ([]byte, error) {
	return json.Marshal(body)
}
```

Wait — we need `encoding/json` import. Fix the file to include it. Also `BuildChatRequest` has an unnecessary indirection. Let me simplify:

```go
package openai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"

	"monika/pkg/engine"
)

// ParseSSEStream parses an SSE stream into ChatEvents.
func ParseSSEStream(ctx context.Context, r io.Reader, ch chan<- engine.ChatEvent) error {
	return parseSSEStream(ctx, r, ch)
}

// ParseSSEStreamInGoroutine wraps ParseSSEStream with body cleanup and context cancellation.
func ParseSSEStreamInGoroutine(ctx context.Context, resp *http.Response, ch chan<- engine.ChatEvent) error {
	return parseSSEStreamInGoroutine(ctx, resp, ch)
}

// SendError sends a provider error event, non-blocking.
func SendError(ch chan<- engine.ChatEvent, err error) {
	sendError(ch, err)
}

// HTTPClientFor returns a cached HTTP client for the given base URL.
func HTTPClientFor(baseURL string) *http.Client {
	return httpClientFor(baseURL)
}

// RetryableHTTPError checks if an HTTP error is transient.
func RetryableHTTPError(err error) bool {
	return retryableHTTPError(err)
}

// ChatRequest is the request body for a chat completion.
type ChatRequest = chatRequest

// StreamOptions is the stream_options field.
type StreamOptions = streamOptions

// BuildChatRequest builds the JSON body for a streaming chat completion request.
func BuildChatRequest(model string, messages []engine.ChatMessage, tools []engine.ToolDef, includeStreamOptions bool) ([]byte, error) {
	body := chatRequest{
		Model:    model,
		Messages: messages,
		Stream:   true,
		Tools:    tools,
	}
	if includeStreamOptions {
		body.StreamOptions = &streamOptions{IncludeUsage: true}
	}
	return json.Marshal(body)
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./pkg/openai/...`
Expected: PASS (no errors — the private functions still exist in streaming.go, the new file just adds exported wrappers)

- [ ] **Step 3: Commit**

```bash
git add pkg/openai/sse.go
git commit -m "refactor: extract exported SSE functions from pkg/openai for reuse"
```

---

## Task 2: Create pkg/copilot/types.go

**Files:**
- Create: `pkg/copilot/types.go`

- [ ] **Step 1: Create the types file**

```go
package copilot

// DeviceCodeResponse is the response from POST /login/device/code.
type DeviceCodeResponse struct {
	DeviceCode      string `json:"device_code"`
	UserCode        string `json:"user_code"`
	VerificationURI string `json:"verification_uri"`
	ExpiresIn       int    `json:"expires_in"`
	Interval        int    `json:"interval"`
}

// TokenResponse is the response from POST /login/oauth/access_token.
type TokenResponse struct {
	AccessToken      string `json:"access_token"`
	RefreshToken     string `json:"refresh_token,omitempty"`
	ExpiresIn        int    `json:"expires_in"`
	RefreshExpiresIn int    `json:"refresh_token_expires_in,omitempty"`
	TokenType        string `json:"token_type"`
	Scope            string `json:"scope"`
	// Error response fields
	Error            string `json:"error,omitempty"`
	ErrorDescription string `json:"error_description,omitempty"`
	ErrorURI         string `json:"error_uri,omitempty"`
	Interval         int    `json:"interval,omitempty"`
}

// CopilotModel represents a model from GET /models.
type CopilotModel struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Capabilities struct {
		Limits struct {
			MaxContextWindowTokens int `json:"max_context_window_tokens"`
			MaxOutputTokens        int `json:"max_output_tokens"`
		} `json:"limits"`
		Supports struct {
			ToolCalls bool `json:"tool_calls"`
			Streaming bool `json:"streaming"`
			Vision    bool `json:"vision"`
		} `json:"supports"`
	} `json:"capabilities"`
}

// TokenRefreshCallback is called after a successful token refresh,
// allowing the caller to persist the new tokens.
type TokenRefreshCallback func(newAccessToken, newRefreshToken string, newExpiresAt int64)
```

- [ ] **Step 2: Commit**

```bash
git add pkg/copilot/types.go
git commit -m "feat: add copilot package types"
```

---

## Task 3: Create pkg/copilot/auth.go

**Files:**
- Create: `pkg/copilot/auth.go`

- [ ] **Step 1: Create the auth file**

```go
package copilot

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"time"
)

const (
	DefaultClientID = "Iv23litrxstEvvTWUeTd"
	GitHubBaseURL   = "https://github.com"
	CopilotAPIURL   = "https://api.githubcopilot.com"
	TokenScope      = "read:user"
)

var (
	ErrAuthorizationPending = errors.New("authorization_pending")
	ErrSlowDown            = errors.New("slow_down")
	ErrExpiredToken        = errors.New("expired_token")
	ErrAccessDenied        = errors.New("access_denied")
)

func ClientID() string {
	if id := os.Getenv("MONIKA_COPILOT_CLIENT_ID"); id != "" {
		return id
	}
	return DefaultClientID
}

var httpClient = &http.Client{
	Timeout: 30 * time.Second,
	Transport: &http.Transport{
		MaxIdleConnsPerHost: 2,
		Proxy:               http.ProxyFromEnvironment,
	},
}

// RequestDeviceCode initiates the GitHub OAuth Device Flow.
func RequestDeviceCode(ctx context.Context) (*DeviceCodeResponse, error) {
	form := url.Values{
		"client_id": {ClientID()},
		"scope":     {TokenScope},
	}
	req, err := http.NewRequestWithContext(ctx, "POST",
		GitHubBaseURL+"/login/device/code",
		safeReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("device code request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("device code request: HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result DeviceCodeResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("device code parse: %w", err)
	}
	return &result, nil
}

// PollForToken polls the token endpoint once (caller controls interval).
func PollForToken(ctx context.Context, deviceCode string) (*TokenResponse, error) {
	form := url.Values{
		"client_id":   {ClientID()},
		"grant_type":  {"urn:ietf:params:oauth:grant-type:device_code"},
		"device_code": {deviceCode},
	}
	req, err := http.NewRequestWithContext(ctx, "POST",
		GitHubBaseURL+"/login/oauth/access_token",
		safeReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token poll: %w", err)
	}
	defer resp.Body.Close()

	var result TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("token parse: %w", err)
	}

	if result.Error != "" {
		switch result.Error {
		case "authorization_pending":
			return nil, ErrAuthorizationPending
		case "slow_down":
			return nil, ErrSlowDown
		case "expired_token":
			return nil, ErrExpiredToken
		case "access_denied":
			return nil, ErrAccessDenied
		default:
			return nil, fmt.Errorf("%s: %s", result.Error, result.ErrorDescription)
		}
	}
	if result.AccessToken == "" {
		return nil, fmt.Errorf("token response missing access_token")
	}
	return &result, nil
}

// RefreshToken exchanges a refresh_token for a new access_token.
func RefreshToken(ctx context.Context, refreshToken string) (*TokenResponse, error) {
	form := url.Values{
		"client_id":      {ClientID()},
		"grant_type":     {"refresh_token"},
		"refresh_token":  {refreshToken},
	}
	req, err := http.NewRequestWithContext(ctx, "POST",
		GitHubBaseURL+"/login/oauth/access_token",
		safeReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token refresh: %w", err)
	}
	defer resp.Body.Close()

	var result TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("refresh parse: %w", err)
	}
	if result.Error != "" {
		return nil, fmt.Errorf("refresh failed: %s: %s", result.Error, result.ErrorDescription)
	}
	if result.AccessToken == "" {
		return nil, fmt.Errorf("refresh response missing access_token")
	}
	return &result, nil
}

// FetchModels retrieves the model list from the Copilot API.
func FetchModels(ctx context.Context, token string) ([]CopilotModel, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", CopilotAPIURL+"/models", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch models: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("fetch models: HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Data []CopilotModel `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("models parse: %w", err)
	}
	return result.Data, nil
}

// safeReader wraps a string in a strings.Reader for request bodies.
func safeReader(s string) io.Reader {
	return &stringReader{s: s}
}

type stringReader struct {
	s   string
	pos int
}

func (r *stringReader) Read(p []byte) (int, error) {
	if r.pos >= len(r.s) {
		return 0, io.EOF
	}
	n := copy(p, r.s[r.pos:])
	r.pos += n
	return n, nil
}
```

Note: we use a simple `stringReader` instead of importing `strings` to keep the dependency surface minimal. Alternatively, you can use `strings.NewReader(form.Encode())` — both are equivalent. If you prefer the standard library, replace `safeReader` with `strings.NewReader` and add `"strings"` to imports.

- [ ] **Step 2: Simplify using strings.NewReader**

Replace the `safeReader` / `stringReader` hack with `strings.NewReader`. Update imports to include `"strings"`. Remove the `stringReader` type entirely. The final imports should be:

```go
import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)
```

And replace `safeReader(form.Encode())` with `strings.NewReader(form.Encode())` in all three functions.

- [ ] **Step 3: Verify compilation**

Run: `go build ./pkg/copilot/...`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add pkg/copilot/auth.go
git commit -m "feat: add copilot Device Flow auth and token refresh"
```

---

## Task 4: Create pkg/copilot/streaming.go

**Files:**
- Create: `pkg/copilot/streaming.go`

- [ ] **Step 1: Create the streaming file**

```go
package copilot

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"monika/pkg/engine"
	oaiclient "monika/pkg/openai"
)

// Option configures StreamChat.
type Option func(*streamConfig)

type streamConfig struct {
	editorVersion string
	refreshToken  string
	onRefresh     TokenRefreshCallback
	hasVision     bool
}

// WithEditorVersion sets the Editor-Version header.
func WithEditorVersion(v string) Option { return func(c *streamConfig) { c.editorVersion = v } }

// WithRefreshToken enables automatic token refresh on 401.
func WithRefreshToken(rt string) Option { return func(c *streamConfig) { c.refreshToken = rt } }

// WithRefreshCallback registers a callback for token refresh persistence.
func WithRefreshCallback(cb TokenRefreshCallback) Option {
	return func(c *streamConfig) { c.onRefresh = cb }
}

// WithVision controls the Copilot-Vision-Request header.
func WithVision(v bool) Option { return func(c *streamConfig) { c.hasVision = v } }

var refreshMu sync.Mutex

// StreamChat sends a streaming chat request to the Copilot API.
func StreamChat(
	ctx context.Context,
	baseURL, token, model string,
	messages []engine.ChatMessage,
	tools []engine.ToolDef,
	opts ...Option,
) (<-chan engine.ChatEvent, error) {
	cfg := &streamConfig{}
	for _, o := range opts {
		o(cfg)
	}

	bodyJSON, err := oaiclient.BuildChatRequest(model, messages, tools, true)
	if err != nil {
		return nil, err
	}

	doRequest := func(authToken string) (*http.Response, error) {
		req, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/chat/completions", bytes.NewReader(bodyJSON))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+authToken)
		if cfg.editorVersion != "" {
			req.Header.Set("Editor-Version", cfg.editorVersion)
		}
		if cfg.hasVision {
			req.Header.Set("Copilot-Vision-Request", "true")
		}
		return oaiclient.HTTPClientFor(baseURL).Do(req)
	}

	// First attempt
	resp, err := doRequest(token)
	if err != nil {
		if !oaiclient.RetryableHTTPError(err) {
			return nil, err
		}
	} else if resp.StatusCode == http.StatusUnauthorized && cfg.refreshToken != "" {
		// 401 — try refresh
		resp.Body.Close()
		newToken, refreshErr := doRefresh(cfg)
		if refreshErr == nil {
			resp, err = doRequest(newToken)
		} else {
			return nil, fmt.Errorf("copilot: token expired and refresh failed: %w", refreshErr)
		}
	}

	if err == nil && resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode < 500 {
			return nil, fmt.Errorf("copilot API returned %d: %s", resp.StatusCode, string(respBody))
		}
		// 5xx — fall through to retry path
	} else if err == nil {
		// Success — parse SSE stream
		ch := make(chan engine.ChatEvent, 128)
		go func() {
			defer close(ch)
			if err := oaiclient.ParseSSEStreamInGoroutine(ctx, resp, ch); err != nil {
				if ctx.Err() != nil {
					return
				}
				oaiclient.SendError(ch, err)
			}
		}()
		return ch, nil
	}

	// Retry path (same pattern as pkg/openai)
	ch := make(chan engine.ChatEvent, 128)
	go func() {
		defer close(ch)
		const maxAttempts = 10
		for attempt := 1; attempt <= maxAttempts; attempt++ {
			if attempt > 1 {
				delay := time.Duration(500*(1<<(attempt-2))) * time.Millisecond
				if delay > 30*time.Second {
					delay = 30 * time.Second
				}
				select {
				case <-time.After(delay):
				case <-ctx.Done():
					return
				}
			}

			req, _ := http.NewRequestWithContext(ctx, "POST", baseURL+"/chat/completions", bytes.NewReader(bodyJSON))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+token)
			if cfg.editorVersion != "" {
				req.Header.Set("Editor-Version", cfg.editorVersion)
			}
			if cfg.hasVision {
				req.Header.Set("Copilot-Vision-Request", "true")
			}

			r, e := oaiclient.HTTPClientFor(baseURL).Do(req)
			if e != nil {
				if oaiclient.RetryableHTTPError(e) && attempt < maxAttempts {
					continue
				}
				oaiclient.SendError(ch, e)
				return
			}
			if r.StatusCode != http.StatusOK {
				rBody, _ := io.ReadAll(r.Body)
				r.Body.Close()
				if r.StatusCode >= 500 && attempt < maxAttempts {
					continue
				}
				oaiclient.SendError(ch, fmt.Errorf("copilot API returned %d: %s", r.StatusCode, string(rBody)))
				return
			}
			if err := oaiclient.ParseSSEStreamInGoroutine(ctx, r, ch); err != nil {
				if ctx.Err() != nil {
					return
				}
				oaiclient.SendError(ch, err)
				return
			}
			return
		}
		oaiclient.SendError(ch, fmt.Errorf("copilot: stream failed after %d attempts", maxAttempts))
	}()
	return ch, nil
}

func doRefresh(cfg *streamConfig) (string, error) {
	refreshMu.Lock()
	defer refreshMu.Unlock()

	resp, err := RefreshToken(context.Background(), cfg.refreshToken)
	if err != nil {
		return "", err
	}
	expiresAt := time.Now().Unix() + int64(resp.ExpiresIn)
	if cfg.onRefresh != nil {
		cfg.onRefresh(resp.AccessToken, resp.RefreshToken, expiresAt)
	}
	return resp.AccessToken, nil
}

// DetectVision checks if any message has image attachments.
func DetectVision(messages []engine.ChatMessage) bool {
	for _, msg := range messages {
		for _, att := range msg.Attachments {
			if strings.HasPrefix(att.MimeType, "image/") {
				return true
			}
		}
	}
	return false
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./pkg/copilot/...`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add pkg/copilot/streaming.go
git commit -m "feat: add copilot streaming client with header injection and 401 refresh"
```

---

## Task 5: Extend ProviderConfig with token fields

**Files:**
- Modify: `internal/config/config.go:53-60`

- [ ] **Step 1: Add fields to ProviderConfig**

In `internal/config/config.go`, find the `ProviderConfig` struct (line 53) and add two fields:

```go
type ProviderConfig struct {
	Name              string       `yaml:"name" json:"name"`
	BaseURL           string       `yaml:"base_url" json:"base_url"`
	APIKey            string       `yaml:"api_key" json:"api_key"`
	WireAPI           string       `yaml:"wire_api" json:"wire_api"`
	ModelsDevProvider string       `yaml:"modelsdev_provider,omitempty" json:"modelsdev_provider,omitempty"`
	Models            []ModelEntry `yaml:"models" json:"models"`
	RefreshToken      string       `yaml:"refresh_token,omitempty" json:"refresh_token,omitempty"`
	TokenExpiresAt    int64        `yaml:"token_expires_at,omitempty" json:"token_expires_at,omitempty"`
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./internal/config/...`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add internal/config/config.go
git commit -m "feat: add RefreshToken and TokenExpiresAt to ProviderConfig"
```

---

## Task 6: Add Env field to modelsdev ProviderEntry

**Files:**
- Modify: `pkg/modelsdev/modelsdev.go:16-22`

- [ ] **Step 1: Add Env field**

```go
type ProviderEntry struct {
	ID     string               `json:"id"`
	Name   string               `json:"name"`
	Npm    string               `json:"npm"`
	API    string               `json:"api"`
	Env    []string             `json:"env"`
	Models map[string]ModelData `json:"models"`
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./pkg/modelsdev/...`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add pkg/modelsdev/modelsdev.go
git commit -m "feat: add Env field to modelsdev ProviderEntry"
```

---

## Task 7: Update bootstrap to pass token fields

**Files:**
- Modify: `internal/bootstrap/provider.go:54-58`

- [ ] **Step 1: Extend initCfg**

Replace lines 54-58:

```go
		initCfg := map[string]any{
			"base_url":         providerCfg.BaseURL,
			"api_key":          providerCfg.APIKey,
			"models":           providerCfg.Models,
			"refresh_token":    providerCfg.RefreshToken,
			"token_expires_at": providerCfg.TokenExpiresAt,
		}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./internal/bootstrap/...`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add internal/bootstrap/provider.go
git commit -m "feat: pass refresh_token and token_expires_at to engines in bootstrap"
```

---

## Task 8: Create CopilotProvider engine

**Files:**
- Create: `internal/engines/provider/copilot/copilot.go`

- [ ] **Step 1: Create the engine file**

```go
package copilot

import (
	"context"
	"fmt"

	"monika/internal/config"
	"monika/internal/version"
	"monika/pkg/copilot"
	"monika/pkg/engine"
)

func init() {
	engine.Register(&CopilotProvider{})
}

type CopilotProvider struct {
	config        map[string]any
	onTokenRefresh copilot.TokenRefreshCallback
}

func (p *CopilotProvider) ID() string                        { return "copilot" }
func (p *CopilotProvider) NewInstance() engine.Engine        { return &CopilotProvider{} }
func (p *CopilotProvider) Capabilities() []engine.Capability { return []engine.Capability{engine.CapProvider} }

func (p *CopilotProvider) Init(_ context.Context, cfg map[string]any) error {
	p.config = cfg
	return nil
}

func (p *CopilotProvider) Shutdown(_ context.Context) error { return nil }

// SetOnTokenRefresh injects a callback for persisting refreshed tokens.
func (p *CopilotProvider) SetOnTokenRefresh(cb copilot.TokenRefreshCallback) {
	p.onTokenRefresh = cb
}

func (p *CopilotProvider) StreamChat(ctx context.Context, req engine.ChatRequest) (<-chan engine.ChatEvent, error) {
	baseURL := ""
	token := ""
	model := ""
	refreshToken := ""

	if p.config != nil {
		if v, ok := p.config["base_url"].(string); ok {
			baseURL = v
		}
		if v, ok := p.config["api_key"].(string); ok {
			token = v
		}
		if v, ok := p.config["refresh_token"].(string); ok {
			refreshToken = v
		}
	}
	if req.Model != "" {
		model = req.Model
	} else if p.config != nil {
		if v, ok := p.config["model"].(string); ok {
			model = v
		}
	}

	if baseURL == "" {
		baseURL = copilot.CopilotAPIURL
	}
	if model == "" {
		model = "gpt-4o"
	}
	if token == "" {
		return nil, fmt.Errorf("copilot: no token configured")
	}

	hasVision := copilot.DetectVision(req.Messages)

	return copilot.StreamChat(ctx, baseURL, token, model, req.Messages, req.Tools,
		copilot.WithEditorVersion("monika/"+version.Version),
		copilot.WithRefreshToken(refreshToken),
		copilot.WithRefreshCallback(p.onTokenRefresh),
		copilot.WithVision(hasVision),
	)
}

func (p *CopilotProvider) ListModels(ctx context.Context) ([]engine.Model, error) {
	if p.config != nil {
		if raw, ok := p.config["models"]; ok {
			if entries, ok := raw.([]config.ModelEntry); ok && len(entries) > 0 {
				models := make([]engine.Model, len(entries))
				for i, e := range entries {
					models[i] = engine.Model{ID: e.ID, DisplayName: e.DisplayName}
				}
				return models, nil
			}
		}
	}
	return nil, nil
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./internal/engines/provider/copilot/...`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add internal/engines/provider/copilot/copilot.go
git commit -m "feat: add CopilotProvider engine"
```

---

## Task 9: Register copilot engine in main.go + inject refresh callbacks

**Files:**
- Modify: `main.go:31-33` (blank imports)
- Modify: `main.go:416` (after NewApp)

- [ ] **Step 1: Add blank import**

In `main.go`, add the copilot engine import alongside the existing openai import (around line 31-33):

```go
	_ "monika/internal/engines/provider/copilot"
	_ "monika/internal/engines/provider/openai"
```

- [ ] **Step 2: Inject token refresh callbacks after NewApp**

After line 416 (`appService = api.NewApp(...)`) and before the next line, add:

```go
	// Inject token refresh callbacks for copilot providers.
	api.InjectCopilotRefreshCallbacks(appService)
```

Then add a new method to `internal/api/app.go`. But since this touches app.go (which is modified in Task 11), we'll defer the method creation to Task 11 and add the call here.

Actually, to keep tasks atomic, let's create the helper in app.go first (Task 11), then wire it in main.go. For now, just add the blank import and commit. The main.go wiring will be in Task 12.

- [ ] **Step 3: Commit (import only)**

```bash
git add main.go
git commit -m "feat: register copilot engine via blank import"
```

---

## Task 10: Update API types

**Files:**
- Modify: `internal/api/types.go`

- [ ] **Step 1: Add Env to AvailableProviderInfo, TokenExpiresAt to ProviderInfo, new Copilot types**

In `internal/api/types.go`, make three changes:

**Change 1:** Add `Env` field to `AvailableProviderInfo` (line 157):

```go
type AvailableProviderInfo struct {
	ID          string               `json:"id"`
	DisplayName string               `json:"display_name"`
	Npm         string               `json:"npm"`
	BaseURL     string               `json:"base_url"`
	Env         []string             `json:"env,omitempty"`
	Models      []AvailableModelInfo `json:"models"`
}
```

**Change 2:** Add `TokenExpiresAt` to `ProviderInfo` (line 138). Do NOT add RefreshToken (security):

```go
type ProviderInfo struct {
	ID             string           `json:"id"`
	DisplayName    string           `json:"display_name"`
	BaseURL        string           `json:"base_url"`
	APIKey         string           `json:"api_key"`
	WireAPI        string           `json:"wire_api,omitempty"`
	Models         []ModelEntryJSON `json:"models"`
	TokenExpiresAt int64            `json:"token_expires_at,omitempty"`
}
```

**Change 3:** Add new types at the end of the file:

```go
// CopilotLoginInfo is returned by StartCopilotLogin.
type CopilotLoginInfo struct {
	DeviceCode      string `json:"device_code"`
	UserCode        string `json:"user_code"`
	VerificationURI string `json:"verification_uri"`
	ExpiresIn       int    `json:"expires_in"`
	Interval        int    `json:"interval"`
}

// CopilotTokenResult is returned by PollCopilotLogin.
type CopilotTokenResult struct {
	AccessToken  string `json:"access_token,omitempty"`
	RefreshToken string `json:"refresh_token,omitempty"`
	ExpiresIn    int    `json:"expires_in,omitempty"`
	Status       string `json:"status"`
	Error        string `json:"error,omitempty"`
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./internal/api/...`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add internal/api/types.go
git commit -m "feat: add Copilot types and Env field to API types"
```

---

## Task 11: Update app.go — 3 new methods + modify existing methods

**Files:**
- Modify: `internal/api/app.go`

This is the largest change. We need to:
1. Add `StartCopilotLogin()`
2. Add `PollCopilotLogin()`
3. Add `updateCopilotToken()` (internal)
4. Add `InjectCopilotRefreshCallbacks()` (public, called from main.go)
5. Modify `GetAvailableProviders()` — pass `Env`
6. Modify `GetProviders()` — pass `TokenExpiresAt`
7. Modify `SaveProvider()` — receive + persist `refresh_token` / `token_expires_at` + inject callback

- [ ] **Step 1: Add import for pkg/copilot**

At the top of `app.go`, add to the import block:

```go
	"monika/pkg/copilot"
```

- [ ] **Step 2: Modify GetAvailableProviders — add Env field**

Find line 582-588 (the `result = append(result, AvailableProviderInfo{...})`). Add `Env: p.Env`:

```go
			result = append(result, AvailableProviderInfo{
				ID:          providerID,
				DisplayName: displayName,
				Npm:         p.Npm,
				BaseURL:     p.API,
				Env:         p.Env,
				Models:      models,
			})
```

- [ ] **Step 3: Modify GetProviders — add TokenExpiresAt**

Find line 536-543 (the `result = append(result, ProviderInfo{...})`). Add `TokenExpiresAt`:

```go
		result = append(result, ProviderInfo{
			ID:             id,
			DisplayName:    displayName,
			BaseURL:        pc.BaseURL,
			APIKey:         pc.APIKey,
			WireAPI:        pc.WireAPI,
			Models:         models,
			TokenExpiresAt: pc.TokenExpiresAt,
		})
```

- [ ] **Step 4: Modify SaveProvider — add refresh_token fields**

Find line 4564 (the `var req struct{...}` in SaveProvider). Add two fields:

```go
	var req struct {
		ID             string               `json:"id"`
		Name           string               `json:"name"`
		BaseURL        string               `json:"base_url"`
		APIKey         string               `json:"api_key"`
		WireAPI        string               `json:"wire_api"`
		Models         []config2.ModelEntry `json:"models"`
		RefreshToken   string               `json:"refresh_token"`
		TokenExpiresAt int64                `json:"token_expires_at"`
	}
```

Find line 4575 (the `pc := config2.ProviderConfig{...}`). Add the new fields:

```go
	pc := config2.ProviderConfig{
		Name:           req.Name,
		BaseURL:        req.BaseURL,
		APIKey:         req.APIKey,
		WireAPI:        req.WireAPI,
		Models:         req.Models,
		RefreshToken:   req.RefreshToken,
		TokenExpiresAt: req.TokenExpiresAt,
	}
```

In the "merge existing" block (line 4582-4601), add preservation for new fields:

```go
		if pc.RefreshToken == "" {
			pc.RefreshToken = existing.RefreshToken
		}
		if pc.TokenExpiresAt == 0 {
			pc.TokenExpiresAt = existing.TokenExpiresAt
		}
```

In the engine init section (line 4627-4631), extend initCfg:

```go
	if err := eng.Init(a.ctx, map[string]any{
		"base_url":         pc.BaseURL,
		"api_key":          pc.APIKey,
		"models":           pc.Models,
		"refresh_token":    pc.RefreshToken,
		"token_expires_at": pc.TokenExpiresAt,
	}); err != nil {
```

After `a.providers[req.ID] = providerEng` (line 4640), inject refresh callback:

```go
	// Inject token refresh callback for copilot providers.
	if cp, ok := providerEng.(*copilot.CopilotProvider); ok {
		providerID := req.ID
		cp.SetOnTokenRefresh(func(at, rt string, exp int64) {
			a.updateCopilotToken(providerID, at, rt, exp)
		})
	}
```

- [ ] **Step 5: Add StartCopilotLogin, PollCopilotLogin, updateCopilotToken, InjectCopilotRefreshCallbacks**

Add these methods anywhere in app.go (e.g., after SaveProvider):

```go
// StartCopilotLogin initiates GitHub Device Flow authentication.
func (a *App) StartCopilotLogin() (*CopilotLoginInfo, error) {
	resp, err := copilot.RequestDeviceCode(a.ctx)
	if err != nil {
		return nil, fmt.Errorf("copilot login: %w", err)
	}
	return &CopilotLoginInfo{
		DeviceCode:      resp.DeviceCode,
		UserCode:        resp.UserCode,
		VerificationURI: resp.VerificationURI,
		ExpiresIn:       resp.ExpiresIn,
		Interval:        resp.Interval,
	}, nil
}

// PollCopilotLogin polls the OAuth token endpoint once.
func (a *App) PollCopilotLogin(deviceCode string) (*CopilotTokenResult, error) {
	resp, err := copilot.PollForToken(a.ctx, deviceCode)
	if err != nil {
		switch {
		case errors.Is(err, copilot.ErrAuthorizationPending):
			return &CopilotTokenResult{Status: "pending"}, nil
		case errors.Is(err, copilot.ErrSlowDown):
			return &CopilotTokenResult{Status: "pending", Error: "slow_down"}, nil
		case errors.Is(err, copilot.ErrExpiredToken):
			return &CopilotTokenResult{Status: "error", Error: "Device code expired"}, nil
		case errors.Is(err, copilot.ErrAccessDenied):
			return &CopilotTokenResult{Status: "error", Error: "Access denied by user"}, nil
		default:
			return &CopilotTokenResult{Status: "error", Error: err.Error()}, nil
		}
	}
	return &CopilotTokenResult{
		AccessToken:  resp.AccessToken,
		RefreshToken: resp.RefreshToken,
		ExpiresIn:    resp.ExpiresIn,
		Status:       "success",
	}, nil
}

// updateCopilotToken persists refreshed tokens to config.
func (a *App) updateCopilotToken(providerID, accessToken, refreshToken string, expiresAt int64) {
	a.mu.Lock()
	if pc, ok := a.cfg.ModelProviders[providerID]; ok {
		pc.APIKey = accessToken
		if refreshToken != "" {
			pc.RefreshToken = refreshToken
		}
		pc.TokenExpiresAt = expiresAt
		a.cfg.ModelProviders[providerID] = pc
	}
	a.mu.Unlock()

	a.writeConfigForScope("global", func(cfg *config2.Config) {
		if pc, ok := cfg.ModelProviders[providerID]; ok {
			pc.APIKey = accessToken
			if refreshToken != "" {
				pc.RefreshToken = refreshToken
			}
			pc.TokenExpiresAt = expiresAt
			cfg.ModelProviders[providerID] = pc
		}
	})
}

// InjectCopilotRefreshCallbacks injects token refresh callbacks into all
// existing copilot providers. Called once after App creation in main.go.
func InjectCopilotRefreshCallbacks(a *App) {
	for id, eng := range a.providers {
		if cp, ok := eng.(*copilot.CopilotProvider); ok {
			providerID := id
			cp.SetOnTokenRefresh(func(at, rt string, exp int64) {
				a.updateCopilotToken(providerID, at, rt, exp)
			})
		}
	}
}
```

Note: you'll need to add `"errors"` to the imports if not already present (it likely is).

- [ ] **Step 6: Verify compilation**

Run: `go build ./internal/api/...`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add internal/api/app.go
git commit -m "feat: add Copilot login API methods and token refresh persistence"
```

---

## Task 12: Wire InjectCopilotRefreshCallbacks in main.go

**Files:**
- Modify: `main.go`

- [ ] **Step 1: Add the call after NewApp**

After line 416 (`appService = api.NewApp(...)`), add:

```go
	api.InjectCopilotRefreshCallbacks(appService)
```

- [ ] **Step 2: Verify full build**

Run: `go build .`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add main.go
git commit -m "feat: inject copilot token refresh callbacks at startup"
```

---

## Task 13: Regenerate Wails bindings

**Files:**
- Modify: `frontend/bindings/monika/index.ts` (auto-generated)

- [ ] **Step 1: Generate bindings**

Run:
```bash
wails3 generate bindings -ts
node -e "require('fs').copyFileSync('build/barrel_index.ts','frontend/bindings/monika/index.ts')"
```

- [ ] **Step 2: Verify the new methods appear**

Check that `StartCopilotLogin`, `PollCopilotLogin` appear in the generated bindings.

- [ ] **Step 3: Commit**

```bash
git add frontend/bindings/
git commit -m "chore: regenerate wails bindings for copilot API"
```

---

## Task 14: Update frontend store

**Files:**
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: Add Copilot types**

After the existing `AvailableModelInfo` interface (around line 60), add:

```ts
export interface CopilotLoginInfo {
	device_code: string
	user_code: string
	verification_uri: string
	expires_in: number
	interval: number
}

export interface CopilotTokenResult {
	access_token?: string
	refresh_token?: string
	expires_in?: number
	status: 'success' | 'pending' | 'error'
	error?: string
}
```

- [ ] **Step 2: Add `env` to AvailableProviderInfo**

Find the `AvailableProviderInfo` interface (line 47) and add:

```ts
export interface AvailableProviderInfo {
	id: string
	display_name: string
	npm: string
	base_url: string
	env?: string[]
	models: AvailableModelInfo[]
}
```

- [ ] **Step 3: Add `token_expires_at` to ProviderFull**

Find the `ProviderFull` interface and add:

```ts
	token_expires_at?: number
```

- [ ] **Step 4: Add actions to the store interface and implementation**

In the store interface definition (around line 370), add:

```ts
	startCopilotLogin: () => Promise<CopilotLoginInfo>
	pollCopilotLogin: (deviceCode: string) => Promise<CopilotTokenResult>
```

In the store implementation (near `saveProviderDetail`, around line 1830), add:

```ts
	startCopilotLogin: async () => {
		return await Call.ByName('monika/internal/api.App.StartCopilotLogin') as CopilotLoginInfo
	},
	pollCopilotLogin: async (deviceCode: string) => {
		return await Call.ByName('monika/internal/api.App.PollCopilotLogin', deviceCode) as CopilotTokenResult
	},
```

- [ ] **Step 5: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS (or only pre-existing errors)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat: add copilot login types and actions to frontend store"
```

---

## Task 15: Create CopilotLogin.tsx component

**Files:**
- Create: `frontend/src/components/Settings/CopilotLogin.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState, useRef, useEffect, useCallback } from 'react'
import { useStore } from '../../store'
import type { CopilotLoginInfo, CopilotTokenResult } from '../../store'

type LoginState = 'idle' | 'waiting' | 'success' | 'error'

interface Props {
	onToken: (accessToken: string, refreshToken: string, expiresIn: number) => void
	onError: (msg: string) => void
	existingToken?: string
}

export function CopilotLoginSection({ onToken, onError, existingToken }: Props) {
	const [state, setState] = useState<LoginState>(existingToken ? 'success' : 'idle')
	const [loginInfo, setLoginInfo] = useState<CopilotLoginInfo | null>(null)
	const [errorMsg, setErrorMsg] = useState('')
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

	const startCopilotLogin = useStore(s => s.startCopilotLogin)
	const pollCopilotLogin = useStore(s => s.pollCopilotLogin)

	const cleanup = useCallback(() => {
		if (timerRef.current) {
			clearInterval(timerRef.current)
			timerRef.current = null
		}
	}, [])

	useEffect(() => cleanup, [cleanup])

	const handleLogin = useCallback(async () => {
		setState('waiting')
		setErrorMsg('')
		try {
			const info = await startCopilotLogin()
			setLoginInfo(info)
			window.open(info.verification_uri, '_blank')

			let interval = info.interval

			const pollFn = async () => {
				try {
					const result: CopilotTokenResult = await pollCopilotLogin(info.device_code)
					if (result.status === 'success') {
						cleanup()
						setState('success')
						onToken(result.access_token!, result.refresh_token!, result.expires_in!)
					} else if (result.status === 'error') {
						cleanup()
						setState('error')
						setErrorMsg(result.error || 'Unknown error')
						onError(result.error || 'Unknown error')
					} else if (result.error === 'slow_down') {
						cleanup()
						interval += 5
						timerRef.current = setInterval(pollFn, (interval + 1) * 1000)
					}
				} catch {
					// Network error — keep polling
				}
			}

			timerRef.current = setInterval(pollFn, (interval + 1) * 1000)
		} catch (e) {
			setState('error')
			setErrorMsg(String(e))
			onError(String(e))
		}
	}, [startCopilotLogin, pollCopilotLogin, onToken, onError, cleanup])

	if (state === 'idle') {
		return (
			<button
				onClick={handleLogin}
				className="w-full px-4 py-2.5 text-[12px] font-medium rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-center gap-2"
			>
				<span>🔑 Login with GitHub</span>
			</button>
		)
	}

	if (state === 'waiting' && loginInfo) {
		return (
			<div className="rounded-md border border-[var(--border)] p-4 space-y-2">
				<p className="text-[12px] text-[var(--text-secondary)] m-0">Enter this code on GitHub:</p>
				<div className="text-[18px] font-mono font-bold tracking-wider text-center py-2 rounded bg-[var(--bg-sidebar)]">
					{loginInfo.user_code}
				</div>
				<p className="text-[11px] text-[var(--text-dim)] m-0 text-center">
					Open <a href={loginInfo.verification_uri} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline">{loginInfo.verification_uri}</a>
				</p>
				<div className="flex items-center justify-center gap-1.5 pt-1">
					<span className="inline-block w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
					<span className="text-[11px] text-[var(--text-dim)]">Waiting for authorization...</span>
				</div>
			</div>
		)
	}

	if (state === 'success') {
		return (
			<div className="space-y-2">
				<div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--green)' }}>
					<span>✓ Logged in</span>
				</div>
				<button
					onClick={handleLogin}
					className="text-[11px] text-[var(--text-dim)] hover:text-[var(--text-primary)] underline cursor-pointer bg-transparent border-none"
				>
					Re-login
				</button>
			</div>
		)
	}

	// error
	return (
		<div className="space-y-2">
			<p className="text-[11px] text-[var(--red)] m-0">{errorMsg}</p>
			<button
				onClick={handleLogin}
				className="text-[11px] text-[var(--accent)] underline cursor-pointer bg-transparent border-none"
			>
				Try again
			</button>
		</div>
	)
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Settings/CopilotLogin.tsx
git commit -m "feat: add CopilotLoginSection component"
```

---

## Task 16: Modify ModelsTab.tsx for conditional auth rendering

**Files:**
- Modify: `frontend/src/components/Settings/ModelsTab.tsx`

- [ ] **Step 1: Add import for CopilotLoginSection**

At the top of `ModelsTab.tsx`, add:

```tsx
import { CopilotLoginSection } from './CopilotLogin'
```

- [ ] **Step 2: Add authMode and copilotToken state**

After line 129 (`const [deleteTarget, setDeleteTarget] = useState<string | null>(null)`), add:

```tsx
	const [authMode, setAuthMode] = useState<'api_key' | 'oauth'>('api_key')
	const [copilotToken, setCopilotToken] = useState<{
		refreshToken: string
		expiresIn: number
	} | null>(null)
```

- [ ] **Step 3: Modify openAdd — reset authMode**

In `openAdd()` (line 149), add at the end before `setSaved(false)`:

```tsx
	setAuthMode('api_key')
	setCopilotToken(null)
```

- [ ] **Step 4: Modify openEdit — detect copilot wire_api**

In `openEdit()` (line 136), add:

```tsx
	setAuthMode(p.wire_api === 'copilot' ? 'oauth' : 'api_key')
	setCopilotToken(null)
```

- [ ] **Step 5: Modify handleProviderSelect — detect OAuth providers**

Replace the entire `handleProviderSelect` function (line 162-168):

```tsx
	const handleProviderSelect = (catalog: AvailableProviderInfo) => {
		setSelectedAvailableProvider(catalog.id)
		setProvId(catalog.id)
		setName(catalog.display_name || catalog.id.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '))
		setBaseURL(catalog.base_url || '')

		const isOAuth = catalog.env?.includes('GITHUB_TOKEN')
		if (isOAuth) {
			setAuthMode('oauth')
			setWireAPI('copilot')
			setApiKey('')
			setCopilotToken(null)
		} else {
			setAuthMode('api_key')
			setWireAPI('openai')
		}
	}
```

- [ ] **Step 6: Replace the API Key input with conditional rendering**

Find lines 344-347 (the API Key div). Replace with:

```tsx
              {authMode === 'api_key' ? (
                <div>
                  <label className={labelCls}>API Key</label>
                  <input type="password" className={inputCls} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Enter your API key" autoFocus={!isAdding} />
                </div>
              ) : (
                <div>
                  <label className={labelCls}>Authentication</label>
                  <CopilotLoginSection
                    existingToken={editingId ? apiKey : undefined}
                    onToken={(at, rt, exp) => {
                      setApiKey(at)
                      setCopilotToken({ refreshToken: rt, expiresIn: exp })
                    }}
                    onError={setError}
                  />
                </div>
              )}
```

- [ ] **Step 7: Modify handleSave — add OAuth validation and pass token fields**

In `handleSave` (line 175), modify the validation block. After the existing `if (isAdding)` block that checks apiKey, add:

```tsx
		if (authMode === 'oauth' && !apiKey.trim()) {
			setError('Please login with GitHub first')
			return
		}
```

Then modify the `saveProvider` call (line 193-197) to include token fields:

```tsx
		const tokenExpiresAt = copilotToken
			? Math.floor(Date.now() / 1000) + copilotToken.expiresIn
			: 0

		await saveProvider({
			id: provId.trim(), display_name: name.trim(), name: name.trim(), base_url: baseURL.trim(),
			api_key: apiKey.trim(), wire_api: wireAPI.trim(),
			refresh_token: copilotToken?.refreshToken || '',
			token_expires_at: tokenExpiresAt,
			models,
		})
```

Update the `useCallback` dependency array to include `authMode, copilotToken`.

- [ ] **Step 8: Modify provider list label — "Token" vs "Key"**

Find line 283 (`<span>Key: {maskKey(p.api_key)}</span>`). Replace with:

```tsx
                    <span>{p.wire_api === 'copilot' ? 'Token' : 'Key'}: {maskKey(p.api_key)}</span>
```

- [ ] **Step 9: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/Settings/ModelsTab.tsx
git commit -m "feat: conditional OAuth/API key rendering in ModelsTab"
```

---

## Task 17: Full build verification

- [ ] **Step 1: Build frontend**

```bash
cd frontend && npm run build && cd ..
```

- [ ] **Step 2: Build Go**

```bash
go build .
```

- [ ] **Step 3: Run go vet**

```bash
go vet ./...
```

Expected: no new warnings

- [ ] **Step 4: Commit if any fixes were needed**

---

## Task 18: End-to-end manual test

- [ ] **Step 1: Launch the app**

```bash
wails3 dev
```

- [ ] **Step 2: Test Device Flow login**

1. Open Settings → Providers
2. Click Add
3. Select "GitHub Copilot" from the catalog
4. Verify the form shows "Login with GitHub" button instead of API Key input
5. Click the button → browser opens GitHub
6. Enter the user_code shown in the UI
7. Authorize on GitHub
8. Verify the UI shows "✓ Logged in"
9. Click Save Provider
10. Verify GitHub Copilot appears in the provider list with "Token:" label

- [ ] **Step 3: Test chat**

1. Select a Copilot model (e.g., gpt-4o)
2. Send a message
3. Verify streaming response works

- [ ] **Step 4: Test token persistence**

1. Restart the app
2. Verify GitHub Copilot provider still works without re-login
3. Send another message to confirm

- [ ] **Step 5: Test proxy support (if behind proxy)**

1. Set `HTTP_PROXY` / `HTTPS_PROXY` environment variables
2. Verify Device Flow and chat requests work through the proxy
