# Settings 配置管理与 Agent 自定义实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settings 支持配置 skill/MCP/models/agents，agent 支持使用已配置的 skill/MCP/model；config.yaml 迁移为 config.json。

**Architecture:** 后端 Config 从 YAML 迁移到 JSON，扩展 schema 支持 agents/skills/mcp 配置；Agent 结构增加 fields；AgentRegistry 支持内置+自定义合并；AgentLoop 运行时注入 skills 列表和 MCP tools；Frontend Settings 新增 AgentsTab 并实现 Skills/MCP/Models 三个 tab 为表格视图。

**Tech Stack:** Go (encoding/json, gopkg.in/yaml.v3), React 18 + TypeScript 5, Zustand v5, Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-05-08-settings-config-design.md`

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `internal/config/config.go` | 修改 | 添加 JSON tag、AgentEntry schema、JSON loader、YAML→JSON 迁移 |
| `internal/config/config_test.go` | 修改 | JSON 序列化/Agent 合并/迁移测试 |
| `internal/agent/agent.go` | 修改 | Agent 结构扩展、AgentRegistry 合并逻辑 |
| `internal/agent/agent_loop.go` | 修改 | buildToolDefs 合并 MCP tools、buildMessages 注入 skills |
| `internal/agent/system_prompt.go` | 修改 | 新增 skills 列表 prompt 模板 |
| `internal/agent/runner.go` | 修改 | 子任务使用 agent permission 过滤 |
| `internal/api/app.go` | 修改 | 新增 Agents/Skills/MCP/Models CRUD API |
| `internal/bootstrap/provider.go` | 修改 | JSON config 加载 + YAML 迁移 |
| `main.go` | 修改 | 启动时连接 MCP、加载 skills、传入 AgentRegistry |
| `frontend/src/components/Settings/SettingsPage.tsx` | 修改 | 新增 Agents tab |
| `frontend/src/components/Settings/AgentsTab.tsx` | 创建 | Agents 表格视图 |
| `frontend/src/components/Settings/SkillsTab.tsx` | 修改 | 从占位改为表格实现 |
| `frontend/src/components/Settings/McpTab.tsx` | 修改 | 从占位改为表格实现 |
| `frontend/src/components/Settings/ModelsTab.tsx` | 修改 | 从占位改为表格实现 |
| `frontend/src/store/index.ts` | 修改 | 新增 agents/skills/mcp/models 的 state 和 actions |

---

### Task 1: Config 结构添加 JSON tag + AgentEntry schema

**Files:**
- Modify: `internal/config/config.go`

- [ ] **Step 1: 添加 AgentEntry 和更新 Config struct**

在 `internal/config/config.go` 中，给所有 Config 字段添加 `json` tag（保留 `yaml`），新增 `AgentEntry`：

```go
type Config struct {
    ModelProvider  string                    `yaml:"model_provider" json:"model_provider"`
    Model          string                    `yaml:"model" json:"model"`
    ModelProviders map[string]ProviderConfig `yaml:"model_providers" json:"model_providers"`
    Agents         []AgentEntry              `yaml:"agents" json:"agents"`
    Skill          SkillConfig               `yaml:"skill" json:"skill"`
    MCP            MCPConfig                 `yaml:"mcp" json:"mcp"`
    Tools          ToolsConfig               `yaml:"tools" json:"tools"`
}

type AgentEntry struct {
    Name         string            `yaml:"name" json:"name"`
    Description  string            `yaml:"description" json:"description,omitempty"`
    Model        string            `yaml:"model,omitempty" json:"model,omitempty"`
    SystemPrompt string            `yaml:"system_prompt,omitempty" json:"system_prompt,omitempty"`
    Temperature  *float64          `yaml:"temperature,omitempty" json:"temperature,omitempty"`
    Hidden       bool              `yaml:"hidden,omitempty" json:"hidden,omitempty"`
    Disabled     bool              `yaml:"disabled,omitempty" json:"disabled,omitempty"`
    Permission   map[string]string `yaml:"permission,omitempty" json:"permission,omitempty"`
}
```

同时给 `ProviderConfig`、`ModelEntry`、`SkillConfig`、`MCPConfig`、`MCPServerEntry`、`ToolsConfig`、`RuleConfig` 都加上 `json` tag。

- [ ] **Step 2: 添加 JSON 加载函数**

```go
func mergeFileJSON(dst *Config, path string) error {
    data, err := os.ReadFile(path)
    if errors.Is(err, os.ErrNotExist) {
        return nil
    }
    if err != nil {
        return err
    }
    var src Config
    if err := json.Unmarshal(data, &src); err != nil {
        return fmt.Errorf("%s: %w", path, err)
    }
    merge(dst, src)
    return nil
}
```

- [ ] **Step 3: 更新 Load 函数优先读 JSON，fallback YAML 并迁移**

```go
func Load(opts Options) (Config, error) {
    var cfg Config
    if opts.HomeDir != "" {
        jsonPath := filepath.Join(opts.HomeDir, ".monika", "config.json")
        yamlPath := filepath.Join(opts.HomeDir, ".monika", "config.yaml")
        if _, err := os.Stat(jsonPath); err == nil {
            if err := mergeFileJSON(&cfg, jsonPath); err != nil {
                return Config{}, err
            }
        } else if _, err := os.Stat(yamlPath); err == nil {
            if err := mergeFile(&cfg, yamlPath); err != nil {
                return Config{}, err
            }
            // migrate: write to config.json
            migrateToJSON(jsonPath, cfg)
        }
    }
    if opts.ProjectDir != "" {
        jsonPath := filepath.Join(opts.ProjectDir, ".monika", "config.json")
        yamlPath := filepath.Join(opts.ProjectDir, ".monika", "config.yaml")
        if _, err := os.Stat(jsonPath); err == nil {
            if err := mergeFileJSON(&cfg, jsonPath); err != nil {
                return Config{}, err
            }
        } else if _, err := os.Stat(yamlPath); err == nil {
            if err := mergeFile(&cfg, yamlPath); err != nil {
                return Config{}, err
            }
            migrateToJSON(jsonPath, cfg)
        }
    }
    return cfg, nil
}
```

- [ ] **Step 4: 添加迁移辅助函数和 Agent 合并逻辑**

```go
func migrateToJSON(path string, cfg Config) {
    data, err := json.MarshalIndent(cfg, "", "  ")
    if err != nil {
        return
    }
    os.WriteFile(path, data, 0600)
}
```

在 `merge()` 中添加 agents 合并：

```go
if len(src.Agents) > 0 {
    existingByName := make(map[string]int)
    for i, a := range dst.Agents {
        existingByName[a.Name] = i
    }
    for _, a := range src.Agents {
        if idx, ok := existingByName[a.Name]; ok {
            // merge: src fields override dst
            target := &dst.Agents[idx]
            if a.Description != "" { target.Description = a.Description }
            if a.Model != "" { target.Model = a.Model }
            if a.SystemPrompt != "" { target.SystemPrompt = a.SystemPrompt }
            if a.Temperature != nil { target.Temperature = a.Temperature }
            target.Hidden = a.Hidden
            target.Disabled = a.Disabled
            if a.Permission != nil { target.Permission = a.Permission }
        } else {
            dst.Agents = append(dst.Agents, a)
        }
    }
}
```

- [ ] **Step 5: 运行现有测试确保兼容**

```bash
go test ./internal/config/ -v
```

- [ ] **Step 6: Commit**

```bash
git add internal/config/config.go
git commit -m "feat: config 添加 JSON tag 和 AgentEntry schema，JSON/YAML 双加载"
```

---

### Task 2: Config JSON/Agent 合并测试

**Files:**
- Modify: `internal/config/config_test.go`

- [ ] **Step 1: 添加 JSON 加载测试**

```go
func TestLoadFromJSON(t *testing.T) {
    tmp := t.TempDir()
    home := filepath.Join(tmp, "home")
    mustWrite(t, filepath.Join(home, ".monika", "config.json"), []byte(`{
  "model_provider": "openai",
  "model": "gpt-4"
}`))
    cfg, err := Load(Options{HomeDir: home})
    if err != nil {
        t.Fatal(err)
    }
    if cfg.ModelProvider != "openai" || cfg.Model != "gpt-4" {
        t.Fatalf("model_provider=%q model=%q", cfg.ModelProvider, cfg.Model)
    }
}

func TestLoadMergesJSONAndYAML(t *testing.T) {
    tmp := t.TempDir()
    home := filepath.Join(tmp, "home")
    // JSON wins over YAML when both exist
    mustWrite(t, filepath.Join(home, ".monika", "config.yaml"), []byte(`model: gpt-4`))
    mustWrite(t, filepath.Join(home, ".monika", "config.json"), []byte(`{"model": "gpt-4o"}`))
    cfg, err := Load(Options{HomeDir: home})
    if err != nil {
        t.Fatal(err)
    }
    if cfg.Model != "gpt-4o" {
        t.Fatalf("expected gpt-4o from JSON, got %q", cfg.Model)
    }
}

func TestLoadMergesAgents(t *testing.T) {
    tmp := t.TempDir()
    home := filepath.Join(tmp, "home")
    project := filepath.Join(tmp, "project")
    mustWrite(t, filepath.Join(home, ".monika", "config.json"), []byte(`{
  "agents": [{"name": "my-agent", "description": "home desc", "model": "gpt-4"}]
}`))
    mustWrite(t, filepath.Join(project, ".monika", "config.json"), []byte(`{
  "agents": [{"name": "my-agent", "description": "project desc"}]
}`))
    cfg, err := Load(Options{HomeDir: home, ProjectDir: project})
    if err != nil {
        t.Fatal(err)
    }
    if len(cfg.Agents) != 1 {
        t.Fatalf("expected 1 agent, got %d", len(cfg.Agents))
    }
    if cfg.Agents[0].Description != "project desc" {
        t.Fatalf("project should override, got %q", cfg.Agents[0].Description)
    }
    if cfg.Agents[0].Model != "gpt-4" {
        t.Fatalf("home model should survive, got %q", cfg.Agents[0].Model)
    }
}

func TestLoadAppendsAgents(t *testing.T) {
    tmp := t.TempDir()
    home := filepath.Join(tmp, "home")
    project := filepath.Join(tmp, "project")
    mustWrite(t, filepath.Join(home, ".monika", "config.json"), []byte(`{
  "agents": [{"name": "agent-a"}]
}`))
    mustWrite(t, filepath.Join(project, ".monika", "config.json"), []byte(`{
  "agents": [{"name": "agent-b"}]
}`))
    cfg, err := Load(Options{HomeDir: home, ProjectDir: project})
    if err != nil {
        t.Fatal(err)
    }
    if len(cfg.Agents) != 2 {
        t.Fatalf("expected 2 agents, got %d", len(cfg.Agents))
    }
}
```

- [ ] **Step 2: 运行测试**

```bash
go test ./internal/config/ -v -run "TestLoad"
```

- [ ] **Step 3: Commit**

```bash
git add internal/config/config_test.go
git commit -m "test: JSON 加载和 Agent 合并测试"
```

---

### Task 3: Config JSON 迁移 (YAML→JSON 自动转换)

**Files:**
- Modify: `internal/bootstrap/provider.go`

- [ ] **Step 1: 更新 bootstrap 使用新 Load 接口**

`provider.go` 的 `InitProvider` 已调用 `config.Load()`，不需要改接口。但需要在迁移发生时通知用户。

```go
// 在 InitProvider 中，config.Load 返回后检查是否存在旧 yaml
yamlPath := filepath.Join(home, ".monika", "config.yaml")
jsonPath := filepath.Join(home, ".monika", "config.json")
if _, err := os.Stat(yamlPath); err == nil {
    if _, err := os.Stat(jsonPath); err == nil {
        fmt.Fprintf(os.Stderr, "[monika] config migrated from config.yaml to config.json\n")
        // Don't delete yaml — user may want backup
    }
}
```

- [ ] **Step 2: 更新 setupConfig 写 JSON**

将 `setupConfig` 中的 `config.yaml` 改为 `config.json`，使用 `json.MarshalIndent` 替代 `yaml.Marshal`。

```go
configPath := filepath.Join(configDir, "config.json")
data, err := json.MarshalIndent(&cfg, "", "  ")
if err != nil {
    return fmt.Errorf("marshal config: %w", err)
}
```

- [ ] **Step 3: 更新 PersistSelection 写 JSON**

更新 `internal/api/app.go` 中 `PersistSelection` 方法的路径：

```go
configPath := filepath.Join(a.home, ".monika", "config.json")
data, err := json.MarshalIndent(&a.cfg, "", "  ")
```

- [ ] **Step 4: 编译验证**

```bash
go build .
```

- [ ] **Step 5: Commit**

```bash
git add internal/bootstrap/provider.go internal/api/app.go
git commit -m "feat: config 迁移到 JSON，setupConfig 和 PersistSelection 写 JSON"
```

---

### Task 4: Agent 结构扩展 + AgentRegistry 合并

**Files:**
- Modify: `internal/agent/agent.go`

- [ ] **Step 1: 扩展 Agent 结构**

```go
type Agent struct {
    Name         string            `json:"name"`
    Description  string            `json:"description,omitempty"`
    SystemPrompt string            `json:"systemPrompt,omitempty"`
    Model        string            `json:"model,omitempty"`   // "provider/model"，空则继承
    Provider     string            `json:"provider,omitempty"` // 保留兼容
    Temperature  *float64          `json:"temperature,omitempty"` // nil 用默认
    Hidden       bool              `json:"hidden,omitempty"`
    Disabled     bool              `json:"disabled,omitempty"` // 内置 agent 被 config 禁用
    Permission   map[string]string `json:"permission,omitempty"` // tool → allow/ask/deny
    IsCustom     bool              `json:"isCustom"`
    Source       string            `json:"source"` // "builtin" | "custom"
}
```

- [ ] **Step 2: AgentRegistry 添加合并方法**

```go
// MergeConfig loads agents from config entries. Config agents with the same
// name override built-in fields. Config agents with Disabled=true remove
// built-in agents. Config agents with new names are added as IsCustom=true.
func (r *AgentRegistry) MergeConfig(entries []config.AgentEntry) {
    for _, e := range entries {
        if existing, ok := r.agents[e.Name]; ok {
            if e.Disabled {
                existing.Disabled = true
                r.agents[e.Name] = existing
                continue
            }
            // merge config fields into existing
            if e.Description != "" { existing.Description = e.Description }
            if e.Model != "" { existing.Model = e.Model }
            if e.SystemPrompt != "" { existing.SystemPrompt = e.SystemPrompt }
            if e.Temperature != nil { existing.Temperature = e.Temperature }
            if e.Hidden { existing.Hidden = true }
            if e.Permission != nil { existing.Permission = e.Permission }
            r.agents[e.Name] = existing
        } else if !e.Disabled {
            r.agents[e.Name] = Agent{
                Name:         e.Name,
                Description:  e.Description,
                SystemPrompt: e.SystemPrompt,
                Model:        e.Model,
                Temperature:  e.Temperature,
                Hidden:       e.Hidden,
                Permission:   e.Permission,
                IsCustom:     true,
            }
        }
    }
}
```

- [ ] **Step 3: 更新 List 排除 Disabled**

```go
func (r *AgentRegistry) List(includeHidden bool) []Agent {
    var out []Agent
    for _, a := range r.agents {
        if a.Disabled { continue }
        if !includeHidden && a.Hidden { continue }
        out = append(out, a)
    }
    return out
}
```

- [ ] **Step 4: 新增 GetAll 方法（供 Settings 使用）**

```go
func (r *AgentRegistry) GetAll() []Agent {
    out := make([]Agent, 0, len(r.agents))
    for _, a := range r.agents {
        out = append(out, a)
    }
    return out
}
```

- [ ] **Step 5: Commit**

```bash
git add internal/agent/agent.go
git commit -m "feat: Agent 结构扩展 + AgentRegistry.MergeConfig 合并逻辑"
```

---

### Task 5: AgentRegistry 合并测试

**Files:**
- Create: `internal/agent/agent_test.go` (如不存在)

- [ ] **Step 1: 编写测试**

```go
func TestAgentRegistryMergeConfig(t *testing.T) {
    builtin := []Agent{
        {Name: "general", Description: "built-in general", Model: ""},
        {Name: "explore", Description: "built-in explore", Model: "gpt-4"},
    }
    r := NewAgentRegistry(builtin)

    configEntries := []config.AgentEntry{
        {Name: "general", Description: "overridden", Model: "gpt-4o"},
        {Name: "explore", Disabled: true},
        {Name: "custom", Description: "new agent", Model: "deepseek"},
    }
    r.MergeConfig(configEntries)

    // general should be overridden
    g, ok := r.Get("general")
    if !ok { t.Fatal("general should exist") }
    if g.Description != "overridden" { t.Fatalf("desc = %q", g.Description) }
    if g.Model != "gpt-4o" { t.Fatalf("model = %q", g.Model) }
    if g.IsCustom { t.Fatal("general should not be custom") }

    // explore should be disabled
    e, ok := r.Get("explore")
    if !ok { t.Fatal("explore should exist") }
    if !e.Disabled { t.Fatal("explore should be disabled") }

    // custom should exist
    c, ok := r.Get("custom")
    if !ok { t.Fatal("custom should exist") }
    if !c.IsCustom { t.Fatal("custom should be IsCustom") }

    // List should exclude disabled
    list := r.List(false)
    if len(list) != 2 { t.Fatalf("List = %d, want 2", len(list)) }

    // GetAll should include disabled
    all := r.GetAll()
    if len(all) != 3 { t.Fatalf("GetAll = %d, want 3", len(all)) }
}
```

- [ ] **Step 2: 运行测试**

```bash
go test ./internal/agent/ -v -run TestAgentRegistry
```

- [ ] **Step 3: Commit**

```bash
git add internal/agent/agent_test.go
git commit -m "test: AgentRegistry 合并逻辑测试"
```

---

### Task 6: Backend CRUD API — Agents/Skills/MCP

**Files:**
- Modify: `internal/api/app.go`

- [ ] **Step 1: 添加 Agent CRUD 方法**

在 `app.go` 末尾添加：

```go
func (a *App) ListAgents() []agent2.Agent {
    return a.agentRegistry.GetAll()
}

func (a *App) SaveAgent(args json.RawMessage) error {
    var entry config2.AgentEntry
    if err := json.Unmarshal(args, &entry); err != nil {
        return err
    }
    // Update in-memory config
    found := false
    for i, ag := range a.cfg.Agents {
        if ag.Name == entry.Name {
            a.cfg.Agents[i] = entry
            found = true
            break
        }
    }
    if !found {
        a.cfg.Agents = append(a.cfg.Agents, entry)
    }
    // Persist
    a.writeConfig()
    // Reload registry
    a.agentRegistry.MergeConfig(a.cfg.Agents)
    return nil
}

func (a *App) DeleteAgent(args json.RawMessage) error {
    var req struct{ Name string }
    if err := json.Unmarshal(args, &req); err != nil {
        return err
    }
    // Mark as disabled
    found := false
    for i, ag := range a.cfg.Agents {
        if ag.Name == req.Name {
            a.cfg.Agents[i].Disabled = true
            found = true
            break
        }
    }
    if !found {
        // Might be a built-in, add disabled entry
        a.cfg.Agents = append(a.cfg.Agents, config2.AgentEntry{
            Name: req.Name, Disabled: true,
        })
    }
    a.writeConfig()
    a.agentRegistry.MergeConfig(a.cfg.Agents)
    return nil
}

func (a *App) writeConfig() {
    configPath := filepath.Join(a.home, ".monika", "config.json")
    data, err := json.MarshalIndent(&a.cfg, "", "  ")
    if err != nil {
        fmt.Fprintf(os.Stderr, "[monika] writeConfig marshal: %v\n", err)
        return
    }
    tmp := configPath + ".tmp"
    if err := os.WriteFile(tmp, data, 0600); err != nil {
        fmt.Fprintf(os.Stderr, "[monika] writeConfig write: %v\n", err)
        return
    }
    os.Rename(tmp, configPath)
}
```

- [ ] **Step 2: 添加 Skills 管理方法**

```go
func (a *App) ListSkills() []engine2.SkillMeta {
    eng, err := engine2.EngineByID("skill")
    if err != nil {
        return nil
    }
    skEng, ok := eng.(engine2.SkillEngine)
    if !ok {
        return nil
    }
    skills, err := skEng.Discover(context.Background(), a.cfg.Skill.Paths)
    if err != nil {
        fmt.Fprintf(os.Stderr, "[monika] ListSkills: %v\n", err)
        return nil
    }
    return skills
}

func (a *App) AddSkillPath(args json.RawMessage) error {
    var req struct{ Path string }
    if err := json.Unmarshal(args, &req); err != nil {
        return err
    }
    a.cfg.Skill.Paths = append(a.cfg.Skill.Paths, req.Path)
    a.writeConfig()
    return nil
}

func (a *App) RemoveSkillPath(args json.RawMessage) error {
    var req struct{ Path string }
    if err := json.Unmarshal(args, &req); err != nil {
        return err
    }
    filtered := make([]string, 0, len(a.cfg.Skill.Paths))
    for _, p := range a.cfg.Skill.Paths {
        if p != req.Path {
            filtered = append(filtered, p)
        }
    }
    a.cfg.Skill.Paths = filtered
    a.writeConfig()
    return nil
}
```

- [ ] **Step 3: 添加 MCP 管理方法**

```go
func (a *App) ListMCPServers() []MCPServerInfo {
    servers := make([]MCPServerInfo, 0, len(a.cfg.MCP.Servers))
    for _, s := range a.cfg.MCP.Servers {
        info := MCPServerInfo{
            ID:      s.ID,
            Command: s.Command,
            Args:    s.Args,
            Status:  "disconnected",
        }
        // Check runtime connection status
        if a.mcpConnected(s.ID) {
            info.Status = "connected"
        }
        servers = append(servers, info)
    }
    return servers
}

func (a *App) mcpConnected(id string) bool {
    // Query MCP engine for connection status
    eng, err := engine2.EngineByID("mcp")
    if err != nil { return false }
    mcpEng := eng.(engine2.MCPEngine)
    _, err = mcpEng.DisconnectServer(context.Background(), id)
    // If disconnect fails with "not found", it's connected
    return err == nil || !strings.Contains(err.Error(), "not found")
}

func (a *App) SaveMCPServer(args json.RawMessage) error {
    var srv config2.MCPServerEntry
    if err := json.Unmarshal(args, &srv); err != nil {
        return err
    }
    // Stop existing connection if updating
    a.disconnectMCPServer(srv.ID)
    // Update config
    found := false
    for i, s := range a.cfg.MCP.Servers {
        if s.ID == srv.ID {
            a.cfg.MCP.Servers[i] = srv
            found = true
            break
        }
    }
    if !found {
        a.cfg.MCP.Servers = append(a.cfg.MCP.Servers, srv)
    }
    a.writeConfig()
    // Reconnect
    a.connectMCPServer(srv)
    return nil
}

func (a *App) DeleteMCPServer(args json.RawMessage) error {
    var req struct{ ID string }
    if err := json.Unmarshal(args, &req); err != nil {
        return err
    }
    a.disconnectMCPServer(req.ID)
    filtered := make([]config2.MCPServerEntry, 0)
    for _, s := range a.cfg.MCP.Servers {
        if s.ID != req.ID {
            filtered = append(filtered, s)
        }
    }
    a.cfg.MCP.Servers = filtered
    a.writeConfig()
    return nil
}

type MCPServerInfo struct {
    ID      string   `json:"id"`
    Command string   `json:"command"`
    Args    []string `json:"args"`
    Status  string   `json:"status"` // "connected" | "disconnected"
}
```

- [ ] **Step 4: Commit**

```bash
git add internal/api/app.go
git commit -m "feat: Agent/Skills/MCP CRUD API 方法"
```

---

### Task 7: Backend CRUD API — Provider 管理

**Files:**
- Modify: `internal/api/app.go`

- [ ] **Step 1: 添加 SaveProvider 和 DeleteProvider**

```go
func (a *App) SaveProvider(args json.RawMessage) error {
    var req struct {
        ID      string                `json:"id"`
        Name    string                `json:"name"`
        BaseURL string                `json:"base_url"`
        APIKey  string                `json:"api_key"`
        Models  []config2.ModelEntry  `json:"models"`
    }
    if err := json.Unmarshal(args, &req); err != nil {
        return err
    }
    pc := config2.ProviderConfig{
        Name: req.Name, BaseURL: req.BaseURL,
        APIKey: req.APIKey, Models: req.Models,
    }
    // merge: preserve existing fields not in request
    if existing, ok := a.cfg.ModelProviders[req.ID]; ok {
        if pc.Name == "" { pc.Name = existing.Name }
        if pc.BaseURL == "" { pc.BaseURL = existing.BaseURL }
        if pc.APIKey == "" { pc.APIKey = existing.APIKey }
        if len(pc.Models) == 0 { pc.Models = existing.Models }
    }
    a.cfg.ModelProviders[req.ID] = pc
    a.writeConfig()
    return nil
}

func (a *App) DeleteProvider(args json.RawMessage) error {
    var req struct{ ID string }
    if err := json.Unmarshal(args, &req); err != nil {
        return err
    }
    delete(a.cfg.ModelProviders, req.ID)
    a.writeConfig()
    return nil
}
```

- [ ] **Step 2: Commit**

```bash
git add internal/api/app.go
git commit -m "feat: Provider Save/Delete API"
```

---

### Task 8: Agent 运行时 — Skills 注入 system prompt

**Files:**
- Modify: `internal/agent/system_prompt.go`

- [ ] **Step 1: 添加 skills 列表 prompt 生成函数**

```go
func BuildSkillsPrompt(skills []engine.SkillMeta) string {
    if len(skills) == 0 {
        return ""
    }
    var b strings.Builder
    b.WriteString("\n\n## Available Skills\n\n")
    b.WriteString("You have access to the following skills. Use the skill tool to invoke one:\n\n")
    for _, s := range skills {
        fmt.Fprintf(&b, "- **%s**: %s\n", s.Name, s.Description)
    }
    b.WriteString("\nTo use a skill, call the skill tool with the skill name.")
    return b.String()
}
```

需要 `import "strings"` 和 `import "fmt"`。

- [ ] **Step 2: Commit**

```bash
git add internal/agent/system_prompt.go
git commit -m "feat: BuildSkillsPrompt 注入可用 skills 列表"
```

---

### Task 9: Agent 运行时 — MCP tools 合并到 tool list

**Files:**
- Modify: `internal/agent/agent_loop.go`

- [ ] **Step 1: AgentLoop 添加 mcpTools 字段**

```go
type AgentLoop struct {
    // ... existing fields ...
    mcpTools []engine.MCPTool  // 新增
}

func WithMCPTools(tools []engine.MCPTool) LoopOption {
    return func(a *AgentLoop) { a.mcpTools = tools }
}
```

- [ ] **Step 2: 更新 buildToolDefs 合并 MCP tools**

```go
func (a *AgentLoop) buildToolDefs() []engine.ToolDef {
    tools := a.tools.List()
    n := len(tools) + len(a.mcpTools)
    defs := make([]engine.ToolDef, 0, n)
    isChild := strings.HasPrefix(a.sessionID, "call_") || strings.HasPrefix(a.sessionID, "sub_")
    for _, t := range tools {
        if isChild && t.Name() == "spawn_agent" {
            continue
        }
        defs = append(defs, engine.ToolDef{
            Type: "function",
            Function: engine.ToolFunction{
                Name:        t.Name(),
                Description: t.Description(),
                Parameters:  t.Parameters(),
            },
        })
    }
    // MCP tools
    for _, mt := range a.mcpTools {
        defs = append(defs, engine.ToolDef{
            Type: "function",
            Function: engine.ToolFunction{
                Name:        mt.Name,
                Description: mt.Description,
                Parameters:  mt.InputSchema,
            },
        })
    }
    return defs
}
```

- [ ] **Step 3: 更新 MCP tool 执行逻辑**

在 `runBlocking` 和 `runStreaming` 中，tool 查找失败时，尝试从 MCP 连接执行。需要在 AgentLoop 中存储 MCP connections 引用。

```go
// 在 AgentLoop 中添加
mcpConns map[string]engine.MCPServerConnection

func WithMCPConnections(conns map[string]engine.MCPServerConnection) LoopOption {
    return func(a *AgentLoop) { a.mcpConns = conns }
}
```

在 tool 执行循环中（tool 未找到时）：

```go
t, ok := a.tools.Get(tc.Function.Name)
if !ok {
    // Try MCP tools
    if content, found := a.executeMCPTool(tc); found {
        conv.Messages = append(...)
        continue
    }
    conv.Messages = append(conv.Messages, ...)
    continue
}
```

- [ ] **Step 4: 编译验证**

```bash
go build .
```

- [ ] **Step 5: Commit**

```bash
git add internal/agent/agent_loop.go
git commit -m "feat: AgentLoop 合并 MCP tools 到 buildToolDefs"
```

---

### Task 10: main.go 启动时连接 MCP / 加载 skills / 合并 agents

**Files:**
- Modify: `main.go`

- [ ] **Step 1: 启动时连接 MCP 服务器 + 扫描 skills**

```go
// After registry := tool.NewRegistry() ...

// Connect MCP servers
var mcpConns map[string]engine2.MCPServerConnection
var mcpToolList []engine2.MCPTool
mcpEng, err := engine2.EngineByID("mcp")
if err == nil {
    if mcp, ok := mcpEng.(engine2.MCPEngine); ok {
        mcpConns = make(map[string]engine2.MCPServerConnection)
        for _, srv := range pr.Config.MCP.Servers {
            cfg := engine2.MCPServerConfig{
                ID: srv.ID, Command: srv.Command,
                Args: srv.Args, Env: srv.Env,
            }
            conn, err := mcp.ConnectServer(ctx, cfg)
            if err != nil {
                fmt.Fprintf(os.Stderr, "[monika] MCP server %q connect failed: %v\n", srv.ID, err)
                continue
            }
            mcpConns[srv.ID] = conn
            tools, err := conn.ListTools(ctx)
            if err != nil {
                fmt.Fprintf(os.Stderr, "[monika] MCP server %q list tools: %v\n", srv.ID, err)
                continue
            }
            mcpToolList = append(mcpToolList, tools...)
        }
    }
}

// Discover skills
var skillList []engine2.SkillMeta
skillEng, err := engine2.EngineByID("skill")
if err == nil {
    if sk, ok := skillEng.(engine2.SkillEngine); ok {
        discovered, err := sk.Discover(ctx, pr.Config.Skill.Paths)
        if err != nil {
            fmt.Fprintf(os.Stderr, "[monika] skill discover: %v\n", err)
        } else {
            skillList = discovered
        }
    }
}

// Build skills prompt section
skillsPrompt := agent.BuildSkillsPrompt(skillList)
systemPrompt := strings.Join(systemParts, "\n\n") + skillsPrompt
```

- [ ] **Step 2: 将 config agents 合并到 registry**

```go
agentRegistry := agent.NewAgentRegistry([]agent.Agent{...builtins...})
agentRegistry.MergeConfig(pr.Config.Agents)
```

- [ ] **Step 3: 将 MCP tools/conns 传入 loopOpts**

```go
loopOpts = append(loopOpts, agent.WithMCPTools(mcpToolList))
loopOpts = append(loopOpts, agent.WithMCPConnections(mcpConns))
```

- [ ] **Step 4: 编译验证**

```bash
go build .
```

- [ ] **Step 5: Commit**

```bash
git add main.go
git commit -m "feat: 启动时连接 MCP、扫描 skills、合并 config agents"
```

---

### Task 11: Frontend Store — 新增 agents/skills/mcp/models state 和 actions

**Files:**
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: 添加类型定义**

```typescript
interface AgentInfo {
  name: string
  description: string
  systemPrompt: string
  model: string
  provider: string
  temperature?: number
  hidden: boolean
  disabled: boolean
  isCustom: boolean
  source: 'builtin' | 'custom'
  permission: Record<string, string>
}

interface SkillInfo {
  name: string
  description: string
  path: string
}

interface MCPServerInfo {
  id: string
  command: string
  args: string[]
  status: 'connected' | 'disconnected'
}

interface ProviderFull {
  id: string
  name: string
  baseURL: string
  apiKey: string  // masked in GetConfig
  models: { id: string; name: string; contextLimit?: number }[]
}
```

- [ ] **Step 2: 添加 state 字段**

在 `AppState` 中添加：

```typescript
agents: AgentInfo[]
skills: SkillInfo[]
skillPaths: string[]
mcpServers: MCPServerInfo[]
providers: ProviderConfig[]
```

- [ ] **Step 3: 添加 actions**

```typescript
loadAgents: () => Promise<void>
saveAgent: (agent: AgentInfo) => Promise<void>
deleteAgent: (name: string) => Promise<void>

loadSkills: () => Promise<void>
addSkillPath: (path: string) => Promise<void>
removeSkillPath: (path: string) => Promise<void>

loadMCPServers: () => Promise<void>
saveMCPServer: (srv: MCPServerInfo) => Promise<void>
deleteMCPServer: (id: string) => Promise<void>

loadProviders: () => Promise<void>  // 扩展已有，改为取完整 ProviderConfig
saveProvider: (cfg: ProviderConfig) => Promise<void>
deleteProvider: (id: string) => Promise<void>
```

每个 action 通过 `Call.ByName('monika/internal/api.App.<Method>', ...)` 调用后端。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat: store 新增 agents/skills/mcp/models state 和 actions"
```

---

### Task 12: Frontend AgentsTab

**Files:**
- Create: `frontend/src/components/Settings/AgentsTab.tsx`
- Modify: `frontend/src/components/Settings/SettingsPage.tsx`

- [ ] **Step 1: 创建 AgentsTab 表格组件**

`AgentsTab.tsx` — 对齐 PermissionsTab 表格模式：

```tsx
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../store'

function AgentEditModal({ agent, onClose, onSave }: {
  agent?: AgentInfo
  onClose: () => void
  onSave: (a: AgentInfo) => Promise<void>
}) {
  const [name, setName] = useState(agent?.name || '')
  const [description, setDescription] = useState(agent?.description || '')
  const [model, setModel] = useState(agent?.model || '')
  const [temperature, setTemperature] = useState(agent?.temperature?.toString() || '')
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt || '')
  const [permission, setPermission] = useState<Record<string, string>>(agent?.permission || {})
  const [newTool, setNewTool] = useState('')
  const [newDecision, setNewDecision] = useState('allow')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    if (!name) { setError('Name is required'); return }
    setLoading(true)
    try {
      await onSave({ name, description, model, temperature: temperature ? parseFloat(temperature) : undefined, systemPrompt, permission, hidden: false, disabled: false, isCustom: true })
      onClose()
    } catch { setError('Failed to save') }
    finally { setLoading(false) }
  }

  const addPerm = () => {
    if (!newTool) return
    setPermission(p => ({ ...p, [newTool]: newDecision }))
    setNewTool('')
  }

  const removePerm = (tool: string) => {
    setPermission(p => { const n = { ...p }; delete n[tool]; return n })
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={loading ? undefined : onClose}>
      <div role="dialog" aria-modal className="bg-[var(--bg-elevated)] rounded-[var(--radius-lg)] w-[520px] p-5 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-[14px] font-semibold mb-4">{agent ? 'Edit Agent' : 'Add Agent'}</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)}
              className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Model</label>
            <input value={model} onChange={e => setModel(e.target.value)} placeholder="provider/model or empty to inherit"
              className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Temperature</label>
            <input value={temperature} onChange={e => setTemperature(e.target.value)} placeholder="0.0-2.0"
              className="w-20 px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">System Prompt</label>
            <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={6}
              className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent)] resize-y" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Permission Rules</label>
            <table className="w-full text-[11px] border-collapse mb-2">
              <thead>
                <tr className="text-left text-[var(--text-dim)] border-b border-[var(--border)]">
                  <th className="py-1 pr-4 font-medium">Tool</th>
                  <th className="py-1 pr-4 font-medium">Decision</th>
                  <th className="py-1 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(permission).map(([tool, dec]) => (
                  <tr key={tool} className="border-b border-[var(--border)]">
                    <td className="py-1 pr-4 font-mono">{tool}</td>
                    <td className="py-1 pr-4">
                      <select value={dec} onChange={e => setPermission(p => ({ ...p, [tool]: e.target.value }))}
                        className="px-1 py-0.5 text-[11px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)]">
                        <option value="allow">allow</option>
                        <option value="ask">ask</option>
                        <option value="deny">deny</option>
                      </select>
                    </td>
                    <td className="py-1"><button onClick={() => removePerm(tool)} className="text-[var(--text-dim)] hover:text-red-400 text-[11px]">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-2">
              <input placeholder="tool name" value={newTool} onChange={e => setNewTool(e.target.value)}
                className="flex-1 px-2 py-1 text-[11px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" />
              <select value={newDecision} onChange={e => setNewDecision(e.target.value)}
                className="px-1 py-1 text-[11px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)]">
                <option value="allow">allow</option>
                <option value="ask">ask</option>
                <option value="deny">deny</option>
              </select>
              <button onClick={addPerm} className="px-2 py-1 text-[11px] rounded border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)]">+</button>
            </div>
          </div>
        </div>
        {error && <p className="text-[11px] text-[var(--red)] m-0 mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} disabled={loading}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-1.5 text-[13px] rounded-[2px] transition-colors disabled:opacity-50">Cancel</button>
          <button onClick={handleSave} disabled={loading}
            className="bg-[var(--accent)] text-white px-3 py-1.5 text-[13px] rounded-[2px] hover:opacity-90 transition-opacity disabled:opacity-50">{loading ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>, document.body
  )
}

function AgentsTab() {
  const agents = useStore(s => s.agents)
  const loadAgents = useStore(s => s.loadAgents)
  const saveAgent = useStore(s => s.saveAgent)
  const deleteAgent = useStore(s => s.deleteAgent)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<AgentInfo | undefined>()

  useEffect(() => { loadAgents() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold m-0 mb-1">Agents</h3>
          <p className="text-[11px] text-[var(--text-dim)] m-0">Manage built-in and custom agents</p>
        </div>
        <button onClick={() => { setEditing(undefined); setShowModal(true) }}>+ Add Agent</button>
      </div>
      {showModal && <AgentEditModal agent={editing} onClose={() => setShowModal(false)} onSave={saveAgent} />}
      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-[var(--text-dim)]">
          <span className="text-[13px]">No agents. Click "+ Add Agent" to create one</span>
        </div>
      ) : (
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="text-left text-[var(--text-dim)] border-b border-[var(--border)]">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Description</th>
              <th className="py-2 pr-4 font-medium">Model</th>
              <th className="py-2 pr-4 font-medium">Source</th>
              <th className="py-2 font-medium w-[80px]"></th>
            </tr>
          </thead>
          <tbody>
            {agents.map(a => (
              <tr key={a.name} className="border-b border-[var(--border)] hover:bg-[var(--bg-elevated)]">
                <td className="py-2 pr-4 font-mono text-[11px]">{a.name}</td>
                <td className="py-2 pr-4 text-[11px] max-w-[300px] truncate">{a.description || '—'}</td>
                <td className="py-2 pr-4 text-[11px] text-[var(--text-dim)]">{a.model || '(inherit)'}</td>
                <td className="py-2 pr-4">
                  {a.source === 'builtin'
                    ? <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-gray-500/15 text-gray-400">{a.hidden ? 'builtin hidden' : 'builtin'}</span>
                    : <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/15 text-indigo-400">custom</span>}
                </td>
                <td className="py-2">
                  {a.source === 'custom' && (
                    <>
                      <button onClick={() => { setEditing(a); setShowModal(true) }}
                        className="text-[var(--text-dim)] hover:text-[var(--text-primary)] text-[11px] px-1">Edit</button>
                      <button onClick={() => deleteAgent(a.name)}
                        className="text-[var(--text-dim)] hover:text-red-400 text-[11px] px-1">✕</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
export default AgentsTab
```

注：完整 JSX（input/select/textarea 样式对齐 PermissionsTab modal 和表格）见实际实现。

- [ ] **Step 2: 更新 SettingsPage 添加 Agents tab**

在 TABS 数组前添加：

```tsx
{ id: 'agents', label: 'Agents' },
```

在 `<main>` 中添加：

```tsx
{activeTab === 'agents' && <AgentsTab />}
```

更新 `Tab` 类型：

```tsx
type Tab = 'agents' | 'permissions' | 'skills' | 'mcp' | 'models'
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Settings/AgentsTab.tsx frontend/src/components/Settings/SettingsPage.tsx
git commit -m "feat: AgentsTab 表格视图 + Add/Edit modal"
```

---

### Task 13: Frontend SkillsTab 从占位改为表格实现

**Files:**
- Modify: `frontend/src/components/Settings/SkillsTab.tsx`

- [ ] **Step 1: 实现 SkillsTab 表格**

对齐 Permissions 模式：表格显示 skills（Name、Description、Path），"+ Add Path" modal 添加/删除搜索路径。

```tsx
function SkillsTab() {
  const skills = useStore(s => s.skills)
  const skillPaths = useStore(s => s.skillPaths)
  const loadSkills = useStore(s => s.loadSkills)
  const addSkillPath = useStore(s => s.addSkillPath)
  const removeSkillPath = useStore(s => s.removeSkillPath)
  const [showAddPath, setShowAddPath] = useState(false)
  const [newPath, setNewPath] = useState('')

  useEffect(() => { loadSkills() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold m-0 mb-1">Skills</h3>
          <p className="text-[11px] text-[var(--text-dim)] m-0">Manage skill search paths</p>
        </div>
        <button onClick={() => setShowAddPath(true)}>+ Add Path</button>
      </div>
      {/* Path list with remove buttons */}
      <div className="mb-6">{/* path tags with × */}</div>
      {/* Skills table: Name, Description, Path */}
      <table>{/* ... */}</table>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Settings/SkillsTab.tsx
git commit -m "feat: SkillsTab 表格实现"
```

---

### Task 14: Frontend McpTab 从占位改为表格实现

**Files:**
- Modify: `frontend/src/components/Settings/McpTab.tsx`

- [ ] **Step 1: 实现 McpTab 表格**

表格列：ID、Command、Status（connected/disconnected 指示点）、Actions（Edit/Delete）

```tsx
function McpTab() {
  const servers = useStore(s => s.mcpServers)
  const loadMCPServers = useStore(s => s.loadMCPServers)
  const saveMCPServer = useStore(s => s.saveMCPServer)
  const deleteMCPServer = useStore(s => s.deleteMCPServer)
  // ... Add/Edit modal with ID, Command, Args, Env fields
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold m-0 mb-1">MCP</h3>
          <p className="text-[11px] text-[var(--text-dim)] m-0">Manage MCP server connections</p>
        </div>
        <button onClick={() => setShowModal(true)}>+ Add Server</button>
      </div>
      <table>{/* ID, Command, Status, Actions */}</table>
    </div>
  )
}
```

状态指示：`<span>` with green/red dot CSS。

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Settings/McpTab.tsx
git commit -m "feat: McpTab 表格实现 + Add/Edit server modal"
```

---

### Task 15: Frontend ModelsTab 从占位改为表格实现

**Files:**
- Modify: `frontend/src/components/Settings/ModelsTab.tsx`

- [ ] **Step 1: 实现 ModelsTab 表格**

表格列：Provider、Base URL、Models（逗号列表）、Actions（Edit/Delete）

```tsx
function ModelsTab() {
  const providers = useStore(s => s.providers)
  const loadProviders = useStore(s => s.loadProviders)
  const saveProvider = useStore(s => s.saveProvider)
  const deleteProvider = useStore(s => s.deleteProvider)
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold m-0 mb-1">Models</h3>
          <p className="text-[11px] text-[var(--text-dim)] m-0">Manage model providers</p>
        </div>
        <button onClick={() => setShowModal(true)}>+ Add Provider</button>
      </div>
      <table>{/* Provider, Base URL, Models, Actions */}</table>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Settings/ModelsTab.tsx
git commit -m "feat: ModelsTab 表格实现 + Add/Edit provider modal"
```

---

### Task 16: 端到端验证 + 清理

- [ ] **Step 1: 运行所有测试**

```bash
go test ./...
cd frontend && npx tsc --noEmit
```

- [ ] **Step 2: 修复任何编译/测试错误**

- [ ] **Step 3: 构建验证**

```bash
cd frontend && npm run build
cd .. && go build .
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: 端到端验证通过，清理未使用导入"
```
