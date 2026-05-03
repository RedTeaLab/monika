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

type childSessionDisk struct {
	Messages   []engine2.ChatMessage `json:"messages"`
	Agent      string                `json:"agent"`
	ParentID   string                `json:"parent_id"`
	Title      string                `json:"title"`
	TokenCount int64                 `json:"token_count"`
}

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

	taskStoreAccessor TaskStoreAccessor
	agentRegistry     *agent2.AgentRegistry
	taskRunner        *agent2.TaskRunner
	childSessions     map[string]*agent2.ChildSession // keyed by child session ID
	pendingChildren   map[string]string               // parentSessionID → childSessionID
	loopOpts          []agent2.LoopOption
}

func NewApp(home, cwd string, cfg config2.Config, provider engine2.ProviderEngine, model string, registry *tool2.ToolRegistry, loopOpts []agent2.LoopOption, taskStoreAccessor TaskStoreAccessor, agentRegistry *agent2.AgentRegistry, taskRunner *agent2.TaskRunner) *App {
	return &App{
		home:             home,
		cfg:              cfg,
		provider:         provider,
		model:            model,
		registry:         registry,
		startupCwd:       cwd,
		sessions:         make(map[string]*SessionManager),
		projects:         make(map[string]*ProjectInfo),
		fileSvc:          make(map[string]*FileService),
		eventBus:         NewEventBus(),
		cancelFuncs:      make(map[string]context.CancelFunc),
		taskStoreAccessor: taskStoreAccessor,
		agentRegistry:    agentRegistry,
		taskRunner:       taskRunner,
		childSessions:    make(map[string]*agent2.ChildSession),
pendingChildren:  make(map[string]string),
		loopOpts:         loopOpts,
	}
}

// SaveChildSession stores a completed child agent session.
func (a *App) SaveChildSession(sessionID string, child *agent2.ChildSession) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.childSessions[sessionID] = child
}

// LoadChildSession returns a completed child agent session, or nil.
func (a *App) LoadChildSession(sessionID string) *agent2.ChildSession {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.childSessions[sessionID]
}

// SaveChildSessionToDisk persists a completed child session to disk under
// the same project as its parent session.
func (a *App) SaveChildSessionToDisk(sessionID string, child *agent2.ChildSession) {
	sm := a.getSessionManagerForSession(child.ParentID)
	if sm == nil {
		fmt.Fprintf(os.Stderr, "[monika] SaveChildSessionToDisk: parent session %s not found\n", child.ParentID)
		return
	}
	dir := filepath.Join(sm.sessionsDir, "child_sessions")
	if err := os.MkdirAll(dir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "[monika] SaveChildSessionToDisk mkdir: %v\n", err)
		return
	}
	disk := childSessionDisk{
		Messages:   child.Messages,
		Agent:      child.Agent,
		ParentID:   child.ParentID,
		Title:      child.Title,
		TokenCount: child.TokenCount,
	}
	data, err := json.MarshalIndent(disk, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "[monika] SaveChildSessionToDisk marshal: %v\n", err)
		return
	}
	target := filepath.Join(dir, sessionID+".json")
	tmp := target + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "[monika] SaveChildSessionToDisk write: %v\n", err)
		return
	}
	if err := os.Rename(tmp, target); err != nil {
		fmt.Fprintf(os.Stderr, "[monika] SaveChildSessionToDisk rename: %v\n", err)
	}
}

// LoadChildSessionFromDisk loads a completed child session from disk.
func (a *App) LoadChildSessionFromDisk(projectPath, sessionID string) *agent2.ChildSession {
	dir := filepath.Join(a.home, ".monika", "projects", projectSlug(projectPath), "sessions", "child_sessions")
	path := filepath.Join(dir, sessionID+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var disk childSessionDisk
	if err := json.Unmarshal(data, &disk); err != nil {
		fmt.Fprintf(os.Stderr, "[monika] LoadChildSessionFromDisk unmarshal %s: %v\n", sessionID, err)
		return nil
	}
	return &agent2.ChildSession{
		Messages:   disk.Messages,
		Agent:      disk.Agent,
		ParentID:   disk.ParentID,
		Title:      disk.Title,
		TokenCount: disk.TokenCount,
	}
}

// PendingChildSession stores a child session ID for a parent, so the frontend
// can resolve it during execution (before the tool returns).
func (a *App) PendingChildSession(parentID, childID string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.pendingChildren[parentID] = childID
}

// ResolveChildSession returns the latest child session ID for a parent.
func (a *App) ResolveChildSession(parentID string) string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.pendingChildren[parentID]
}

// isPendingChild reports whether a child session ID has a pending registration.
func (a *App) isPendingChild(sessionID string) bool {
	a.mu.RLock()
	defer a.mu.RUnlock()
	for _, childID := range a.pendingChildren {
		if childID == sessionID {
			return true
		}
	}
	return false
}

func (a *App) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	a.ctx = ctx

	// Restore the last opened project if one was saved.
	if lastPath := a.loadLastProjectPath(); lastPath != "" {
		if stat, err := os.Stat(lastPath); err == nil && stat.IsDir() {
			if _, err := a.OpenProject(lastPath); err != nil {
				fmt.Fprintf(os.Stderr, "[monika] ServiceStartup failed to restore last project %s: %v\n", lastPath, err)
			}
		}
	}

	return nil
}

func (a *App) QuitApp() {
	application.Get().Quit()
}

func (a *App) GetCurrentProject() *ProjectInfo {
	a.mu.RLock()
	defer a.mu.RUnlock()

	// Prefer the last opened project over startup CWD.
	if lastPath := a.loadLastProjectPath(); lastPath != "" {
		if info, ok := a.projects[lastPath]; ok {
			return info
		}
	}

	if info, ok := a.projects[a.startupCwd]; ok {
		return info
	}
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
	cmd := command("git", "rev-parse", "--abbrev-ref", "HEAD")
	cmd.Dir = path
	out, err := cmd.Output()
	if err == nil {
		branch = strings.TrimSpace(string(out))
	}
	if branch == "" {
		branch = "—"
	}
	var worktrees []WorktreeInfo
	cmd2 := command("git", "worktree", "list", "--porcelain")
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
	// Reset any sessions left in StatusGenerating status from a previous crash
	a.resetStaleSessions(path)
	a.getFileService(path)
	a.writeRecentProject(info.Path, info.Name)
	a.saveLastProjectPath(path)

	return info, nil
}

func (a *App) ListSessions(projectPath string) ([]SessionInfo, error) {
	sm := a.getSessionManager(projectPath)
	return sm.List()
}

func (a *App) NewSession(projectPath, model string) (*SessionInfo, error) {
	sm := a.getSessionManager(projectPath)
	s, err := sm.New(model, a.cfg.ModelProvider)
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
		Status:    s.Status,
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
	// Check child sessions first (in-memory, then on-disk, then placeholder)
	if strings.HasPrefix(sessionID, "sub_") || strings.HasPrefix(sessionID, "call_") {
		if child := a.LoadChildSession(sessionID); child != nil {
			return &Session{
				ID:          sessionID,
				Title:       child.Title,
				Messages:    child.Messages,
				Status:      StatusSuccess,
				ParentID:    child.ParentID,
				TokenCount:  child.TokenCount,
			}, nil
		}
		if child := a.LoadChildSessionFromDisk(projectPath, sessionID); child != nil {
			return &Session{
				ID:          sessionID,
				Title:       child.Title,
				Messages:    child.Messages,
				Status:      StatusSuccess,
				ParentID:    child.ParentID,
				TokenCount:  child.TokenCount,
			}, nil
		}
		// Return placeholder only for recently-pending sessions so the
		// tab can open before the backend saves the child session.
		if a.isPendingChild(sessionID) {
			return &Session{
				ID:     sessionID,
				Title:  "Subagent",
				Status: StatusGenerating,
			}, nil
		}
		return nil, fmt.Errorf("child session %s not found", sessionID)
	}
	sm := a.getSessionManager(projectPath)
	return sm.Load(sessionID)
}

func (a *App) SendMessage(projectPath, sessionID, text, model string) error {
	sm := a.getSessionManager(projectPath)
	sm.Lock()
	defer sm.Unlock()

	s, err := sm.Load(sessionID)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithCancel(a.ctx)
	a.cancelMu.Lock()
	if _, exists := a.cancelFuncs[sessionID]; exists {
		a.cancelMu.Unlock()
		cancel()
		return fmt.Errorf("session %s is already generating", sessionID)
	}
	a.cancelFuncs[sessionID] = cancel
	a.cancelMu.Unlock()

	conv := &agent2.Conversation{
		ID:               s.ID,
		Messages:         s.Messages,
		TokenCount:       s.TokenCount,
		TokenMax:         s.TokenMax,
		CompactionCount:  s.CompactionCount,
		ArchivedMessages: s.ArchivedMessages,
	}

	opts := append([]agent2.LoopOption{}, a.loopOpts...)
	opts = append(opts, agent2.WithProjectDir(projectPath), agent2.WithModel(model))
	generalAgent, _ := a.agentRegistry.Get("general")
	opts = append(opts, agent2.WithAgent(generalAgent))
	fmt.Fprintf(os.Stderr, "[monika DEBUG] SendMessage: projectPath=%q\n", projectPath)
	loop := agent2.NewLoop(a.provider, a.registry, opts...)
	loop.SetDispatchFn(func(ctx context.Context, task agent2.SubTask) <-chan agent2.Event {
		return a.taskRunner.Dispatch(ctx, task, loop)
	})

	go func() {
		defer cancel()
		defer func() {
			a.cancelMu.Lock()
			delete(a.cancelFuncs, sessionID)
			a.cancelMu.Unlock()
		}()

		// Set generating status
		sm.Lock()
		sm.SetStatus(s, StatusGenerating)
		sm.Save(s)
		sm.Unlock()

		hadError := false

		events := loop.Run(ctx, conv, text)
		for ev := range events {
			if ev.Type == agent2.EventError {
				hadError = true
			}
			a.handleAgentEvent(sessionID, model, ev)
		}

		s.Messages = conv.Messages
		s.TokenCount = conv.TokenCount
		s.TokenMax = conv.TokenMax
		s.CompactionCount = conv.CompactionCount
		if len(conv.ArchivedMessages) > 0 {
			s.ArchivedMessages = conv.ArchivedMessages
		}
		sm.SetTitle(s)

			sm.Lock()
			if ctx.Err() != nil {
				sm.SetStatus(s, StatusIdle)
				sm.Save(s)
			} else if hadError {
				sm.SetStatus(s, StatusFailure)
				sm.Save(s)
			} else {
				sm.SetStatus(s, StatusSuccess)
				sm.Save(s)
			}
			sm.Unlock()

			if ctx.Err() == nil {
				a.handleAgentEvent(sessionID, model, agent2.Event{
					Type:    agent2.EventSessionUpdated,
					Content: s.Title,
				})
			}
	}()

	return nil
}

func (a *App) CancelGeneration(sessionID string) {
	a.cancelMu.Lock()
	cancel, ok := a.cancelFuncs[sessionID]
	a.cancelMu.Unlock()
	if ok {
		cancel()
		if sm := a.getSessionManagerForSession(sessionID); sm != nil {
			if s, err := sm.Load(sessionID); err == nil {
				sm.Lock()
				sm.SetStatus(s, StatusIdle)
				sm.Save(s)
				sm.Unlock()
			}
		}
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
	return fs.ListDir("")
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

func (a *App) handleAgentEvent(sessionID, model string, ev agent2.Event) {
	// Route to child session if event carries its own session ID
	sid := sessionID
	if ev.SessionID != "" {
		sid = ev.SessionID
	}
	se := StreamEvent{
		SessionID: sid,
		Model:     model,
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
	case agent2.EventCompacting:
		se.Type = "compacting"
		se.Compacting = ev.Compacting
	case agent2.EventCompaction:
		se.Type = "compaction"
		se.Compaction = ev.Compaction
	}

	a.eventBus.Emit(se)
	application.Get().Event.Emit("stream", se)
}

func (a *App) EmitTaskEvent(sessionID string, tasks []agent2.TaskItem) {
	se := StreamEvent{
		SessionID: sessionID,
		Type:      "task_updated",
		Tasks:     tasks,
	}
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

func (a *App) resetStaleSessions(projectPath string) {
	sm := a.getSessionManager(projectPath)
	sessions, err := sm.List()
	if err != nil {
		return
	}
	for _, info := range sessions {
		if info.Status == StatusGenerating {
			s, err := sm.Load(info.ID)
			if err != nil {
				continue
			}
			sm.Lock()
			sm.SetStatus(s, StatusIdle)
			sm.Save(s)
			sm.Unlock()
		}
	}
}

func (a *App) getSessionManagerForSession(sessionID string) *SessionManager {
	a.mu.RLock()
	defer a.mu.RUnlock()
	for _, sm := range a.sessions {
		if _, err := sm.Load(sessionID); err == nil {
			return sm
		}
	}
	return nil
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

func (a *App) statePath() string {
	return filepath.Join(a.home, ".monika", "state.json")
}

func (a *App) loadLastProjectPath() string {
	data, err := os.ReadFile(a.statePath())
	if err != nil {
		return ""
	}
	var state struct {
		LastProjectPath string `json:"last_project_path"`
	}
	if err := json.Unmarshal(data, &state); err != nil {
		return ""
	}
	return state.LastProjectPath
}

func (a *App) saveLastProjectPath(path string) {
	dir := filepath.Join(a.home, ".monika")
	if err := os.MkdirAll(dir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "[monika] failed to create state dir: %v\n", err)
		return
	}
	state := struct {
		LastProjectPath string `json:"last_project_path"`
	}{LastProjectPath: path}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return
	}
	statePath := a.statePath()
	tmpPath := statePath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return
	}
	if err := os.Rename(tmpPath, statePath); err != nil {
		fmt.Fprintf(os.Stderr, "[monika] failed to rename state.json: %v\n", err)
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
	cmd := command("git", "branch", "-a", "--no-color")
	cmd.Dir = projectPath
	out, err := cmd.Output()
	if err != nil {
		fmt.Fprintf(os.Stderr, "[monika] ListBranches git branch failed: %v\n", err)
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
// Automatically stashes tracked changes before checkout and pops them afterward.
func (a *App) SwitchBranch(projectPath, name string) error {
	if err := validateBranchName(name); err != nil {
		return err
	}

	// Guard: check for unresolved merge conflicts before attempting stash.
	if files := hasUnmergedFiles(projectPath); len(files) > 0 {
		return fmt.Errorf("UNMERGED_FILES:%s", strings.Join(files, ","))
	}

	// Auto-stash tracked changes so they don't block checkout.
	stashed, err := autoStash(projectPath)
	if err != nil {
		return err
	}

	// Detect remote branch pattern: "remoteName/branchName" where remoteName
	// matches a known git remote. Fall back to plain checkout if not a remote branch.
	var cmd *exec.Cmd
	if idx := strings.Index(name, "/"); idx > 0 {
		remoteName := name[:idx]
		localName := name[idx+1:]
		// Verify remoteName is a real remote.
		remoteCmd := command("git", "remote")
		remoteCmd.Dir = projectPath
		if remoteOut, err := remoteCmd.Output(); err == nil {
			for _, r := range strings.Split(strings.TrimSpace(string(remoteOut)), "\n") {
				if strings.TrimSpace(r) == remoteName {
					if err := validateBranchName(localName); err != nil {
						return err
					}
					cmd = command("git", "checkout", "-b", localName, name)
					break
				}
			}
		}
	}
	if cmd == nil {
		cmd = command("git", "checkout", name)
	}
	cmd.Dir = projectPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		fmt.Fprintf(os.Stderr, "[monika] SwitchBranch git checkout failed: %v output=%s\n", err, strings.TrimSpace(string(out)))
		// If checkout failed, try to restore stashed changes before returning.
		if stashed {
			_ = autoStashPop(projectPath)
		}
		return fmt.Errorf("%s: %s", err.Error(), strings.TrimSpace(string(out)))
	}

	// For remote checkout (checkout -b localName remote/branch), use localName.
	displayBranch := name
	if cmd.Args[1] == "checkout" && cmd.Args[2] == "-b" {
		displayBranch = cmd.Args[3] // localName from checkout -b localName remote/branch
	}

	a.setProjectBranch(projectPath, displayBranch)

	// Restore stashed changes on the new branch.
	if stashed {
		_ = autoStashPop(projectPath)
	}

	return nil
}

// hasUnmergedFiles returns a list of unmerged file paths in the project.
func hasUnmergedFiles(projectPath string) []string {
	cmd := command("git", "diff", "--name-only", "--diff-filter=U")
	cmd.Dir = projectPath
	out, err := cmd.Output()
	if err != nil {
		return nil
	}
	var files []string
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line != "" {
			files = append(files, line)
		}
	}
	return files
}

// autoStash stashes tracked changes in the project directory.
// Returns true if a stash entry was created, false if there was nothing to stash.
func autoStash(projectPath string) (bool, error) {
	if !hasTrackedChanges(projectPath) {
		return false, nil
	}
	cmd := command("git", "stash", "push", "-m", "monika: auto-stash before branch switch")
	cmd.Dir = projectPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		return false, fmt.Errorf("auto-stash failed: %s: %s", err.Error(), strings.TrimSpace(string(out)))
	}
	return true, nil
}

// autoStashPop pops the most recent stash entry. Errors are logged but not returned
// since the branch switch itself succeeded and the stash is still preserved.
func autoStashPop(projectPath string) error {
	cmd := command("git", "stash", "pop", "--quiet")
	cmd.Dir = projectPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		fmt.Fprintf(os.Stderr, "[monika] stash pop after branch switch failed (stash preserved): %s\n", strings.TrimSpace(string(out)))
		return err
	}
	return nil
}

// hasTrackedChanges returns true if there are any uncommitted tracked changes
// (staged or unstaged), excluding untracked files which don't block checkout.
func hasTrackedChanges(projectPath string) bool {
	cmd := command("git", "status", "--porcelain")
	cmd.Dir = projectPath
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// Untracked files (??) don't block checkout; only tracked changes matter.
		if !strings.HasPrefix(line, "??") {
			return true
		}
	}
	return false
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

	// Guard: check for unresolved merge conflicts before attempting stash.
	if files := hasUnmergedFiles(projectPath); len(files) > 0 {
		return fmt.Errorf("UNMERGED_FILES:%s", strings.Join(files, ","))
	}

	stashed, err := autoStash(projectPath)
	if err != nil {
		return err
	}

	cmd := command("git", "checkout", "-b", name, baseBranch)
	cmd.Dir = projectPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		fmt.Fprintf(os.Stderr, "[monika] CreateBranch git checkout -b failed: %v output=%s\n", err, strings.TrimSpace(string(out)))
		if stashed {
			_ = autoStashPop(projectPath)
		}
		return fmt.Errorf("%s: %s", err.Error(), strings.TrimSpace(string(out)))
	}

	a.setProjectBranch(projectPath, name)

	if stashed {
		_ = autoStashPop(projectPath)
	}

	return nil
}
