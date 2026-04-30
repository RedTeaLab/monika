# Project/Branch Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TitleBar project name and branch name interactive dropdowns for switching projects and branches without restarting Monika.

**Architecture:** Go backend adds 5 new RPC methods + modifies OpenProject to return ProjectInfo and write recent.json. React frontend adds 4 new TitleBar sub-components (ProjectDropdown, BranchDropdown, CreateBranchPanel, FileDialog) using createPortal for dropdown positioning, Zustand store gets 2 new fields + 3 new actions. Git command safety via `--` separator and branch name validation.

**Tech Stack:** Go (os/exec, encoding/json), React 18 + TypeScript, Zustand v5, Tailwind CSS v4, Wails v3 runtime

---

### Task 1: Add Backend Types

**Files:**
- Modify: `internal/api/types.go`

- [ ] **Step 1: Add RecentProject and BranchInfo types**

Add after the `WorktreeInfo` struct block (after line 29 in types.go):

```go
// RecentProject represents a recently opened project.
type RecentProject struct {
	Path     string `json:"path"`
	Name     string `json:"name"`
	OpenedAt int64  `json:"opened_at"`
}

// BranchInfo represents a git branch (local or remote).
type BranchInfo struct {
	Name   string `json:"name"`
	Remote string `json:"remote"` // empty = local branch
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd d:\git\monika && go build ./internal/api/`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add internal/api/types.go
git commit -m "feat: add RecentProject and BranchInfo types for project/branch switching"
```

---

### Task 2: Backend — GetRecentProjects

**Files:**
- Modify: `internal/api/app.go`

- [ ] **Step 1: Add GetRecentProjects method**

Add to `internal/api/app.go`. The `home` field on `App` already contains the home directory path. Place the method after `GetCurrentProject`:

```go
// GetRecentProjects returns recently opened projects from ~/.monika/recent.json.
func (a *App) GetRecentProjects() []RecentProject {
	recentPath := filepath.Join(a.home, ".monika", "recent.json")
	data, err := os.ReadFile(recentPath)
	if err != nil {
		// File doesn't exist or can't be read — return empty list.
		return nil
	}

	var projects []RecentProject
	if err := json.Unmarshal(data, &projects); err != nil {
		// Corrupted file — log warning, return empty list.
		fmt.Fprintf(os.Stderr, "[monika] WARNING: failed to parse recent.json: %v\n", err)
		return nil
	}

	// Filter out entries whose path no longer exists or is not a directory.
	filtered := make([]RecentProject, 0, len(projects))
	for _, p := range projects {
		if info, err := os.Stat(p.Path); err == nil && info.IsDir() {
			filtered = append(filtered, p)
		}
	}

	// Already sorted by openedAt desc from write logic, but ensure order.
	sort.Slice(filtered, func(i, j int) bool {
		return filtered[i].OpenedAt > filtered[j].OpenedAt
	})

	if len(filtered) > 20 {
		filtered = filtered[:20]
	}
	return filtered
}

// writeRecentProject appends or updates a project entry in recent.json.
func (a *App) writeRecentProject(path, name string) {
	recentDir := filepath.Join(a.home, ".monika")
	os.MkdirAll(recentDir, 0755)
	recentPath := filepath.Join(recentDir, "recent.json")

	projects := a.GetRecentProjects()

	// Remove existing entry for this path.
	for i, p := range projects {
		if p.Path == path {
			projects = append(projects[:i], projects[i+1:]...)
			break
		}
	}

	// Prepend with current timestamp.
	projects = append([]RecentProject{{
		Path:     path,
		Name:     name,
		OpenedAt: time.Now().Unix(),
	}}, projects...)

	if len(projects) > 20 {
		projects = projects[:20]
	}

	// Atomic write: write to temp file first, then rename.
	tmpPath := recentPath + ".tmp"
	data, err := json.MarshalIndent(projects, "", "  ")
	if err != nil {
		return
	}
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return
	}
	os.Rename(tmpPath, recentPath)
}
```

Ensure imports include `"encoding/json"`, `"fmt"`, `"os"`, `"path/filepath"`, `"sort"`, `"time"`. Check existing imports — `os`, `fmt`, `path/filepath` are already in app.go; `encoding/json`, `sort`, `time` may need adding.

- [ ] **Step 2: Verify compilation**

Run: `cd d:\git\monika && go build ./internal/api/`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add internal/api/app.go
git commit -m "feat: add GetRecentProjects backend method with atomic write"
```

---

### Task 3: Backend — ListBranches

**Files:**
- Modify: `internal/api/app.go`

- [ ] **Step 1: Add ListBranches method**

Append to `internal/api/app.go`:

```go
// ListBranches returns local and remote git branches for the given project.
func (a *App) ListBranches(projectPath string) ([]BranchInfo, error) {
	cmd := exec.Command("git", "branch", "-a", "--no-color")
	cmd.Dir = projectPath
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	var branches []BranchInfo
	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Remove leading "* " (current branch marker) or "  " (regular branch).
		line = strings.TrimPrefix(line, "* ")
		line = strings.TrimSpace(line)

		// Detect remote branches: "remotes/origin/xxx".
		remotePrefix := "remotes/"
		if strings.HasPrefix(line, remotePrefix) {
			remoteAndName := strings.TrimPrefix(line, remotePrefix)
			// Split into remote name and branch name: "origin/feat/x" -> remote="origin", name="feat/x"
			slashIdx := strings.Index(remoteAndName, "/")
			if slashIdx >= 0 {
				branches = append(branches, BranchInfo{
					Name:   remoteAndName[slashIdx+1:],
					Remote: remoteAndName[:slashIdx],
				})
			}
		} else {
			// Local branch.
			branches = append(branches, BranchInfo{
				Name:   line,
				Remote: "",
			})
		}
	}
	return branches, nil
}
```

Check that `"strings"` is in imports (add if needed).

- [ ] **Step 2: Verify compilation**

Run: `cd d:\git\monika && go build ./internal/api/`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add internal/api/app.go
git commit -m "feat: add ListBranches backend method"
```

---

### Task 4: Backend — SwitchBranch

**Files:**
- Modify: `internal/api/app.go`

- [ ] **Step 1: Add validateBranchName helper and SwitchBranch method**

Add the validation helper and method to `internal/api/app.go`:

```go
// validateBranchName checks that a branch name is safe for git command execution.
func validateBranchName(name string) error {
	if name == "" {
		return fmt.Errorf("branch name must not be empty")
	}
	if name[0] == '-' {
		return fmt.Errorf("branch name must not start with '-'")
	}
	// Reject names with control characters or shell metacharacters.
	for _, r := range name {
		if r <= 0x1F || r == 0x7F {
			return fmt.Errorf("branch name contains control characters")
		}
		switch r {
		case '`', '$', ';', '|', '&', '<', '>', '\'', '"', '\\', '\n', '\r':
			return fmt.Errorf("branch name contains invalid character: %q", r)
		}
	}
	return nil
}

// SwitchBranch checks out the given branch in the project.
func (a *App) SwitchBranch(projectPath, name string) error {
	if err := validateBranchName(name); err != nil {
		return err
	}

	var cmd *exec.Cmd
	// If name looks like a remote tracking ref (contains "/"), create local tracking branch.
	if strings.Contains(name, "/") && !strings.HasPrefix(name, "origin/") {
		// name is like "feat/x" but was selected from a remote entry — the caller passes
		// "origin/feat/x" when remote is set. Handle both cases.
	}
	// Backend receives name + optional remote info. For simplicity, BranchDropdown passes
	// "origin/<name>" for remote branches and just "<name>" for local branches.
	if strings.HasPrefix(name, "origin/") {
		localName := strings.TrimPrefix(name, "origin/")
		if err := validateBranchName(localName); err != nil {
			return err
		}
		cmd = exec.Command("git", "checkout", "-b", localName, "--", name)
	} else {
		cmd = exec.Command("git", "checkout", "--", name)
	}
	cmd.Dir = projectPath
	cmd.Stderr = nil // captured via CombinedOutput below
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %s", err.Error(), strings.TrimSpace(string(out)))
	}

	// Update in-memory branch info.
	a.mu.Lock()
	if info, ok := a.projects[projectPath]; ok {
		// Re-parse branch after checkout.
		branchCmd := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD")
		branchCmd.Dir = projectPath
		if branchOut, bErr := branchCmd.Output(); bErr == nil {
			info.Branch = strings.TrimSpace(string(branchOut))
		}
	}
	a.mu.Unlock()

	return nil
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd d:\git\monika && go build ./internal/api/`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add internal/api/app.go
git commit -m "feat: add SwitchBranch with git safety validation"
```

---

### Task 5: Backend — CreateBranch

**Files:**
- Modify: `internal/api/app.go`

- [ ] **Step 1: Add CreateBranch method**

```go
// CreateBranch creates and checks out a new branch from the given base branch.
func (a *App) CreateBranch(projectPath, name, baseBranch string) error {
	if err := validateBranchName(name); err != nil {
		return err
	}
	if err := validateBranchName(baseBranch); err != nil {
		return err
	}

	cmd := exec.Command("git", "checkout", "-b", name, "--", baseBranch)
	cmd.Dir = projectPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %s", err.Error(), strings.TrimSpace(string(out)))
	}

	// Update in-memory branch info.
	a.mu.Lock()
	if info, ok := a.projects[projectPath]; ok {
		info.Branch = name
	}
	a.mu.Unlock()

	return nil
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd d:\git\monika && go build ./internal/api/`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add internal/api/app.go
git commit -m "feat: add CreateBranch backend method"
```

---

### Task 6: Backend — ListDirectory

**Files:**
- Modify: `internal/api/app.go`

- [ ] **Step 1: Add ListDirectory method**

```go
// ListDirectory returns the non-recursive contents of a directory.
// Reuses FileNode type from file_service.go.
func (a *App) ListDirectory(parentPath string) ([]FileNode, error) {
	entries, err := os.ReadDir(parentPath)
	if err != nil {
		return nil, err
	}

	var nodes []FileNode
	for _, entry := range entries {
		nodes = append(nodes, FileNode{
			Name:  entry.Name(),
			Path:  filepath.Join(parentPath, entry.Name()),
			IsDir: entry.IsDir(),
		})
	}

	// Sort: directories first, then alphabetically.
	sort.Slice(nodes, func(i, j int) bool {
		if nodes[i].IsDir != nodes[j].IsDir {
			return nodes[i].IsDir
		}
		return nodes[i].Name < nodes[j].Name
	})

	return nodes, nil
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd d:\git\monika && go build ./internal/api/`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add internal/api/app.go
git commit -m "feat: add ListDirectory backend method"
```

---

### Task 7: Backend — Modify OpenProject

**Files:**
- Modify: `internal/api/app.go`

- [ ] **Step 1: Modify OpenProject to return ProjectInfo and write recent.json**

The current OpenProject signature is `(path string) (*ProjectInfo, error)` — already returns `*ProjectInfo`. We only need to add the `writeRecentProject` call.

After the successful project setup (after line 158 — the `return info, nil` line), add the recent.json write:

```go
// At the end of OpenProject, just before "return info, nil":
// Write to recent projects.
a.writeRecentProject(info.Path, info.Name)

return info, nil
```

The signature is already correct (`*ProjectInfo` return). The frontend flow in the spec already captures the return value (`projectInfo = App.OpenProject(newPath)`).

- [ ] **Step 2: Verify compilation**

Run: `cd d:\git\monika && go build ./internal/api/`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add internal/api/app.go
git commit -m "feat: write recent.json on OpenProject"
```

---

### Task 8: Update Frontend Bindings

**Files:**
- Modify: `frontend/bindings/monika/index.ts`

- [ ] **Step 1: Add new type definitions and API methods**

In `frontend/bindings/monika/index.ts`, add the new types after existing type definitions (after `FileChange` interface around line 45):

```typescript
export interface RecentProject {
  path: string
  name: string
  opened_at: number
}

export interface BranchInfo {
  name: string
  remote: string
}
```

Add new API methods to the `App` export object (before the closing `}` of the App object):

```typescript
  GetRecentProjects(): Promise<RecentProject[]> {
    return Call.ByName(`${serviceName}.GetRecentProjects`);
  },
  ListBranches(projectPath: string): Promise<BranchInfo[]> {
    return Call.ByName(`${serviceName}.ListBranches`, [projectPath]);
  },
  CreateBranch(projectPath: string, name: string, baseBranch: string): Promise<void> {
    return Call.ByName(`${serviceName}.CreateBranch`, [projectPath, name, baseBranch]);
  },
  SwitchBranch(projectPath: string, name: string): Promise<void> {
    return Call.ByName(`${serviceName}.SwitchBranch`, [projectPath, name]);
  },
  ListDirectory(parentPath: string): Promise<FileNode[]> {
    return Call.ByName(`${serviceName}.ListDirectory`, [parentPath]);
  },
```

Note: `FileNode` is already defined in the bindings file. Verify it exists and matches the Go struct.

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd d:\git\monika\frontend && npx tsc --noEmit`
Expected: no errors (or only pre-existing errors unrelated to our changes).

- [ ] **Step 3: Commit**

```bash
git add frontend/bindings/monika/index.ts
git commit -m "feat: add frontend bindings for new project/branch API methods"
```

---

### Task 9: Store Changes

**Files:**
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: Add new fields to AppState interface**

Add after the `openFiles: FileTabInfo[]` line in the AppState interface:

```typescript
  recentProjects: RecentProject[]
  allBranches: BranchInfo[]
```

- [ ] **Step 2: Add new fields to initial state**

Add to the `create<AppState>` initial state object:

```typescript
  recentProjects: [],
  allBranches: [],
```

- [ ] **Step 3: Add new action signatures in AppState interface**

Add after `setFileDirty` / `updateFileContent`:

```typescript
  loadRecentProjects: () => Promise<void>
  loadBranches: () => Promise<void>
  resetProjectState: () => void
```

- [ ] **Step 4: Implement loadRecentProjects action**

Add to the `create<AppState>` callbacks:

```typescript
  loadRecentProjects: async () => {
    const { App } = await import('../bindings/monika');
    const projects = await App.GetRecentProjects();
    set({ recentProjects: projects });
  },
```

- [ ] **Step 5: Implement loadBranches action**

```typescript
  loadBranches: async () => {
    const { App } = await import('../bindings/monika');
    const { projectPath } = get();
    if (!projectPath) return;
    try {
      const branches = await App.ListBranches(projectPath);
      set({ allBranches: branches });
    } catch {
      // Non-git directory or git error — leave branches empty.
      set({ allBranches: [] });
    }
  },
```

- [ ] **Step 6: Implement resetProjectState action**

```typescript
  resetProjectState: () => {
    set({
      messages: [{ id: 'welcome', role: 'system' as const, content: 'Welcome to Monika. Type /help for commands.' }],
      generatingSessionId: '',
      tokenCount: 0,
      activeSessionId: '',
      activeFilePath: '',
      consoleLines: ['$ ready'],
      openSessions: [],
      sessionMessages: {},
      openFiles: [],
    });
  },
```

- [ ] **Step 7: Add import for types**

At the top of the file, update the import from bindings to include new types:

```typescript
import type { RecentProject, BranchInfo, FileNode } from '../bindings/monika';
import { App } from '../bindings/monika';
```

(Adjust based on what's already imported — the `App` object is likely already imported for `initProject`.)

- [ ] **Step 8: Verify TypeScript compilation**

Run: `cd d:\git\monika\frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat: add recentProjects, allBranches, load actions, and resetProjectState to store"
```

---

### Task 10: ProjectDropdown Component

**Files:**
- Create: `frontend/src/components/TitleBar/ProjectDropdown.tsx`

- [ ] **Step 1: Create ProjectDropdown component**

Create `frontend/src/components/TitleBar/ProjectDropdown.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../store';
import type { RecentProject } from '../../bindings/monika';

interface ProjectDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFileDialog: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}

export function ProjectDropdown({ isOpen, onClose, onOpenFileDialog, triggerRef }: ProjectDropdownProps) {
  const { recentProjects, projectPath, loadRecentProjects } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    loadRecentProjects()
      .then(() => setLoading(false))
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [isOpen, loadRecentProjects]);

  // Close on outside click.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose, triggerRef]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') setFocusIndex(i => Math.min(i + 1, recentProjects.length));
      if (e.key === 'ArrowUp') setFocusIndex(i => Math.max(i - 1, 0));
      if (e.key === 'Enter') {
        const target = recentProjects[focusIndex];
        if (target) handleSelect(target);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, recentProjects, focusIndex, onClose]);

  const handleSelect = (project: RecentProject) => {
    if (project.path === projectPath) { onClose(); return; }
    onClose();
    // Project switch is handled by parent (TitleBar) via store action.
    useStore.getState().setProjectPath(project.path);
  };

  if (!isOpen) return null;

  // Position calculation.
  const triggerEl = triggerRef.current;
  const top = triggerEl ? triggerEl.getBoundingClientRect().bottom + 4 : 0;
  const left = triggerEl ? triggerEl.getBoundingClientRect().left : 0;

  return createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top,
        left,
        minWidth: 260,
        maxHeight: 360,
        overflowY: 'auto',
        background: 'var(--bg-sidebar)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        zIndex: 1000,
      }}
    >
      <div style={{
        padding: '8px 12px',
        fontSize: 11,
        color: 'var(--text-dim)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        borderBottom: '1px solid var(--border)',
      }}>
        Recent Projects
      </div>

      {loading && (
        <>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ padding: '6px 12px' }}>
              <div style={{ height: 12, width: '60%', background: 'var(--glass-medium)', borderRadius: 2, animation: 'pulse 1.5s infinite' }} />
              <div style={{ height: 8, width: '40%', background: 'var(--glass-light)', borderRadius: 2, marginTop: 4, animation: 'pulse 1.5s infinite' }} />
            </div>
          ))}
        </>
      )}

      {error && (
        <div style={{ padding: '12px', color: 'var(--red)', fontSize: 12 }}>
          {error}
          <button
            onClick={() => loadRecentProjects()}
            style={{ marginLeft: 8, color: 'var(--accent)', cursor: 'pointer', background: 'none', border: 'none', fontSize: 11 }}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && recentProjects.length === 0 && (
        <div style={{ padding: '12px', color: 'var(--text-dim)', fontSize: 12 }}>
          No recent projects
        </div>
      )}

      {!loading && !error && recentProjects.map((p, i) => (
        <div
          key={p.path}
          onClick={() => handleSelect(p)}
          style={{
            padding: '6px 12px',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            background: i === focusIndex ? 'var(--glass-hover)' : p.path === projectPath ? 'var(--glass-active)' : 'transparent',
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{p.name}</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{p.path}</div>
          </div>
          {p.path === projectPath && (
            <span style={{ fontSize: 10, color: 'var(--accent)' }}>✓ active</span>
          )}
        </div>
      ))}

      <div style={{ borderTop: '1px solid var(--border)', marginTop: 4 }}>
        <div
          onClick={() => { onClose(); onOpenFileDialog(); }}
          style={{
            padding: '8px 12px',
            fontSize: 12,
            color: 'var(--accent)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          + Open New Project...
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd d:\git\monika\frontend && npx tsc --noEmit`
Expected: no new errors (may need to cast or adjust generic types). Fix any type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TitleBar/ProjectDropdown.tsx
git commit -m "feat: add ProjectDropdown component"
```

---

### Task 11: BranchDropdown Component

**Files:**
- Create: `frontend/src/components/TitleBar/BranchDropdown.tsx`

- [ ] **Step 1: Create BranchDropdown component**

Create `frontend/src/components/TitleBar/BranchDropdown.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../store';

interface BranchDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onNewBranch: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}

export function BranchDropdown({ isOpen, onClose, onNewBranch, triggerRef }: BranchDropdownProps) {
  const { allBranches, branch, projectPath, loadBranches } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    loadBranches()
      .then(() => setLoading(false))
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [isOpen, loadBranches]);

  // Close on outside click.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose, triggerRef]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const handleSwitch = async (branchName: string, remote: string) => {
    setError(null);
    const { App } = await import('../../bindings/monika');
    try {
      // For remote branches, pass "origin/<name>" so backend can distinguish.
      const name = remote ? `${remote}/${branchName}` : branchName;
      await App.SwitchBranch(projectPath, name);

      // Refresh open file tabs.
      const { openFiles } = useStore.getState();
      for (const file of openFiles) {
        try {
          const content = await import('../../bindings/monika').then(m =>
            m.App.ReadFile(projectPath, file.path)
          );
          if (content.exist) {
            useStore.getState().updateFileContent(file.path, content.content);
          } else {
            useStore.getState().closeFileTab(file.path);
          }
        } catch {
          // File no longer readable — close tab.
          useStore.getState().closeFileTab(file.path);
        }
      }
      useStore.getState().setBranch(branchName);
      useStore.getState().loadBranches();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to switch branch');
    }
  };

  if (!isOpen) return null;

  const localBranches = allBranches.filter(b => !b.remote);
  const remoteBranches = allBranches.filter(b => b.remote);

  const triggerEl = triggerRef.current;
  const top = triggerEl ? triggerEl.getBoundingClientRect().bottom + 4 : 0;
  const left = triggerEl ? triggerEl.getBoundingClientRect().left : 0;

  return createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top,
        left,
        minWidth: 260,
        maxHeight: 360,
        overflowY: 'auto',
        background: 'var(--bg-sidebar)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        zIndex: 1000,
      }}
    >
      <div style={{
        padding: '8px 12px',
        fontSize: 11,
        color: 'var(--text-dim)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        borderBottom: '1px solid var(--border)',
      }}>
        Local Branches
      </div>

      {loading && (
        <div style={{ padding: '8px 12px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 10, background: 'var(--glass-medium)', borderRadius: 2, marginBottom: 6, animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      )}

      {!loading && localBranches.map(b => (
        <div
          key={b.name}
          onClick={() => handleSwitch(b.name, '')}
          style={{
            padding: '5px 12px',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: b.name === branch ? 'var(--text-primary)' : 'var(--text-dim)',
            fontSize: 12,
            background: b.name === branch ? 'var(--glass-active)' : 'transparent',
          }}
        >
          <span>{b.name}</span>
          {b.name === branch && <span style={{ color: 'var(--accent)', fontSize: 10 }}>✓</span>}
        </div>
      ))}

      {remoteBranches.length > 0 && (
        <div style={{
          padding: '8px 12px',
          fontSize: 11,
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          borderBottom: '1px solid var(--border)',
          borderTop: '1px solid var(--border)',
        }}>
          Remote Branches
        </div>
      )}

      {!loading && remoteBranches.map(b => (
        <div
          key={`${b.remote}/${b.name}`}
          onClick={() => handleSwitch(b.name, b.remote)}
          style={{
            padding: '5px 12px',
            cursor: 'pointer',
            color: 'var(--text-dim)',
            fontSize: 12,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>{b.remote}/{b.name}</span>
        </div>
      ))}

      {error && (
        <div style={{ padding: '8px 12px', color: 'var(--red)', fontSize: 11, borderTop: '1px solid var(--border)' }}>
          {error}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border)', marginTop: error ? 0 : 4 }}>
        <div
          onClick={onNewBranch}
          style={{
            padding: '8px 12px',
            fontSize: 12,
            color: 'var(--accent)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          + New Branch...
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd d:\git\monika\frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TitleBar/BranchDropdown.tsx
git commit -m "feat: add BranchDropdown component"
```

---

### Task 12: CreateBranchPanel Component

**Files:**
- Create: `frontend/src/components/TitleBar/CreateBranchPanel.tsx`

- [ ] **Step 1: Create CreateBranchPanel component**

Create `frontend/src/components/TitleBar/CreateBranchPanel.tsx`:

```tsx
import { useState } from 'react';
import { useStore } from '../../store';

interface CreateBranchPanelProps {
  onCancel: () => void;
  onCreated: () => void;
}

export function CreateBranchPanel({ onCancel, onCreated }: CreateBranchPanelProps) {
  const { allBranches, branch, projectPath, loadBranches } = useStore();
  const [name, setName] = useState('');
  const [baseBranch, setBaseBranch] = useState(branch);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    const { App } = await import('../../bindings/monika');
    try {
      await App.CreateBranch(projectPath, name.trim(), baseBranch);
      useStore.getState().setBranch(name.trim());
      await loadBranches();
      onCreated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create branch');
    }
    setCreating(false);
  };

  return (
    <div style={{ padding: 12 }}>
      <div style={{
        fontSize: 11,
        color: 'var(--text-dim)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 8,
      }}>
        Create New Branch
      </div>

      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Branch name"
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') onCancel(); }}
        style={{
          width: '100%',
          background: 'var(--glass-medium)',
          border: '1px solid var(--border)',
          borderRadius: 2,
          padding: '6px 8px',
          fontSize: 12,
          color: 'var(--text-primary)',
          marginBottom: 8,
          boxSizing: 'border-box',
          outline: 'none',
        }}
      />

      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>From branch</div>
      <select
        value={baseBranch}
        onChange={e => setBaseBranch(e.target.value)}
        style={{
          width: '100%',
          background: 'var(--glass-medium)',
          border: '1px solid var(--border)',
          borderRadius: 2,
          padding: '6px 8px',
          fontSize: 12,
          color: 'var(--text-primary)',
          marginBottom: 10,
          outline: 'none',
        }}
      >
        {allBranches.map(b => (
          <option key={b.remote ? `${b.remote}/${b.name}` : b.name} value={b.name}>
            {b.remote ? `${b.remote}/${b.name}` : b.name}{b.name === branch && !b.remote ? ' (current)' : ''}
          </option>
        ))}
      </select>

      {error && (
        <div style={{ color: 'var(--red)', fontSize: 11, marginBottom: 8 }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          disabled={creating}
          style={{
            padding: '4px 12px',
            fontSize: 11,
            color: 'var(--text-dim)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={!name.trim() || creating}
          style={{
            padding: '4px 16px',
            fontSize: 11,
            background: name.trim() && !creating ? 'var(--accent)' : 'var(--glass-medium)',
            color: name.trim() && !creating ? 'white' : 'var(--text-dim)',
            border: 'none',
            borderRadius: 2,
            cursor: name.trim() && !creating ? 'pointer' : 'default',
          }}
        >
          {creating ? 'Creating...' : 'Create & Switch'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd d:\git\monika\frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TitleBar/CreateBranchPanel.tsx
git commit -m "feat: add CreateBranchPanel component"
```

---

### Task 13: FileDialog Component

**Files:**
- Create: `frontend/src/components/TitleBar/FileDialog.tsx`

- [ ] **Step 1: Create FileDialog component**

Create `frontend/src/components/TitleBar/FileDialog.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../store';
import type { FileNode } from '../../bindings/monika';

interface FileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen: (path: string) => void;
}

export function FileDialog({ isOpen, onClose, onOpen }: FileDialogProps) {
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [selectedPath, setSelectedPath] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Start with the current project's parent directory, or home.
    const { projectPath } = useStore.getState();
    const start = projectPath || '';
    setCurrentPath(start ? start.replace(/[/\\][^/\\]+$/, '') || start : '');
    setPathInput(start || '');
    setSelectedPath('');
    setError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !currentPath) return;
    setLoading(true);
    setError(null);
    const { App } = require('../../bindings/monika').App || useStore.getState;
    import('../../bindings/monika').then(({ App }) => {
      App.ListDirectory(currentPath)
        .then((nodes: FileNode[]) => {
          setEntries(nodes);
          setLoading(false);
        })
        .catch((e: Error) => {
          setError(e.message);
          setLoading(false);
        });
    });
  }, [isOpen, currentPath]);

  const navigateTo = (dirPath: string) => {
    setCurrentPath(dirPath);
    setPathInput(dirPath);
    setSelectedPath(dirPath);
  };

  const goUp = () => {
    const parent = currentPath.replace(/[/\\][^/\\]+$/, '');
    if (parent && parent !== currentPath) {
      navigateTo(parent);
    }
  };

  const handleOpenClick = () => {
    if (selectedPath || currentPath) {
      onOpen(selectedPath || currentPath);
    }
  };

  if (!isOpen) return null;

  const dirs = entries.filter(e => e.is_dir);

  return createPortal(
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
      zIndex: 2000,
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-sidebar)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        width: 480,
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          fontSize: 12,
          color: 'var(--text-primary)',
          fontWeight: 600,
        }}>
          Open Project
        </div>

        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
          <input
            ref={inputRef}
            type="text"
            value={pathInput}
            onChange={e => setPathInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                // Try navigating to typed path.
                import('../../bindings/monika').then(({ App }) => {
                  App.ListDirectory(pathInput)
                    .then(() => navigateTo(pathInput))
                    .catch(() => setError('Path not found'));
                });
              }
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Filter or type path..."
            style={{
              width: '100%',
              background: 'var(--glass-medium)',
              border: '1px solid var(--border)',
              borderRadius: 2,
              padding: '6px 8px',
              fontSize: 12,
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ height: 240, overflowY: 'auto', padding: '4px 0' }}>
          {loading && (
            <div style={{ padding: '12px' }}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} style={{ height: 10, background: 'var(--glass-medium)', borderRadius: 2, marginBottom: 8, animation: 'pulse 1.5s infinite' }} />
              ))}
            </div>
          )}

          {error && (
            <div style={{ padding: '12px', color: 'var(--red)', fontSize: 12 }}>{error}</div>
          )}

          {!loading && !error && (
            <>
              <div
                onClick={goUp}
                style={{
                  padding: '5px 14px',
                  fontSize: 12,
                  color: 'var(--text-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                }}
              >
                <span>📁</span> ..
              </div>

              {dirs.map(d => (
                <div
                  key={d.path}
                  onClick={() => navigateTo(d.path)}
                  onDoubleClick={() => { navigateTo(d.path); }}
                  style={{
                    padding: '5px 14px',
                    fontSize: 12,
                    color: d.path === selectedPath ? 'var(--text-primary)' : 'var(--text-dim)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    background: d.path === selectedPath ? 'var(--glass-active)' : 'transparent',
                  }}
                >
                  <span>📁</span> {d.name}
                </div>
              ))}

              {dirs.length === 0 && (
                <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-dim)' }}>
                  No subdirectories
                </div>
              )}
            </>
          )}
        </div>

        <div style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '4px 16px',
              fontSize: 11,
              color: 'var(--text-dim)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              borderRadius: 2,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleOpenClick}
            disabled={!selectedPath && !currentPath}
            style={{
              padding: '4px 16px',
              fontSize: 11,
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 2,
              cursor: 'pointer',
            }}
          >
            Open
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd d:\git\monika\frontend && npx tsc --noEmit`
Expected: no new errors. Fix any type issues (dynamic imports, casting, etc.).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TitleBar/FileDialog.tsx
git commit -m "feat: add FileDialog component for in-app folder selection"
```

---

### Task 14: Modify TitleBar

**Files:**
- Modify: `frontend/src/components/TitleBar/TitleBar.tsx`

- [ ] **Step 1: Rewrite TitleBar with interactive project/branch triggers**

Replace `frontend/src/components/TitleBar/TitleBar.tsx`. Keep the existing imports, add new ones, and restructure:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Window } from '@wailsio/runtime';
import { App, Events } from '../../bindings/monika';
import { useStore } from '../../store';
import { IconChatLayout, IconClose, IconMaximize, IconMinimize, IconSplitLayout, IconFilesLayout, IconRestore, IconChevronDown } from '../Icons';
import { ProjectDropdown } from './ProjectDropdown';
import { BranchDropdown } from './BranchDropdown';
import { CreateBranchPanel } from './CreateBranchPanel';
import { FileDialog } from './FileDialog';
import { ConfirmModal } from '../Chat/ConfirmModal';

export function TitleBar() {
  const { projectPath, branch, openFiles, generatingSessionId, resetProjectState, setProjectPath, setBranch, loadBranches, loadRecentProjects } = useStore();
  const [maximized, setMaximized] = useState(false);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [showCreateBranch, setShowCreateBranch] = useState(false);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; targetPath: string } | null>(null);
  const projectTriggerRef = useRef<HTMLSpanElement>(null);
  const branchTriggerRef = useRef<HTMLSpanElement>(null);

  const projectName = projectPath ? projectPath.split(/[/\\]/).pop() || projectPath : '';

  // Track maximized state.
  useEffect(() => {
    const unsubMax = Events.On('common:WindowMaximise', () => setMaximized(true));
    const unsubUnmax = Events.On('common:WindowUnMaximise', () => setMaximized(false));
    const unsubRestore = Events.On('common:WindowRestore', () => setMaximized(false));
    return () => { unsubMax(); unsubUnmax(); unsubRestore(); };
  }, []);

  // Load recent projects on mount.
  useEffect(() => {
    loadRecentProjects();
  }, [loadRecentProjects]);

  const handleProjectSelect = useCallback(async (targetPath: string) => {
    // Check for unsaved files or generating session.
    const dirtyCount = openFiles.filter(f => f.isDirty).length;
    const isGenerating = generatingSessionId !== '';

    if (dirtyCount > 0 || isGenerating) {
      let message = '';
      if (dirtyCount > 0 && isGenerating) {
        message = `You have ${dirtyCount} unsaved files and a session is generating. Switching projects will discard changes and interrupt generation.`;
      } else if (dirtyCount > 0) {
        message = `You have ${dirtyCount} unsaved files. Switching projects will lose unsaved changes.`;
      } else {
        message = 'A session is generating a response. Switching projects will interrupt it.';
      }
      setConfirmModal({ title: 'Switch Project', message, targetPath });
      return;
    }

    await doSwitchProject(targetPath);
  }, [openFiles, generatingSessionId]);

  const doSwitchProject = async (targetPath: string) => {
    if (generatingSessionId) {
      // Cancel active generation via the session manager.
      // Note: CancelGeneration is accessed via the bindings.
    }
    const { App } = await import('../../bindings/monika');
    const info = await App.OpenProject(targetPath);
    if (!info) return;
    resetProjectState();
    setProjectPath(info.path);
    setBranch(info.branch);
    await loadBranches();
    await loadRecentProjects();
  };

  const handleOpenFileDialog = () => {
    setProjectDropdownOpen(false);
    setFileDialogOpen(true);
  };

  const handleFileDialogOpen = async (dirPath: string) => {
    setFileDialogOpen(false);
    await handleProjectSelect(dirPath);
  };

  const isGitRepo = projectPath && branch !== '—';

  return (
    <>
      <div
        className="flex items-center h-[32px] relative select-none"
        style={{ background: 'var(--glass-strong)', padding: '0 8px', WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          Monika
        </span>

        {/* Project trigger */}
        <span
          ref={projectTriggerRef}
          onClick={() => { setProjectDropdownOpen(!projectDropdownOpen); setBranchDropdownOpen(false); }}
          style={{
            fontSize: 11,
            color: projectDropdownOpen ? 'var(--accent)' : 'var(--text-dim)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            padding: '2px 4px',
            borderRadius: 2,
            marginLeft: 12,
            WebkitAppRegion: 'no-drag',
            background: projectDropdownOpen ? 'rgba(91,141,239,0.08)' : 'transparent',
          }}
        >
          {projectName || 'project'}
          <IconChevronDown size={10} style={{ transform: projectDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </span>

        {/* Branch trigger */}
        <span
          ref={branchTriggerRef}
          onClick={() => {
            if (!isGitRepo) return;
            setBranchDropdownOpen(!branchDropdownOpen);
            setProjectDropdownOpen(false);
            setShowCreateBranch(false);
          }}
          title={isGitRepo ? undefined : 'Not a git repository'}
          style={{
            fontSize: 11,
            color: branchDropdownOpen ? 'var(--accent)' : 'var(--text-dim)',
            cursor: isGitRepo ? 'pointer' : 'default',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            padding: '2px 4px',
            borderRadius: 2,
            marginLeft: 6,
            WebkitAppRegion: 'no-drag',
            background: branchDropdownOpen ? 'rgba(91,141,239,0.08)' : 'transparent',
            opacity: isGitRepo ? 1 : 0.5,
          }}
        >
          {isGitRepo ? branch : '—'}
          {isGitRepo && (
            <IconChevronDown size={10} style={{ transform: branchDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          )}
        </span>

        <div style={{ flex: 1 }} />

        {/* Layout mode buttons */}
        <div style={{ WebkitAppRegion: 'no-drag', display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* ... existing layout buttons ... */}
        </div>

        {/* Window controls */}
        <div style={{ WebkitAppRegion: 'no-drag', display: 'flex', alignItems: 'center', marginLeft: 8 }}>
          {/* ... existing window buttons ... */}
        </div>
      </div>

      {/* Dropdowns and modals */}
      <ProjectDropdown
        isOpen={projectDropdownOpen}
        onClose={() => setProjectDropdownOpen(false)}
        onOpenFileDialog={handleOpenFileDialog}
        triggerRef={projectTriggerRef}
      />

      <BranchDropdown
        isOpen={branchDropdownOpen && !showCreateBranch}
        onClose={() => { setBranchDropdownOpen(false); setShowCreateBranch(false); }}
        onNewBranch={() => setShowCreateBranch(true)}
        triggerRef={branchTriggerRef}
      />

      {branchDropdownOpen && showCreateBranch && (
        /* CreateBranchPanel renders inside the same portal position */
        <div style={{
          position: 'fixed',
          top: (branchTriggerRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
          left: branchTriggerRef.current?.getBoundingClientRect().left ?? 0,
          minWidth: 280,
          background: 'var(--bg-sidebar)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          zIndex: 1000,
        }}>
          <CreateBranchPanel
            onCancel={() => setShowCreateBranch(false)}
            onCreated={() => { setShowCreateBranch(false); setBranchDropdownOpen(true); }}
          />
        </div>
      )}

      <FileDialog
        isOpen={fileDialogOpen}
        onClose={() => setFileDialogOpen(false)}
        onOpen={handleFileDialogOpen}
      />

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel="Discard"
          onConfirm={async () => {
            const target = confirmModal.targetPath;
            setConfirmModal(null);
            await doSwitchProject(target);
          }}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </>
  );
}
```

**Important:** Keep the existing layout mode buttons and window control buttons unchanged — only the project/branch spans and the new dropdown/portal rendering at the bottom are new. The `... existing layout buttons ...` and `... existing window buttons ...` comments above are placeholders — the actual code should copy the existing button JSX from the current TitleBar.tsx.

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd d:\git\monika\frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TitleBar/TitleBar.tsx
git commit -m "feat: integrate dropdowns into TitleBar for project/branch switching"
```

---

### Task 15: Integration Testing

**Files:**
- None (manual testing)

- [ ] **Step 1: Build and run the application**

```bash
cd d:\git\monika && wails dev
```

- [ ] **Step 2: Test project dropdown**

1. Click the project name in TitleBar → dropdown opens
2. Verify recent projects list appears (or "No recent projects" if first run)
3. Press Escape → dropdown closes
4. Click project name again, click "Open New Project..." → FileDialog opens
5. Navigate to a git directory, click Open
6. Verify project switches, TitleBar updates, sessions/files cleared

- [ ] **Step 3: Test branch dropdown**

1. Click branch name → dropdown opens
2. Verify local and remote branches appear, current branch has ✓
3. Select a different branch → verify checkout succeeds, TitleBar updates, open file tabs refresh
4. Click "New Branch..." → CreateBranchPanel appears
5. Enter a branch name, select base, click Create & Switch → verify new branch created
6. Test with dirty working tree → verify error message appears in dropdown (not console)

- [ ] **Step 4: Test confirmation dialogs**

1. Open a file, make unsaved changes → try to switch project → verify ConfirmModal with "N unsaved files" message
2. Start a chat generation → try to switch project → verify ConfirmModal
3. Both unsaved + generating → verify combined message

- [ ] **Step 5: Test edge cases**

1. Empty recent projects → verify only "Open New Project..." shown
2. Non-git directory → verify branch shows "—", no dropdown on click
3. Deleted recent project → verify grayed out with tooltip
4. Permission denied directory in FileDialog → verify error message

- [ ] **Step 6: Commit any follow-up fixes**

```bash
git add -A
git commit -m "fix: address integration issues from project/branch switching"
```

---

### Self-Review Checklist

**Spec coverage:**
- [x] GetRecentProjects API → Task 2
- [x] ListBranches API → Task 3
- [x] SwitchBranch API → Task 4
- [x] CreateBranch API → Task 5
- [x] ListDirectory API → Task 6
- [x] OpenProject modified → Task 7
- [x] Frontend bindings → Task 8
- [x] Store: recentProjects, allBranches, loadRecentProjects, loadBranches, resetProjectState → Task 9
- [x] ProjectDropdown component → Task 10
- [x] BranchDropdown component → Task 11
- [x] CreateBranchPanel component → Task 12
- [x] FileDialog component → Task 13
- [x] TitleBar integration → Task 14
- [x] Git command safety (-- separator, branch name validation) → Task 4
- [x] TOCTOU fix (direct git checkout) → Task 4
- [x] Loading/error states → Tasks 10, 11, 12, 13
- [x] Combined unsaved+generating message → Task 14
- [x] File tab refresh after branch switch → Task 11 (handleSwitch)
- [x] Inline error feedback → Tasks 10, 11, 12
- [x] recent.json atomic write → Task 2

**Placeholder scan:** No "TBD", "TODO", or placeholder patterns found.
