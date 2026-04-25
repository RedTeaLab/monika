# Monika 引擎插件架构重构 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将单模块 go-plugin 架构重构为 go.work 多模块 + `database/sql` 风格引擎注册架构。

**Architecture:** 三层结构：`engine/`（纯接口+注册表）、`core/`（编排+工具+配置+CLI）、`engines/*`（引擎实现）。使用 `init()` 自注册，废弃 go-plugin/gRPC/protobuf。

**Tech Stack:** Go 1.25.5, cobra, yaml.v3, 标准库 HTTP client

**Design doc:** `docs/plans/2026-04-26-engine-plugin-architecture-design.md`

---

### Task 1: 创建 engine 模块（接口 + 注册表）

**Files:**
- Create: `engine/go.mod`
- Create: `engine/engine.go`
- Create: `engine/provider.go`
- Create: `engine/skill.go`
- Create: `engine/mcp.go`
- Create: `engine/registry.go`
- Create: `engine/registry_test.go`
- Create: `engine/engine_test.go`

**Step 1: 创建 engine/go.mod**

```
module monika/engine

go 1.25.5
```

零外部依赖。

**Step 2: 创建 engine/engine.go**

```go
package engine

import "context"

type Engine interface {
	ID() string
	Init(ctx context.Context, cfg map[string]any) error
	Capabilities() []Capability
	Shutdown(ctx context.Context) error
}

type Capability string

const (
	CapProvider Capability = "provider"
	CapSkill    Capability = "skill"
	CapMCP      Capability = "mcp"
)
```

**Step 3: 创建 engine/provider.go**

```go
package engine

import "context"

type ChatRequest struct {
	Provider string
	Model    string
	Messages []ChatMessage
}

type ChatMessage struct {
	Role    string
	Content string
}

type ChatEvent struct {
	Kind     EventKind
	Text     string
	ToolCall *ToolCall
	Usage    Usage
	Error    ProviderError
}

type EventKind int

const (
	EventContentDelta EventKind = iota
	EventToolCallStart
	EventToolCallDelta
	EventToolCallEnd
	EventUsage
	EventError
	EventMessageEnd
)

type ToolCall struct {
	ID        string
	Name      string
	Arguments string
}

type Usage struct {
	InputTokens  int64
	OutputTokens int64
	TotalTokens  int64
}

type ProviderError struct {
	Code    string
	Message string
}

type Model struct {
	ID          string
	DisplayName string
}

type ProviderEngine interface {
	Engine
	StreamChat(ctx context.Context, req ChatRequest) ([]ChatEvent, error)
	ListModels(ctx context.Context) ([]Model, error)
}
```

**Step 4: 创建 engine/skill.go**

```go
package engine

import "context"

type SkillMeta struct {
	Name        string
	Description string
	Path        string
}

type SkillContent struct {
	Meta         SkillMeta
	Instructions string
}

type SkillEngine interface {
	Engine
	Discover(ctx context.Context, paths []string) ([]SkillMeta, error)
	Activate(ctx context.Context, skill SkillMeta) (SkillContent, error)
	Deactivate(ctx context.Context, skill SkillMeta) error
}
```

**Step 5: 创建 engine/mcp.go**

```go
package engine

import (
	"context"
	"encoding/json"
)

type MCPServerConfig struct {
	ID      string
	Command string
	Args    []string
	Env     map[string]string
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
}
```

**Step 6: 创建 engine/registry.go**

```go
package engine

import (
	"fmt"
	"sync"
)

var (
	mu      sync.RWMutex
	engines = map[string]Engine{}
)

func Register(e Engine) {
	mu.Lock()
	defer mu.Unlock()
	id := e.ID()
	if _, exists := engines[id]; exists {
		panic(fmt.Sprintf("engine: Register called twice for %q", id))
	}
	engines[id] = e
}

func EngineByID(id string) (Engine, error) {
	mu.RLock()
	defer mu.RUnlock()
	e, ok := engines[id]
	if !ok {
		return nil, fmt.Errorf("engine %q not registered", id)
	}
	return e, nil
}

func Engines() []Engine {
	mu.RLock()
	defer mu.RUnlock()
	out := make([]Engine, 0, len(engines))
	for _, e := range engines {
		out = append(out, e)
	}
	return out
}

func Reset() {
	mu.Lock()
	defer mu.Unlock()
	engines = map[string]Engine{}
}
```

`Reset()` 仅用于测试。

**Step 7: 创建 engine/engine_test.go**

测试 Engine 接口的 `ID()`、`Capabilities()` 方法。

```go
package engine

import "testing"

func TestRegisterAndResolve(t *testing.T) {
	Reset()
	e := &stubEngine{id: "test"}
	Register(e)

	got, err := EngineByID("test")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID() != "test" {
		t.Fatalf("expected test, got %s", got.ID())
	}
}

func TestRegisterDuplicatePanics(t *testing.T) {
	Reset()
	e := &stubEngine{id: "dup"}
	Register(e)
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected panic on duplicate register")
		}
	}()
	Register(e)
}

func TestResolveNotFound(t *testing.T) {
	Reset()
	_, err := EngineByID("nonexistent")
	if err == nil {
		t.Fatal("expected error for missing engine")
	}
}

func TestEnginesList(t *testing.T) {
	Reset()
	Register(&stubEngine{id: "a"})
	Register(&stubEngine{id: "b"})
	all := Engines()
	if len(all) != 2 {
		t.Fatalf("expected 2 engines, got %d", len(all))
	}
}

type stubEngine struct {
	id string
}

func (s *stubEngine) ID() string                                         { return s.id }
func (s *stubEngine) Init(_ context.Context, _ map[string]any) error     { return nil }
func (s *stubEngine) Capabilities() []Capability                         { return nil }
func (s *stubEngine) Shutdown(_ context.Context) error                   { return nil }
```

**Step 8: 运行测试**

Run: `go test ./engine/...`
Expected: PASS

**Step 9: Commit**

```bash
git add engine/
git commit -m "feat: add engine module with interfaces and registry"
```

---

### Task 2: 创建 core 模块（迁移 agent + config）

**Files:**
- Create: `core/go.mod`
- Create: `core/internal/agent/agent_loop.go`（从 `internal/agent/` 迁移）
- Create: `core/internal/agent/agent_loop_test.go`
- Create: `core/internal/config/config.go`（从 `internal/config/` 迁移并扩展）
- Create: `core/internal/config/config_test.go`
- Create: `core/cmd/monika/main.go`
- Create: `core/cmd/monika/root.go`

**Step 1: 创建 core/go.mod**

```
module monika

go 1.25.5

require (
	github.com/spf13/cobra v1.10.2
	gopkg.in/yaml.v3 v3.0.1
	monika/engine v0.0.0
)
```

替换 `monika/engine v0.0.0` 由 go.work 解析。

**Step 2: 迁移 config.go 到 core/internal/config/config.go**

基于现有 `internal/config/config.go`，扩展配置结构：

```go
package config

type Config struct {
	ModelProvider string                              `yaml:"model_provider"`
	Model         string                              `yaml:"model"`
	ModelProviders map[string]ProviderConfig          `yaml:"model_providers"`
	Skill         SkillConfig                         `yaml:"skill"`
	MCP           MCPConfig                           `yaml:"mcp"`
	Tools         ToolsConfig                         `yaml:"tools"`
}

type ProviderConfig struct {
	Name    string         `yaml:"name"`
	BaseURL string         `yaml:"base_url"`
	APIKey  string         `yaml:"api_key"`
	WireAPI string         `yaml:"wire_api"` // chat | responses | messages
}

type SkillConfig struct {
	Paths []string `yaml:"paths"`
}

type MCPConfig struct {
	Servers []MCPServerConfig `yaml:"servers"`
}

type MCPServerConfig struct {
	ID      string            `yaml:"id"`
	Command string            `yaml:"command"`
	Args    []string          `yaml:"args"`
	Env     map[string]string `yaml:"env"`
}

type ToolsConfig struct {
	Confirm  []string `yaml:"confirm"`
	Disallow []string `yaml:"disallow"`
}
```

保留现有的 `Load()`、`mergeFile()`、`merge()`、`mergeMap()` 逻辑，更新 `Config` 字段和 `merge()` 函数。

**Step 3: 迁移 config_test.go 并扩展**

添加新配置字段的合并测试。

**Step 4: 迁移 agent 到 core/internal/agent/agent_loop.go**

从 `internal/agent/agent.go` 和 `internal/agent/stream.go` 迁移。保留 `Agent` 接口、`ProviderClient`、`ChatEvent`、`AggregateEvents` 等类型。当前阶段保持现有接口不变，后续 Task 中逐步替换为使用 `engine.ProviderEngine`。

**Step 5: 创建 core/cmd/monika/main.go**

```go
package main

func main() {
	Execute()
}
```

**Step 6: 创建 core/cmd/monika/root.go**

基于现有 `cmd/monika/root.go`，去掉 `--registry` flag，改为 `--config` flag。暂不加 provider 子命令。

**Step 7: 运行测试**

Run: `go test ./core/...`
Expected: PASS

**Step 8: Commit**

```bash
git add core/
git commit -m "feat: create core module with migrated agent and config"
```

---

### Task 3: 创建 engines/provider 模块（OpenAI 兼容后端）

**Files:**
- Create: `engines/provider/go.mod`
- Create: `engines/provider/provider.go`
- Create: `engines/provider/provider_test.go`

**Step 1: 创建 engines/provider/go.mod**

```
module monika/engines/provider

go 1.25.5

require monika/engine v0.0.0
```

**Step 2: 创建 engines/provider/provider.go**

```go
package provider

import (
	"context"
	"fmt"
	"sync"

	"monika/engine"
)

func init() {
	engine.Register(&ProviderEngine{})
}

type ProviderEngine struct {
	mu       sync.RWMutex
	backends map[string]Backend
}

type Backend struct {
	Name    string
	BaseURL string
	APIKey  string
	WireAPI string
}

func (e *ProviderEngine) ID() string { return "provider" }

func (e *ProviderEngine) Capabilities() []engine.Capability {
	return []engine.Capability{engine.CapProvider}
}

func (e *ProviderEngine) Init(_ context.Context, cfg map[string]any) error {
	e.backends = make(map[string]Backend)
	providers, ok := cfg["model_providers"]
	if !ok {
		return nil
	}
	// 解析 model_providers map，初始化各个 backend
	// 后续 Task 完善具体实现
	return nil
}

func (e *ProviderEngine) Shutdown(_ context.Context) error {
	return nil
}

func (e *ProviderEngine) StreamChat(_ context.Context, req engine.ChatRequest) ([]engine.ChatEvent, error) {
	return nil, fmt.Errorf("not implemented")
}

func (e *ProviderEngine) ListModels(_ context.Context) ([]engine.Model, error) {
	return nil, fmt.Errorf("not implemented")
}
```

**Step 3: 创建 engines/provider/provider_test.go**

测试 init() 自注册、ID()、Capabilities()。

**Step 4: 运行测试**

Run: `go test ./engines/provider/...`
Expected: PASS

**Step 5: Commit**

```bash
git add engines/provider/
git commit -m "feat: add provider engine module with init registration"
```

---

### Task 4: 创建 engines/skill 模块

**Files:**
- Create: `engines/skill/go.mod`
- Create: `engines/skill/skill.go`
- Create: `engines/skill/skill_test.go`

**Step 1: 创建 engines/skill/go.mod**

```
module monika/engines/skill

go 1.25.5

require monika/engine v0.0.0
```

**Step 2: 创建 engines/skill/skill.go**

实现 `engine.SkillEngine`：
- `Discover()`: 扫描给定路径列表，查找包含 `SKILL.md` 的子目录，解析 YAML frontmatter 提取 name + description
- `Activate()`: 读取完整 SKILL.md 内容
- `Deactivate()`: 当前为 no-op

遵循 [Agent Skills 标准](https://agentskills.io/specification) 格式。

**Step 3: 创建测试**

使用 `t.TempDir()` 创建 SKILL.md 文件，测试 Discover 和 Activate。

**Step 4: 运行测试**

Run: `go test ./engines/skill/...`
Expected: PASS

**Step 5: Commit**

```bash
git add engines/skill/
git commit -m "feat: add skill engine module with Agent Skills standard support"
```

---

### Task 5: 创建 engines/mcp 模块

**Files:**
- Create: `engines/mcp/go.mod`
- Create: `engines/mcp/mcp.go`
- Create: `engines/mcp/mcp_test.go`

**Step 1: 创建 engines/mcp/go.mod**

```
module monika/engines/mcp

go 1.25.5

require monika/engine v0.0.0
```

**Step 2: 创建 engines/mcp/mcp.go**

实现 `engine.MCPEngine`：
- `ConnectServer()`: 启动 MCP server 子进程（exec.Command），通过 stdin/stdout 发送 JSON-RPC
- `DisconnectServer()`: kill 子进程
- `MCPServerConnection` 实现 `ListTools` 和 `CallTool`

当前阶段实现 JSON-RPC over stdio 基础框架。

**Step 3: 创建测试**

使用 `t.TempDir()` 创建一个简单的 mock server 脚本，测试 Connect/Disconnect/ListTools。

**Step 4: 运行测试**

Run: `go test ./engines/mcp/...`
Expected: PASS

**Step 5: Commit**

```bash
git add engines/mcp/
git commit -m "feat: add MCP engine module with stdio transport"
```

---

### Task 6: 创建 go.work 并连接模块

**Files:**
- Create: `go.work`
- Create: `go.work.sum`

**Step 1: 创建 go.work**

```
go 1.25.5

use (
	./core
	./engine
	./engines/mcp
	./engines/provider
	./engines/skill
)
```

**Step 2: 验证所有模块可编译**

Run: `go build ./engine/... && go build ./core/... && go build ./engines/provider/... && go build ./engines/skill/... && go build ./engines/mcp/...`
Expected: 无错误

**Step 3: 验证所有测试通过**

Run: `go test ./...`
Expected: 全部 PASS

**Step 4: Commit**

```bash
git add go.work go.work.sum
git commit -m "feat: add go.work for multi-module workspace"
```

---

### Task 7: 更新 CLI（接入引擎注册）

**Files:**
- Modify: `core/cmd/monika/main.go` — 添加 blank import 引擎
- Modify: `core/cmd/monika/root.go` — 更新配置加载逻辑

**Step 1: 更新 main.go**

```go
package main

import (
	_ "monika/engines/mcp"
	_ "monika/engines/provider"
	_ "monika/engines/skill"
)

func main() {
	Execute()
}
```

**Step 2: 更新 root.go**

加载配置，初始化引擎，打印状态。

**Step 3: 运行测试**

Run: `go test ./core/...`
Expected: PASS

**Step 4: Commit**

```bash
git add core/
git commit -m "feat: wire engine registration into CLI"
```

---

### Task 8: 清理旧代码

**Files:**
- Delete: `proto/` (整个目录)
- Delete: `gen/` (整个目录)
- Delete: `internal/` (整个目录，已迁移到 core/)
- Delete: `cmd/` (整个目录，已迁移到 core/cmd/)
- Delete: `go.mod` (顶层，由各模块 go.mod 替代)
- Delete: `go.sum` (顶层)
- Modify: `.gitignore` — 更新忽略规则

**Step 1: 删除旧文件**

```bash
git rm -r proto/ gen/ internal/ cmd/ go.mod go.sum
```

**Step 2: 更新 .gitignore**

**Step 3: 运行全量测试**

Run: `go test ./...`
Expected: 全部 PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove old go-plugin code, restructure to go.work modules"
```

---

### Task 9: 更新 AGENTS.md

**Files:**
- Modify: `AGENTS.md`

**Step 1: 重写 AGENTS.md**

更新为反映新架构：
- go.work 多模块结构
- engine/ 契约层
- core/ 编排层
- engines/* 实现层
- init() 自注册模式
- 废弃 go-plugin/gRPC/protobuf
- 更新测试命令、格式化命令

**Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md for new engine plugin architecture"
```

---

## 执行顺序和依赖

```
Task 1 (engine 模块)
  ├── Task 2 (core 模块，依赖 engine)
  ├── Task 3 (provider 引擎，依赖 engine)
  ├── Task 4 (skill 引擎，依赖 engine)
  └── Task 5 (mcp 引擎，依赖 engine)
          │
          ▼
     Task 6 (go.work 连接所有模块)
          │
          ▼
     Task 7 (CLI 接入)
          │
          ▼
     Task 8 (清理旧代码)
          │
          ▼
     Task 9 (更新文档)
```

Task 2-5 可并行执行。
