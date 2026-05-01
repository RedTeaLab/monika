# Git 变更展示 + Edit/Diff 模式切换 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 文件树叠加 git 状态标记，文件编辑器支持 Edit/Diff 模式切换

**Architecture:** 后端在 `ListDir()` 中合并 `git status --porcelain` 结果到 `FileNode.Status`；前端 store 扩展 `FileTabInfo.mode` 字段，FileEditor 根据 mode 渲染 CodeMirror（可编辑）或 unified diff 视图（只读）

**Tech Stack:** Go (Wails v3 后端), React 18 + TypeScript + Zustand + CodeMirror 6 (前端)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `internal/api/file_service.go` | Modify | `ListDir()` 顶层跑 `git status --porcelain`，填充 `FileNode.Status` |
| `frontend/src/store/index.ts` | Modify | `FileTabInfo` 新增 `mode` 字段，新增 `setFileMode` action |
| `frontend/src/components/FileTree/FileEditor.tsx` | Modify | 模式切换按钮、Edit 模式（可编辑+Ctrl+S）、Diff 模式（unified diff 视图） |

---

### Task 1: 后端 — ListDir 填充 git 状态

**Files:**
- Modify: `internal/api/file_service.go:51-91`

- [ ] **Step 1: 在 ListDir 顶层执行 git status 并构建映射**

在 `ListDir()` 函数顶部（靠近 `absPath := filepath.Join(...)` 之后），新增获取 git status 的逻辑，然后修改递归调用将映射传入。

将 `ListDir` 拆为两个函数：导出版本保持 `ListDir(relPath string)` 签名不变，内部增加 `listDirWithStatus(relPath string, statusMap map[string]string)` 作为递归实现。

修改 `file_service.go` 第 51-91 行：

```go
func (f *FileService) ListDir(relPath string) ([]FileNode, error) {
	// Build git status map once at top level.
	statusMap := f.gitStatusMap()

	var listDirRecursive func(relPath string) ([]FileNode, error)
	listDirRecursive = func(relPath string) ([]FileNode, error) {
		absPath := filepath.Join(f.projectDir, relPath)
		entries, err := os.ReadDir(absPath)
		if err != nil {
			return []FileNode{}, err
		}

		nodes := make([]FileNode, 0)
		for _, entry := range entries {
			name := entry.Name()
			if strings.HasPrefix(name, ".") || name == "node_modules" {
				continue
			}

			entryRelPath := filepath.Join(relPath, name)
			node := FileNode{
				Name:  name,
				Path:  entryRelPath,
				IsDir: entry.IsDir(),
			}

			// Populate git status from the status map.
			if status, ok := statusMap[entryRelPath]; ok {
				node.Status = status
			}

			if entry.IsDir() {
				children, err := listDirRecursive(entryRelPath)
				if err != nil {
					return nil, err
				}
				node.Children = children
			}

			nodes = append(nodes, node)
		}

		sort.Slice(nodes, func(i, j int) bool {
			if nodes[i].IsDir != nodes[j].IsDir {
				return nodes[i].IsDir
			}
			return nodes[i].Name < nodes[j].Name
		})

		return nodes, nil
	}

	return listDirRecursive(relPath)
}

// gitStatusMap returns a map of file path -> git status code for the project.
func (f *FileService) gitStatusMap() map[string]string {
	m := make(map[string]string)
	cmd := exec.Command("git", "status", "--porcelain")
	cmd.Dir = f.projectDir
	out, err := cmd.Output()
	if err != nil {
		return m // not a git repo, return empty map
	}
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if len(line) < 4 {
			continue
		}
		status := strings.TrimSpace(line[0:2])
		filename := strings.TrimSpace(line[3:])
		if idx := strings.Index(filename, " -> "); idx >= 0 {
			filename = filename[idx+4:]
		}
		if status != "" && filename != "" {
			m[filename] = status
		}
	}
	return m
}
```

- [ ] **Step 2: 编译验证**

Run: `cd d:\git\monika && go build ./...`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add internal/api/file_service.go
git commit -m "feat: populate FileNode.Status from git status in ListDir"
```

---

### Task 2: Store — FileTabInfo 新增 mode 字段

**Files:**
- Modify: `frontend/src/store/index.ts:28-32` (FileTabInfo interface), `frontend/src/store/index.ts:77-81` (actions)

- [ ] **Step 1: 扩展 FileTabInfo 接口**

修改第 28-32 行：

```typescript
interface FileTabInfo {
  path: string
  content: string
  isDirty: boolean
  mode: 'edit' | 'diff'
}
```

- [ ] **Step 2: 在 AppState 中添加 setFileMode action**

在 AppState interface 中（`setFileDirty` 之后）添加：

```typescript
  setFileMode: (path: string, mode: 'edit' | 'diff') => void
```

- [ ] **Step 3: 实现 setFileMode**

在 store 的 create 回调中，`setFileDirty` 实现之后添加：

```typescript
  setFileMode: (path, mode) => {
    set((s) => ({
      openFiles: s.openFiles.map((f) => f.path === path ? { ...f, mode } : f),
    }))
  },
```

- [ ] **Step 4: openFileTab 默认 mode: 'edit'**

修改 `openFileTab` 实现（第 365-368 行），添加 `mode: 'edit'`：

```typescript
    set((s) => ({
      openFiles: [...s.openFiles, { path, content, isDirty: false, mode: 'edit' }],
      activeFilePath: path,
    }))
```

- [ ] **Step 5: 类型检查**

Run: `cd d:\git\monika\frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add frontend/src/store/index.ts
git commit -m "feat: add mode field to FileTabInfo for edit/diff switching"
```

---

### Task 3: FileEditor — 模式切换按钮

**Files:**
- Modify: `frontend/src/components/FileTree/FileEditor.tsx`

- [ ] **Step 1: 提取当前文件的 mode**

在 `FileEditor` 组件顶部，解构增加 `setFileMode`：

```typescript
function FileEditor() {
  const openFiles = useStore((s) => s.openFiles)
  const activeFilePath = useStore((s) => s.activeFilePath)
  const closeFileTab = useStore((s) => s.closeFileTab)
  const switchFileTab = useStore((s) => s.switchFileTab)
  const updateFileContent = useStore((s) => s.updateFileContent)
  const setFileMode = useStore((s) => s.setFileMode)

  const activeFile = openFiles.find((f) => f.path === activeFilePath)
  const currentMode = activeFile?.mode || 'edit'
```

- [ ] **Step 2: 添加模式切换按钮 UI**

在编辑器内容区（`<div className="flex-1 relative">` 内部），TabBar 下方，代码容器之上，添加模式切换：

```tsx
{activeFilePath && (
  <div className="absolute top-2 right-3 z-10 flex rounded-md overflow-hidden shadow-lg"
    style={{ background: 'var(--glass-strong)', border: '1px solid var(--border)' }}>
    <button
      onClick={() => setFileMode(activeFilePath, 'edit')}
      className="px-3 py-1 text-[11px] font-medium transition-colors"
      style={{
        background: currentMode === 'edit' ? 'var(--accent)' : 'transparent',
        color: currentMode === 'edit' ? '#fff' : 'var(--text-dim)',
      }}
    >Edit</button>
    <button
      onClick={() => setFileMode(activeFilePath, 'diff')}
      className="px-3 py-1 text-[11px] font-medium transition-colors"
      style={{
        background: currentMode === 'diff' ? 'var(--accent)' : 'transparent',
        color: currentMode === 'diff' ? '#fff' : 'var(--text-dim)',
      }}
    >Diff</button>
  </div>
)}
```

- [ ] **Step 3: 类型检查**

Run: `cd d:\git\monika\frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/FileTree/FileEditor.tsx
git commit -m "feat: add Edit/Diff mode toggle button to FileEditor"
```

---

### Task 4: FileEditor — Edit 模式改为可编辑

**Files:**
- Modify: `frontend/src/components/FileTree/FileEditor.tsx`

- [ ] **Step 1: 导入新依赖和 store 字段**

在文件顶部添加 import：

```typescript
import { Compartment } from '@codemirror/state'
```

在 FileEditor 组件顶部解构增加：

```typescript
  const setFileDirty = useStore((s) => s.setFileDirty)
  const projectPath = useStore((s) => s.projectPath)
```

创建 editable compartment 实例（组件内，`useRef` 之后）：

```typescript
  const editableCompartment = useRef(new Compartment())
```

- [ ] **Step 2: 创建 EditorView 时用 compartment 控制 editable**

修改创建 EditorView 的 useEffect（约第 49-62 行）。用 `editableCompartment` 替代硬编码的 `EditorView.editable.of(false)`，并用 `updateListener` 检测变更：

```typescript
  useEffect(() => {
    if (!activeFilePath) return
    const container = containerRefs.current.get(activeFilePath)
    if (!container) return

    let view = editorCache.current.get(activeFilePath)
    if (!view) {
      const file = openFiles.find((f) => f.path === activeFilePath)
      const content = file?.content || ''
      const state = EditorState.create({
        doc: content,
        extensions: [
          oneDark,
          keymap.of(defaultKeymap),
          getLangExtension(activeFilePath),
          editableCompartment.current.of(EditorView.editable.of(file?.mode === 'edit')),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const currentFile = useStore.getState().openFiles.find((f) => f.path === activeFilePath)
              if (currentFile?.mode === 'edit') {
                setFileDirty(activeFilePath, true)
              }
            }
          }),
        ],
      })
      view = new EditorView({ state, parent: container })
```

注意 `updateListener` 中通过 `useStore.getState()` 读取最新的 mode，避免闭包陈旧值。

同时更新 LRU 管理代码（保持在 `if (!view)` 块内）不变。

- [ ] **Step 3: mode 变化时切换 editable 状态**

新增一个 `useEffect`，当 `currentMode` 变化时动态切换：

```typescript
  useEffect(() => {
    if (!activeFilePath) return
    const view = editorCache.current.get(activeFilePath)
    if (!view) return
    view.dispatch({
      effects: editableCompartment.current.reconfigure(
        EditorView.editable.of(currentMode === 'edit')
      )
    })
  }, [currentMode, activeFilePath])
```

- [ ] **Step 4: Ctrl+S 保存**

在组件中添加键盘事件监听，当 Edit 模式 + Ctrl+S 时保存：

```typescript
  useEffect(() => {
    if (currentMode !== 'edit') return
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        const file = openFiles.find((f) => f.path === activeFilePath)
        if (!file?.isDirty) return
        const view = editorCache.current.get(activeFilePath)
        if (!view) return
        const content = view.state.doc.toString()
        App.WriteFile(projectPath, activeFilePath, content)
          .then(() => {
            updateFileContent(activeFilePath, content)
            setFileDirty(activeFilePath, false)
          })
          .catch(() => {
            // Write failed — keep dirty state
          })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentMode, activeFilePath, openFiles, projectPath])
```

- [ ] **Step 5: 类型检查 + 构建验证**

Run: `cd d:\git\monika\frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/FileTree/FileEditor.tsx
git commit -m "feat: enable file editing with Ctrl+S save in Edit mode"
```

---

### Task 5: FileEditor — Diff 模式

**Files:**
- Modify: `frontend/src/components/FileTree/FileEditor.tsx`

- [ ] **Step 1: 添加 diff 数据状态**

在 FileEditor 组件内添加：

```typescript
  const [diffLines, setDiffLines] = useState<string[]>([])
  const [diffLoading, setDiffLoading] = useState(false)
```

- [ ] **Step 2: 切换到 Diff 模式时获取 diff**

新增 `useEffect` 在切换到 Diff 模式时调用 `GetFileDiff`：

```typescript
  useEffect(() => {
    if (currentMode !== 'diff' || !activeFilePath) return
    let cancelled = false
    setDiffLoading(true)
    App.GetFileDiff(projectPath, activeFilePath)
      .then((result) => {
        if (!cancelled) {
          setDiffLines(result?.lines || [])
          setDiffLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDiffLines([])
          setDiffLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [currentMode, activeFilePath, projectPath])
```

- [ ] **Step 3: Diff 模式渲染**

在编辑器内容区，根据 `currentMode` 条件渲染。当 `currentMode === 'diff'` 时渲染 diff 视图而非 CodeMirror 容器：

修改 return 中 `<div className="flex-1 relative">` 内部：

```tsx
      <div className="flex-1 relative">
        {currentMode === 'diff' ? (
          <div className="absolute inset-0 overflow-auto font-mono text-[13px] leading-relaxed"
            style={{ background: 'var(--bg-main)' }}>
            {diffLoading ? (
              <div className="flex items-center justify-center h-full text-[var(--text-dim)] text-[12px]">
                Loading diff...
              </div>
            ) : diffLines.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[var(--text-dim)] text-[12px]">
                No changes
              </div>
            ) : (
              <div className="py-2">
                {diffLines.map((line, i) => {
                  let bg = 'transparent'
                  let fg = 'var(--text-primary)'
                  if (line.startsWith('+') && !line.startsWith('+++')) {
                    bg = 'rgba(74, 222, 128, 0.08)'
                    fg = 'var(--green)'
                  } else if (line.startsWith('-') && !line.startsWith('---')) {
                    bg = 'rgba(248, 113, 113, 0.10)'
                    fg = 'var(--red)'
                  } else if (line.startsWith('@@')) {
                    fg = 'var(--text-dim)'
                  } else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
                    fg = 'var(--text-dim)'
                  }
                  return (
                    <div key={i} style={{ background: bg, color: fg, paddingLeft: '16px', paddingRight: '16px', minHeight: '22px', whiteSpace: 'pre' }}>
                      {line}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          openFiles.map((f) => (
            <div
              key={f.path}
              ref={(el) => registerContainer(f.path, el)}
              style={{ display: f.path === activeFilePath ? 'block' : 'none', height: '100%' }}
              className="absolute inset-0"
            />
          ))
        )}
      </div>
```

- [ ] **Step 4: 类型检查 + 构建验证**

Run: `cd d:\git\monika\frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/FileTree/FileEditor.tsx
git commit -m "feat: add Diff mode with unified git diff rendering"
```

---

### Task 6: 集成验证

**Files:** 无需修改

- [ ] **Step 1: 完整编译**

Run: `cd d:\git\monika && go build ./...`
Expected: PASS

- [ ] **Step 2: 前端类型检查**

Run: `cd d:\git\monika\frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: 手动测试清单**

1. 打开一个 git 仓库项目，确认文件树中有变更的文件显示颜色和状态标签（M/A/D）
2. 点击一个文件，确认默认进入 Edit 模式
3. 修改文件内容，确认 Tab 上显示脏标记 ●
4. Ctrl+S 保存，确认脏标记消失
5. 切换到 Diff 模式，确认显示 unified diff
6. 切换回 Edit 模式，确认回到可编辑状态
7. 打开多个文件，切换 Tab 确认每个文件独立记住自己的模式
8. 关闭脏文件，确认弹出确认对话框
