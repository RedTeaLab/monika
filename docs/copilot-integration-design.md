# GitHub Copilot 完整集成方案

> 状态：Draft
> 创建：2025-07-08
> Client ID：`Iv23litrxstEvvTWUeTd`

## 一、背景

### 1.1 目标

在 Monika 中集成 GitHub Copilot 作为 provider，支持：

- OAuth 2.0 Device Flow 登录（用户无需手动复制 token）
- Token 自动刷新（8h 过期后透明续期）
- Copilot API 流式聊天（OpenAI-compatible SSE）
- 动态模型列表（从 Copilot API 拉取，回退到 models.dev catalog）
- Copilot 专有请求头注入（Editor-Version、Copilot-Vision-Request）

### 1.2 已验证事实

通过实际 API 调用验证：

| 项 | 结果 |
|----|------|
| Device Flow 端点 | `POST https://github.com/login/device/code` |
| Token 轮询端点 | `POST https://github.com/login/oauth/access_token` |
| scope | `read:user`（不需要 copilot scope） |
| access_token 有效期 | **8 小时**（28800s），非永久 |
| refresh_token 有效期 | **约 184 天**（15897600s） |
| Copilot API | `https://api.githubcopilot.com`（OpenAI-compatible） |
| 模型列表端点 | `GET /models`（返回 7+ 模型，含 gpt-4o, claude-sonnet-4.5 等） |
| 聊天端点 | `POST /chat/completions`（标准 OpenAI SSE 格式） |
| 认证方式 | GitHub OAuth token **直接作为 Bearer**，无需 Copilot token 交换 |

### 1.3 models.dev catalog 中的 Copilot

`github-copilot` 已在 models.dev catalog 中，与其他 provider 平等：

```json
{
  "id": "github-copilot",
  "env": ["GITHUB_TOKEN"],
  "npm": "@ai-sdk/openai-compatible",
  "api": "https://api.githubcopilot.com",
  "name": "GitHub Copilot",
  "models": { "gpt-4o": {...}, "claude-sonnet-4.5": {...}, ... }
}
```

**区分依据**：`env` 字段包含 `"GITHUB_TOKEN"` → 走 OAuth Device Flow；否则 → 走手动 API Key 输入。

---

## 二、数据流全景

### 2.1 登录流程

```
用户在 Settings → Add Provider → 选择 "GitHub Copilot"
  ↓
前端检测 env 含 GITHUB_TOKEN → 切换到 OAuth 模式
  ↓
点击 "Login with GitHub" 按钮
  ↓
App.StartCopilotLogin()
  → POST https://github.com/login/device/code
  → body: client_id=Iv23litrxstEvvTWUeTd&scope=read:user
  ← 返回 { device_code, user_code, verification_uri, expires_in, interval }
  ↓
前端显示 user_code，自动打开浏览器到 verification_uri
  ↓
用户在浏览器中输入 user_code 并授权
  ↓
前端每 (interval+1) 秒轮询 App.PollCopilotLogin(device_code)
  → POST https://github.com/login/oauth/access_token
  → body: client_id=...&grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=...
  ← authorization_pending → 继续轮询
  ← slow_down → 增加 5s 间隔
  ← 成功 → { access_token, refresh_token, expires_in }
  ↓
前端拿到 token → 存入 state → handleSave()
  → SaveProvider({ api_key: access_token, wire_api: "copilot", refresh_token, token_expires_at })
  → Go 写入 config.json + 初始化 copilot engine
```

### 2.2 聊天流程

```
AgentLoop → CopilotProvider.StreamChat()
  → pkg/copilot.StreamChat(ctx, baseURL, token, model, messages, tools, opts...)
    → 构建 HTTP 请求
    → 注入: Authorization: Bearer <token>
    → 注入: Editor-Version: monika/<version>
    → 注入: Copilot-Vision-Request: true (仅有图片时)
    → POST api.githubcopilot.com/chat/completions
    → SSE 流式返回
    → pkg/openai.ParseSSEStream() 复用现有 SSE 解析
```

### 2.3 Token 自动刷新流程

```
pkg/copilot.StreamChat 发送请求
  ↓
HTTP 401 Unauthorized?
  ↓ Yes
检查是否有 refresh_token
  ↓ Yes
调用 copilot.RefreshToken(clientID, refreshToken)
  → POST github.com/login/oauth/access_token
  → body: client_id=...&grant_type=refresh_token&refresh_token=...
  ← 返回新的 access_token + refresh_token + expires_in
  ↓
通过 onRefresh 回调通知上层更新 config.json
  ↓
用新 token 重试原始请求（仅重试 1 次）
  ↓
如果 refresh 也失败 → 返回 401 错误 → 前端提示重新登录
```

---

## 三、架构分层

```
┌─ Frontend ──────────────────────────────────────────────────────┐
│                                                                  │
│  Settings/ModelsTab.tsx                                          │
│    ├── ProviderSelect (现有，不变)                                │
│    ├── CopilotLogin.tsx (新增)                                   │
│    │     idle → waiting → success/error                          │
│    └── 条件渲染: env 含 GITHUB_TOKEN ? OAuth : APIKey             │
│                                                                  │
│  store/index.ts                                                  │
│    ├── startCopilotLogin() → App.StartCopilotLogin()             │
│    ├── pollCopilotLogin() → App.PollCopilotLogin()               │
│    └── copilotLoginInfo / copilotPolling 状态                    │
│                                                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Wails IPC
┌─ Backend (Go) ───────────┴──────────────────────────────────────┐
│                                                                  │
│  internal/api/app.go                                             │
│    ├── StartCopilotLogin() → pkg/copilot.RequestDeviceCode()    │
│    ├── PollCopilotLogin() → pkg/copilot.PollForToken()          │
│    ├── RefreshCopilotToken() → pkg/copilot.RefreshToken()       │
│    ├── SaveProvider() ← 增加 refresh_token / token_expires_at    │
│    ├── GetAvailableProviders() ← 增加 env 字段传递               │
│    └── updateCopilotToken() ← token 刷新回调写回 config          │
│                                                                  │
│  internal/engines/provider/copilot/copilot.go (新增)             │
│    ├── CopilotProvider 实现 ProviderEngine 接口                   │
│    ├── StreamChat() → pkg/copilot.StreamChat()                   │
│    ├── ListModels() → config 静态 / GET /models 动态             │
│    └── ID() = "copilot"                                          │
│                                                                  │
│  internal/config/config.go                                       │
│    └── ProviderConfig 增加 RefreshToken, TokenExpiresAt          │
│                                                                  │
│  internal/bootstrap/provider.go                                  │
│    └── initCfg 增加 refresh_token, token_expires_at              │
│                                                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌─ pkg 层 ─────────────────┴──────────────────────────────────────┐
│                                                                  │
│  pkg/copilot/ (新增)                                             │
│    ├── auth.go                                                   │
│    │     RequestDeviceCode() / PollForToken() / RefreshToken()   │
│    │     FetchModels()                                           │
│    ├── streaming.go                                              │
│    │     StreamChat() — 复用 pkg/openai SSE 解析                  │
│    │     注入 Copilot 专有头                                      │
│    │     401 自动刷新 + 重试                                      │
│    └── types.go                                                  │
│          DeviceCodeResponse / TokenResponse / CopilotModel       │
│                                                                  │
│  pkg/openai/                                                     │
│    ├── sse.go (新增 — 提取导出)                                   │
│    │     ParseSSEStream() / ParseSSEStreamInGoroutine()          │
│    │     SendError() / HTTPClientFor() / RetryableHTTPError()    │
│    └── streaming.go (修改 — 改为调用同包导出函数)                  │
│                                                                  │
│  pkg/engine/registry.go                                          │
│    └── copilot engine 通过 init() 自动注册                        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 四、变更清单

| # | 文件 | 操作 | 内容 |
|---|------|------|------|
| 1 | `pkg/copilot/types.go` | **新建** | 数据类型定义 |
| 2 | `pkg/copilot/auth.go` | **新建** | Device Flow + Token Refresh + FetchModels |
| 3 | `pkg/copilot/streaming.go` | **新建** | Copilot HTTP streaming client |
| 4 | `pkg/openai/sse.go` | **新建** | 从 streaming.go 提取公共 SSE 函数并导出 |
| 5 | `pkg/openai/streaming.go` | **修改** | 改为调用同包 sse.go 中的导出函数 |
| 6 | `internal/engines/provider/copilot/copilot.go` | **新建** | CopilotProvider 引擎 |
| 7 | `internal/config/config.go` | **修改** | ProviderConfig 增加 RefreshToken + TokenExpiresAt |
| 8 | `internal/bootstrap/provider.go` | **修改** | initCfg 传递新字段 |
| 9 | `internal/api/types.go` | **修改** | AvailableProviderInfo 加 Env；新增 CopilotLoginInfo + CopilotTokenResult |
| 10 | `internal/api/app.go` | **修改** | 新增 3 个方法；GetAvailableProviders 传 env；SaveProvider 传 refresh_token |
| 11 | `main.go` | **修改** | blank import copilot engine |
| 12 | `frontend/src/store/index.ts` | **修改** | 新增类型、状态、actions |
| 13 | `frontend/src/components/Settings/CopilotLogin.tsx` | **新建** | Device Flow 登录组件 |
| 14 | `frontend/src/components/Settings/ModelsTab.tsx` | **修改** | 条件渲染 + 列表适配 |

---

## 五、逐层详细设计

### 5.1 `pkg/copilot/types.go`

```go
package copilot

// DeviceCodeResponse is the response from POST /login/device/code
type DeviceCodeResponse struct {
    DeviceCode      string `json:"device_code"`
    UserCode        string `json:"user_code"`
    VerificationURI string `json:"verification_uri"`
    ExpiresIn       int    `json:"expires_in"`
    Interval        int    `json:"interval"`
}

// TokenResponse is the response from POST /login/oauth/access_token
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
    Interval         int    `json:"interval,omitempty"` // returned on slow_down
}

// CopilotModel represents a model from GET /models
type CopilotModel struct {
    ID           string `json:"id"`
    Name         string `json:"name"`
    Capabilities struct {
        Limits struct {
            MaxContextWindowTokens int `json:"max_context_window_tokens"`
            MaxOutputTokens        int `json:"max_output_tokens"`
        } `json:"limits"`
        Supports struct {
            ToolCalls    bool `json:"tool_calls"`
            Streaming    bool `json:"streaming"`
            Vision       bool `json:"vision"`
        } `json:"supports"`
    } `json:"capabilities"`
}

// TokenRefreshCallback is called after a successful token refresh,
// allowing the caller to persist the new tokens.
type TokenRefreshCallback func(newAccessToken, newRefreshToken string, newExpiresAt int64)
```

### 5.2 `pkg/copilot/auth.go`

```go
package copilot

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

// ClientID resolves the OAuth client ID from env override or default.
func ClientID() string {
    if id := os.Getenv("MONIKA_COPILOT_CLIENT_ID"); id != "" {
        return id
    }
    return DefaultClientID
}

// RequestDeviceCode initiates the device flow.
func RequestDeviceCode(ctx context.Context) (*DeviceCodeResponse, error) {
    // POST https://github.com/login/device/code
    // body: client_id=<ClientID()>&scope=read:user
    // Accept: application/json
}

// PollForToken polls the token endpoint once (caller controls polling interval).
// Returns:
//   *TokenResponse, nil                      — success
//   nil, ErrAuthorizationPending             — user hasn't authorized yet
//   nil, ErrSlowDown                         — increase interval
//   nil, ErrExpiredToken / ErrAccessDenied   — terminal failure
//   nil, err                                 — unexpected error
func PollForToken(ctx context.Context, deviceCode string) (*TokenResponse, error) {
    // POST https://github.com/login/oauth/access_token
    // body: client_id=<ClientID()>&grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=<deviceCode>
    // Map error string to sentinel errors
}

// RefreshToken exchanges a refresh_token for a new access_token.
func RefreshToken(ctx context.Context, refreshToken string) (*TokenResponse, error) {
    // POST https://github.com/login/oauth/access_token
    // body: client_id=<ClientID()>&grant_type=refresh_token&refresh_token=<refreshToken>
}

// FetchModels retrieves the model list from Copilot API.
func FetchModels(ctx context.Context, token string) ([]CopilotModel, error) {
    // GET https://api.githubcopilot.com/models
    // Authorization: Bearer <token>
    // Editor-Version: monika/<version>
}
```

### 5.3 `pkg/copilot/streaming.go`

```go
package copilot

// Option configures the StreamChat call.
type Option func(*streamConfig)

type streamConfig struct {
    editorVersion  string
    refreshToken   string
    onRefresh      TokenRefreshCallback
    hasVision      bool
}

func WithEditorVersion(v string) Option    { return func(c *streamConfig) { c.editorVersion = v } }
func WithRefreshToken(rt string) Option     { return func(c *streamConfig) { c.refreshToken = rt } }
func WithRefreshCallback(cb TokenRefreshCallback) Option { return func(c *streamConfig) { c.onRefresh = cb } }
func WithVision(v bool) Option              { return func(c *streamConfig) { c.hasVision = v } }

// StreamChat sends a streaming chat request to the Copilot API.
// It mirrors pkg/openai.StreamChat but adds:
//   - Copilot-specific headers (Editor-Version, Copilot-Vision-Request)
//   - Automatic token refresh on 401
//   - stream_options.include_usage (always, Copilot supports it)
func StreamChat(
    ctx context.Context, baseURL, token, model string,
    messages []engine.ChatMessage, tools []engine.ToolDef,
    opts ...Option,
) (<-chan engine.ChatEvent, error) {
    cfg := &streamConfig{}
    for _, o := range opts { o(cfg) }

    // 1. Build request (same as pkg/openai but with Copilot headers)
    // 2. Try request
    // 3. On 401: if refresh_token available, RefreshToken(), call onRefresh, retry once
    // 4. On success: pkg/openai.ParseSSEStreamInGoroutine(ctx, resp, ch)
    // 5. On 5xx: retry with backoff (same pattern as pkg/openai)
}
```

**核心差异 vs `pkg/openai.StreamChat`**：

| 方面 | pkg/openai | pkg/copilot |
|------|-----------|-------------|
| 认证头 | `Authorization: Bearer <apiKey>` | 同左 |
| Editor-Version | 无 | `monika/<version>` |
| Copilot-Vision-Request | 无 | `true`（仅有图片时） |
| stream_options | 仅 `api.openai.com` | **始终发送** |
| Token 刷新 | 无 | 401 → RefreshToken → 重试 1 次 |
| SSE 解析 | 内部 `parseSSEStream` | 复用 `pkg/openai.ParseSSEStream` |
| 重试逻辑 | 内部 | 相同模式（复用 `RetryableHTTPError`） |

### 5.4 `pkg/openai/sse.go` — 公共 SSE 提取

从 `pkg/openai/streaming.go` 提取以下函数到新文件 `sse.go`，并改为**导出**：

```go
package openai

// ParseSSEStream parses an SSE stream into ChatEvents.
func ParseSSEStream(ctx context.Context, r io.Reader, ch chan<- engine.ChatEvent) error

// ParseSSEStreamInGoroutine wraps ParseSSEStream with body cleanup and context cancellation.
func ParseSSEStreamInGoroutine(ctx context.Context, resp *http.Response, ch chan<- engine.ChatEvent) error

// SendError sends a provider error event, non-blocking.
func SendError(ch chan<- engine.ChatEvent, err error)

// HTTPClientFor returns a cached HTTP client for the given base URL.
func HTTPClientFor(baseURL string) *http.Client

// RetryableHTTPError checks if an HTTP error is transient.
func RetryableHTTPError(err error) bool
```

`streaming.go` 中的调用从 `parseSSEStream` → `ParseSSEStream` 等（去掉首字母小写）。

同时导出 chat request 构建辅助函数：

```go
// BuildChatRequest creates the JSON body for a chat completion request.
func BuildChatRequest(model string, messages []engine.ChatMessage, tools []engine.ToolDef, includeStreamOptions bool) ([]byte, error)
```

### 5.5 `internal/engines/provider/copilot/copilot.go`

```go
package copilot

func init() {
    engine.Register(&CopilotProvider{})
}

type CopilotProvider struct {
    config map[string]any
}

func (p *CopilotProvider) ID() string                        { return "copilot" }
func (p *CopilotProvider) NewInstance() engine.Engine        { return &CopilotProvider{} }
func (p *CopilotProvider) Capabilities() []engine.Capability { return []engine.Capability{engine.CapProvider} }
func (p *CopilotProvider) Init(_ context.Context, cfg map[string]any) error { p.config = cfg; return nil }
func (p *CopilotProvider) Shutdown(_ context.Context) error  { return nil }

func (p *CopilotProvider) StreamChat(ctx context.Context, req engine.ChatRequest) (<-chan engine.ChatEvent, error) {
    cfg := p.resolveConfig(req)
    if cfg.BaseURL == "" {
        cfg.BaseURL = copilotapi.CopilotAPIURL // fallback to default
    }

    // Detect vision: check if any message has image attachments
    hasVision := detectVision(req.Messages)

    return copilotapi.StreamChat(ctx, cfg.BaseURL, cfg.Token, cfg.Model, req.Messages, req.Tools,
        copilotapi.WithEditorVersion("monika/"+version.Version),
        copilotapi.WithRefreshToken(cfg.RefreshToken),
        copilotapi.WithRefreshCallback(func(at, rt string, exp int64) {
            // Persist refreshed token — needs access to App/config
            // Solution: store the callback at engine init time
            if p.onTokenRefresh != nil {
                p.onTokenRefresh(at, rt, exp)
            }
        }),
        copilotapi.WithVision(hasVision),
    )
}

func (p *CopilotProvider) ListModels(ctx context.Context) ([]engine.Model, error) {
    // Priority 1: config["models"] (from models.dev catalog or manual)
    if p.config != nil {
        if raw, ok := p.config["models"]; ok {
            if entries, ok := raw.([]config.ModelEntry); ok && len(entries) > 0 {
                // return entries as engine.Model slice
            }
        }
    }
    // Priority 2: empty → return nil (frontend will show "no models")
    return nil, nil
}
```

**Token 刷新回调链路**：

引擎本身不持有 config 写入能力。回调的注册在 `App.SaveProvider` 初始化 engine 时注入：

```go
// app.go SaveProvider 中（或 initProvider）
if eng, ok := eng.(*copilot.CopilotProvider); ok {
    eng.SetOnTokenRefresh(func(at, rt string, exp int64) {
        a.updateCopilotToken(req.ID, at, rt, exp)
    })
}
```

### 5.6 `internal/config/config.go` — ProviderConfig 扩展

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

向后兼容：新字段使用 `omitempty`，旧 config 不受影响。

### 5.7 `internal/bootstrap/provider.go` — initCfg 扩展

```go
initCfg := map[string]any{
    "base_url":         providerCfg.BaseURL,
    "api_key":          providerCfg.APIKey,
    "models":           providerCfg.Models,
    "refresh_token":    providerCfg.RefreshToken,
    "token_expires_at": providerCfg.TokenExpiresAt,
}
```

### 5.8 `internal/api/types.go` — 类型变更

```go
// AvailableProviderInfo — 新增 Env 字段
type AvailableProviderInfo struct {
    ID          string               `json:"id"`
    DisplayName string               `json:"display_name"`
    Npm         string               `json:"npm"`
    BaseURL     string               `json:"base_url"`
    Env         []string             `json:"env,omitempty"`  // 新增
    Models      []AvailableModelInfo `json:"models"`
}

// ProviderInfo — 新增字段（仅 Copilot 相关 provider 有值）
type ProviderInfo struct {
    ID             string           `json:"id"`
    DisplayName    string           `json:"display_name"`
    BaseURL        string           `json:"base_url"`
    APIKey         string           `json:"api_key"`
    WireAPI        string           `json:"wire_api,omitempty"`
    Models         []ModelEntryJSON `json:"models"`
    RefreshToken   string           `json:"refresh_token,omitempty"`    // 新增
    TokenExpiresAt int64            `json:"token_expires_at,omitempty"` // 新增
}

// CopilotLoginInfo — Device Flow 第一步返回给前端
type CopilotLoginInfo struct {
    DeviceCode      string `json:"device_code"`
    UserCode        string `json:"user_code"`
    VerificationURI string `json:"verification_uri"`
    ExpiresIn       int    `json:"expires_in"`
    Interval        int    `json:"interval"`
}

// CopilotTokenResult — Device Flow 轮询结果
type CopilotTokenResult struct {
    AccessToken  string `json:"access_token,omitempty"`
    RefreshToken string `json:"refresh_token,omitempty"`
    ExpiresIn    int    `json:"expires_in,omitempty"`
    Status       string `json:"status"`           // "success" | "pending" | "error"
    Error        string `json:"error,omitempty"`
}
```

### 5.9 `internal/api/app.go` — 新增/修改方法

**新增方法**：

```go
// StartCopilotLogin initiates GitHub Device Flow authentication.
func (a *App) StartCopilotLogin() (*CopilotLoginInfo, error) {
    resp, err := copilotapi.RequestDeviceCode(a.ctx)
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
    resp, err := copilotapi.PollForToken(a.ctx, deviceCode)
    if err != nil {
        switch {
        case errors.Is(err, copilotapi.ErrAuthorizationPending):
            return &CopilotTokenResult{Status: "pending"}, nil
        case errors.Is(err, copilotapi.ErrSlowDown):
            return &CopilotTokenResult{Status: "pending", Error: "slow_down"}, nil
        case errors.Is(err, copilotapi.ErrExpiredToken):
            return &CopilotTokenResult{Status: "error", Error: "Device code expired"}, nil
        case errors.Is(err, copilotapi.ErrAccessDenied):
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

// updateCopilotToken persists refreshed tokens to config (called by engine callback).
func (a *App) updateCopilotToken(providerID, accessToken, refreshToken string, expiresAt int64) {
    a.mu.Lock()
    defer a.mu.Unlock()
    if pc, ok := a.cfg.ModelProviders[providerID]; ok {
        pc.APIKey = accessToken
        if refreshToken != "" {
            pc.RefreshToken = refreshToken
        }
        pc.TokenExpiresAt = expiresAt
        a.cfg.ModelProviders[providerID] = pc
        _ = config.WriteGlobal(a.home, a.cfg)
    }
}
```

**修改 GetAvailableProviders** — 增加 env 传递：

```go
result = append(result, AvailableProviderInfo{
    ID:          providerID,
    DisplayName: displayName,
    Npm:         p.Npm,
    BaseURL:     p.API,
    Env:         p.Env,     // 新增
    Models:      models,
})
```

**修改 SaveProvider** — 增加新字段：

```go
var req struct {
    ID             string               `json:"id"`
    Name           string               `json:"name"`
    BaseURL        string               `json:"base_url"`
    APIKey         string               `json:"api_key"`
    WireAPI        string               `json:"wire_api"`
    Models         []config2.ModelEntry `json:"models"`
    RefreshToken   string               `json:"refresh_token"`     // 新增
    TokenExpiresAt int64                `json:"token_expires_at"` // 新增
}

pc := config2.ProviderConfig{
    ...
    RefreshToken:   req.RefreshToken,
    TokenExpiresAt: req.TokenExpiresAt,
}
```

**修改 initProvider（SaveProvider 中 engine 初始化部分）** — 注入 token 刷新回调：

```go
// 在 SaveProvider 的 engine init 之后，添加:
if cp, ok := providerEng.(*copilot.CopilotProvider); ok {
    cp.SetOnTokenRefresh(func(at, rt string, exp int64) {
        a.updateCopilotToken(req.ID, at, rt, exp)
    })
}
```

### 5.10 `main.go` — 注册

```go
import (
    ...
    _ "monika/internal/engines/provider/copilot"  // 新增
    _ "monika/internal/engines/provider/openai"
    ...
)
```

### 5.11 前端 `store/index.ts`

```ts
// 新增类型
interface CopilotLoginInfo {
    device_code: string
    user_code: string
    verification_uri: string
    expires_in: number
    interval: number
}

interface CopilotTokenResult {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    status: 'success' | 'pending' | 'error'
    error?: string
}

// AvailableProviderInfo 增加可选 env 字段
interface AvailableProviderInfo {
    id: string
    display_name: string
    npm: string
    base_url: string
    env?: string[]           // 新增
    models: AvailableModelInfo[]
}

// ProviderFull 增加可选字段
interface ProviderFull {
    // ... existing fields ...
    refresh_token?: string    // 新增
    token_expires_at?: number // 新增
}

// 新增 actions
startCopilotLogin: async (): Promise<CopilotLoginInfo> => {
    return await Call.ByName('monika/internal/api.App.StartCopilotLogin')
},

pollCopilotLogin: async (deviceCode: string): Promise<CopilotTokenResult> => {
    return await Call.ByName('monika/internal/api.App.PollCopilotLogin', deviceCode)
},
```

### 5.12 前端 `CopilotLogin.tsx`

```tsx
import { useState, useRef } from 'react'
import { useStore } from '../../store'

type LoginState = 'idle' | 'waiting' | 'success' | 'error'

interface Props {
    onToken: (accessToken: string, refreshToken: string, expiresIn: number) => void
    onError: (msg: string) => void
    // 编辑模式下，如果已有 token 则显示已登录状态
    existingToken?: string
}

export function CopilotLoginSection({ onToken, onError, existingToken }: Props) {
    const [state, setState] = useState<LoginState>(existingToken ? 'success' : 'idle')
    const [loginInfo, setLoginInfo] = useState<CopilotLoginInfo | null>(null)
    const [errorMsg, setErrorMsg] = useState('')
    const timerRef = useRef<ReturnType<typeof setInterval>>()
    const startCopilotLogin = useStore(s => s.startCopilotLogin)
    const pollCopilotLogin = useStore(s => s.pollCopilotLogin)

    async function handleLogin() {
        setState('waiting')
        setErrorMsg('')
        try {
            const info = await startCopilotLogin()
            setLoginInfo(info)
            // Auto-open browser
            window.open(info.verification_uri, '_blank')
            // Start polling
            let interval = info.interval
            timerRef.current = setInterval(async () => {
                const result = await pollCopilotLogin(info.device_code)
                if (result.status === 'success') {
                    clearInterval(timerRef.current!)
                    setState('success')
                    onToken(result.access_token!, result.refresh_token!, result.expires_in!)
                } else if (result.status === 'error') {
                    clearInterval(timerRef.current!)
                    setState('error')
                    setErrorMsg(result.error || 'Unknown error')
                    onError(result.error || 'Unknown error')
                } else if (result.error === 'slow_down') {
                    // Increase interval by 5s
                    clearInterval(timerRef.current!)
                    interval += 5
                    timerRef.current = setInterval(pollFn, (interval + 1) * 1000)
                }
                // pending → continue polling
            }, (interval + 1) * 1000)
        } catch (e) {
            setState('error')
            setErrorMsg(String(e))
        }
    }

    // Cleanup on unmount
    useEffect(() => () => clearInterval(timerRef.current!), [])

    // UI rendering:
    // idle    → "Login with GitHub" button
    // waiting → user_code display + verification_uri + spinner + "Waiting for authorization..."
    // success → "✓ Logged in" + option to re-login
    // error   → error message + retry button
}
```

### 5.13 前端 `ModelsTab.tsx` 改造

**新增状态**：

```tsx
const [authMode, setAuthMode] = useState<'api_key' | 'oauth'>('api_key')
const [copilotToken, setCopilotToken] = useState<{
    accessToken: string
    refreshToken: string
    expiresIn: number
} | null>(null)
```

**handleProviderSelect 改造**：

```tsx
const handleProviderSelect = (catalog: AvailableProviderInfo) => {
    setSelectedAvailableProvider(catalog.id)
    setProvId(catalog.id)
    setName(catalog.display_name || ...)
    setBaseURL(catalog.base_url || '')

    const isOAuth = catalog.env?.includes('GITHUB_TOKEN')
    if (isOAuth) {
        setAuthMode('oauth')
        setWireAPI('copilot')
        setApiKey('') // Clear any previous key
        setCopilotToken(null)
    } else {
        setAuthMode('api_key')
        setWireAPI('openai')
    }
}
```

**openAdd 改造**：

```tsx
const openAdd = () => {
    ...
    setAuthMode('api_key') // default
    setCopilotToken(null)
}
```

**openEdit 改造**：

```tsx
const openEdit = (p) => {
    ...
    setAuthMode(p.wire_api === 'copilot' ? 'oauth' : 'api_key')
    setCopilotToken(null) // token already in apiKey state
}
```

**Modal body — 条件渲染认证区域**（替换现有的 API Key input）：

```tsx
{authMode === 'api_key' ? (
    <div>
        <label className={labelCls}>API Key</label>
        <input type="password" className={inputCls} value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="Enter your API key" autoFocus={!isAdding} />
    </div>
) : (
    <div>
        <label className={labelCls}>Authentication</label>
        <CopilotLoginSection
            existingToken={editingId ? apiKey : undefined}
            onToken={(at, rt, exp) => {
                setApiKey(at)
                setCopilotToken({
                    accessToken: at,
                    refreshToken: rt,
                    expiresIn: exp,
                })
            }}
            onError={setError}
        />
    </div>
)}
```

**handleSave 改造**：

```tsx
const handleSave = useCallback(async () => {
    if (!provId.trim() || !name.trim()) { setError('ID and Name are required'); return }
    if (isAdding) {
        if (authMode === 'api_key' && !apiKey.trim()) {
            setError('API Key is required when adding a provider'); return
        }
        if (authMode === 'oauth' && !apiKey.trim()) {
            setError('Please login with GitHub first'); return
        }
    }

    // Calculate token expiry timestamp
    const tokenExpiresAt = copilotToken
        ? Math.floor(Date.now() / 1000) + copilotToken.expiresIn
        : 0

    await saveProvider({
        id: provId.trim(),
        display_name: name.trim(),
        name: name.trim(),
        base_url: baseURL.trim(),
        api_key: apiKey.trim(),
        wire_api: wireAPI.trim(),
        refresh_token: copilotToken?.refreshToken || '',
        token_expires_at: tokenExpiresAt,
        models,
    })
    ...
}, [/* deps including authMode, copilotToken */])
```

**Provider 列表卡片适配**：

```tsx
// Key/Token label
<span>{p.wire_api === 'copilot' ? 'Token' : 'Key'}: {maskKey(p.api_key)}</span>
```

---

## 六、Token 刷新机制详细设计

### 6.1 并发保护

```go
// pkg/copilot/streaming.go
var refreshMu sync.Mutex

func refreshTokenIfNeeded(refreshToken string) (*TokenResponse, error) {
    refreshMu.Lock()
    defer refreshMu.Unlock()
    // 即使多个请求同时 401，refresh 只执行一次
    return RefreshToken(context.Background(), refreshToken)
}
```

### 6.2 刷新链路

```
pkg/copilot.StreamChat (401)
  → refreshTokenIfNeeded(refreshToken)
    → RefreshToken() → GitHub API
  → onRefresh(newAT, newRT, newExpiresAt)
    → CopilotProvider.onTokenRefresh()
      → App.updateCopilotToken(providerID, ...)
        → 更新 a.cfg.ModelProviders[id]
        → config.WriteGlobal()
  → 用新 token 重试请求
```

### 6.3 边界情况

| 场景 | 行为 |
|------|------|
| refresh_token 为空 | 不刷新，直接返回 401 错误 |
| refresh 请求也返回 401 | 返回错误 "token expired, please re-login" |
| refresh 请求网络错误 | 返回错误（不重试 refresh 本身） |
| 多请求并发 401 | `sync.Mutex` 保证只刷新一次 |

---

## 七、SSE 解析复用方案

### 7.1 提取的函数

从 `pkg/openai/streaming.go` 提取到 `pkg/openai/sse.go`：

| 原函数（私有） | 新函数（导出） |
|---|---|
| `parseSSEStream` | `ParseSSEStream` |
| `parseSSEStreamInGoroutine` | `ParseSSEStreamInGoroutine` |
| `sendError` | `SendError` |
| `httpClientFor` | `HTTPClientFor` |
| `retryableHTTPError` | `RetryableHTTPError` |

同时导出类型 `ChatChunk`、`ToolCallChunk` 等供 `pkg/copilot` 复用（如需）。

### 7.2 影响范围

修改 `pkg/openai/streaming.go` 中的内部调用从 `parseSSEStream` → `ParseSSEStream` 等。**不影响外部行为**——pkg/openai 的 StreamChat 签名和返回值不变。

---

## 八、风险与边界情况

| 场景 | 处理 |
|------|------|
| Device Code 过期（15 分钟未授权） | 前端轮询返回 `status: "error"` → 提示重新登录 |
| 用户拒绝授权 | `error: "access_denied"` → 前端显示 |
| slow_down | 增加 5s 轮询间隔 |
| Token 过期 + refresh 成功 | 透明刷新，用户无感知 |
| Token 过期 + refresh 失败 | 返回 401 错误 → 前端提示重新登录 |
| 网络代理 | Go `http.Client` 使用系统代理设置 |
| 并发刷新 | `sync.Mutex` 保护 |
| Editor-Version 格式 | `monika/<version>`，version 来自 `internal/version` |
| Copilot-Vision-Request | 仅当 messages 中有 image attachment 时注入 |
| 现有 `github-models` provider | 不受影响——使用 `wire_api: openai`，手动填 GITHUB_TOKEN |
| 旧 config 无新字段 | `omitempty` 向后兼容 |
| Copilot subscription 未订阅 | API 返回 403 → 前端显示错误信息 |
| 用户在多设备使用 | 同一 OAuth App 可多设备登录，各自独立 token |
| `wails3 generate bindings` | 新增 Go 类型后需要重新生成 TS bindings |

---

## 九、实现顺序

### Phase 1: Go 后端

| 步骤 | 文件 | 说明 |
|------|------|------|
| ① | `pkg/openai/sse.go` | 提取公共 SSE 函数并导出 |
| ② | `pkg/openai/streaming.go` | 改为调用导出函数 |
| ③ | `pkg/copilot/types.go` | 数据类型 |
| ④ | `pkg/copilot/auth.go` | Device Flow + Refresh + FetchModels |
| ⑤ | `pkg/copilot/streaming.go` | Streaming client |
| ⑥ | `internal/config/config.go` | ProviderConfig 扩展 |
| ⑦ | `internal/engines/provider/copilot/copilot.go` | 引擎 |
| ⑧ | `internal/bootstrap/provider.go` | initCfg 扩展 |
| ⑨ | `internal/api/types.go` | 类型 |
| ⑩ | `internal/api/app.go` | 3 个新方法 + 修改 3 个现有方法 |
| ⑪ | `main.go` | blank import |
| ⑫ | `go build .` | 编译验证 |

### Phase 2: Bindings + 前端

| 步骤 | 文件 | 说明 |
|------|------|------|
| ⑬ | `wails3 generate bindings -ts` | 重新生成 TS bindings |
| ⑭ | `frontend/src/store/index.ts` | 类型 + 状态 + actions |
| ⑮ | `frontend/src/components/Settings/CopilotLogin.tsx` | 登录组件 |
| ⑯ | `frontend/src/components/Settings/ModelsTab.tsx` | 条件渲染 + 列表适配 |
| ⑰ | `cd frontend && npm run build` | 前端编译 |

### Phase 3: 验证

| 步骤 | 说明 |
|------|------|
| ⑱ | `go vet ./...` |
| ⑲ | 端到端：启动应用 → Settings → Add → 选 GitHub Copilot → Device Flow 登录 → 聊天 |
| ⑳ | 验证 Token 刷新：手动让 token 过期（修改 config 中的 expires_at）→ 发送消息 → 观察自动刷新 |

---

## 十、最终效果

### 10.1 用户视角

1. 打开 Settings → Providers → Add
2. 在 catalog 下拉中选择 "GitHub Copilot"
3. 表单自动切换到 OAuth 模式，显示 "Login with GitHub" 按钮
4. 点击 → 浏览器打开 GitHub 授权页，显示 user_code
5. 在 GitHub 上授权 → 前端自动检测成功
6. 点击 Save Provider → Copilot 出现在 provider 列表
7. 选择模型 → 开始聊天

### 10.2 Config 结果

```json
{
  "model_providers": {
    "github-copilot": {
      "name": "GitHub Copilot",
      "base_url": "https://api.githubcopilot.com",
      "api_key": "ghu_xxxxxxxx",
      "refresh_token": "ghr_xxxxxxxx",
      "token_expires_at": 1720451523,
      "wire_api": "copilot",
      "models": [
        { "id": "gpt-4o", "name": "GPT-4o", "context_limit": 128000, "enabled": true },
        { "id": "claude-sonnet-4.5", "name": "Claude Sonnet 4.5", "context_limit": 200000, "enabled": true }
      ]
    }
  }
}
```

### 10.3 Token 生命周期

```
登录成功 → access_token (8h) + refresh_token (184d)
     ↓ 8h 后
聊天时 401 → 自动用 refresh_token 换新 access_token (8h) + 新 refresh_token
     ↓ 每 8h 刷新一次
     ↓ ~184d 后
refresh_token 也过期 → 需要重新 Device Flow 登录
```

---

## 附录 A：models.dev catalog 中的 ProviderEntry 结构

```go
// pkg/modelsdev/modelsdev.go
type ProviderEntry struct {
    ID     string               `json:"id"`
    Name   string               `json:"name"`
    Npm    string               `json:"npm"`
    API    string               `json:"api"`
    Env    []string             `json:"env"`     // ← 关键：用于区分认证方式
    Models map[string]ModelData `json:"models"`
}
```

> **注意**：当前 `ProviderEntry` 已有 `Env` 字段但 `GetAvailableProviders` 未传递到前端。需要补上。

## 附录 B：Copilot API 请求头参考

| Header | 值 | 必填 | 说明 |
|--------|-----|------|------|
| `Authorization` | `Bearer <github_oauth_token>` | 是 | GitHub OAuth access_token |
| `Content-Type` | `application/json` | 是 | |
| `Editor-Version` | `monika/<version>` | 是 | 标识客户端 |
| `Copilot-Vision-Request` | `true` | 否 | 仅有图片时 |

## 附录 C：GitHub Device Flow 错误码

| error | 含义 | 处理 |
|-------|------|------|
| `authorization_pending` | 用户还没授权 | 继续轮询 |
| `slow_down` | 轮询太快 | 增加 5s 间隔 |
| `expired_token` | device_code 过期（15分钟） | 重新发起 |
| `access_denied` | 用户拒绝 | 停止，提示 |
| `incorrect_device_code` | device_code 错误 | 不应发生 |
| `unsupported_grant_type` | grant_type 错误 | 不应发生 |

---

## 附录 D：审查发现的遗漏（2025-07-08 补充）

以下问题在初版方案中未覆盖，实现时必须处理：

### D.1 代理支持（关键）

**问题**：`pkg/openai/streaming.go` 中自定义 `&http.Transport{MaxIdleConnsPerHost: 2}` **不继承系统代理**。在 Windows 上 Go 的 `http.Client` 默认不检测系统代理设置（只读 `HTTP_PROXY`/`HTTPS_PROXY` 环境变量）。中国用户访问 `github.com` 和 `api.githubcopilot.com` 需要 VPN/代理，否则 Device Flow 和聊天请求都会超时。

**影响范围**：
- `pkg/copilot/auth.go` — Device Flow 请求 + Token Refresh
- `pkg/copilot/streaming.go` — Copilot API 聊天请求

**修复方案**：

`pkg/copilot/` 中的 HTTP client 创建使用 `http.ProxyFromEnvironment`：

```go
transport := &http.Transport{
    MaxIdleConnsPerHost: 2,
    Proxy:               http.ProxyFromEnvironment,
}
```

仅 `pkg/copilot/` 中加 Proxy，不影响现有 provider。

### D.2 Bootstrap 初始化时未设置 Token 刷新回调

**问题**：方案 5.9 中 `SetOnTokenRefresh` 只在 `SaveProvider` 时注入。但应用启动时 provider 在 `bootstrap.InitProvider` 中创建，这些实例**没有 token 刷新回调**，导致启动后首次 token 过期时刷新的 token 不会被持久化。

**修复方案**：

在 App 初始化 providers 之后，遍历 providers 并注入回调：

```go
for id, eng := range a.providers {
    if cp, ok := eng.(*copilot.CopilotProvider); ok {
        providerID := id
        cp.SetOnTokenRefresh(func(at, rt string, exp int64) {
            a.updateCopilotToken(providerID, at, rt, exp)
        })
    }
}
```

需找到 App 拿到 providers 的具体位置（`SetProviders` 或 `main.go` 中赋值时机）并在此注入。

### D.3 `detectVision` 函数未定义

**问题**：方案 5.5 中 `CopilotProvider.StreamChat` 调用 `detectVision(req.Messages)` 判断是否有图片，但该函数未定义。

**修复方案**：

```go
func detectVision(messages []engine.ChatMessage) bool {
    for _, msg := range messages {
        for _, part := range msg.Parts {
            if part.Type == "image_url" || part.Type == "image" {
                return true
            }
        }
    }
    return false
}
```

需确认 `engine.ChatMessage.Parts` 的具体结构。

### D.4 前端不应接收 refresh_token

**问题**：方案 5.8 中 `ProviderInfo` 新增了 `RefreshToken` 字段并返回给前端。refresh_token 是敏感凭据，不应暴露。

**修复方案**：

`ProviderInfo` 只返回 `TokenExpiresAt`（用于 UI 展示），**不返回** `RefreshToken`：

```go
type ProviderInfo struct {
    // ... existing fields ...
    TokenExpiresAt int64 `json:"token_expires_at,omitempty"`
    // RefreshToken 不在此结构中 — 仅在 SaveProvider 接收，GetProviders 不返回
}
```

### D.5 包名冲突

**问题**：`internal/engines/provider/copilot` 和 `pkg/copilot` 包名均为 `copilot`。

**修复方案**：引擎文件中 import 时加别名：

```go
package copilot

import (
    copilotapi "monika/pkg/copilot"
)
```

### D.6 stream_options 流式验证待定

**问题**：方案说 Copilot "始终发送 stream_options.include_usage"，但仅验证了非流式请求。

**建议**：实现后进行一次流式聊天测试（`stream: true` + `stream_options.include_usage: true`），确认 Copilot 返回 usage chunk。

### D.7 Copilot API `padding` 字段

测试中发现非流式响应中有 `"padding"` 字段。`pkg/openai.ParseSSEStream` 只解析已知字段，padding 不在结构体中会被自动忽略。**不影响**。
