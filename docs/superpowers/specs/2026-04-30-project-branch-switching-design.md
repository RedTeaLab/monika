# 项目/分支切换 — 设计文档

## 动机

当前 Monika 启动时固定使用 cwd 作为项目路径，分支也仅在启动时读取一次。用户无法：

- 在 Monika 内切换到其他项目（必须重启应用）
- 切换 git 分支（必须离开 Monika 用外部工具操作）
- 查看最近打开的项目、快速在不同项目间跳转

TitleBar 中的项目名和分支名目前仅为静态文本展示，需改造为可交互的下拉菜单。

## 用户交互

- **切换项目**：点击 TitleBar 项目名 → 弹出最近项目下拉 → 选择项目 → 若有未保存文件或生成中的会话则弹窗确认 → 切换（清空所有标签/状态 → `OpenProject` → 重新初始化）。
- **打开新项目**：下拉底部点击 "Open New Project..." → 应用内 FileDialog 选择目录 → 同切换流程。
- **切换分支**：点击 TitleBar 分支名 → 弹出分支下拉（本地 + 远程）→ 选择分支 → checkout → 对有 `openFiles` 中仍存在的文件，调用 `ReadFile` 重新加载内容；对已不存在的文件，关闭对应 tab。有未保存（`isDirty`）的文件时，询问用户是否在 checkout 前放弃更改。
- **创建分支**：下拉底部点击 "New Branch..." → 输入分支名 + 选择基准分支 → 创建并切换。
- **关闭下拉**：点击外部区域或按 Esc。

### 状态覆盖

| 场景 | 行为 |
|---|---|
| 下拉打开中 | 项目/分支名高亮（`--accent` 色），箭头旋转 180° |
| 最近项目为空 | 下拉仅显示 "Open New Project..." 入口 |
| 非 git 目录 | 分支名显示 "—"，点击无下拉，仅 tooltip "Not a git repository" |
| 项目切换有 unsaved | ConfirmModal "有 N 个未保存的文件，切换项目将丢失更改" → Discard / Cancel |
| 项目切换有生成中 | ConfirmModal "有会话正在生成回复，切换项目将中断生成" → Discard / Cancel |
| 分支切换失败 | BranchDropdown 内显示内联红色错误文本，不关闭下拉 |
| 创建分支失败 | CreateBranchPanel 内显示内联红色错误文本 |
| FileDialog 空目录 | 显示 "." 和 ".." 以及空状态提示 "No subdirectories" |
| ProjectDropdown 加载中 | 显示 3 条 skeleton 占位项（灰色脉冲动画） |
| BranchDropdown 加载中 | 显示 3 条 skeleton 占位项 |
| FileDialog 加载中 | 目录列表区域显示 skeleton 占位项 |
| GetRecentProjects 失败 | ProjectDropdown 内显示错误文本 + 重试按钮 |
| ListBranches 失败 | BranchDropdown 内显示错误文本 |
| ListDirectory 失败 | FileDialog 目录列表区域显示错误文本（如 "Cannot read directory: Permission denied"） |
| OpenProject 失败 | 内联错误提示或 toast，不切换状态 |
| 最近项目路径已不存在 | 该项灰显 + tooltip "Directory not found"，点击无效 |

## 后端变更

### 新增 API 方法

所有方法注册到 `api.App` 服务，自动生成前端 bindings。

| 方法 | 签名 | 职责 |
|---|---|---|
| `GetRecentProjects` | `() => []RecentProject` | 读取 `~/.monika/recent.json`，按 `openedAt` 降序返回，上限 20。JSON 解析失败时返回空列表并 log 警告（不崩溃）。读取时校验每条路径存在且为目录，过滤无效条目。写入使用原子写（写 temp + rename）防止并发损坏 |
| `ListBranches` | `(projectPath: string) => []BranchInfo` | 执行 `git branch -a`，解析为本地和远程分支列表 |
| `CreateBranch` | `(projectPath, name, baseBranch: string) => error` | 执行 `git checkout -b <name> <baseBranch>` |
| `SwitchBranch` | `(projectPath, name: string) => error` | 若 `name` 以 `origin/` 等远程前缀开头，执行 `git checkout -b <local-name> <remote>` 创建本地跟踪分支；否则执行 `git checkout <name>`。`<local-name>` 取远程引用最后 `/` 之后的部分（如 `origin/feat/x` → `feat/x`）。更新内存中的 branch 信息 |
| `ListDirectory` | `(parentPath: string) => []FileNode` | 列出指定目录下的子目录和文件（非递归，仅一层），供 FileDialog 导航用。复用已有 `FileNode` 类型（`Children` 和 `Status` 字段置零/省略） |

### 修改现有方法

**`OpenProject`**：签名改为 `(path: string) => ProjectInfo`（原为 `error`）。成功打开项目后：
- 返回 `ProjectInfo{ path, branch }` 供前端直接使用，避免前端另行解析分支名
- 追加写入 `~/.monika/recent.json`：
  - 若 path 已存在，更新 `openedAt` 时间戳并移到首位
  - 若不存在，插入到首位；若超过 20 条则截断
  - 只写入被 git 管理的目录（`git rev-parse --show-toplevel` 返回有效路径）

### 数据结构

```go
type RecentProject struct {
    Path    string `json:"path"`
    Name    string `json:"name"`
    OpenedAt int64  `json:"opened_at"`
}

type BranchInfo struct {
    Name   string `json:"name"`
    Remote string `json:"remote"` // 空字符串 = 本地分支
}

```
`ListDirectory` 复用已有 `FileNode` 类型（`internal/api/file_service.go`），无需新增 `DirEntry`。

### Git 命令安全

所有 git 命令必须遵循以下安全实践：
- 使用 `exec.Command("git", "checkout", "--", name)` 形式，通过 `--` 分隔符防止分支名被误解析为选项（如名为 `--help` 的分支）
- 分支名输入校验：拒绝包含空格、控制字符（`\n`、`\r`、`\x00`）、shell 元字符（`` ` ``、`$`、`;`、`|`）以及以 `-` 开头的名称
- 禁止使用 shell 方式拼接命令（`sh -c "git checkout $name"`），仅使用 argv 数组形式
- `projectPath` 需校验为绝对路径后再用作 `cmd.Dir`

### 分支切换保障

- `SwitchBranch` 直接执行 `git checkout <name>`，依赖 git 自身的原子检查——git 在检出前会在同一进程中检查工作区状态，不存在 TOCTOU 竞态。若工作区有未提交更改且与目标分支冲突，git 返回非零退出码及描述性错误信息，后端将其透传。
- 若 `git checkout` 失败（dirty tree 冲突），后端返回错误，前端在 BranchDropdown 内以内联错误文本展示（红色文字，如 "Cannot switch: your local changes would be overwritten"），**不**关闭下拉。仅使用 `console.error` 不可见。
- 对 dirty tree 场景，后续版本可考虑 `--merge` 三路合并策略或 auto-stash 流程以降低使用门槛。当前版本不自动处理未提交更改。
- `CreateBranch` 同理——直接执行 `git checkout -b <name> <base>`，依赖 git 自身的冲突检测；失败时前端同样以内联错误展示。

## 前端变更

### 组件结构

```
components/TitleBar/
├── TitleBar.tsx              (修改：项目名/分支名变为触发器)
├── ProjectDropdown.tsx       (新增：最近项目列表 + Open 入口)
├── BranchDropdown.tsx        (新增：分支列表 + New Branch 入口)
├── CreateBranchPanel.tsx     (新增：创建分支表单)
└── FileDialog.tsx            (新增：应用内目录浏览器)
```

### TitleBar 修改

项目名和分支名从 `<span>` 变为可交互 trigger：
- 点击展开对应 dropdown
- 箭头图标（`▾`），展开时旋转 180°
- 触发状态传递到子组件（`isOpen`、`onToggle`）

### ProjectDropdown

- 门户渲染（`createPortal`），定位在 trigger 下方左对齐
- `min-width: 260px`，`max-height: 360px`
- 列表项：项目名 + 路径（灰色小字），当前项目显示 `✓ active`
- 底部固定 "Open New Project..." 按钮
- 键盘导航：↑↓ 移动焦点，Enter 选择，Esc 关闭
- 点击外部关闭（`useEffect` + document `mousedown` listener）

### BranchDropdown

- 分组显示：本地分支（"Local Branches" header）+ 远程分支（"Remote Branches" header）
- 当前分支高亮 + `✓` 标记
- 远程分支选择时：自动 checkout 为本地分支（`git checkout -b <local-name> origin/<remote>`）
- 底部固定 "New Branch..." 按钮
- 点击 "New Branch..." → BranchDropdown 内部切换为 CreateBranchPanel

### CreateBranchPanel

- 替换 BranchDropdown 内容（非新弹窗）
- 输入框：分支名（placeholder "Branch name"）
- 下拉选择：基准分支（来自 `ListBranches` 结果，当前分支默认选中）
- 按钮：Cancel（返回 BranchDropdown）/ Create & Switch
- 输入为空时 Create 按钮 disabled

### FileDialog

- 模态弹窗，居中显示，`width: 480px`，`height: 360px`
- 顶部标题 "Open Project"
- 路径输入框（可手动输入完整路径，也可用于过滤）
- 目录列表（`ListDirectory` 返回所有条目，前端按 `isDir` 过滤仅展示目录）
- ".." 回到上级目录
- 底部 Cancel / Open 按钮
- 支持双击目录进入、Enter 确认选中

### 确认对话框

复用现有 `ConfirmModal` 组件（`confirmLabel` prop 已就绪）：

- **项目切换有 unsaved**：`confirmLabel="Discard"`，文案 "You have N unsaved files. Switching projects will lose unsaved changes."
- **项目切换有生成中**：`confirmLabel="Discard"`，文案 "A session is generating a response. Switching projects will interrupt it."
- **同时有 unsaved + 生成中**：`confirmLabel="Discard"`，文案 "You have N unsaved files and a session is generating. Switching projects will discard changes and interrupt generation."（合并两个条件，一次确认）

### Store 变更

新增字段：

```typescript
recentProjects: RecentProject[]  // 最近项目列表，来自 GetRecentProjects
allBranches: BranchInfo[]         // 当前项目的所有分支，来自 ListBranches
```

新增操作：

| 操作 | 签名 | 职责 |
|---|---|---|
| `loadRecentProjects` | `() => Promise<void>` | 从后端获取最近项目列表 |
| `loadBranches` | `() => Promise<void>` | 从后端获取当前项目分支列表 |
| `resetProjectState` | `() => void` | 清空项目相关瞬态：`openSessions`、`sessionMessages`、`openFiles`、`messages`、`generatingSessionId`、`tokenCount`、`activeSessionId`、`activeFilePath`、`consoleLines`。**保留**：`layoutMode`、`splitRatio`（用户布局偏好跨项目持久）。同时调用 `App.CancelGeneration()` 取消旧项目的后台生成 |

现有操作修改：

- `setProjectPath` — 纯状态设置，不触发副作用（`loadBranches()` 由调用方在流程中显式调用）
- `setBranch` — 纯状态设置，不触发副作用

### 项目切换流程

```
用户选择目标项目
  → 检查 openFiles[].isDirty 或 generatingSessionId !== ''
    → 根据命中的条件选择 ConfirmModal 文案（仅 unsaved / 仅生成中 / 两者皆有）
    → 有 → ConfirmModal → 用户取消 → 中止
    → 用户确认 / 无 → 继续
  → 若 generatingSessionId 非空 → App.CancelGeneration(sessionId)   [取消正在进行的生成]
  → projectInfo = App.OpenProject(newPath)                         [后端：git解析 + recent.json写入，返回 ProjectInfo { path, branch }]
  → resetProjectState()                                            [前端：清空 store 所有瞬态]
  → setProjectPath(projectInfo.path) + setBranch(projectInfo.branch)
  → loadBranches() + loadRecentProjects()
```

`OpenProject` 方法签名从 `(path: string) => error` 改为 `(path: string) => ProjectInfo`，
返回解析后的项目路径和当前分支名（而非 void）。

## 设计决策

### FileDialog 实现为应用内组件而非调用 OS 原生对话框

原因：
- Wails v3 的 `Dialogs.OpenFile` 配合 `CanChooseDirectories: true` 可调用原生 OS 文件夹选择器，但应用内实现可与 Monika 深色主题一致，避免各平台原生对话框风格差异
- `ListDirectory` 复用后端的文件系统访问能力（对标已有 `ListFileTree`）

### 分支操作不支持 stash/merge，仅支持 checkout

原因：
- 分支切换的基础场景是切换上下文（如从 main 切到 feature 分支）
- stash/merge 涉及复杂的状态管理，超出当前范围
- 工作区 dirty 时返回错误，用户需自行处理（git 命令行或其他工具）
- 后续版本可考虑 `git checkout --merge` 策略或 auto-stash 流程，降低 dirty tree 场景下的使用摩擦

### 最近项目仅记录 git 仓库

原因：
- Monika 是 coding editor，非通用文件编辑器
- 非 git 目录不需要出现在最近列表中

## 影响范围

| 文件 | 变更 |
|---|---|
| `internal/api/app.go` | 新增 `GetRecentProjects`、`ListBranches`、`CreateBranch`、`SwitchBranch`、`ListDirectory`；`OpenProject` 追加 recent.json 写入 |
| `internal/api/types.go` | 新增 `RecentProject`、`BranchInfo` 类型（`ListDirectory` 复用已有 `FileNode`） |
| `frontend/src/components/TitleBar/TitleBar.tsx` | 项目名/分支名 span → button，管理 dropdown 状态，集成新组件 |
| `frontend/src/components/TitleBar/ProjectDropdown.tsx` | 新增：最近项目下拉 |
| `frontend/src/components/TitleBar/BranchDropdown.tsx` | 新增：分支列表下拉 |
| `frontend/src/components/TitleBar/CreateBranchPanel.tsx` | 新增：创建分支表单 |
| `frontend/src/components/TitleBar/FileDialog.tsx` | 新增：应用内文件浏览器 |
| `frontend/src/store/index.ts` | 新增 `recentProjects`、`allBranches`、`loadRecentProjects`、`loadBranches`、`resetProjectState` |
