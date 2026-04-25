# Monika 引擎插件架构设计

> 日期: 2026-04-26  
> 状态: 已确认，待实施

## 设计目标

Monika 定位为乐高式编码智能体：核心提供最小编排能力，用户通过组装引擎插件按需定制功能。插件采用 `database/sql` 风格的 `init()` 自注册模式，`import` 即组装。

## 第一节：项目结构与 Go Workspace

采用单仓库多模块的 go.work 管理方式：

```
monika/                                  (git repo root)
├── go.work                              (go 1.25.5, use ./engine ./core ./engines/*)
│
├── engine/                              module: monika/engine
│   ├── go.mod                           纯接口 + 注册表，零外部依赖
│   ├── engine.go                        Engine base interface
│   ├── provider.go                      ProviderEngine interface
│   ├── skill.go                         SkillEngine interface
│   ├── mcp.go                           MCPEngine interface
│   └── registry.go                      Register[T]() / Engine[T]() / EngineByID()
│
├── core/                                module: monika
│   ├── go.mod                           require monika/engine
│   ├── internal/
│   │   ├── agent/
│   │   │   ├── agent_loop.go            消息编排、对话循环
│   │   │   └── tool_registry.go         统一工具注册表
│   │   ├── config/
│   │   │   └── config.go                分层 YAML 配置加载
│   │   └── tool/                        内置工具实现
│   │       ├── file_read.go
│   │       ├── file_write.go
│   │       ├── file_list.go
│   │       ├── glob.go
│   │       ├── grep.go
│   │       └── bash.go
│   └── cmd/
│       └── monika/
│           ├── main.go                  CLI 入口，blank import 引擎
│           └── root.go                  cobra 根命令
│
├── engines/
│   ├── provider/                        module: monika/engines/provider
│   │   ├── go.mod                       require monika/engine
│   │   ├── provider.go                  ProviderEngine 实现，多后端适配
│   │   ├── openai.go                    OpenAI 兼容后端
│   │   └── anthropic.go                 Anthropic 后端（后续）
│   ├── skill/                           module: monika/engines/skill
│   │   ├── go.mod                       require monika/engine
│   │   └── skill.go                     SkillEngine 实现，Agent Skills 兼容
│   └── mcp/                             module: monika/engines/mcp
│       ├── go.mod                       require monika/engine
│       └── mcp.go                       MCPEngine 实现，管理 stdio MCP 子进程
│
└── docs/
    └── plans/
```

**go.work 内容：**

```go
go 1.25.5

use (
    ./core
    ./engine
    ./engines/mcp
    ./engines/provider
    ./engines/skill
)
```

**模块职责：**

| 模块 | 职责 | 依赖 |
|------|------|------|
| `monika/engine` | 引擎接口契约 + 全局注册表，不包含任何实现 | 无 |
| `monika` (core) | AgentLoop、ToolRegistry、ConfigLoader、内置 tools、CLI | `monika/engine` |
| `monika/engines/provider` | 实现 `ProviderEngine`，多后端适配（OpenAI/Anthropic/Ollama） | `monika/engine` |
| `monika/engines/skill` | 实现 `SkillEngine`，Agent Skills 标准兼容 | `monika/engine` |
| `monika/engines/mcp` | 实现 `MCPEngine`，管理 MCP 子进程 | `monika/engine` |

**设计原则：**
- `engine/` 模块是契约层，不被任何模块依赖，是依赖倒置的锚点
- `core/` 依赖 `engine/` 的接口，不依赖任何引擎实现
- 引擎模块只依赖 `engine/`，不依赖 `core/`
- 用户编译自己的二进制：`import` 想要的引擎 + `go build`

---

## 第二节：引擎契约

### 基础接口

```go
package engine

// Engine — 所有引擎必须实现
type Engine interface {
    ID() string                                     // 唯一标识，如 "provider"、"skill"、"mcp"
    Init(ctx context.Context, cfg map[string]any) error  // 初始化，接收配置
    Capabilities() []Capability                     // 声明提供的能力
    Shutdown(ctx context.Context) error             // 优雅关闭
}

type Capability string

const (
    CapProvider Capability = "provider"
    CapSkill    Capability = "skill"
    CapMCP      Capability = "mcp"
)
```

### Provider 引擎

```go
type ProviderEngine interface {
    Engine
    StreamChat(ctx context.Context, req ChatRequest) ([]ChatEvent, error)
    ListModels(ctx context.Context) ([]Model, error)
}
```

### Skill 引擎

```go
type SkillEngine interface {
    Engine
    Discover(ctx context.Context, paths []string) ([]SkillMeta, error)
    Activate(ctx context.Context, skill SkillMeta) (SkillContent, error)
    Deactivate(ctx context.Context, skill SkillMeta) error
}

type SkillMeta struct {
    Name        string
    Description string
    Path        string
}

type SkillContent struct {
    Meta         SkillMeta
    Instructions string
    Scripts      map[string]string // 脚本文件名 → 内容
}
```

Skills 遵循 [Agent Skills 标准](https://agentskills.io) 格式（`SKILL.md` + YAML frontmatter），确保与社区生态互操作。

### MCP 引擎

```go
type MCPEngine interface {
    Engine
    ConnectServer(ctx context.Context, config MCPServerConfig) (MCPServerConnection, error)
    DisconnectServer(ctx context.Context, serverID string) error
}

type MCPServerConfig struct {
    ID      string
    Command string
    Args    []string
    Env     map[string]string
}

type MCPServerConnection interface {
    ListTools(ctx context.Context) ([]Tool, error)
    CallTool(ctx context.Context, name string, args json.RawMessage) (json.RawMessage, error)
}
```

### 注册与解析

```go
// 由引擎包在 init() 中调用
func Register[T Engine](e T)

// 由 Core 在运行时按需获取
func Engine[T Engine]() T                     // 按类型获取，泛型返回具体类型
func EngineByID(id string) (Engine, error)    // 按 ID 获取
func Engines() []Engine                       // 列出所有已注册引擎
```

---

## 第三节：内置工具与 Tool Registry

核心内置一组基础工具，MCP 引擎提供的外部工具注入同一注册表。Agent 不区分工具来源。

### 工具接口

```go
type Tool interface {
    Name() string
    Description() string
    InputSchema() jsonschema.Schema
    Execute(ctx context.Context, args json.RawMessage) (ExecutionResult, error)
}

type ExecutionResult struct {
    Content string
    Data    json.RawMessage
    IsError bool
}
```

### Tool Registry

```go
type ToolRegistry struct {
    tools sync.Map
}

func (r *ToolRegistry) Register(t Tool)
func (r *ToolRegistry) Get(name string) (Tool, error)
func (r *ToolRegistry) List() []Tool
func (r *ToolRegistry) Remove(name string)
```

### 内置工具清单

| 工具 | 功能 | 安全约束 |
|------|------|---------|
| `file_read` | 读取文件 | 仅限项目目录，拒绝路径穿越 |
| `file_write` | 创建/写入文件 | 仅限项目目录，需确认 |
| `file_list` | 列目录 | 仅限项目目录 |
| `glob` | 文件名匹配 | 仅限项目目录 |
| `grep` | 内容搜索 | 仅限项目目录 |
| `bash` | 执行 shell | 白名单策略，需确认 |

MCP 工具注入：`ConnectServer` → `ListTools` → 逐个 `ToolRegistry.Register()`。断开时自动 `Remove()`。

### 工具执行流程

```
Agent 收到 tool_call
        │
        ▼
ToolRegistry.Get(tool_call.Name)
        │
   ┌────┴────┐
   │ 存在     │  不存在 → 返回 error tool_result
   └────┬────┘
        │
   ┌────┴────┐
   │ 安全检查  │  不通过 → 返回 error tool_result
   └────┬────┘
        │
        ▼
  Tool.Execute(ctx, args)
        │
        ▼
  返回 tool_result → 注入上下文 → 继续循环
```

---

## 第四节：Agent Loop（消息编排引擎）

### 接口

```go
type AgentLoop struct {
    provider     engine.ProviderEngine
    tools        *ToolRegistry
    skillEng     engine.SkillEngine
    systemPrompt string
    confirmFn    func(tool Tool, args json.RawMessage) bool
}

func NewLoop(provider engine.ProviderEngine, tools *ToolRegistry, opts ...LoopOption) *AgentLoop

func (l *AgentLoop) Run(ctx context.Context, userMessage string) (*Conversation, error)

func (l *AgentLoop) Resume(ctx context.Context, conv *Conversation, userMessage string) (*Conversation, error)
```

### 对话循环流程

```
用户消息 ──→ AgentLoop.Run()
                │
                ▼
         [Skill 引擎：匹配并注入相关技能指令]
                │
                ▼
         [构造 ChatRequest: system + skills + context + messages + tools_schema]
                │
                ▼
         ProviderEngine.StreamChat()
                │
                ▼
         [检查 AssistantMessage 是否包含 tool_call]
                │
          ┌─────┴─────┐
          │ 有 tool    │  无 tool → 返回 Conversation
          └─────┬─────┘
                │
                ▼
         confirmFn(tool, args)  —— 可选确认回调
                │
          ┌─────┴─────┐
          │ 允许       │  拒绝 → 返回 error tool_result
          └─────┬─────┘
                │
                ▼
         ToolRegistry.Get(name).Execute()
                │
                ▼
         [注入 tool_result 到上下文]
                │
                ▼
         循环 ←── 回到 ProviderEngine.StreamChat()
```

### 上下文数据结构

```go
type Conversation struct {
    ID        string
    Messages  []Message
    CreatedAt time.Time
}

type Message struct {
    Role       Role
    Content    string
    ToolCalls  []ToolCall
    ToolResult *ToolResult
    Timestamp  time.Time
}
```

### LoopOption

```go
type LoopOption func(*AgentLoop)

func WithSystemPrompt(prompt string) LoopOption
func WithSkillEngine(eng engine.SkillEngine) LoopOption
func WithConfirmation(fn func(tool Tool, args json.RawMessage) bool) LoopOption
```

确认回调由宿主层（TUI / Server）注入，不同宿主可以有不同确认策略。

---

## 第五节：配置系统（Codex 风格）

### YAML 配置结构

参考 Codex 的 `config.toml` 设计，Provider 采用 `model_providers` 块定义多后端：

```yaml
# ~/.monika/config.yaml (全局)

# 默认供应商和模型
model_provider: openai
model: gpt-4o

# 供应商定义 (一个 provider 引擎处理所有后端)
model_providers:
  openai:
    name: OpenAI
    base_url: https://api.openai.com/v1
    api_key: ${OPENAI_API_KEY}
    wire_api: chat

  anthropic:
    name: Anthropic
    base_url: https://api.anthropic.com
    api_key: ${ANTHROPIC_API_KEY}
    wire_api: messages

  ollama:
    name: Ollama
    base_url: http://localhost:11434/v1

# Skill 引擎配置
skill:
  paths:
    - ~/.monika/skills
    - ~/.agents/skills

# MCP 引擎配置
mcp:
  servers:
    - id: postgres
      command: npx
      args: [-y, @anthropic/mcp-postgres, $DATABASE_URL]

# 工具安全策略
tools:
  confirm:
    - bash
  disallow:
    - bash:rm -rf

# .monika/config.yaml (项目级，覆盖全局)
model_provider: anthropic
model: claude-sonnet-4-20250514

model_providers:
  anthropic:
    api_key: ${PROJECT_ANTHROPIC_KEY}   # 项目级覆盖

skill:
  paths:
    - .monika/skills

mcp:
  servers:
    - id: project-db
      command: python
      args: [./mcp/db_server.py]
```

**配置合并规则：** 项目级覆盖全局级，map 级别深度合并。字符串字段项目非空则覆盖，map 字段逐层合并。

### 启动流程

```
monika 启动
    │
    ▼
ConfigLoader.Load(home, project)          // 合并全局 + 项目 YAML
    │
    ▼
[初始化 Provider 引擎]
    engine.Engine[ProviderEngine]().Init(ctx, model_providers)
    │
    ▼
[初始化 Skill 引擎]
    engine.Engine[SkillEngine]().Init(ctx, skill_cfg)
    SkillEngine.Discover(skill_paths)      // 扫描技能目录
    │
    ▼
[初始化 MCP 引擎]
    engine.Engine[MCPEngine]().Init(ctx, mcp_cfg)
    MCPEngine.ConnectServer(server_configs)  // 连接所有 MCP server
    │
    ▼
[注入 MCP tools 到 ToolRegistry]
    │
    ▼
AgentLoop 就绪，等待用户输入
```

### 关闭流程

```
收到退出信号
    │
    ▼
MCPEngine.DisconnectServer(all)           // 断开所有 MCP 连接
    │
    ▼
for each initialized engine:
    e.Shutdown(ctx)
    │
    ▼
退出
```

### 资源消耗分析

| 配置 | 额外进程 | 额外内存 |
|------|---------|---------|
| 最小（仅 Provider 引擎） | 0 | ~0 |
| 典型（Provider + Skill + MCP） | MCP server 子进程（非引擎进程） | ~0 |
| Skills 数量 | 0（文件读取） | ~KB per skill |
| Provider 后端数量 | 0 | 按需初始化 HTTP client |

引擎本身作为主进程的一部分运行，不产生额外进程或显著内存开销。MCP server 作为独立子进程是唯一的外部进程来源。

---

## 与现有代码的关系

| 现有代码 | 处理方式 |
|---------|---------|
| `proto/provider/v1/provider.proto` | 废弃，Provider 改为 Go interface |
| `gen/provider/v1/` | 废弃 |
| `internal/plugin/host/` | 废弃，不依赖 go-plugin |
| `internal/plugin/registry/` | 迁移到 `engine/registry.go` |
| `internal/config/` | 迁移到 `core/internal/config/`，扩展 provider/skill/mcp 配置段 |
| `internal/agent/` | 迁移到 `core/internal/agent/agent_loop.go` |
| `internal/provider/install/` | 废弃，引擎安装改用 `go get` |
| `cmd/monika/provider.go` | 改为引擎管理命令 |
| `cmd/monika/root.go` | 保留 CLI 框架 |
| `go.mod` | 拆分为 engine/go.mod、core/go.mod、各 engines/*/go.mod，顶层加 go.work |

---

## 后续扩展

当前阶段只聚焦三类引擎（Provider / Skill / MCP），以下能力为后续扩展预留：

- **Prompt 引擎**：属于 Skill 引擎的一个子能力，通过 Agent Skills 的能力声明
- **Knowledge 引擎**：后续用 `KnowledgeEngine` 接口扩展，提供 RAG 检索能力
- **Middleware 引擎**：使用 `MiddlewareEngine` 接口，在消息管线中插入拦截逻辑
- **SubAgent 引擎**：使用 `SubAgentEngine` 接口，管理子 agent 的创建和通信
