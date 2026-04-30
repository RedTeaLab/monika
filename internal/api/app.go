package api

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	agent2 "monika/internal/agent"
	config2 "monika/internal/config"
	tool2 "monika/internal/tool"
	engine2 "monika/pkg/engine"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type App struct {
	ctx context.Context

	home       string
	cfg        config2.Config
	provider   engine2.ProviderEngine
	model      string
	registry   *tool2.ToolRegistry
	startupCwd string

	mu       sync.RWMutex
	sessions map[string]*SessionManager
	projects map[string]*ProjectInfo
	fileSvc  map[string]*FileService

	eventBus    *EventBus
	cancelFuncs map[string]context.CancelFunc
	cancelMu    sync.Mutex

	loopOpts []agent2.LoopOption
}

func NewApp(home, cwd string, cfg config2.Config, provider engine2.ProviderEngine, model string, registry *tool2.ToolRegistry, loopOpts []agent2.LoopOption) *App {
	fmt.Fprintf(os.Stderr, "[monika] NewApp: home=%s cwd=%s\n", home, cwd)
	return &App{
		home:        home,
		cfg:         cfg,
		provider:    provider,
		model:       model,
		registry:    registry,
		startupCwd:  cwd,
		sessions:    make(map[string]*SessionManager),
		projects:    make(map[string]*ProjectInfo),
		fileSvc:     make(map[string]*FileService),
		eventBus:    NewEventBus(),
		cancelFuncs: make(map[string]context.CancelFunc),
		loopOpts:    loopOpts,
	}
}

func (a *App) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	fmt.Fprintf(os.Stderr, "[monika] ServiceStartup called, startupCwd=%q\n", a.startupCwd)
	a.ctx = ctx
	if a.startupCwd != "" {
		info, err := a.OpenProject(a.startupCwd)
		fmt.Fprintf(os.Stderr, "[monika] ServiceStartup OpenProject result: info=%+v err=%v\n", info, err)
		if err != nil {
			return err
		}
		_ = info
	}
	return nil
}

func (a *App) QuitApp() {
	application.Get().Quit()
}

func (a *App) GetCurrentProject() *ProjectInfo {
	fmt.Fprintf(os.Stderr, "[monika] GetCurrentProject called, startupCwd=%q projects=%v\n", a.startupCwd, func() []string {
		var keys []string
		for k := range a.projects {
			keys = append(keys, k)
		}
		return keys
	}())
	a.mu.RLock()
	defer a.mu.RUnlock()
	if info, ok := a.projects[a.startupCwd]; ok {
		fmt.Fprintf(os.Stderr, "[monika] GetCurrentProject returning: path=%s branch=%s\n", info.Path, info.Branch)
		return info
	}
	fmt.Fprintf(os.Stderr, "[monika] GetCurrentProject: no project found for key=%q\n", a.startupCwd)
	return nil
}

func (a *App) ServiceShutdown() error {
	a.cancelMu.Lock()
	for _, cancel := range a.cancelFuncs {
		cancel()
	}
	a.cancelMu.Unlock()
	a.eventBus.Close()
	return nil
}

func (a *App) ListProjects() []ProjectInfo {
	a.mu.RLock()
	defer a.mu.RUnlock()
	var projects []ProjectInfo
	for _, p := range a.projects {
		projects = append(projects, *p)
	}
	return projects
}

func (a *App) OpenProject(path string) (*ProjectInfo, error) {
	branch := ""
	cmd := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD")
	cmd.Dir = path
	out, err := cmd.Output()
	if err == nil {
		branch = strings.TrimSpace(string(out))
	}
	if branch == "" {
		branch = "—"
	}

	var worktrees []WorktreeInfo
	cmd2 := exec.Command("git", "worktree", "list", "--porcelain")
	cmd2.Dir = path
	out2, err2 := cmd2.Output()
	if err2 == nil {
		lines := strings.Split(strings.TrimSpace(string(out2)), "\n")
		var wt WorktreeInfo
		for _, line := range lines {
			if strings.HasPrefix(line, "branch ") {
				wt.Branch = strings.TrimSpace(strings.TrimPrefix(line, "branch refs/heads/"))
			}
			if strings.HasPrefix(line, "worktree ") {
				wt.Path = strings.TrimSpace(strings.TrimPrefix(line, "worktree "))
				worktrees = append(worktrees, wt)
				wt = WorktreeInfo{}
			}
		}
	}

	info := &ProjectInfo{
		Path:      path,
		Name:      filepath.Base(path),
		Branch:    branch,
		Worktrees: worktrees,
	}
	a.mu.Lock()
	a.projects[path] = info
	a.mu.Unlock()

	a.getSessionManager(path)
	a.getFileService(path)
	a.writeRecentProject(info.Path, info.Name)

	return info, nil
}

func (a *App) ListSessions(projectPath string) ([]SessionInfo, error) {
	sm := a.getSessionManager(projectPath)
	return sm.List()
}

func (a *App) NewSession(projectPath string) (*SessionInfo, error) {
	sm := a.getSessionManager(projectPath)
	s, err := sm.New(a.model, a.cfg.ModelProvider)
	if err != nil {
		return nil, err
	}
	s.Title = "New Session"
	if err := sm.Save(s); err != nil {
		return nil, err
	}
	return &SessionInfo{
		ID:        s.ID,
		Title:     s.Title,
		UpdatedAt: s.UpdatedAt.Format(time.RFC3339),
	}, nil
}

func (a *App) GetModels() ([]engine2.Model, error) {
	return a.provider.ListModels(a.ctx)
}

func (a *App) DeleteSession(projectPath, sessionID string) error {
	sm := a.getSessionManager(projectPath)
	return sm.Delete(sessionID)
}

func (a *App) LoadSession(projectPath, sessionID string) (*Session, error) {
	sm := a.getSessionManager(projectPath)
	return sm.Load(sessionID)
}

func (a *App) SendMessage(projectPath, sessionID, text string) error {
	sm := a.getSessionManager(projectPath)
	sm.Lock()
	defer sm.Unlock()

	s, err := sm.Load(sessionID)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithCancel(a.ctx)
	a.cancelMu.Lock()
	a.cancelFuncs[sessionID] = cancel
	a.cancelMu.Unlock()

	conv := &agent2.Conversation{
		ID:       s.ID,
		Messages: s.Messages,
	}

	opts := append([]agent2.LoopOption{
		agent2.WithModel(a.model),
		agent2.WithProjectDir(projectPath),
	}, a.loopOpts...)
	loop := agent2.NewLoop(a.provider, a.registry, opts...)

	go func() {
		defer cancel()
		defer func() {
			a.cancelMu.Lock()
			delete(a.cancelFuncs, sessionID)
			a.cancelMu.Unlock()
		}()

		events := loop.RunStreaming(ctx, conv, text)
		for ev := range events {
			a.handleAgentEvent(sessionID, ev)
		}

		s.Messages = conv.Messages
		sm.SetTitle(s)
		sm.Save(s)
			a.handleAgentEvent(sessionID, agent2.Event{
				Type:    agent2.EventSessionUpdated,
				Content: s.Title,
			})
	}()

	return nil
}

func (a *App) CancelGeneration(sessionID string) {
	a.cancelMu.Lock()
	cancel, ok := a.cancelFuncs[sessionID]
	a.cancelMu.Unlock()
	if ok {
		cancel()
	}
}

func (a *App) ReadFile(projectPath, filePath string) (*FileContent, error) {
	fs := a.getFileService(projectPath)
	fc, err := fs.ReadFile(filePath)
	if err != nil {
		return nil, err
	}
	return &fc, nil
}

func (a *App) WriteFile(projectPath, filePath, content string) error {
	fs := a.getFileService(projectPath)
	if err := fs.WriteFile(filePath, content); err != nil {
		return err
	}
	a.eventBus.Emit(StreamEvent{
		Type: "file_changed",
		FileChange: &FileChangeEvent{
			Path:   filePath,
			Status: "modified",
		},
	})
	return nil
}

func (a *App) ListFileTree(projectPath string) ([]FileNode, error) {
	fs := a.getFileService(projectPath)
	return fs.ListDir(".")
}

func (a *App) ListFileChanges(projectPath string) ([]FileChange, error) {
	fs := a.getFileService(projectPath)
	return fs.ListChanges()
}

func (a *App) GetFileDiff(projectPath, filePath string) (*DiffResult, error) {
	fs := a.getFileService(projectPath)
	dr, err := fs.GetDiff(filePath)
	if err != nil {
		return nil, err
	}
	return &dr, nil
}

func (a *App) handleAgentEvent(sessionID string, ev agent2.Event) {
	se := StreamEvent{
		SessionID: sessionID,
		Model:     a.model,
	}

	switch ev.Type {
	case agent2.EventTextDelta:
		se.Type = "text_delta"
		se.Content = ev.Content
	case agent2.EventThinking:
		se.Type = "thinking"
		se.Content = ev.Content
	case agent2.EventToolStart:
		se.Type = "tool_start"
		se.Tool = ev.Tool
	case agent2.EventToolOutput:
		se.Type = "tool_output"
		se.Tool = ev.Tool
	case agent2.EventToolDone:
		se.Type = "tool_done"
		se.Tool = ev.Tool
	case agent2.EventUsage:
		se.Type = "usage"
		se.AgentUsage = &ev.Usage
	case agent2.EventError:
		se.Type = "error"
		se.Content = ev.Content
	case agent2.EventDone:
		se.Type = "done"
	case agent2.EventSessionUpdated:
		se.Type = "session_updated"
		se.Content = ev.Content
	case agent2.EventTurnStart:
		se.Type = "turn_start"
	}

	fmt.Fprintf(os.Stderr, "[monika] emit stream event: type=%s session=%s\n", se.Type, sessionID)
	a.eventBus.Emit(se)
	application.Get().Event.Emit("stream", se)
}

func (a *App) getSessionManager(projectPath string) *SessionManager {
	a.mu.RLock()
	if sm, ok := a.sessions[projectPath]; ok {
		a.mu.RUnlock()
		return sm
	}
	a.mu.RUnlock()

	a.mu.Lock()
	defer a.mu.Unlock()
	if sm, ok := a.sessions[projectPath]; ok {
		return sm
	}
	sm := NewSessionManager(a.home, projectPath)
	a.sessions[projectPath] = sm
	return sm
}

func (a *App) getFileService(projectPath string) *FileService {
	a.mu.RLock()
	if fs, ok := a.fileSvc[projectPath]; ok {
		a.mu.RUnlock()
		return fs
	}
	a.mu.RUnlock()

	a.mu.Lock()
	defer a.mu.Unlock()
	if fs, ok := a.fileSvc[projectPath]; ok {
		return fs
	}
	fs := NewFileService(projectPath)
	a.fileSvc[projectPath] = fs
	return fs
}

// GetRecentProjects returns recently opened projects from ~/.monika/recent.json.
func (a *App) GetRecentProjects() []RecentProject {
	recentPath := filepath.Join(a.home, ".monika", "recent.json")
	data, err := os.ReadFile(recentPath)
	if err != nil {
		// File doesn't exist or can't be read — return empty list.
		return []RecentProject{}
	}

	var projects []RecentProject
	if err := json.Unmarshal(data, &projects); err != nil {
		// Corrupted file — log warning, return empty list.
		fmt.Fprintf(os.Stderr, "[monika] WARNING: failed to parse recent.json: %v\n", err)
		return []RecentProject{}
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
	if err := os.MkdirAll(recentDir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "[monika] failed to create recent dir: %v\n", err)
		return
	}
	recentPath := filepath.Join(recentDir, "recent.json")

	projects := a.GetRecentProjects()

	// Remove existing entry for this path (copy-based to avoid backing-array mutation).
	var updated []RecentProject
	for _, p := range projects {
		if p.Path != path {
			updated = append(updated, p)
		}
	}

	// Prepend with current timestamp.
	updated = append([]RecentProject{{
		Path:     path,
		Name:     name,
		OpenedAt: time.Now().Unix(),
	}}, updated...)

	if len(updated) > 20 {
		updated = updated[:20]
	}

	// Atomic write: write to temp file first, then rename.
	tmpPath := recentPath + ".tmp"
	data, err := json.MarshalIndent(updated, "", "  ")
	if err != nil {
		return
	}
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return
	}
	if err := os.Rename(tmpPath, recentPath); err != nil {
		fmt.Fprintf(os.Stderr, "[monika] failed to rename recent.json: %v\n", err)
	}
}

// ListDirectory returns the non-recursive contents of a directory.
func (a *App) ListDirectory(parentPath string) ([]FileNode, error) {
	// Canonicalize and reject obviously invalid paths.
	clean := filepath.Clean(parentPath)
	if clean == "." || clean == ".." {
		return nil, fmt.Errorf("invalid path: %s", parentPath)
	}

	entries, err := os.ReadDir(clean)
	if err != nil {
		return nil, err
	}

	var nodes []FileNode
	for _, entry := range entries {
		nodes = append(nodes, FileNode{
			Name:  entry.Name(),
			Path:  filepath.Join(clean, entry.Name()),
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

		line = strings.TrimPrefix(line, "* ")
		line = strings.TrimSpace(line)

		// Skip detached HEAD indicator and symbolic refs.
		if strings.HasPrefix(line, "(HEAD") || strings.Contains(line, "->") {
			continue
		}

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
// If name starts with "origin/" (remote branch), creates a local tracking branch via git checkout -b.
// Branch names are validated by validateBranchName to reject names starting with '-'.
func (a *App) SwitchBranch(projectPath, name string) error {
	if err := validateBranchName(name); err != nil {
		return err
	}

	// Detect remote branch pattern: "remoteName/branchName" where remoteName
	// matches a known git remote. Fall back to plain checkout if not a remote branch.
	var cmd *exec.Cmd
	if idx := strings.Index(name, "/"); idx > 0 {
		remoteName := name[:idx]
		localName := name[idx+1:]
		// Verify remoteName is a real remote.
		remoteCmd := exec.Command("git", "remote")
		remoteCmd.Dir = projectPath
		if remoteOut, err := remoteCmd.Output(); err == nil {
			for _, r := range strings.Split(strings.TrimSpace(string(remoteOut)), "\n") {
				if strings.TrimSpace(r) == remoteName {
					if err := validateBranchName(localName); err != nil {
						return err
					}
					cmd = exec.Command("git", "checkout", "-b", localName, name)
					break
				}
			}
		}
	}
	if cmd == nil {
		cmd = exec.Command("git", "checkout", name)
	}
	cmd.Dir = projectPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %s", err.Error(), strings.TrimSpace(string(out)))
	}

	// For remote checkout (checkout -b localName remote/branch), use localName.
	displayBranch := name
	if cmd.Args[1] == "checkout" && cmd.Args[2] == "-b" {
		displayBranch = cmd.Args[3] // localName from checkout -b localName remote/branch
	}

	a.setProjectBranch(projectPath, displayBranch)

	return nil
}

// setProjectBranch updates the in-memory branch for a project.
func (a *App) setProjectBranch(projectPath, branchName string) {
	a.mu.Lock()
	if info, ok := a.projects[projectPath]; ok {
		info.Branch = branchName
	}
	a.mu.Unlock()
}

// CreateBranch creates and checks out a new branch from the given base branch.
func (a *App) CreateBranch(projectPath, name, baseBranch string) error {
	if err := validateBranchName(name); err != nil {
		return err
	}
	if err := validateBranchName(baseBranch); err != nil {
		return err
	}

	cmd := exec.Command("git", "checkout", "-b", name, baseBranch)
	cmd.Dir = projectPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %s", err.Error(), strings.TrimSpace(string(out)))
	}

	a.setProjectBranch(projectPath, name)

	return nil
}
