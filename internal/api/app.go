package api

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
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
