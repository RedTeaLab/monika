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
- **切换分支**：点击 TitleBar 分支名 → 弹出分支下拉（本地 + 远程）→ 选择分支 → checkout。
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
| 分支切换失败 | console 输出错误，不关闭下拉 |
| FileDialog 空目录 | 显示 "." 和 ".." 以及空状态提示 "No subdirectories" |

## 后端变更

### 新增 API 方法

所有方法注册到 `api.App` 服务，自动生成前端 bindings。

| 方法 | 签名 | 职责 |
|---|---|---|
| `GetRecentProjects` | `() => []RecentProject` | 读取 `~/.monika/recent.json`，按 `openedAt` 降序返回，上限 20 |
| `ListBranches` | `(projectPath: string) => []BranchInfo` | 执行 `git branch -a`，解析为本地和远程分支列表 |
| `CreateBranch` | `(projectPath, name, baseBranch: string) => error` | 执行 `git checkout -b <name> <baseBranch>` |
| `SwitchBranch` | `(projectPath, name: string) => error` | 执行 `git checkout <name>`，更新内存中的 branch 信息 |
| `ListDirectory` | `(parentPath: string) => []DirEntry` | 列出指定目录下的子目录和文件，供 FileDialog 导航用 |

### 修改现有方法

**`OpenProject`**：成功打开项目后，追加写入 `~/.monika/recent.json`：
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

type DirEntry struct {
    Name  string `json:"name"`
    IsDir bool   `json:"is_dir"`
    Path  string `json:"path"`
}
```

### 分支切换保障

- `SwitchBranch` 在执行 `git checkout` 前先 `git status --porcelain` 检查工作区状态——若有未提交更改，返回错误 `"working tree is dirty"`。不对未提交更改做自动处理。
- `CreateBranch` 执行前同样检查工作区状态，dirty 时拒绝操作。

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
- 目录列表（仅显示目录，过滤文件）
- ".." 回到上级目录
- 底部 Cancel / Open 按钮
- 支持双击目录进入、Enter 确认选中

### 确认对话框

复用现有 `ConfirmModal` 组件（`confirmLabel` prop 已就绪）：

- **项目切换有 unsaved**：`confirmLabel="Discard"`，文案 "You have N unsaved files. Switching projects will lose unsaved changes."
- **项目切换有生成中**：`confirmLabel="Discard"`，文案 "A session is generating a response. Switching projects will interrupt it."

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
| `resetProjectState` | `() => void` | 清空所有会话、文件、消息状态 |

现有操作修改：

- `setProjectPath` — 同时触发 `loadBranches()`
- `setBranch` — 纯状态，不变

### 项目切换流程

```
用户选择目标项目
  → 检查 openFiles[].isDirty || generatingSessionId !== ''
    → 有 → ConfirmModal → 用户取消 → 中止
    → 用户确认 / 无 → 继续
  → App.OpenProject(newPath)                [后端：git解析 + recent.json写入]
  → resetProjectState()                     [前端：清空 store 所有瞬态]
  → setProjectPath(newPath) + setBranch(newBranch)
  → loadBranches() + loadRecentProjects()
```

## 设计决策

### FileDialog 实现为应用内组件而非调用 OS 原生对话框

原因：
- Wails v3 不提供原生文件夹选择器 API
- 应用内实现可与 Monika 主题一致，避免平台风格差异
- `ListDirectory` 复用后端的文件系统访问能力（对标已有 `ListFileTree`）

### 分支操作不支持 stash/merge，仅支持 checkout

原因：
- 分支切换的基础场景是切换上下文（如从 main 切到 feature 分支）
- stash/merge 涉及复杂的状态管理，超出当前范围
- 工作区 dirty 时返回错误，用户需自行处理（git 命令行或其他工具）

### 最近项目仅记录 git 仓库

原因：
- Monika 是 coding editor，非通用文件编辑器
- 非 git 目录不需要出现在最近列表中

## 影响范围

| 文件 | 变更 |
|---|---|
| `internal/api/app.go` | 新增 `GetRecentProjects`、`ListBranches`、`CreateBranch`、`SwitchBranch`、`ListDirectory`；`OpenProject` 追加 recent.json 写入 |
| `internal/api/types.go` | 新增 `RecentProject`、`BranchInfo`、`DirEntry` 类型 |
| `frontend/src/components/TitleBar/TitleBar.tsx` | 项目名/分支名 span → button，管理 dropdown 状态，集成新组件 |
| `frontend/src/components/TitleBar/ProjectDropdown.tsx` | 新增：最近项目下拉 |
| `frontend/src/components/TitleBar/BranchDropdown.tsx` | 新增：分支列表下拉 |
| `frontend/src/components/TitleBar/CreateBranchPanel.tsx` | 新增：创建分支表单 |
| `frontend/src/components/TitleBar/FileDialog.tsx` | 新增：应用内文件浏览器 |
| `frontend/src/store/index.ts` | 新增 `recentProjects`、`allBranches`、`loadRecentProjects`、`loadBranches`、`resetProjectState` |
