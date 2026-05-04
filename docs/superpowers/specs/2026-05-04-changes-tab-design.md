# Changes Tab Design

## Overview

在文件面板（`filetree-group`）中新增 "CHANGES" 标签页，展示所有已修改文件的增删行数统计，点击后在编辑器中以 Diff 模式打开。

## 后端

### 新类型 `ChangeStat` (`internal/api/types.go`)

```go
type ChangeStat struct {
    Path    string `json:"path"`
    Added   int    `json:"added"`
    Deleted int    `json:"deleted"`
}
```

### 新方法 `ListChangeStats` (`internal/api/file_service.go`)

- 执行 `git diff --numstat`，输出格式为 `added\tdeleted\tpath`
- 逐行解析为 `[]ChangeStat`
- 跳过空行、字段不足的行、`added` 和 `deleted` 都为 0 的行（二进制文件 numstat 返回 `- - path`）
- 非 git 仓库时返回空列表（不报错）
- 预估 20 行

### App 暴露 (`internal/api/app.go`)

```go
func (a *App) ListChangeStats(projectPath string) ([]ChangeStat, error) {
    fs := a.getFileService(projectPath)
    return fs.ListChangeStats()
}
```

### Wails bindings

自动生成 `App.ListChangeStats()` 和对应的 `ChangeStat` 类型。

## 前端

### ChangesList 组件 (`frontend/src/components/ChangesList/ChangesList.tsx`)

Dockview panel 组件，接受 `IDockviewPanelProps`。

**数据获取**：
- 挂载时调用 `App.ListChangeStats(projectPath)` 获取变更列表
- 监听 `fileTreeVersion` 变化（`file_changed` / `done` 流事件触发）实时刷新

**渲染**：
- 滚动列表，每项一行，包含：
  - 文件名（truncate，`text-[13px]`）
  - 绿色 `+N`（`var(--green)`）
  - 红色 `-N`（`var(--red)`）
- 空列表时显示 "No changes" 提示

**点击行为**：
1. `App.ReadFile(projectPath, node.path)` 读取文件内容
2. `openFileTab(path, content)` 打开 tab
3. `setFileMode(path, 'diff')` 切换到 diff 模式
4. `dockviewApi.addPanel({ id: path, component: 'editor', tabComponent: 'editor-tab', params: { filePath: path }, position: { referenceGroup: 'editor-group' } })` 创建编辑器面板

**样式**：与 FileTree 一致，使用 `var(--bg-sidebar)` 背景。

### App.tsx 注册

- `components` 新增：`changes: ChangesList`
- `tabComponents` 新增：`changes-tab: DefaultTab`

### 默认布局 (`defaultLayout.ts`)

- `filetree-group` views 改为 `['filetree', 'changes']`
- panels 新增 `changes` 定义，使用 `contentComponent: 'changes'`、`tabComponent: 'changes-tab'`，标题 `'CHANGES'`

### Store

无需改动。复用 `fileTreeVersion`、`openFileTab`、`setFileMode`、`dockviewApi`。

## 数据流

```
ChangesList mount / fileTreeVersion change
  → App.ListChangeStats(projectPath)
    → git diff --numstat
      → []ChangeStat
        → 渲染列表

用户点击文件
  → App.ReadFile() → openFileTab(path, content)
  → setFileMode(path, 'diff')
  → dockviewApi.addPanel({ component: 'editor', params: { filePath: path }, position: { referenceGroup: 'editor-group' } })
    → FileEditor 在 diff 模式下渲染 GetFileDiff 结果
```

## 边界情况

| 场景 | 处理 |
|------|------|
| 非 git 仓库 | `ListChangeStats` 返回空列表，前端显示 "No changes" |
| 二进制文件 | numstat 返回 `- - path`，`Added==0 && Deleted==0` 时跳过 |
| 文件无变更 | 空列表，显示 "No changes" |
| 已删除文件 | `ReadFile` 调用失败，由已有错误处理捕获（catch 后 `openFileTab(path, '')`） |

## 范围

- `internal/api/types.go` — 新增 `ChangeStat`
- `internal/api/file_service.go` — 新增 `ListChangeStats()`
- `internal/api/app.go` — 新增 `ListChangeStats` wrapper
- `frontend/src/components/ChangesList/ChangesList.tsx` — 新组件
- `frontend/src/components/Panel/defaultLayout.ts` — layout 配置
- `frontend/src/App.tsx` — 注册组件和 tab
- `frontend/src/components/Panel/useLayoutPersistence.ts` — 递增 `LAYOUT_VERSION`（11 → 12）以触发现有用户布局重置
- 自动生成的 bindings 文件 — 不手动编辑
