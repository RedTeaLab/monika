# 竞品调查：主流 AI 编程工具特性分析

> 调查日期：2026-05-02
> 调查对象：OpenCode、Hermes Agent、Warp、Claude Code、Codex CLI
> 目标：识别可被 Monika 吸收的特性与能力

---

## 1. 竞品概览

| 维度 | OpenCode | Hermes Agent | Warp | Claude Code | Codex CLI | **Monika (现状)** |
|------|----------|-------------|------|-------------|-----------|-------------------|
| 形态 | TUI + 桌面 + Web | CLI + TUI + 网关 | 终端模拟器 | CLI + IDE 扩展 | CLI + VS Code | **桌面 GUI (Wails)** |
| 核心语言 | Go + Tauri | Python | Rust | TypeScript | Rust | Go + React/TS |
| 开源 | ✅ MIT | ✅ MIT | ✅ | ❌ | ✅ | ❌ (内部) |
| 模型支持 | 75+ | 20+ | 多模型 | Claude only | OpenAI only | DeepSeek + OpenAI |
| MCP | 客户端 | 计划中 | 客户端(Oz) | 客户端+Channel | 客户端+服务端 | 客户端 |
| LSP | ✅ 内置 | ❌ | ✅ 内置 | ❌ | ❌ | ❌ |
| 沙箱 | ❌ | Docker可选 | ❌ | ✅ OS级 | ✅ Seatbelt/Landlock | ❌ |
| 子代理 | ✅ 隔离上下文 | ✅ 并行+不同模型 | ❌ | ✅ 专用子代理 | 通过MCP服务端 | ❌ |
| Skills | 自定义命令 | ✅ 自改进闭环 | 技能规格(Oz) | ✅ SKILL.md | ✅ SKILL.md | ✅ SKILL.md |
| 权限系统 | 工具级 allow/deny/ask | 工具集级 | 细粒度自主性 | 6级权限模式 | 3级+ExecPolicy | 基础确认 |

---

## 2. 值得 Monika 吸收的关键特性

以下按**价值 × 可行性**排序，分为三个优先级。

---

### P0 — 高价值、高可行（建议近期规划）

#### 2.1 层级化权限系统

**参考来源：** Claude Code / Codex / Warp

Monika 目前仅有基础的 bash 确认机制。Claude Code 的 6 级权限模型 (`default → acceptEdits → plan → auto → dontAsk → bypassPermissions`) 和 Codex 的 3 级策略 (`untrusted / on-request / never`) 提供了成熟参考。

**建议方案：**
```
off → ask-each → accept-readonly → accept-edits → auto → bypass
```
- 每个工具独立可配：`file_read`、`file_write`、`bash`、`grep`、`glob`
- 支持通配符规则（如 `bash(npm test *)` 自动允许）
- Bash 工具增加危险命令黑名单（curl/wget/nc/rm -rf 等）

**Monika 优势：** 桌面 GUI 天然支持可视化的权限配置面板，比 CLI 工具的 JSON 配置更直观。

---

#### 2.2 ExecPolicy / 命令策略引擎

**参考来源：** Codex CLI

Codex 的 Starlark 策略引擎是目前最精细的命令级安全控制方案。规则可以匹配命令前缀、解析可执行文件路径、产生三级决策 (`allow / prompt / forbidden`)。

```
prefix_rule(pattern = ["git", "push", "--force"], decision = "forbidden")
prefix_rule(pattern = ["npm", "test"], decision = "allow")
prefix_rule(pattern = ["rm"], decision = "prompt")
```

**建议方案：** 用 Go 实现一个轻量级规则引擎（正则/前缀匹配即可，不需要完整的 Starlark），配合 Monika 的桌面 UI 提供可视化的规则编辑器。

---

#### 2.3 子代理系统（Subagents）

**参考来源：** Claude Code / OpenCode / Hermes

所有主流竞品都已支持子代理。Claude Code 的子代理最成熟——定义在 `.claude/agents/` 下，有独立的工具集和模型，agent 自动判断何时 delegate。

OpenCode 子代理的特点是**完全隔离上下文**——主代理必须提供完整 prompt，子代理不继承任何上下文，防止上下文污染。

Hermes 支持**并行扇出**——同时启动多个子代理且使用不同模型。

**建议方案：**
- 后端：`internal/agent/subagent/` — 独立 context、可配置工具集、可选不同 model
- 工具：新增 `task` 工具（语义优于 agent/delegate），允许主代理委托子任务
- 前端：在 TodoPanel 旁展示活跃子代理状态（spinner + 描述）
- 限制：子代理 context 隔离（类似 OpenCode），最大并发数限制

---

#### 2.4 Agent Hooks / 生命周期插件

**参考来源：** Claude Code（最成熟）、Hermes、OpenCode

Claude Code 的 Hook 系统是**所有竞品中最强大**的——5 种 hook 类型 (command/http/mcp_tool/prompt/agent)、12+ 生命周期节点。

```
SessionStart → UserPromptSubmit → PreToolUse → PostToolUse → ... → SessionEnd
```

**对 Monika 最有价值的 hook 节点：**
| Hook 点 | 用途 | 参考 |
|---------|------|------|
| `PreToolUse(bash)` | 危险命令拦截 | Claude Code |
| `PostToolUse(file_edit)` | 自动 gofmt/prettier | Claude Code |
| `SessionStart` | 注入项目上下文 | Claude Code |
| `PostToolUseFailure` | 错误自愈逻辑 | Claude Code |
| `on_session_end` | 持久化 + 通知 | Hermes |

**建议方案：** 配置文件驱动（`.monika/hooks.yaml`），初期支持 `command` 类型 hook，后续扩展到 `http` 和内置 agent。

---

#### 2.5 LSP 集成

**参考来源：** OpenCode、Warp

OpenCode 将 LSP 诊断为 **agent 可调用的工具**（diagnostics tool），agent 可以在编辑后自动获取编译/类型错误并自我修正。Warp 则把 LSP 集成到内置编辑器中，提供 hover/go-to-definition。

**建议方案：** Monika 已有 CodeMirror 6 编辑器，可以：
1. 启动 LSP server（gopls、typescript-language-server）作为后台进程
2. 暴露 `diagnostics` 工具给 agent（读取当前文件的错误/警告）
3. 在 FileEditor 中显示诊断（CodeMirror 6 原生支持 lint 扩展）
4. Agent 编辑文件后自动请求诊断 → 发现错误 → 自我修正

---

### P1 — 高价值、中等可行（建议中期规划）

#### 2.6 自动化记忆系统

**参考来源：** Claude Code、Hermes

Claude Code 的 auto-memory 和 Hermes 的 FTS5 + LLM 摘要组合是两种互补方案：

- **Claude Code：** 按类别（user/feedback/project/reference）自动保存到 MEMORY.md 索引文件，前端带 YAML frontmatter
- **Hermes：** SQLite FTS5 全文搜索历史会话 + LLM 摘要注入当前上下文，以及 Honcho 用户建模（多轮辩证推理构建用户画像）

**建议方案：** 结合两者优势：
- Session JSON 中提取关键决策/偏好 → 写入 `.monika/memory/` 分类文件
- Session 切换/启动时注入相关记忆到 system prompt
- 前端增加 Memory 面板展示已学习的内容

---

#### 2.7 自定义斜杠命令

**参考来源：** OpenCode

OpenCode 的自定义命令系统非常灵活——定义在 `opencode.json` 或 Markdown 文件中，支持 `$ARGUMENTS` 占位符、agent/model 覆盖、描述和模板。

```json
{
  "commands": {
    "/test": {
      "prompt": "Run tests for the current package and fix any failures",
      "description": "Run tests and fix failures",
      "agent": "build"
    }
  }
}
```

**建议方案：** `.monika/commands/` 目录，用户定义 `name.md` 文件（YAML frontmatter + Markdown body），在 ChatInput 中通过 `/` 触发补全。

---

#### 2.8 Web 搜索与抓取工具

**参考来源：** Claude Code、OpenCode

Claude Code 的 `WebSearch` + `WebFetch` 工具让 agent 能够搜索最新文档和 API 用法。这对编程场景的价值在于：模型训练截止日期后的新库、API 变更、错误信息搜索。

**建议方案：** 
- `web_search` 工具：调用搜索 API（Bing/Google/SerpAPI）
- `web_fetch` 工具：抓取 URL 内容转 Markdown
- 可选功能，需用户配置 API key

---

#### 2.9 Thread Fork / 会话分支

**参考来源：** Codex CLI

Codex 支持在任意消息点 fork 会话线程，探索替代方案而不丢失原始上下文——就像 git branch 之于代码。

**建议方案：** Monika 的多 Tab 会话已经具备基础。可以增加：
- "Fork from here" 按钮（某条消息的分支图标）
- Fork 出的会话独立运行，元数据记录 `forkedFrom: sessionId + messageIndex`
- 前端展示 fork 关系树

---

#### 2.10 GPU 加速渲染与 Warp 式 Blocks

**参考来源：** Warp

Warp 的 Blocks 概念——将每个命令和输出打包为一个 Block，Block 可作为 agent 聊天的上下文单元——这个模式对 Monika 的 Console 面板有启发。虽然不是 GPU 渲染（Monika 是 WebView2），但 Blocks 作为上下文原子单元的设计值得借鉴。

**建议方案：** Console 面板中的每条命令输出作为一个"引用块"，用户可以：
- 点击引用块将其附加到当前会话消息中
- Agent 可以引用特定 Block ID 获取命令输出

---

### P2 — 高价值但需较大投入（建议长期观察）

#### 2.11 沙箱执行

**参考来源：** Codex (Seatbelt/Landlock)、Claude Code (OS-level)

Codex 的三级沙箱是行业标杆：`read-only → workspace-write → danger-full-access`，在 macOS 使用 Apple Seatbelt、Linux 使用 Landlock、Windows 使用内置沙箱。

**分析：** Monika 是 Windows 优先的桌面应用（Wails/WebView2），Windows 沙箱 API 复杂度高。建议优先级低于其他特性，可以先通过：
- 简单的路径约束（已有）
- 危险命令拦截（P0）
- ExecPolicy 引擎（P0）
来覆盖大部分安全需求。

---

#### 2.12 MCP 服务端模式

**参考来源：** Codex CLI

Codex 可以同时作为 MCP 客户端和服务端运行——其他 agent 可以通过 MCP 调用 Codex 作为编码工具。这种双向 MCP 的设计让 Codex 可以嵌入多 agent 编排框架。

**分析：** Monika 已实现 MCP 客户端。服务端模式的价值在于让 Monika 成为多 agent 系统中的"执行器"，但这需要 agent 间协调协议，投入较大。

---

#### 2.13 Hermes 式自改进 Skill 闭环

**参考来源：** Hermes Agent

Hermes 的 skill 系统是唯一实现**自主创建 + 使用中自我改进 + 后台策展**的闭环学习系统。Agent 完成任务后 fork 一个审查进程，用评分标准（rubric-based grading）评估技能质量，自动归档过时技能。

**分析：** 这是 Hermes 最独特的创新，但需要大量的工程投入（后台策展进程、评分标准、重复检测），目前对 Monika 来说性价比不高。可以等社区积累更多实践经验后再考虑。

---

#### 2.14 多平台消息网关

**参考来源：** Hermes Agent

Hermes 支持 Telegram、Discord、Slack、WhatsApp、Signal、Matrix、Email、Home Assistant 的统一消息网关——用户可以在任何平台上与 agent 对话并获得完整的工具访问。

**分析：** 这个方向与 Monika 的"桌面编辑器"定位有偏差。Monika 的价值在于 GUI 的直观性和沉浸感，消息网关更适合作为独立功能或 MCP 集成。

---

## 3. 竞品对比矩阵

| 特性 | Monika | Claude Code | Codex | OpenCode | Hermes | Warp |
|------|--------|-------------|-------|----------|--------|------|
| 桌面 GUI | ✅ 原生 | ❌ CLI | ❌ CLI | 🟡 TUI | ❌ CLI | ✅ GPU终端 |
| 多模型 | ✅ | ❌ 仅Claude | ❌ 仅OpenAI | ✅ 75+ | ✅ 20+ | ✅ |
| Task Planning | 🟡 设计中 | ✅ | ✅ update_plan | ✅ todowrite | ❌ | ✅ |
| Session Compaction | 🟡 设计中 | ✅ auto | ✅ compaction API | ✅ auto | ❌ | ❌ |
| 权限系统 | 🟡 基础 | ✅ 6级 | ✅ 3级+ExecPolicy | ✅ 工具级 | ✅ 工具集级 | ✅ 细粒度 |
| Hooks | ❌ | ✅ 5类型12+节点 | 🟡 notify | ✅ | ✅ 6钩子 | ❌ |
| 子代理 | ❌ | ✅ | 🟡 MCP服务端 | ✅ 隔离上下文 | ✅ 并行+多模型 | ❌ |
| Sandbox | ❌ | ✅ OS级 | ✅ Seatbelt/Landlock | ❌ | 🟡 Docker可选 | ❌ |
| LSP | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| MCP | ✅ 客户端 | ✅ 客户端+Channel | ✅ 客户端+服务端 | ✅ 客户端+OAuth | ❌ | ✅ 客户端 |
| Memory | 🟡 会话JSON | ✅ auto+episodic | ❌ | ❌ SQLite存储 | ✅ FTS5+用户建模 | 🟡 Drive |
| Web Search | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ |
| 自定义命令 | ❌ | ✅ Slash Commands | ❌ | ✅ | ✅ | ❌ |
| IDE扩展 | N/A (自身即IDE) | VS Code/JetBrains | VS Code | ❌ | 🟡 ACP协议 | N/A (终端) |
| 会话分支 | ❌ | ❌ | ✅ Thread Fork | ❌ | ❌ | ❌ |
| Skills | ✅ SKILL.md | ✅ SKILL.md | ✅ SKILL.md | ✅ 自定义命令 | ✅ 自改进 | 🟡 技能规格 |
| 浏览器控制 | ❌ | ✅ Chrome Beta | ❌ | ❌ | ✅ browser工具 | ❌ |

---

## 4. 差异化分析：Monika 的独特优势

在调查竞品的过程中，发现 Monika 有一些**天然优势**是当前竞品不具备或较弱的：

### 4.1 桌面 GUI 是结构性优势

所有主流竞品（除 Warp 外）都是**终端优先**的。Monika 作为 Wails 桌面应用拥有：
- 多面板布局（Session List / Chat / FileTree / FileEditor / Console / StatusBar）天然优于终端的单视图
- 可视化权限配置、可视化 Task Plan、可视化 Diff ——这些在终端里很别扭
- 原生文件树 + CodeMirror 编辑器的集成深度超过任何竞品
- 拖拽分割面板、Tab 切换——这些交互终端做不到

### 4.2 Go 后端 + React 前端是优秀的架构选择

- Go 的工具执行性能（无 GIL、原生并发）
- React + Zustand 的状态管理成熟度
- Wails v3 的 WebView2 跨平台能力
- CodeMirror 6 的编辑器能力是顶级的

### 4.3 竞品的真正弱项

- **OpenCode：** TUI 在 Windows 上体验差（官方推荐 WSL）
- **Hermes：** Unix domain socket 依赖导致 Windows 受限
- **Claude Code：** 无桌面 GUI，IDE 扩展也只是辅助
- **Codex：** 仅 OpenAI 模型，贡献受限，Linux 沙箱依赖内核版本
- **Warp：** 是终端而非编辑器，没有文件树/编辑器深度集成

---

## 5. 行动建议

### 近期（本月）

1. **权限系统升级**：在 `internal/agent/` 增加 per-tool 权限配置，前端增加可视化权限面板
2. **ExecPolicy 轻量版**：Go 实现的规则引擎 + `.monika/rules.yaml`
3. **AGENTS.md 注入**：在 system prompt 编译时读取项目根 `AGENTS.md` 并注入上下文（对标 Claude Code 的 CLAUDE.md 机制）
4. **Web Search 工具**：`web_search` + `web_fetch`，作为可选功能

### 中期（Q2-Q3）

5. **子代理系统**：`task` 工具 + 隔离 context + TodoPanel 状态展示
6. **LSP 集成**：`diagnostics` 工具 + CodeMirror lint 扩展
7. **Hooks 系统**：YAML 配置驱动，`PreToolUse` + `PostToolUse` + `SessionStart/End`
8. **自定义斜杠命令**：`.monika/commands/*.md` + ChatInput `/` 补全

### 长期（观察后再决定）

9. 沙箱执行（Codex 式 Seatbelt/Landlock）
10. MCP 服务端模式
11. 自动化记忆与用户建模
12. 自改进 Skill 闭环
13. 多平台消息网关

---

## 6. 参考资料

- [OpenCode 官方文档](https://opencode.ai/docs)
- [Hermes Agent GitHub](https://github.com/nousresearch/hermes-agent)
- [Warp 文档](https://docs.warp.dev)
- [Claude Code 官方文档](https://code.claude.com/docs)
- [Codex CLI GitHub](https://github.com/openai/codex)
