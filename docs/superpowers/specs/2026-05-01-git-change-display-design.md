# Git 变更展示 + 编辑/差异模式切换

## 概述

在文件树中叠加 git 变更状态（类似 VS Code），在文件编辑器中增加 Edit/Diff 模式切换按钮，Diff 模式展示 `git diff` 统一格式。

## 后端

### FileService.ListDir — 填充 git 状态

`FileService.ListDir()` 在递归构建文件树前，先执行一次 `git status --porcelain`，构建 `map[string]string`（path → status）。递归过程中对每个文件查找匹配的 status 填入 `FileNode.Status`。

- 已有方法不变：`ListChanges()` 和 `GetDiff()` 无需修改
- 预估改动：`file_service.go` 约 15 行

## 前端

### Store — FileTabInfo 扩展 mode

```typescript
interface FileTabInfo {
  path: string
  content: string
  isDirty: boolean
  mode: 'edit' | 'diff'  // 新增
}
```

新增 action：
- `setFileMode(path: string, mode: 'edit' | 'diff')`

行为：
- `openFileTab` 时默认 `mode: 'edit'`
- 关闭文件时随 `closeFileTab` 清除
- 切换 Tab 时保留每个文件的 mode

### FileTree — 无需改动

前端已有 `gitColor()` 和 `node.status` 渲染逻辑，后端填充数据后即生效。

### FileEditor — 核心改动

#### 模式切换按钮

- 位置：编辑器内容区右上角，绝对定位浮动在代码上方
- 样式：Edit | Diff 分段按钮（segmented control），当前模式高亮
- 交互：点击切换当前文件的 `mode`，调用 `setFileMode()`

#### Edit 模式

- 移除 `EditorView.editable.of(false)`，CodeMirror 变为可编辑
- 内容变更时通过 `EditorView.updateListener` 检测，自动标记 `isDirty`
- Ctrl+S 保存：调用 `App.WriteFile(projectPath, filePath, content)`，成功后清除 `isDirty`
- 关闭脏文件时弹出 Unsaved Changes 确认（已有 ConfirmModal）

#### Diff 模式

- 切换到 Diff 模式时调用 `App.GetFileDiff(projectPath, filePath)` 获取统一 diff
- 渲染只读 diff 视图：`+` 行绿色背景，`-` 行红色背景，上下文行默认背景
- 退出 Diff 模式时销毁 diff 视图，恢复 CodeMirror 编辑器

## 数据流

```
文件树: 后端 git status --porcelain → FileNode.Status → 前端 gitColor() 着色
编辑器: 用户点击模式按钮 → store.setFileMode() → FileEditor 渲染对应视图
        Edit 模式 → CodeMirror 可编辑 → Ctrl+S → App.WriteFile()
        Diff 模式 → App.GetFileDiff() → 只读 diff 视图
```

## 依赖和范围

- 所有 git 操作使用 `git diff <file>`（工作区 vs HEAD）
- 非 git 仓库项目：文件树状态为空，Diff 模式不可用（降级提示）
- 仅涉及 `file_service.go` / `store/index.ts` / `FileEditor.tsx`
