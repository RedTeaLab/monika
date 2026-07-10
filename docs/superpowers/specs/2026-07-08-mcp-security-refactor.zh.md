# MCP 安全重构 — 设计文档

**日期**: 2026-07-08
**分支**: `feat/mcp-security-refactor`
**状态**: 已实现

## 概述

重构 MCP（Model Context Protocol）服务器管理，强制分离配置与凭据，防止敏感数据泄露到 LLM 上下文，并增加第三方 MCP 配置的自动发现。

## 背景

重构前：
- MCP 服务器凭据（环境变量、headers、URL 认证）内联存储在 `config.json` 中 —— 任何 `file_read` 调用都能看到
- `list_mcp_servers` 工具向 LLM 暴露 `env` 和原始 URL
- 所有配置写入都到一个全局文件 —— 无项目级作用域
- MCP 服务器在保存/删除后无生命周期管理 —— 需要重启应用
- 无第三方 MCP 配置（`.cursor/mcp.json` 等）的自动发现

## 目标

1. **凭据隔离**: `env`/`headers`/URL 认证存储在 `credentials.json`（0600），不存入 `config.json`
2. **LLM 不可见**: Agent 无法通过任何工具看到或读取凭据
3. **项目/全局作用域**: 配置拆分为全局（`~/.monika/`）和项目级（`<project>/.monika/`）
4. **自动发现**: 项目打开时扫描 `.cursor/mcp.json`、`.claude/mcp.json`、`mcp.json`
5. **生命周期管理**: 保存/删除/重连贯穿完整的连接/断开周期
6. **向后兼容**: 内联凭据的旧配置在加载时自动迁移

---

## 架构

```
┌─────────────────────────────────────────────────────────┐
│  磁盘                                                    │
│                                                          │
│  ~/.monika/config.json          (全局配置，无凭据)        │
│  ~/.monika/credentials.json     (全局凭据，0600)         │
│                                                          │
│  <project>/.monika/config.json (项目配置，无凭据)        │
│  <project>/.monika/credentials.json (项目凭据，0600)     │
│  <project>/.cursor/mcp.json     (第三方，只读)           │
│  <project>/.claude/mcp.json     (第三方，只读)           │
│  <project>/mcp.json             (第三方，只读)           │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  加载流程                                                 │
│                                                          │
│  1. MigrateInlineCredentials()  ── 剥离内联凭据          │
│  2. 读取全局 config.json                                 │
│  3. 合并项目 config.json (MCP 按 ID 去重)                │
│  4. 加载全局 credentials.json → ApplyCredentialsStore   │
│  5. 加载项目 credentials.json → ApplyCredentialsStore   │
│                                                          │
│  结果: 内存中 Config 已应用凭据，                         │
│        磁盘文件中凭据已剥离                               │
└─────────────────────────────────────────────────────────┘
         │
         ├──────────────────┐
         ▼                  ▼
┌─────────────────┐  ┌──────────────────────────────────┐
│  Wails API      │  │  LLM 工具                        │
│  (给前端)       │  │  (给 agent)                      │
│                 │  │                                  │
│  ListMCPServers │  │  list_mcp_servers                │
│  → 返回 env,    │  │  → 无 Env 字段                   │
│    headers, url │  │  → maskURL() 脱敏 URL 认证       │
│    (用户需要    │  │  → LLM 无法看到凭据               │
│     编辑)       │  │                                  │
└─────────────────┘  └──────────────────────────────────┘
```

---

## 实现细节

### 1. 凭据分离（`internal/config/credentials.go`）

**结构体:**

```go
type CredentialEntry struct {
    Env     map[string]string  // 环境变量
    Headers map[string]string  // HTTP headers
    URLAuth string             // URL 内嵌认证 (user:pass)
}

type CredentialStore struct {
    Entries map[string]CredentialEntry  // 按服务器 ID 索引
}
```

**核心函数:**

| 函数 | 用途 |
|------|------|
| `StripCredentials(entry)` | 从服务器条目移除 `Env`/`Headers`/URL 认证，返回 `CredentialEntry` |
| `ApplyCredentials(entry, cred)` | 将凭据重新注入内存条目 |
| `ApplyCredentialsStore(cfg, store)` | 将所有凭据应用到 Config |
| `SplitURL(rawURL)` → `(clean, auth)` | 基于 regex 的 URL 认证提取（避免 `net/url` 百分号编码问题） |
| `JoinURL(clean, auth)` | SplitURL 的逆操作 |
| `LoadCredentials(path)` | 读取 credentials.json，不存在则返回空 store |
| `SaveCredentials(path, store)` | 原子写入（tmp + rename），0600 权限 |
| `UpdateCredentials(path, id, cred)` | 加载 → upsert → 保存（空时删除文件） |
| `DeleteCredentials(path, id)` | 加载 → 删除条目 → 保存（空时删除文件） |
| `MigrateInlineCredentials(configPath, credPath)` | 一次性迁移：扫描配置内联凭据，剥离到 credentials.json。幂等。 |

**URL 认证提取** 使用 regex `(://)([^/@]+)@` 而非 `net/url`，避免百分号编码边界问题。

### 2. 配置作用域拆分（`internal/api/app.go`）

| 辅助函数 | 返回 |
|---------|------|
| `configPathForScope("global")` | `~/.monika/config.json` |
| `configPathForScope("project")` | `<project>/.monika/config.json` |
| `credentialsPathForScope("global")` | `~/.monika/credentials.json` |
| `credentialsPathForScope("project")` | `<project>/.monika/credentials.json` |
| `normalizeScope(scope)` | 验证，默认 `"project"` |

所有配置写入通过 `writeConfigForScope(scope, mutatorFn)`。

`reloadMergedConfig()` 读取两个作用域，合并（MCP 按 ID 去重：项目覆盖全局），然后应用两个作用域的凭据。

### 3. LLM 数据隐藏

**`list_mcp_servers` 工具**（`internal/tool/builtin/mcp_list.go`）:
- `MCPServerInfo` 结构体**没有 `Env` 字段** —— LLM 永远看不到环境变量
- `maskURL()` 脱敏 URL 凭据：`https://user:pass@host` → `https://***@host`

**`file_read`/`file_edit`/`patch` 黑名单**（`internal/permission/hard_rule.go`）:
- `defaultBuiltinBlacklist()` 拒绝三个工具匹配 `.monika/credentials.json`
- `CheckBuiltinBlacklist()` 使用 `strings.Contains` + 路径归一化（`\` → `/`）而非 `strings.HasPrefix` —— 正确匹配绝对路径

**重要**: MCP 服务器数据有两条独立代码路径：
- **Wails `ListMCPServers()`** → 返回完整数据包括 `Env`/`Headers`/`URL` —— 给**前端 Settings UI**（用户需要查看/编辑自己的凭据）
- **工具 `list_mcp_servers`** → 剥离 `Env`，脱敏 URL —— 给**LLM**（上下文中零敏感数据）

### 4. MCP 自动发现（`internal/mcpdiscovery/mcpdiscovery.go`）

项目打开时，扫描:
- `.cursor/mcp.json`
- `.claude/mcp.json`
- `mcp.json`（项目根目录）

流程:
1. `Scan(projectDir)` → 读取所有文件，解析 `mcpServers` 映射
2. `FilterExisting(servers, configuredIDs)` → 跳过已配置的
3. 每个新服务器：`StripCredentials` → 写入项目配置 → 写入项目凭据
4. `reloadMergedConfig()` → `syncMCPServers()` 连接它们
5. 发射 `mcp-discovered` 事件 → 前端显示 toast 通知

发现是**纯后端** —— 无 LLM 参与。服务器导入到项目作用域。

### 5. MCP 生命周期管理

`app.go` 中四个辅助方法:

| 方法 | 功能 |
|------|------|
| `getMCPEngine()` | 返回初始化的 MCPEngine（减少样板代码） |
| `connectMCPServer(entry)` | 通过 MCPEngine 连接 → ListTools → `mcpRegistry.AddServer()` |
| `disconnectMCPServer(id)` | `MCPEngine.DisconnectServer()` → `mcpRegistry.RemoveServer()` |
| `syncMCPServers()` | 比对 `a.cfg` 与 registry：连接新服务器，断开失效的 |

接入点:
- **`SaveMCPServer`**: 断开旧的 → 保存配置 → 连接新的
- **`DeleteMCPServer`**: 断开 → 从配置删除
- **`ReconnectMCPServer`**: 断开 → 连接（现在注册到 registry）
- **`onProjectSwitch`**: `reloadMergedConfig()` 后调 `syncMCPServers()`
- **`ImportMCPServers`**: reload 后调 `syncMCPServers()`

### 6. 内联凭据自动迁移

`MigrateInlineCredentials(configPath, credPath)`:
1. 读取配置文件（JSON 或 YAML）
2. 对每个 MCP 服务器：调用 `StripCredentials`
3. 如果有凭据被剥离:
   - 重写配置文件（不含敏感信息）
   - 合并凭据到现有 `credentials.json`
4. 幂等 —— 无内联凭据时不操作

调用点:
- `config.Load()` —— 加载前，全局和项目两个作用域
- `reloadMergedConfig()` —— 读取前，两个作用域

### 7. 前端改动

- **作用域选择器**: Add 弹窗有下拉选择 `project` / `global`
- **自动发现 toast**: 监听 `mcp-discovered` Wails 事件，显示发现的服务器名称，自动刷新列表
- **作用域徽章**: ServerCard 显示 project/global 徽章，tooltip 指示存储位置

---

## 变更文件

### 新增文件

| 文件 | 用途 | 测试 |
|------|------|------|
| `internal/config/credentials.go` | 凭据存储: Strip/Apply/Load/Save/Update/Delete + Migrate | — |
| `internal/config/credentials_test.go` | URL split/join、strip/apply 往返、save/load、update/delete、迁移 | 13 个测试 |
| `internal/mcpdiscovery/mcpdiscovery.go` | 扫描第三方 MCP 配置、解析、过滤、格式化 | — |
| `internal/mcpdiscovery/mcpdiscovery_test.go` | Cursor/Claude/root 扫描、去重、过滤、摘要 | 7 个测试 |
| `internal/tool/builtin/mcp_list_test.go` | URL 脱敏测试 | 5 个测试 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `internal/config/config.go` | `Load()`: 迁移 + 凭据加载；`Merge()`: MCP 按 ID 去重 |
| `internal/api/app.go` | 作用域辅助函数、凭据辅助函数、生命周期辅助函数（connect/disconnect/sync）、所有 MCP CRUD 使用 scope+credentials、reload 中迁移、自动发现、`mcp-discovered` 事件 |
| `internal/permission/hard_rule.go` | `defaultBuiltinBlacklist()`、`CheckBuiltinBlacklist()`（Contains + 归一化）、`extractMatchValue()` 增加 `file_read` |
| `internal/agent/agent_loop.go` | 权限检查移到两个工具执行循环的顶部 |
| `internal/tool/builtin/mcp_list.go` | `MCPServerInfo` 移除 `Env`；`maskURL()` |
| `internal/tool/builtin/mcp_install.go` | `scope` 参数 |
| `internal/tool/builtin/mcp_uninstall.go` | `scope` 参数 |
| `main.go` | MCP 启动连接（逻辑不变，读取合并后的配置） |
| `frontend/src/components/Settings/McpTab.tsx` | Add 弹窗的作用域选择器，handleImport 中注入作用域 |
| `frontend/src/store/index.ts` | `mcp-discovered` 事件监听 → toast + 刷新 |

---

## 安全模型

### LLM 能看到的
- MCP 服务器 ID、类型（stdio/http）、命令、参数
- 服务器 URL（认证信息已脱敏 `https://***@host`）
- 连接状态（已连接/已断开）
- 工具数量和名称

### LLM 不能看到的
- 环境变量（`env`）
- HTTP headers（`headers`）
- URL 凭据（`user:pass@`）
- `credentials.json` 的内容（被 `file_read`/`file_edit`/`patch` 黑名单拦截）
- `config.json` 中 MCP 的 `env`/`headers` 字段（保存时已剥离）

### 防护层级
1. **存储层**: 凭据在 `credentials.json`（0600），不在 `config.json`
2. **工具输出层**: `list_mcp_servers` 剥离 `Env`，脱敏 URL
3. **文件访问层**: 黑名单拒绝 `file_read`/`file_edit`/`patch` 访问 `credentials.json`
4. **路径匹配层**: `strings.Contains` + 归一化（非 `HasPrefix`）确保黑名单对绝对路径生效

---

## 向后兼容

- 内联凭据的旧配置继续可用
- `MigrateInlineCredentials` 在每次 `config.Load()` 和 `reloadMergedConfig()` 时透明运行
- 迁移后首次保存自动拆分凭据
- YAML 配置已处理（剥离为 YAML，后续由现有 `migrateToJSON` 转为 JSON）
- `credentials.json` 无条目时自动删除（无孤儿文件）

---

## 已知限制

1. **启动**: `bootstrap.InitProvider` 调用时 `projectDir=""`，启动时仅连接全局 MCP 服务器。项目级服务器在项目打开时通过 `syncMCPServers()` 连接。
2. **Wails `ListMCPServers`** 向前端返回完整凭据 —— 这是有意的（用户需要在 Settings UI 编辑）。安全边界在前端与 LLM 之间，不在磁盘与前端之间。
3. **`TestMCPServerConfig`** 接受前端传来的原始 env/headers 进行连接测试 —— 不持久化，仅用于测试。
4. **`isMCPConnected`** 有 FIXME 注释，使用探测方式检查连接 —— 原有问题，本次重构未处理。
