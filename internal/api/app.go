package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	agent2 "monika/internal/agent"
	config2 "monika/internal/config"
	"monika/internal/permission"
	tool2 "monika/internal/tool"
	engine2 "monika/pkg/engine"

	"github.com/wailsapp/wails/v3/pkg/application"
	"gopkg.in/yaml.v3"
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

	home              string
	cfg               config2.Config
	providers         map[string]engine2.ProviderEngine
	model             string
	registry          *tool2.ToolRegistry
	startupCwd        string
	taskStoreAccessor TaskStoreAccessor

	mu       sync.RWMutex
	sessions map[string]*SessionManager
	projects map[string]*ProjectInfo
	fileSvc  map[string]*FileService

	eventBus    *EventBus
	cancelFuncs map[string]context.CancelFunc
	cancelMu    sync.Mutex

	agentRegistry     *agent2.AgentRegistry
	taskRunner        *agent2.TaskRunner
	childSessions     map[string]*agent2.ChildSession // keyed by child session ID
	pendingChildren   map[string]string               // parentSessionID → childSessionID
	loopOpts          []agent2.LoopOption
	baseLoopOptsCount int // number of opts passed at construction (before refreshSkillPrompt appends)
	baseSystemPrompt  string

	permissionRequests map[string]chan permission.PermissionResponse
	permMu             sync.Mutex

	pipeline *permission.Pipeline
}

func NewApp(home, cwd string, cfg config2.Config, providers map[string]engine2.ProviderEngine, model string, registry *tool2.ToolRegistry, loopOpts []agent2.LoopOption, taskStoreAccessor TaskStoreAccessor, agentRegistry *agent2.AgentRegistry, taskRunner *agent2.TaskRunner, baseSystemPrompt string) *App {
	return &App{
		home:              home,
		cfg:               cfg,
		providers:         providers,
		model:             model,
		registry:          registry,
		startupCwd:        cwd,
		taskStoreAccessor: taskStoreAccessor,
		sessions:          make(map[string]*SessionManager),
		projects:          make(map[string]*ProjectInfo),
		fileSvc:           make(map[string]*FileService),
		eventBus:          NewEventBus(),
		cancelFuncs:       make(map[string]context.CancelFunc),
		agentRegistry:     agentRegistry,
		taskRunner:        taskRunner,
		childSessions:     make(map[string]*agent2.ChildSession),
		pendingChildren:   make(map[string]string),
		loopOpts:          loopOpts,
		baseSystemPrompt:  baseSystemPrompt,
		baseLoopOptsCount: len(loopOpts),
	}
}

// refreshSkillPrompt rebuilds the system prompt in loopOpts with the current skill list.
// Future sessions will see the updated skills; running sessions keep their existing prompt.
func (a *App) refreshSkillPrompt() {
	eng, err := engine2.EngineByID("skill")
	if err != nil {
		return
	}
	skEng, ok := eng.(engine2.SkillEngine)
	if !ok {
		return
	}
	skills, err := skEng.Discover(context.Background(), a.home, a.startupCwd, a.cfg.Skill.Paths)
	if err != nil {
		return
	}
	fullPrompt := a.baseSystemPrompt + agent2.BuildSkillsPrompt(skills)
	a.loopOpts = append(a.loopOpts[:a.baseLoopOptsCount], agent2.WithSystemPrompt(fullPrompt))
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

func (a *App) NewSession(projectPath, providerID, model string) (*SessionInfo, error) {
	sm := a.getSessionManager(projectPath)
	s, err := sm.New(model, providerID)
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

func (a *App) GetProviders() []ProviderInfo {
	result := make([]ProviderInfo, 0, len(a.cfg.ModelProviders))
	for id, pc := range a.cfg.ModelProviders {
		displayName := pc.Name
		if displayName == "" {
			displayName = id
		}
		models := make([]ModelEntryJSON, 0, len(pc.Models))
		for _, m := range pc.Models {
			models = append(models, ModelEntryJSON{
				ID:           m.ID,
				Name:         m.DisplayName,
				ContextLimit: int64(m.ContextLimit),
			})
		}
		result = append(result, ProviderInfo{
			ID:          id,
			DisplayName: displayName,
			BaseURL:     pc.BaseURL,
			APIKey:      pc.APIKey,
			WireAPI:     pc.WireAPI,
			Models:      models,
		})
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].ID < result[j].ID
	})
	return result
}

func (a *App) GetDefaultModel() map[string]string {
	return map[string]string{
		"provider": a.cfg.ModelProvider,
		"model":    a.cfg.Model,
	}
}

func (a *App) SetDefaultModel(providerID, modelID string) {
	a.PersistSelection(providerID, modelID)
}

func (a *App) GetModels(providerID string) ([]engine2.Model, error) {
	p, ok := a.providers[providerID]
	if !ok {
		return nil, fmt.Errorf("provider %q not available", providerID)
	}
	return p.ListModels(a.ctx)
}

func (a *App) PersistSelection(providerID, modelID string) {
	a.cfg.ModelProvider = providerID
	a.cfg.Model = modelID

	configPath := filepath.Join(a.home, ".monika", "config.json")
	data, err := json.MarshalIndent(&a.cfg, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "[monika] WARNING: failed to marshal config: %v\n", err)
		return
	}
	if err := os.WriteFile(configPath, data, 0600); err != nil {
		fmt.Fprintf(os.Stderr, "[monika] WARNING: failed to write config: %v\n", err)
	}
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
				ID:         sessionID,
				Title:      child.Title,
				Messages:   child.Messages,
				Status:     StatusSuccess,
				ParentID:   child.ParentID,
				TokenCount: child.TokenCount,
			}, nil
		}
		if child := a.LoadChildSessionFromDisk(projectPath, sessionID); child != nil {
			return &Session{
				ID:         sessionID,
				Title:      child.Title,
				Messages:   child.Messages,
				Status:     StatusSuccess,
				ParentID:   child.ParentID,
				TokenCount: child.TokenCount,
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
	s, err := sm.Load(sessionID)
	if err != nil {
		return nil, err
	}
	a.restoreTasksFromSession(s)
	return s, nil
}

func (a *App) SendMessage(projectPath, sessionID, text, providerID, model string) error {
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

	providerEng, ok := a.providers[providerID]
	if !ok {
		return fmt.Errorf("provider %q not available", providerID)
	}

	conv := &agent2.Conversation{
		ID:               s.ID,
		Messages:         s.Messages,
		TokenCount:       s.TokenCount,
		TokenMax:         s.TokenMax,
		CompactionCount:  s.CompactionCount,
		ArchivedMessages: s.ArchivedMessages,
	}

	opts := append([]agent2.LoopOption{}, a.loopOpts...)
	opts = append(opts,
		agent2.WithProjectDir(projectPath),
		agent2.WithProvider(providerID),
		agent2.WithModel(model),
		agent2.WithSessionID(sessionID),
	)
	generalAgent, _ := a.agentRegistry.Get("general")
	if limit := a.resolveModelContextLimit(providerID, model); limit > 0 {
		opts = append(opts, agent2.WithModelContextLimit(limit))
	}
	opts = append(opts, agent2.WithAgent(generalAgent))
	fmt.Fprintf(os.Stderr, "[monika DEBUG] SendMessage: projectPath=%q provider=%q\n", projectPath, providerID)
	loop := agent2.NewLoop(providerEng, a.registry, opts...)
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

		// Persist tasks alongside the session so they survive restarts.
		a.syncTasksToSession(sessionID, s)

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
				sm.SetStatus(s, StatusStopped)
				sm.Save(s)
				sm.Unlock()
			}
		}
	}
}

func resolveShellAPI() (string, string) {
	if runtime.GOOS == "windows" {
		if path, err := exec.LookPath("pwsh"); err == nil {
			return path, "-Command"
		}
		if path, err := exec.LookPath("powershell"); err == nil {
			return path, "-Command"
		}
		if path, err := exec.LookPath("cmd"); err == nil {
			return path, "/C"
		}
		return "", ""
	}
	if path, err := exec.LookPath("sh"); err == nil {
		return path, "-c"
	}
	if path, err := exec.LookPath("bash"); err == nil {
		return path, "-c"
	}
	return "", ""
}

var ansiRE = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)

func stripANSI(s string) string {
	return ansiRE.ReplaceAllString(s, "")
}

// RunShellCommand executes a shell command in the project directory and returns merged stdout+stderr.
// Commands timeout after 120 seconds.
func (a *App) RunShellCommand(projectPath, command string) (string, error) {
	shell, shellArg := resolveShellAPI()
	if shell == "" {
		return "", fmt.Errorf("no shell found on system")
	}

	timeoutCtx, cancel := context.WithTimeout(a.ctx, 120*time.Second)
	defer cancel()

	cmd := exec.CommandContext(timeoutCtx, shell, shellArg, command)
	cmd.Dir = projectPath
	hideWindow(cmd)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	out := stdout.String()
	if errStderr := stderr.String(); errStderr != "" {
		if out != "" {
			out += "\n"
		}
		out += errStderr
	}

	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			// Command ran but exited non-zero: include exit info in output, don't return error
			if out != "" {
				out += "\n"
			}
			out += fmt.Sprintf("exit code: %d", exitErr.ExitCode())
			return strings.TrimSpace(stripANSI(out)), nil
		}
		// System error (timeout, etc.): propagate as error
		if out == "" {
			out = err.Error()
		}
		return strings.TrimSpace(stripANSI(out)), err
	}

	return strings.TrimSpace(stripANSI(out)), nil
}

// ListSystemCommands searches PATH for executable files matching prefix.
// Returns up to 20 results, sorted alphabetically.
func (a *App) ListSystemCommands(prefix string) ([]string, error) {
	pathEnv := os.Getenv("PATH")
	if pathEnv == "" {
		return nil, nil
	}
	exts := []string{""}
	if runtime.GOOS == "windows" {
		pathext := os.Getenv("PATHEXT")
		if pathext != "" {
			for _, e := range strings.Split(pathext, ";") {
				exts = append(exts, strings.ToLower(e))
			}
		} else {
			exts = append(exts, ".exe", ".cmd", ".bat", ".ps1", ".com")
		}
	}

	seen := make(map[string]bool)
	var results []string
	lowerPrefix := strings.ToLower(prefix)

	for _, dir := range filepath.SplitList(pathEnv) {
		if len(results) >= 20 {
			break
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if len(results) >= 20 {
				break
			}
			name := entry.Name()
			if !strings.HasPrefix(strings.ToLower(name), lowerPrefix) {
				continue
			}
			if entry.IsDir() {
				continue
			}
			hasExt := false
			for _, ext := range exts {
				if ext == "" {
					continue
				}
				if strings.HasSuffix(strings.ToLower(name), ext) {
					hasExt = true
					break
				}
			}
			if !hasExt && len(exts) > 1 {
				continue
			}
			baseName := name
			for _, ext := range exts {
				if ext != "" && strings.HasSuffix(strings.ToLower(baseName), ext) {
					baseName = baseName[:len(baseName)-len(ext)]
					break
				}
			}
			if seen[baseName] {
				continue
			}
			seen[baseName] = true
			results = append(results, baseName)
		}
	}

	sort.Strings(results)
	return results, nil
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

func (a *App) ListChangeStats(projectPath string) ([]ChangeStat, error) {
	fs := a.getFileService(projectPath)
	return fs.ListChangeStats()
}

func (a *App) GetFileDiff(projectPath, filePath string) (*DiffResult, error) {
	fs := a.getFileService(projectPath)
	dr, err := fs.GetDiff(filePath)
	if err != nil {
		return nil, err
	}
	return &dr, nil
}

func (a *App) GetInlineDiff(projectPath, filePath, oldContent string) (*DiffResult, error) {
	fs := a.getFileService(projectPath)
	dr, err := fs.GetInlineDiff(filePath, oldContent)
	if err != nil {
		return nil, err
	}
	return &dr, nil
}

func (a *App) resolveModelContextLimit(providerID, modelID string) int64 {
	if pc, ok := a.cfg.ModelProviders[providerID]; ok {
		for _, m := range pc.Models {
			if m.ID == modelID && m.ContextLimit.Int64() > 0 {
				return m.ContextLimit.Int64()
			}
		}
	}
	return 0
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

// syncTasksToSession reads the current tasks for a session from the TaskStore
// and writes them onto the Session struct so they are persisted to disk.
func (a *App) syncTasksToSession(sessionID string, s *Session) {
	if a.taskStoreAccessor == nil {
		return
	}
	ts := a.taskStoreAccessor.GetTaskStore(sessionID)
	if ts == nil {
		return
	}
	s.Tasks = ts.List(sessionID)
}

// restoreTasksFromSession loads persisted tasks into the TaskStore and emits a
// task_updated event so the frontend renders them without waiting for a new
// LLM-initiated task_create.
func (a *App) restoreTasksFromSession(s *Session) {
	if a.taskStoreAccessor == nil || len(s.Tasks) == 0 {
		return
	}
	a.taskStoreAccessor.Restore(s.ID, s.Tasks)
	taskItems := make([]agent2.TaskItem, len(s.Tasks))
	for i, t := range s.Tasks {
		taskItems[i] = agent2.TaskItem{
			ID: t.ID, Subject: t.Subject, Description: t.Description,
			Status: t.Status, BlockedBy: t.BlockedBy,
		}
	}
	a.EmitTaskEvent(s.ID, taskItems)
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
			sm.SetStatus(s, StatusStopped)
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

// RequestConfirm implements permission.ConfirmUI.
func (a *App) RequestConfirm(ctx context.Context, ev permission.PermissionRequiredEvent) (permission.PermissionResponse, error) {
	ch := make(chan permission.PermissionResponse, 1)
	a.permMu.Lock()
	if a.permissionRequests == nil {
		a.permissionRequests = make(map[string]chan permission.PermissionResponse)
	}
	a.permissionRequests[ev.RequestID] = ch
	a.permMu.Unlock()

	// Emit event to frontend via existing stream channel
	se := StreamEvent{
		Type:       "permission_required",
		SessionID:  ev.SessionID,
		Permission: &ev,
	}
	application.Get().Event.Emit("stream", se)

	// Block until response or context cancellation
	select {
	case resp := <-ch:
		return resp, nil
	case <-ctx.Done():
		a.permMu.Lock()
		delete(a.permissionRequests, ev.RequestID)
		a.permMu.Unlock()
		return permission.PermissionResponse{}, ctx.Err()
	}
}

// RespondPermission handles the frontend's response to a permission request.
func (a *App) RespondPermission(args json.RawMessage) error {
	var resp permission.PermissionResponse
	if err := json.Unmarshal(args, &resp); err != nil {
		return err
	}
	a.permMu.Lock()
	ch, ok := a.permissionRequests[resp.RequestID]
	if ok {
		delete(a.permissionRequests, resp.RequestID)
	}
	a.permMu.Unlock()
	if ok {
		ch <- resp
	}
	return nil
}

// SetPipeline stores the permission pipeline reference for runtime mode changes.
func (a *App) SetPipeline(p *permission.Pipeline) {
	a.pipeline = p
}

// SetPermissionMode updates the session-level permission mode ("auto" or "manual").
func (a *App) SetPermissionMode(args json.RawMessage) error {
	var req struct{ Mode string }
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	if req.Mode != "auto" && req.Mode != "manual" {
		return fmt.Errorf("invalid permission mode: %q", req.Mode)
	}
	if a.pipeline != nil {
		a.pipeline.SetMode(permission.Mode(req.Mode))
	}
	return nil
}

// ListPermissionRules returns all permission rules for the given project,
// including both built-in blacklist rules and user-defined rules.
func (a *App) ListPermissionRules(args json.RawMessage) ([]permission.Rule, error) {
	var req struct {
		ProjectPath string `json:"projectPath"`
	}
	if err := json.Unmarshal(args, &req); err != nil {
		return nil, err
	}
	userRules, err := permission.LoadRules(a.home, req.ProjectPath)
	if err != nil {
		return nil, err
	}
	var allRules []permission.Rule
	if a.pipeline != nil {
		allRules = a.pipeline.BuiltinRules()
	}
	if userRules != nil {
		allRules = append(allRules, userRules...)
	}
	return allRules, nil
}

// AddPermissionRule adds a new permission rule.
func (a *App) AddPermissionRule(args json.RawMessage) error {
	var req struct {
		Tool     string `json:"tool"`
		Pattern  string `json:"pattern"`
		Decision string `json:"decision"`
		Source   string `json:"source"`
	}
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	if req.Decision != "allow" && req.Decision != "ask" && req.Decision != "deny" {
		return fmt.Errorf("invalid decision: %q, must be 'allow', 'ask', or 'deny'", req.Decision)
	}
	if req.Source != "global" && req.Source != "project" {
		return fmt.Errorf("invalid source: %q, must be 'global' or 'project'", req.Source)
	}
	return permission.AddRule(a.home, a.projectPath(), req.Tool, req.Pattern, req.Decision, req.Source)
}

// DeletePermissionRule removes a rule identified by tool, pattern, and source.
func (a *App) DeletePermissionRule(args json.RawMessage) error {
	var req struct {
		Tool    string `json:"tool"`
		Pattern string `json:"pattern"`
		Source  string `json:"source"`
	}
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	return permission.DeleteRule(a.home, a.projectPath(), req.Tool, req.Pattern, req.Source)
}

func (a *App) projectPath() string {
	if cp := a.GetCurrentProject(); cp != nil {
		return cp.Path
	}
	return a.startupCwd
}

// MCPServerInfo describes a configured MCP server and its connection status.
type MCPServerInfo struct {
	ID      string   `json:"id"`
	Command string   `json:"command"`
	Args    []string `json:"args"`
	Status  string   `json:"status"` // "connected" | "disconnected"
}

// ListAgents returns all registered agents.
func (a *App) ListAgents() []agent2.Agent {
	return a.agentRegistry.GetAll()
}

// SaveAgent creates or updates an agent entry in config and refreshes the registry.
func (a *App) SaveAgent(args json.RawMessage) error {
	var entry config2.AgentEntry
	if err := json.Unmarshal(args, &entry); err != nil {
		return err
	}
	found := false
	for i, ag := range a.cfg.Agents {
		if ag.Name == entry.Name {
			a.cfg.Agents[i] = entry
			found = true
			break
		}
	}
	if !found {
		a.cfg.Agents = append(a.cfg.Agents, entry)
	}
	a.writeConfig()
	a.agentRegistry.MergeConfig(a.cfg.Agents)
	return nil
}

// DeleteAgent disables an agent by name (soft-delete via Disabled flag).
func (a *App) DeleteAgent(args json.RawMessage) error {
	var req struct{ Name string }
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	found := false
	for i, ag := range a.cfg.Agents {
		if ag.Name == req.Name {
			a.cfg.Agents[i].Disabled = true
			found = true
			break
		}
	}
	if !found {
		a.cfg.Agents = append(a.cfg.Agents, config2.AgentEntry{
			Name: req.Name, Disabled: true,
		})
	}
	a.writeConfig()
	a.agentRegistry.MergeConfig(a.cfg.Agents)
	return nil
}

// writeConfig persists the current in-memory config to ~/.monika/config.json.
func (a *App) writeConfig() {
	configPath := filepath.Join(a.home, ".monika", "config.json")
	data, err := json.MarshalIndent(&a.cfg, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "[monika] writeConfig marshal: %v\n", err)
		return
	}
	tmp := configPath + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		fmt.Fprintf(os.Stderr, "[monika] writeConfig write: %v\n", err)
		return
	}
	os.Rename(tmp, configPath)
}

// ListSkills discovers and returns skill metadata from configured skill paths.
func (a *App) ListSkills() []engine2.SkillMeta {
	eng, err := engine2.EngineByID("skill")
	if err != nil {
		return nil
	}
	skEng, ok := eng.(engine2.SkillEngine)
	if !ok {
		return nil
	}
	skills, err := skEng.Discover(context.Background(), a.home, a.startupCwd, a.cfg.Skill.Paths)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[monika] ListSkills: %v\n", err)
		return nil
	}
	disabledSet := make(map[string]bool, len(a.cfg.Skill.DisabledSkills))
	for _, n := range a.cfg.Skill.DisabledSkills {
		disabledSet[n] = true
	}
	for i := range skills {
		if disabledSet[skills[i].Name] {
			skills[i].Enabled = ptrBool(false)
		}
	}
	return skills
}

func ptrBool(v bool) *bool { return &v }

// ToggleSkillEnabled toggles the enabled state of a skill by name.
func (a *App) ToggleSkillEnabled(args json.RawMessage) error {
	var req struct{ Name string }
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	disabled := a.cfg.Skill.DisabledSkills
	found := false
	filtered := make([]string, 0, len(disabled))
	for _, n := range disabled {
		if n == req.Name {
			found = true
		} else {
			filtered = append(filtered, n)
		}
	}
	if !found {
		filtered = append(filtered, req.Name)
	}
	a.cfg.Skill.DisabledSkills = filtered
	a.writeConfig()
	return nil
}

// AddSkillPath appends a directory to the skill search paths.
func (a *App) AddSkillPath(args json.RawMessage) error {
	var req struct{ Path string }
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	a.cfg.Skill.Paths = append(a.cfg.Skill.Paths, req.Path)
	a.writeConfig()
	return nil
}

// RemoveSkillPath removes a directory from the skill search paths.
func (a *App) RemoveSkillPath(args json.RawMessage) error {
	var req struct{ Path string }
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	filtered := make([]string, 0, len(a.cfg.Skill.Paths))
	for _, p := range a.cfg.Skill.Paths {
		if p != req.Path {
			filtered = append(filtered, p)
		}
	}
	a.cfg.Skill.Paths = filtered
	a.writeConfig()
	return nil
}

// GetSkillContent returns the SKILL.md content and sibling files for a given skill name.
func (a *App) GetSkillContent(args json.RawMessage) (SkillContentResult, error) {
	var req struct{ Name string }
	if err := json.Unmarshal(args, &req); err != nil {
		return SkillContentResult{}, err
	}
	eng, err := engine2.EngineByID("skill")
	if err != nil {
		return SkillContentResult{}, err
	}
	skEng, ok := eng.(engine2.SkillEngine)
	if !ok {
		return SkillContentResult{}, fmt.Errorf("skill engine not available")
	}
	skills, err := skEng.Discover(context.Background(), a.home, a.startupCwd, a.cfg.Skill.Paths)
	if err != nil {
		return SkillContentResult{}, err
	}
	var meta *engine2.SkillMeta
	for i := range skills {
		if skills[i].Name == req.Name {
			meta = &skills[i]
			break
		}
	}
	if meta == nil {
		return SkillContentResult{}, fmt.Errorf("skill %q not found", req.Name)
	}
	content, err := skEng.Activate(context.Background(), *meta)
	if err != nil {
		return SkillContentResult{}, err
	}
	var files []string
	entries, _ := os.ReadDir(meta.Path)
	for _, e := range entries {
		if e.Name() == "SKILL.md" {
			continue
		}
		files = append(files, filepath.Join(meta.Path, e.Name()))
	}
	return SkillContentResult{
		Content: content.Instructions,
		Files:   files,
	}, nil
}

// InstallSkillFromURL downloads a GitHub repo and installs skills found in it.
func (a *App) InstallSkillFromURL(args json.RawMessage) ([]string, error) {
	var req struct {
		URL   string `json:"url"`
		Scope string `json:"scope"` // "project" or "global"
	}
	if err := json.Unmarshal(args, &req); err != nil {
		return nil, err
	}
	if req.Scope == "" {
		req.Scope = "project"
	}
	owner, repo, err := parseGitHubURL(req.URL)
	if err != nil {
		return nil, fmt.Errorf("invalid GitHub URL: %w", err)
	}
	zipURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/zipball/main", owner, repo)
	tmpDir, err := os.MkdirTemp("", "monika-skill-install-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmpDir)
	zipPath := filepath.Join(tmpDir, "repo.zip")
	if err := downloadFile(zipURL, zipPath); err != nil {
		// Retry with master branch
		zipURL = fmt.Sprintf("https://api.github.com/repos/%s/%s/zipball/master", owner, repo)
		if err := downloadFile(zipURL, zipPath); err != nil {
			return nil, fmt.Errorf("failed to download repo (tried main and master): %w", err)
		}
	}
	extractDir := filepath.Join(tmpDir, "extracted")
	if err := extractZip(zipPath, extractDir); err != nil {
		return nil, fmt.Errorf("failed to extract zip: %w", err)
	}
	installed, err := a.installSkillsFromDir(extractDir, req.Scope)
	if err == nil {
		a.refreshSkillPrompt()
	}
	return installed, err
}

// InstallSkillFromZip installs skills from a base64-encoded ZIP file.
func (a *App) InstallSkillFromZip(args json.RawMessage) ([]string, error) {
	var req struct {
		Data  string `json:"data"`
		Scope string `json:"scope"`
	}
	if err := json.Unmarshal(args, &req); err != nil {
		return nil, err
	}
	if req.Scope == "" {
		req.Scope = "project"
	}
	zipData, err := base64.StdEncoding.DecodeString(req.Data)
	if err != nil {
		return nil, fmt.Errorf("invalid base64 data: %w", err)
	}
	tmpDir, err := os.MkdirTemp("", "monika-skill-install-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmpDir)
	zipPath := filepath.Join(tmpDir, "upload.zip")
	if err := os.WriteFile(zipPath, zipData, 0o644); err != nil {
		return nil, err
	}
	extractDir := filepath.Join(tmpDir, "extracted")
	if err := extractZip(zipPath, extractDir); err != nil {
		return nil, fmt.Errorf("failed to extract zip: %w", err)
	}
	installed, err := a.installSkillsFromDir(extractDir, req.Scope)
	if err == nil {
		a.refreshSkillPrompt()
	}
	return installed, err
}

// UninstallSkill removes an installed skill by name.
func (a *App) UninstallSkill(args json.RawMessage) error {
	var req struct{ Name string }
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	eng, err := engine2.EngineByID("skill")
	if err != nil {
		return err
	}
	skEng, ok := eng.(engine2.SkillEngine)
	if !ok {
		return fmt.Errorf("skill engine not available")
	}
	skills, err := skEng.Discover(context.Background(), a.home, a.startupCwd, a.cfg.Skill.Paths)
	if err != nil {
		return err
	}
	for _, s := range skills {
		if s.Name == req.Name {
			if err := os.RemoveAll(s.Path); err != nil {
				return err
			}
			a.refreshSkillPrompt()
			return nil
		}
	}
	return fmt.Errorf("skill %q not found", req.Name)
}

// installSkillsFromDir scans a directory for SKILL.md files and copies them to the target skill directory.
func (a *App) installSkillsFromDir(scanDir string, scope string) ([]string, error) {
	var installed []string
	skillBase := a.skillBaseDir(scope)

	err := filepath.WalkDir(scanDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.Name() != "SKILL.md" {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		name, _ := parseSkillFrontmatter(data)
		if name == "" || !isValidSkillName(name) {
			return nil
		}
		srcDir := filepath.Dir(path)
		dstDir := filepath.Join(skillBase, name)
		if err := copySkillDir(srcDir, dstDir); err != nil {
			fmt.Fprintf(os.Stderr, "[monika] install skill %q: %v\n", name, err)
			return nil
		}
		installed = append(installed, name)
		return nil
	})
	return installed, err
}

func (a *App) skillBaseDir(scope string) string {
	if scope == "global" {
		return filepath.Join(a.home, ".monika", "skills")
	}
	return filepath.Join(a.startupCwd, ".opencode", "skills")
}

// OpenInFileManager opens the given directory path in the system file manager.
func (a *App) OpenInFileManager(args json.RawMessage) error {
	var req struct{ Path string }
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	absPath, err := filepath.Abs(req.Path)
	if err != nil {
		return fmt.Errorf("invalid path: %w", err)
	}
	info, err := os.Stat(absPath)
	if err != nil {
		return fmt.Errorf("path not found: %w", err)
	}
	target := absPath
	if !info.IsDir() {
		target = filepath.Dir(absPath)
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer", target)
	case "darwin":
		cmd = exec.Command("open", target)
	default:
		cmd = exec.Command("xdg-open", target)
	}
	return cmd.Start()
}

// parseGitHubURL extracts owner and repo from various GitHub URL formats.
func parseGitHubURL(rawURL string) (owner, repo string, err error) {
	u := strings.TrimSpace(rawURL)
	u = strings.TrimPrefix(u, "https://")
	u = strings.TrimPrefix(u, "http://")
	u = strings.TrimPrefix(u, "github.com/")
	u = strings.TrimSuffix(u, ".git")
	u = strings.TrimSuffix(u, "/")
	parts := strings.SplitN(u, "/", 3)
	if len(parts) < 2 {
		return "", "", fmt.Errorf("expected github.com/owner/repo format")
	}
	return parts[0], parts[1], nil
}

// parseSkillFrontmatter parses YAML frontmatter from SKILL.md data.

var skillNameRE = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

func isValidSkillName(name string) bool {
	return len(name) > 0 && len(name) <= 64 && skillNameRE.MatchString(name)
}

func parseSkillFrontmatter(data []byte) (string, string) {
	delimiter := []byte("---\n")
	if !bytes.HasPrefix(data, delimiter) {
		return "", ""
	}
	rest := data[len(delimiter):]
	end := bytes.Index(rest, delimiter)
	if end == -1 {
		return "", ""
	}
	var fm struct {
		Name        string `yaml:"name"`
		Description string `yaml:"description"`
	}
	if err := yaml.Unmarshal(rest[:end], &fm); err != nil {
		return "", ""
	}
	return fm.Name, fm.Description
}
func (a *App) ListMCPServers() []MCPServerInfo {
	servers := make([]MCPServerInfo, 0, len(a.cfg.MCP.Servers))
	for _, s := range a.cfg.MCP.Servers {
		info := MCPServerInfo{
			ID:      s.ID,
			Command: s.Command,
			Args:    s.Args,
			Status:  "disconnected",
		}
		if a.isMCPConnected(s.ID) {
			info.Status = "connected"
		}
		servers = append(servers, info)
	}
	return servers
}

// isMCPConnected checks whether an MCP server is currently connected.
//
// FIXME: This is a workaround — it calls DisconnectServer to probe connectivity,
// which has the side effect of actually disconnecting a connected server.
// A proper solution should add a GetConnection or IsConnected method to MCPEngine.
func (a *App) isMCPConnected(id string) bool {
	eng, err := engine2.EngineByID("mcp")
	if err != nil {
		return false
	}
	mcpEng, ok := eng.(engine2.MCPEngine)
	if !ok {
		return false
	}
	err = mcpEng.DisconnectServer(context.Background(), id)
	return err == nil
}

// SaveMCPServer creates or updates an MCP server entry in config.
func (a *App) SaveMCPServer(args json.RawMessage) error {
	var srv config2.MCPServerEntry
	if err := json.Unmarshal(args, &srv); err != nil {
		return err
	}
	found := false
	for i, s := range a.cfg.MCP.Servers {
		if s.ID == srv.ID {
			a.cfg.MCP.Servers[i] = srv
			found = true
			break
		}
	}
	if !found {
		a.cfg.MCP.Servers = append(a.cfg.MCP.Servers, srv)
	}
	a.writeConfig()
	return nil
}

// DeleteMCPServer removes an MCP server entry from config by ID.
func (a *App) DeleteMCPServer(args json.RawMessage) error {
	var req struct{ ID string }
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	filtered := make([]config2.MCPServerEntry, 0)
	for _, s := range a.cfg.MCP.Servers {
		if s.ID != req.ID {
			filtered = append(filtered, s)
		}
	}
	a.cfg.MCP.Servers = filtered
	a.writeConfig()
	return nil
}

// SaveProvider creates or updates a model provider in config.
func (a *App) SaveProvider(args json.RawMessage) error {
	var req struct {
		ID      string               `json:"id"`
		Name    string               `json:"name"`
		BaseURL string               `json:"base_url"`
		APIKey  string               `json:"api_key"`
		WireAPI string               `json:"wire_api"`
		Models  []config2.ModelEntry `json:"models"`
	}
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	pc := config2.ProviderConfig{
		Name:    req.Name,
		BaseURL: req.BaseURL,
		APIKey:  req.APIKey,
		WireAPI: req.WireAPI,
		Models:  req.Models,
	}
	if existing, ok := a.cfg.ModelProviders[req.ID]; ok {
		if pc.Name == "" {
			pc.Name = existing.Name
		}
		if pc.BaseURL == "" {
			pc.BaseURL = existing.BaseURL
		}
		if pc.APIKey == "" {
			pc.APIKey = existing.APIKey
		}
		if pc.WireAPI == "" {
			pc.WireAPI = existing.WireAPI
		}
		if len(pc.Models) == 0 {
			pc.Models = existing.Models
		}
	}
	a.cfg.ModelProviders[req.ID] = pc
	a.writeConfig()
	return nil
}

// DeleteProvider removes a model provider from config by ID.
func (a *App) DeleteProvider(args json.RawMessage) error {
	var req struct{ ID string }
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	delete(a.cfg.ModelProviders, req.ID)
	a.writeConfig()
	return nil
}
