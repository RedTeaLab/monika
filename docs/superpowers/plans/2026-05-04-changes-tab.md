# Changes Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在文件面板（filetree-group）新增 CHANGES 标签页，展示 git 变更文件及增删行数，点击后在编辑器中以 Diff 模式打开。

**Architecture:** 后端通过 `git diff --numstat` 获取增删行数统计，前端新增 dockview panel 组件监听 `fileTreeVersion` 实时刷新，复用现有 `openFileTab` + `setFileMode` + `dockviewApi.addPanel` 流程。

**Tech Stack:** Go, React + TypeScript + dockview v5, git

---

### Task 1: Backend — 添加 ChangeStat 类型

**Files:**
- Modify: `internal/api/types.go:66-76`

- [ ] **Step 1: 在 types.go 中 FileChange 下方添加 ChangeStat 类型**

```go
type ChangeStat struct {
	Path    string `json:"path"`
	Added   int    `json:"added"`
	Deleted int    `json:"deleted"`
}
```

- [ ] **Step 2: 提交**

```bash
git add internal/api/types.go
git commit -m "feat: add ChangeStat type for git change statistics"
```

---

### Task 2: Backend — 添加 ListChangeStats 方法到 FileService

**Files:**
- Modify: `internal/api/file_service.go:3-8`（imports），`internal/api/file_service.go:170`（末尾追加）

- [ ] **Step 1: 在 imports 中添加 "strconv"**

```go
import (
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)
```

- [ ] **Step 2: 在文件末尾 (GetDiff 之后) 添加 ListChangeStats 方法**

```go
func (f *FileService) ListChangeStats() ([]ChangeStat, error) {
	cmd := command("git", "diff", "--numstat")
	cmd.Dir = f.projectDir
	out, err := cmd.Output()
	if err != nil {
		return []ChangeStat{}, nil
	}

	stats := make([]ChangeStat, 0)
	for _, line := range strings.Split(string(out), "\n") {
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		added, _ := strconv.Atoi(fields[0])
		deleted, _ := strconv.Atoi(fields[1])
		// Skip binary files: numstat returns "-" for counts
		if added == 0 && deleted == 0 && fields[0] == "-" && fields[1] == "-" {
			continue
		}
		stats = append(stats, ChangeStat{
			Path:    fields[2],
			Added:   added,
			Deleted: deleted,
		})
	}
	return stats, nil
}
```

- [ ] **Step 3: 运行 Backend 测试**

```bash
go test ./internal/api/...
```
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add internal/api/file_service.go
git commit -m "feat: add ListChangeStats to FileService using git diff --numstat"
```

---

### Task 3: Backend — 添加 ListChangeStats wrapper 到 App

**Files:**
- Modify: `internal/api/app.go:552-555`（在 ListFileChanges 下方）

- [ ] **Step 1: 添加 App.ListChangeStats wrapper**

```go
func (a *App) ListChangeStats(projectPath string) ([]ChangeStat, error) {
	fs := a.getFileService(projectPath)
	return fs.ListChangeStats()
}
```

- [ ] **Step 2: 运行 Backend 测试**

```bash
go test ./internal/api/...
```
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add internal/api/app.go
git commit -m "feat: add ListChangeStats App wrapper"
```

---

### Task 4: 重新生成 Wails bindings

**Files:**
- Auto-generated: `frontend/bindings/`（不手动编辑）

- [ ] **Step 1: 重新生成 bindings**

```bash
cd frontend && npx wails3 generate bindings
```
Expected: 生成包含 `ListChangeStats` 和 `ChangeStat` 的 TypeScript bindings

- [ ] **Step 2: 提交**

```bash
git add frontend/bindings/
git commit -m "chore: regenerate Wails bindings for ListChangeStats"
```

---

### Task 5: Frontend — 创建 ChangesList 组件

**Files:**
- Create: `frontend/src/components/ChangesList/ChangesList.tsx`

- [ ] **Step 1: 创建 ChangesList.tsx**

```tsx
import { useState, useEffect } from 'react'
import { IDockviewPanelProps } from 'dockview'
import { App } from '../../bindings/monika'
import type { ChangeStat } from '../../bindings/monika/internal/api/models'
import { useStore } from '../../store'

function ChangesList(_props: IDockviewPanelProps) {
  const [changes, setChanges] = useState<ChangeStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const projectPath = useStore((s) => s.projectPath)
  const fileTreeVersion = useStore((s) => s.fileTreeVersion)
  const openFileTab = useStore((s) => s.openFileTab)
  const setFileMode = useStore((s) => s.setFileMode)

  useEffect(() => {
    if (!projectPath) return
    let cancelled = false
    setLoading(true)
    App.ListChangeStats(projectPath)
      .then((stats) => {
        if (!cancelled) {
          setChanges(Array.isArray(stats) ? stats : [])
          setError('')
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load changes')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [projectPath, fileTreeVersion])

  const handleClick = async (stat: ChangeStat) => {
    try {
      const result = await App.ReadFile(projectPath, stat.path)
      openFileTab(stat.path, result?.content || '')
    } catch {
      openFileTab(stat.path, '')
    }
    setFileMode(stat.path, 'diff')
    const dockApi = useStore.getState().dockviewApi
    if (dockApi) {
      const existing = dockApi.getPanel(stat.path)
      if (!existing) {
        dockApi.addPanel({
          id: stat.path,
          component: 'editor',
          tabComponent: 'editor-tab',
          title: stat.path.split('/').pop() || stat.path,
          params: { filePath: stat.path },
          position: { referenceGroup: 'editor-group' },
        })
      } else {
        existing.api.setActive()
        // Force diff mode even if file already open
        setFileMode(stat.path, 'diff')
      }
    }
  }

  const basename = (p: string) => p.split('/').pop() || p

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--bg-sidebar)', padding: '0 8px' }}
    >
      <div className="flex-1 overflow-y-auto">
        {loading && changes.length === 0 ? (
          <div className="py-4 text-[12px] text-[var(--text-dim)] px-1">Loading...</div>
        ) : error && changes.length === 0 ? (
          <div className="py-4 text-[12px] text-[var(--red)] px-1">{error}</div>
        ) : changes.length === 0 ? (
          <div className="py-4 text-[12px] text-[var(--text-dim)] px-1">No changes</div>
        ) : (
          changes.map((stat) => (
            <div
              key={stat.path}
              className="flex items-center gap-1 cursor-pointer text-[13px] leading-[26px] rounded-md transition-colors mx-1 px-[6px]"
              style={{ color: 'var(--text-secondary)' }}
              onClick={() => handleClick(stat)}
              title={stat.path}
            >
              <span className="truncate flex-1">{basename(stat.path)}</span>
              {stat.added > 0 && (
                <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--green)' }}>
                  +{stat.added}
                </span>
              )}
              {stat.deleted > 0 && (
                <span className="text-[11px] flex-shrink-0 ml-0.5" style={{ color: 'var(--red)' }}>
                  -{stat.deleted}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default ChangesList
```

- [ ] **Step 2: TypeScript 类型检查**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 无新增类型错误（如果 `ChangeStat` 导入路径不对，调整为 bindings 实际生成的导出路径）

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/ChangesList/ChangesList.tsx
git commit -m "feat: add ChangesList component for git change display"
```

---

### Task 6: Frontend — 在 App.tsx 注册 ChangesList

**Files:**
- Modify: `frontend/src/App.tsx:1-30`（imports + component maps）

- [ ] **Step 1: 添加 import**

在现有 imports 后追加：
```tsx
import ChangesList from './components/ChangesList/ChangesList'
```

- [ ] **Step 2: 注册 component 和 tabComponent**

在 `components` 对象中添加：
```tsx
changes: ChangesList,
```

在 `tabComponents` 对象中添加：
```tsx
'changes-tab': DefaultTab,
```

- [ ] **Step 3: TypeScript 类型检查**

```bash
cd frontend && npx tsc --noEmit
```
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add frontend/src/App.tsx
git commit -m "feat: register ChangesList as dockview panel"
```

---

### Task 7: Frontend — 更新默认布局

**Files:**
- Modify: `frontend/src/components/Panel/defaultLayout.ts:27-28`, `defaultLayout.ts:72`

- [ ] **Step 1: 更新 filetree-group views**

将 `views: ['filetree']` 改为：
```ts
views: ['filetree', 'changes'],
```

- [ ] **Step 2: 在 panels 对象中添加 changes 定义**

在 `filetree: { ... }` 之后追加：
```ts
changes: {
  id: 'changes',
  contentComponent: 'changes',
  tabComponent: 'changes-tab',
  title: 'CHANGES',
  renderer: 'always',
},
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/Panel/defaultLayout.ts
git commit -m "feat: add CHANGES panel to default dockview layout"
```

---

### Task 8: Frontend — 递增 LAYOUT_VERSION

**Files:**
- Modify: `frontend/src/components/Panel/useLayoutPersistence.ts:7`

- [ ] **Step 1: 将 LAYOUT_VERSION 从 11 改为 12**

```ts
const LAYOUT_VERSION = 12
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/Panel/useLayoutPersistence.ts
git commit -m "chore: bump LAYOUT_VERSION to 12 for CHANGES tab"
```

---

### Task 9: 最终验证

- [ ] **Step 1: Backend 测试**

```bash
go test ./... -count=1
```
Expected: PASS

- [ ] **Step 2: Frontend 类型检查**

```bash
cd frontend && npx tsc --noEmit
```
Expected: PASS

- [ ] **Step 3: 构建验证**

```bash
cd frontend && npm run build && cd .. && go build .
```
Expected: 编译成功，无错误
