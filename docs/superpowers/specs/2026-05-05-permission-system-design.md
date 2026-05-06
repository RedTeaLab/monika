# 层级化权限系统设计

> 日期：2026-05-05
> 参考：[竞品分析](../../competitive-analysis-2026-05-02.md) — 2.1 层级化权限系统 + 2.2 ExecPolicy

## 1. 概述

Monika 目前没有运行时权限管控。`confirmFn` 回调已定义但从未设置，`ToolsConfig` 已解析但从未读取。本次设计实现一个三层 Pipeline 权限系统，覆盖所有工具调用。

### 核心决策

| 维度 | 决策 |
|------|------|
| 模式 | 自动（默认）/ 手动，会话级切换，放在模型选择器前面 |
| 架构 | 三层 Pipeline：HardRuleEngine → SecurityModel → InlineConfirmBar |
| 安检范围（自动） | 写操作：bash、file_write、file_edit、task；读操作直接放行 |
| 安检模型 | 独立小模型（Haiku 级别），返回 safe / unsafe |
| 用户确认 | 内联确认栏替代 ChatInput，Allow / Deny / Always Allow |
| 规则存储 | 项目级 `.monika/projects/<slug>/rules.json` |

## 2. 架构

### 2.1 Pipeline 数据流

```
AgentLoop 工具调用前
  │
  ├─ 读操作（file_read / grep / glob）→ 直接放行
  │
  ├─ 写操作（bash / file_write / file_edit / task）→ 进入权限检查
  │
  ├─ 内置黑名单预过滤（所有模式强制生效）
  │    ├─ 命中 deny  → Deny（终止，不可绕过）
  │    └─ 未命中    → 进入模式判断
  │
  ├─ Manual 模式 → 跳过用户规则 + 安检模型 → 直接 InlineConfirmBar
  │
  └─ Auto 模式 → PermissionPipeline
                   ├─ Stage 1: HardRuleEngine（用户规则匹配）
                   │    ├─ 命中 deny  → Deny（终止）
                   │    ├─ 命中 allow → Allow（放行）
                   │    └─ 未命中    → Stage 2
                   ├─ Stage 2: SecurityModel（小模型判断）
                   │    ├─ safe      → Allow（放行）
                   │    └─ unsafe    → Stage 3
                   └─ Stage 3: InlineConfirmBar（内联确认栏）
                        ├─ 拒绝       → Deny
                        ├─ 允许       → Allow
                        └─ 始终允许   → Allow + 写入 rules.json
```

### 2.2 文件拆分

```
internal/permission/
├─ pipeline.go        # Pipeline 编排、模式判断、Stage 串联
├─ hard_rule.go       # 硬规则引擎：前缀匹配、通配符、内置黑名单
├─ security_model.go  # 安检模型调用：小模型判断 safe/unsafe
└─ types.go           # Decision、Mode、Rule、Stage 接口

frontend/src/
├─ components/Chat/ConfirmBar.tsx   # 内联确认栏
├─ components/Settings/             # Settings 全屏页面（目录）
│   ├─ SettingsPage.tsx             # 外壳：侧边栏 + 内容区
│   ├─ PermissionsTab.tsx           # 权限规则列表 + 添加表单
│   ├─ SkillsTab.tsx                # 占位
│   ├─ McpTab.tsx                   # 占位
│   └─ ModelsTab.tsx                # 占位
└─ store/permissionStore.ts         # 确认栏状态、等待用户响应
```

## 3. 内置黑名单（通用预过滤）

内置黑名单在 Pipeline 之前执行，所有模式（Auto / Manual）强制生效，不可绕过。

| 示例 | 说明 |
|------|------|
| `rm -rf /` | 递归根目录删除 |
| `curl \| sh` | 远程脚本管道执行 |
| `chmod 777 /` | 全局权限放宽 |

命中内置黑名单 → 直接 Deny，不进入后续流程。

## 4. Stage 1：HardRuleEngine（用户规则引擎）

### 4.1 规则来源与优先级

| 来源 | 优先级 | 示例 | 可编辑 |
|------|--------|------|--------|
| 用户手动配置 | 高 | Settings 面板添加的规则 | Settings 面板 |
| 弹窗"始终允许" | 低 | 确认栏点"始终允许"生成的规则 | Settings 面板 |

### 4.2 匹配逻辑

- 提取工具名 + 参数（bash 取 command 字段）
- 按优先级遍历规则，首个命中即生效
- 前缀匹配：`npm test` 匹配 `npm test -- --coverage`
- 通配符：`git *` 匹配所有 git 子命令

### 4.3 存储格式

```json
// .monika/projects/<project_slug>/rules.json
{
  "projectSlug": "monika",
  "rules": [
    {
      "tool": "bash",
      "pattern": "npm test",
      "decision": "allow",
      "source": "user_always",
      "createdAt": "2026-05-05T10:30:00Z"
    }
  ]
}
```

内置黑名单在加载时自动注入（不写入文件），排在用户规则前面。

## 4. Stage 2：SecurityModel（安检模型）

### 4.1 设计

- 模型：通过配置文件指定（`.monika/config.yaml` 中 `security_model.provider` + `security_model.model`），默认使用主对话模型的 provider，model 优先选用轻量版本（如 claude-haiku-4-5 / gpt-5.1-nano）。Settings → Models tab 中将增加安检模型配置入口（后续迭代）
- 输入：工具名 + **脱敏后**参数 + 项目类型
- 输出：safe / unsafe（可选简短理由，用于确认栏展示）
- 超时：3 秒，超时降级为 unsafe
- 缓存：使用脱敏后参数的 hash 作为缓存 key，不缓存原始参数

**输入脱敏：** 发送给安检模型前，对参数中的类凭据模式做掩码处理：`--password=***`、`--api-key=***`、`SECRET=***`、`TOKEN=***`、`Bearer ***`、连接字符串 URI 中的密码部分替换为 `***`。

**Prompt 防御：** 使用分隔符（`### USER INPUT ###`）隔离系统指令与用户数据；强制 JSON 格式输出 `{"decision": "safe"|"unsafe"}`，非 JSON 或非法 decision 视为 unsafe；拒绝包含 prompt-injection 特征字符（`[SYSTEM]`、`<|im_start|>` 等伪控制字符）的输入。

### 4.2 降级策略

- 安检模型不可用 → 所有写操作视为 unsafe → 进入 Stage 3
- 安检模型超时 → 视为 unsafe → 进入 Stage 3
- 读操作不受影响

### 4.3 凭证管理

- API key 来源：环境变量 `MONIKA_SECURITY_MODEL_API_KEY`，fallback 到 OS keychain（Windows Credential Manager / macOS Keychain）
- 启动时校验 key 存在且非空，缺失时降级为 unsafe（所有写操作进入 Stage 3）
- 禁止在日志中输出 key，配置文件中不存储明文 key

## 5. Stage 3：InlineConfirmBar（内联确认栏）

### 5.1 位置

确认栏替换 ChatInput 位置（聊天区底部），不遮挡聊天内容。聊天消息保持可见可滚动。

**过渡动画：** ChatInput 区 200ms ease-out 上滑收起 → ConfirmBar 从底部 200ms ease-out 滑入。用户决策后 ConfirmBar 下滑退出，ChatInput 同样动画恢复。

### 5.2 内容

- 标题："确认工具执行"
- 安检理由（auto 模式）："安检模型标记为 unsure" + 风险原因
- 工具名 + 参数（代码块展示，敏感信息脱敏处理）
- 三个按钮：拒绝 / 允许 / 始终允许

**凭据脱敏：** 展示参数前对类凭据模式做掩码处理：`--password=`、`--api-key=`、`SECRET=`、`TOKEN=`、`Bearer ` 等值替换为 `***`。提供眼睛图标点击展示原始值。

### 5.3 按钮行为

| 按钮 | 行为 |
|------|------|
| 拒绝 | 工具不执行，Agent 收到 "denied by user"，需找替代方案 |
| 允许 | 本次放行，不记规则 |
| 始终允许 | 放行 + 写入项目 rules.json（前缀匹配） |

### 5.4 手动模式精简版

Manual 模式下：内置黑名单 pre-filter 仍然生效，但跳过 Stage 1（用户规则）和 Stage 2（安检模型），直接进入 InlineConfirmBar。标题改为"手动模式 — 确认操作"，不展示安检模型理由。

## 6. 模式选择器

- 位置：ChatInput 上方工具栏，模型选择器前面
- 形态：分段控件（segmented control），"Auto" 和 "Manual" 两段，激活段使用强调色填充 + 白色文字，非激活段透明背景。hover tooltip：Auto — "安检模型审查写操作" / Manual — "每步工具调用均需确认"
- 行为见 2.1 Pipeline 数据流

## 7. Settings 页面

**信任模型：** Monika 是单用户本地桌面工具，UI 仅在 localhost 访问。当前用户拥有全部安全决策权，Settings 页面不需要额外的认证/授权层。如需远程访问或多用户支持应在后续迭代中增加 auth 设计。

### 7.1 入口

StatusBar 刷新按钮右侧新增齿轮图标 ⚙，点击进入 Settings 全屏页面。再次点击或 Esc / ← 按钮退出。

### 7.2 布局

- 顶栏：← 返回按钮 + "Settings" 标题
- 左侧导航：Permissions / Skills / MCP / Models（Tab 切换）
- 右侧内容：当前 Tab 对应的配置面板

### 7.3 Permissions Tab（本次实现）

- 规则列表（表格：decision、pattern、tool、source、删除按钮）
- "添加规则"按钮 → 弹出表单，字段：
  - `tool`：下拉选择（bash / file_write / file_edit / task）
  - `pattern`：文本输入，placeholder `npm test` 或 `git *`
  - `decision`：allow / deny 单选
  - `scope`：路径前缀（可选），限制规则作用范围
  - `priority`：数字输入（默认 0），数值越高优先级越高
- 内置规则显示为灰色，不可删除

### 7.4 其他 Tab

Skills、MCP、Models 为占位，后续迭代实现。

## 8. 审计日志

Pipeline 每个 Stage 的决策均记录结构化日志：

```
{stage, tool, mode, decision, rule_matched?, model_verdict?, user_response?, timestamp}
```

- 日志内容：决策结果、工具名、模式、匹配到的规则（如有）、安检模型判断（如有）、用户响应（Stage 3 时）
- 不记录原始工具参数（避免产生二次凭据存储问题），仅记录脱敏后的摘要
- 存储位置：`.monika/projects/<slug>/audit.log`，按大小轮转（10MB 上限）
- 目的：事后追溯、检测异常模式（如连续拒绝可能表明攻击探测）

## 9. AgentLoop 集成

替换现有空壳 `confirmFn` 为 Pipeline 实例：

```go
// agent_loop.go
pipeline *permission.Pipeline  // 替换 confirmFn

// 调用点不变（RunBlocking / runStreaming 中各 1 处）
decision := a.pipeline.Check(ctx, tool, args)
if decision == permission.Deny {
    // 现有 deny 逻辑保持不变
}
```

Pipeline.Check() 在 Stage 3 时发事件给前端并阻塞等待响应。

## 9. 前端事件

```typescript
// 后端 → 前端（Stage 3 触发）
type PermissionRequiredEvent = {
  type: "permission_required"
  sessionId: string        // 目标会话 ID，用于多会话路由
  tool: string             // "bash"
  args: string             // "kubectl apply -f production.yaml"
  reason: string           // "此命令会修改生产环境配置"
  mode: "auto" | "manual"
}

// 前端 → 后端（用户点击按钮）
type PermissionResponse = {
  decision: "allow" | "deny" | "allow_always"
  rule_pattern?: string  // "always allow" 时生成的规则
}
```

## 10. 无障碍与键盘交互

- **ConfirmBar 键盘快捷键：** Esc = 拒绝，Enter = 允许，Ctrl+Enter = 始终允许。ConfirmBar 出现时自动聚焦"允许"按钮
- **焦点管理：** ConfirmBar 关闭后焦点返回 ChatInput
- **Settings 页面 ARIA：** 左侧导航使用 `role="tablist"` / `role="tab"` / `role="tabpanel"` 模式
- **屏幕阅读器：** 工具等待确认时 `aria-live="assertive"` 区域播报"工具 [name] 需要您的确认"
- **响应式断点：** ≤768px 时 Settings 侧边栏折叠为顶部水平 Tab 栏；≤480px 时 ConfirmBar 按钮纵向排列，触控目标最小 44px 高度

## 11. 不在本次范围

- Skills / MCP / Models 配置 Tab（仅占位）
- 规则导入导出
- 沙箱执行（Codex 式 Seatbelt/Landlock）
- 多项目规则共享

## 12. Open Questions（2026-05-05 review）

以下问题在文档审查中识别，留待实现阶段解决：

### 通信机制
- **Q1：前端→后端权限响应通道。** 现有 Wails 只有 Event.Emit 单向。Pipeline.Check() 需要阻塞等待 `PermissionResponse`。建议方案：新增 Wails RPC `App.RespondPermission(requestID, response)`，后端通过 channel 关联请求/响应。
- **Q2：RunBlocking 路径权限支持。** RunBlocking 无事件通道。建议方案：给 RunBlocking 加 event channel 参数；或权限场景下 RunBlocking 降级为 stream 路径。

### 交互状态
- **Q3：SecurityModel 等待期 UI。** 3 秒超时期内，聊天区是否展示"正在评估安全性..."的瞬态指示器？建议在聊天消息流中插入临时 loading 气泡（带取消按钮可选）。
- **Q4：手动模式确认疲劳。** 单次 Agent turn 可能触发数十次 ConfirmBar。建议增加"本次会话全部允许"的批量审批机制，或按工具类型分组确认。

### 配置迁移
- **Q5：旧 ToolsConfig 字段处理。** config.yaml 中 `tools.confirm` 和 `tools.disallow` 已被解析但从未生效。建议：废弃字段，不迁移——因为从未被实际使用过。

### 安全检查
- **Q6：rules.json 防篡改。** 本地单用户桌面工具场景下，文件系统级篡改风险已在信任边界内。建议：首版不做 HMAC 签名，未来如有远程访问需求再加。
