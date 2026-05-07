# Settings 配置管理与 Agent 自定义设计

> 目标：Settings 支持配置 skill/MCP/models/agents，agent 支持使用已配置的 skill/MCP/model。config.yaml 迁移为 config.json。

## 架构概览

```
config.json (~/.monika/ + <project>/.monika/)
    ├── model_provider / model          → 全局默认 provider 和 model
    ├── model_providers                 → provider 配置（base_url、api_key、models）
    ├── agents[]                        → 自定义 agent 定义（model、permission、prompt）
    ├── skills.paths[]                  → skill 搜索路径
    └── mcp.servers[]                   → MCP 服务器定义
```

Skills 和 MCP 是全局资源，所有 agent 可见。Agent 通过 permission 规则控制对 tool/skill/MCP 的访问粒度。Model 支持 per-agent 覆盖，空则继承全局。

参考：opencode 的 agent/skill/MCP 架构模式。

## Config Schema (config.json)

```json
{
  "model_provider": "deepseek",
  "model": "deepseek-v4-pro",
  "model_providers": {
    "deepseek": {
      "name": "DeepSeek",
      "base_url": "https://api.deepseek.com",
      "api_key": "",
      "models": [
        {"id": "deepseek-v4-pro", "name": "DeepSeek V4 Pro", "context_limit": "128k"}
      ]
    }
  },
  "agents": [
    {
      "name": "code-reviewer",
      "description": "Reviews code for bugs, style, and security",
      "model": "deepseek/deepseek-v4-pro",
      "system_prompt": "You are an expert code reviewer...",
      "temperature": 0.3,
      "hidden": false,
      "disabled": false,
      "permission": {
        "bash": "ask",
        "file_write": "allow",
        "file_delete": "deny"
      }
    }
  ],
  "skills": {
    "paths": ["~/.claude/skills", "./.monika/skills"]
  },
  "mcp": {
    "servers": [
      {
        "id": "filesystem",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem"],
        "env": {}
      }
    ]
  }
}
```

**合并规则**：项目 config 覆盖/追加全局 config。agents 按 name 匹配覆盖，同名时 config 中的定义覆盖内置。`disabled: true` 移除内置 agent。

## Agent 结构

```go
type Agent struct {
    Name         string            // 唯一标识
    Description  string            // 描述
    SystemPrompt string            // 自定义 system prompt，追加到全局 prompt 后面
    Model        string            // "provider/model" 格式，空则继承全局
    Temperature  *float64          // nil 则用默认
    Hidden       bool              // List() 默认不返回
    Disabled     bool              // 内置 agent 被 config 禁用
    Permission   map[string]string // tool/all -> allow/ask/deny
    IsCustom     bool              // 是否来自 config（非内置）
}
```

**AgentRegistry**：启动时加载内置 agent → 合并 config agents → config 中 marked disabled 的移除 → 自定义 agent 追加。

## 运行时注入

AgentLoop 启动时：
1. System prompt = 基础 prompt + agent.SystemPrompt + 可用 skills 列表
2. Tools = 内置 tools + MCP tools（全局，所有 agent 可见）
3. Agent.permission 过滤可用 tools/skills/MCP tools
4. Model = agent.Model ?? cfg.Model（per-agent 优先）

## Backend API

| 方法 | 说明 |
|------|------|
| `GetConfig()` | 返回完整 config（脱敏 api_key） |
| `ListAgents()` | 所有 agent（含 disabled） |
| `SaveAgent(agent)` | 创建/更新，写 config.json |
| `DeleteAgent(name)` | 删自定义 / 禁用内置 |
| `ListSkills()` | 扫描到的 skill 列表 |
| `AddSkillPath(path)` | 追加路径，写 config |
| `RemoveSkillPath(path)` | 移除路径，写 config |
| `ListMCPServers()` | 服务器列表 + 连接状态 |
| `SaveMCPServer(srv)` | 创建/更新，写 config |
| `DeleteMCPServer(id)` | 删除并断开连接 |
| `SaveProvider(cfg)` | 新增/更新 provider |
| `DeleteProvider(id)` | 删除 provider |

## Frontend Settings UI

Settings 全屏 overlay，左侧 tab nav（Agents、Skills、MCP、Models、Permissions），右侧表格视图。

所有 tab 统一表格模式（对齐 PermissionsTab）：
- 标题 + 描述 + 右上角 "+ Add X" 按钮
- 表格每行带操作按钮（Edit/Delete，builtin 行无操作按钮）
- Add/Edit 通过 portal modal

### Agents Tab
表格列：Name、Description、Model、Source（builtin/custom）、Actions
Modal：name、description、model（下拉）、temperature、system prompt（textarea）、permission rules（子表格，tool + allow/ask/deny + 删除）

### Skills Tab
表格列：Name、Description、Path
仅展示已扫描到的 skill，Source 列标记来源路径
通过 "+ Add Path" modal 添加/删除搜索路径

### MCP Tab
表格列：ID、Command、Status（connected/disconnected 绿/红点）、Actions
Modal：id、command、args、env vars
状态为运行时内存查询

### Models Tab
表格列：Provider、Base URL、Models（逗号列表）、Actions
Modal：name、base_url、api_key、models 子列表（id + name + context_limit）

## 实现策略

### Phase 1: 后端基础
- config.json 支持（JSON loader，保留 YAML 兼容读取旧配置并迁移）
- Config schema 扩展（agents、skills、mcp 字段）
- Agent 结构扩展 + AgentRegistry 合并逻辑
- CRUD API 实现

### Phase 2: Agent 运行时集成
- 启动时扫描 skills、连接 MCP 服务器
- Agent runtime 注入 skills 到 system prompt
- MCP tools 合并到 tool list
- Agent permission 过滤

### Phase 3: Frontend Settings
- AgentsTab、SkillsTab、McpTab、ModelsTab 表格实现
- 各 tab 的 Add/Edit modal
- Store actions 调用后端 API

每个 phase 独立可测试，不影响现有功能。

## 测试策略

- config 序列化/反序列化单测
- JSON/YAML 迁移测试
- AgentRegistry 合并逻辑测试（内置 + 自定义 + 覆盖 + 禁用）
- API 方法集成测试
