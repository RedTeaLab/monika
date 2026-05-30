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
	"sync/atomic"
	"time"

	agent2 "monika/internal/agent"
	config2 "monika/internal/config"
	"monika/internal/permission"
	tool2 "monika/internal/tool"
	"monika/internal/update"
	engine2 "monika/pkg/engine"
	"monika/pkg/modelsdev"

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
	mcpRegistry       *engine2.MCPRegistry

	permissionRequests map[string]chan permission.PermissionResponse
	permMu             sync.Mutex

	askUserRequests map[string]chan AskUserResponse
	askUserMu       sync.Mutex

	pipeline *permission.Pipeline
	checker  *update.Checker

	eventSeq atomic.Int64
}

func NewApp(home, cwd string, cfg config2.Config, providers map[string]engine2.ProviderEngine, model string, registry *tool2.ToolRegistry, loopOpts []agent2.LoopOption, taskStoreAccessor TaskStoreAccessor, agentRegistry *agent2.AgentRegistry, taskRunner *agent2.TaskRunner, baseSystemPrompt string, mcpRegistry *engine2.MCPRegistry) *App {
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
		mcpRegistry:       mcpRegistry,
		checker:           update.NewChecker(),
	}
}

// AppendLoopOption appends a loop option to the internally stored slice.
func (a *App) AppendLoopOption(opt agent2.LoopOption) {
	a.loopOpts = append(a.loopOpts, opt)
	a.baseLoopOptsCount++
}

// refreshSkillPrompt rebuilds the system prompt in loopOpts with the current skill list and MCP tools.
// Future sessions will see the updated prompt; running sessions keep their existing prompt.
func (a *App) refreshSkillPrompt() {
	eng, err := engine2.EngineByID("skill")
	if err != nil {
		return
	}
	skEng, ok := eng.(engine2.SkillEngine)
	if !ok {
		return
	}
	skills, err := skEng.Discover(context.Background(), a.home, a.projectPath(), a.cfg.Skill.Paths)
	if err != nil {
		return
	}
	fullPrompt := a.baseSystemPrompt + agent2.BuildSkillsPrompt(skills)
	if a.mcpRegistry != nil {
		fullPrompt += agent2.BuildMCPPrompt(a.mcpRegistry.GetTools())
	}
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

	// Auto-check for updates on startup (respects 4-hour cooldown).
	go a.checker.AutoCheck(ctx, func(info *update.UpdateInfo) {
		application.Get().Event.Emit("update-available", *info)
	})

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
				ContextLimit: m.ContextLimit,
				OutputLimit:  m.OutputLimit,
				Enabled:      m.Enabled,
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

// GetAvailableProviders returns all providers available from models.dev catalog.
// This is used in the Settings UI to let users select a provider to add.
func (a *App) GetAvailableProviders() ([]AvailableProviderInfo, error) {
	catalog, err := modelsdev.Catalog(a.home)
	if err != nil {
		return nil, fmt.Errorf("failed to load models.dev catalog: %w", err)
	}

	result := make([]AvailableProviderInfo, 0, len(catalog))
	for providerID, p := range catalog {
		models := make([]AvailableModelInfo, 0, len(p.Models))
		for modelID, md := range p.Models {
			if md.Limit.Context > 0 {
				displayName := md.Name
				if displayName == "" {
					displayName = modelID
				}
				models = append(models, AvailableModelInfo{
					ID:           modelID,
					Name:         displayName,
					ContextLimit: md.Limit.Context,
					OutputLimit:  md.Limit.Output,
				})
			}
		}
		if len(models) > 0 {
			displayName := p.Name
			if displayName == "" {
				displayName = providerID
			}
			result = append(result, AvailableProviderInfo{
				ID:          providerID,
				DisplayName: displayName,
				Npm:         p.Npm,
				BaseURL:     p.API,
				Models:      models,
			})
		}
	}

	// Sort by provider ID
	sort.Slice(result, func(i, j int) bool {
		return result[i].ID < result[j].ID
	})

	return result, nil
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

func (a *App) SetSessionPinned(projectPath, sessionID string, pinned bool) error {
	sm := a.getSessionManager(projectPath)
	sm.Lock()
	defer sm.Unlock()
	s, err := sm.Load(sessionID)
	if err != nil {
		return err
	}
	s.Pinned = pinned
	return sm.Save(s)
}

func (a *App) RenameSession(projectPath, sessionID, newTitle string) error {
	runes := []rune(newTitle)
	if len(runes) > 40 {
		newTitle = string(runes[:40])
	}
	sm := a.getSessionManager(projectPath)
	sm.Lock()
	defer sm.Unlock()
	s, err := sm.Load(sessionID)
	if err != nil {
		return err
	}
	s.Title = newTitle
	s.CustomTitle = true
	return sm.Save(s)
}

func (a *App) ArchiveSession(projectPath, sessionID string) error {
	sm := a.getSessionManager(projectPath)
	sm.Lock()
	defer sm.Unlock()
	s, err := sm.Load(sessionID)
	if err != nil {
		return err
	}
	s.Status = StatusArchived
	return sm.Save(s)
}

func (a *App) MarkSessionViewed(projectPath, sessionID string) {
	sm := a.getSessionManager(projectPath)
	sm.Lock()
	defer sm.Unlock()
	s, err := sm.Load(sessionID)
	if err != nil {
		return
	}
	now := time.Now()
	s.LastViewedAt = &now
	// Save without touching UpdatedAt so the session doesn't jump in the list.
	prev := s.UpdatedAt
	sm.Save(s)
	s.UpdatedAt = prev
}

func (a *App) LoadSession(projectPath, sessionID string) (*Session, error) {
	// Check child sessions first (in-memory, then on-disk, then placeholder)
	if agent2.IsChildSession(sessionID) {
		if child := a.LoadChildSession(sessionID); child != nil {
			return &Session{
				ID:         sessionID,
				Title:      child.Title,
				Messages:   child.Messages,
				Status:     StatusPending,
				ParentID:   child.ParentID,
				TokenCount: child.TokenCount,
			}, nil
		}
		if child := a.LoadChildSessionFromDisk(projectPath, sessionID); child != nil {
			return &Session{
				ID:         sessionID,
				Title:      child.Title,
				Messages:   child.Messages,
				Status:     StatusPending,
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

	// Route /skill-name [msg] to skill tool
	if strings.HasPrefix(text, "/") {
		parts := strings.SplitN(strings.TrimPrefix(text, "/"), " ", 2)
		skillName := parts[0]
		if skillName != "" {
			skills := a.ListSkills()
			for _, s := range skills {
				if s.Name == skillName {
					var sb strings.Builder
					sb.WriteString(fmt.Sprintf("Load the skill %q and execute its full workflow.", skillName))
					if len(parts) > 1 && strings.TrimSpace(parts[1]) != "" {
						sb.WriteString(fmt.Sprintf("\n\nUser context: %s", strings.TrimSpace(parts[1])))
					}
					text = sb.String()
					break
				}
			}
		}
	}

	providerEng, ok := a.providers[providerID]
	if !ok {
		return fmt.Errorf("provider %q not available", providerID)
	}

	conv := &agent2.Conversation{
		ID:              s.ID,
		Messages:        s.Messages,
		TokenCount:      s.TokenCount,
		TokenMax:        s.TokenMax,
		CompactionCount: s.CompactionCount,
		CompactionFrom:  s.CompactionFrom,
	}
	// Backward compat: if CompactionFrom not persisted, fall back to scanning
	if conv.CompactionFrom == 0 {
		for i := len(s.Messages) - 1; i >= 0; i-- {
			if s.Messages[i].Name == "compaction_summary" {
				conv.CompactionFrom = i
				break
			}
		}
	}

	opts := append([]agent2.LoopOption{}, a.loopOpts...)
	opts = append(opts,
		agent2.WithProjectDir(projectPath),
		agent2.WithProvider(providerID),
		agent2.WithModel(model),
		agent2.WithSessionID(sessionID),
	)
	if ctxLimit, outLimit := a.modelLimits(providerID, model); ctxLimit > 0 {
		opts = append(opts, agent2.WithContextLimit(ctxLimit), agent2.WithOutputLimit(outLimit))
	}
	generalAgent, _ := a.agentRegistry.Get("general")
	opts = append(opts, agent2.WithAgent(generalAgent))

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

		events := loop.Run(ctx, conv, text)
		for ev := range events {
			select {
			case <-ctx.Done():
				_ = ctx.Err()
			default:
			}
			a.handleAgentEvent(sessionID, model, ev)
		}

		s.Messages = conv.Messages
		s.TokenCount = conv.TokenCount
		s.TokenMax = conv.TokenMax
		s.CompactionCount = conv.CompactionCount
		s.CompactionFrom = conv.CompactionFrom
		sm.SetTitle(s)

		// Debug: log compaction state before save
		if s.CompactionCount > 0 {
			summaryCount := 0
			for _, m := range s.Messages {
				if m.Name == "compaction_summary" {
					summaryCount++
				}
			}
			fmt.Fprintf(os.Stderr, "[monika] save: sid=%s messages=%d compactCount=%d compactFrom=%d summaries=%d\n",
				s.ID, len(s.Messages), s.CompactionCount, s.CompactionFrom, summaryCount)
		}

		// Persist tasks alongside the session so they survive restarts.
		a.syncTasksToSession(sessionID, s)

		sm.Lock()
		if ctx.Err() != nil {
			sm.SetStatus(s, StatusPending)
			sm.Save(s)
		} else {
			sm.SetStatus(s, StatusPending)
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
				sm.SetStatus(s, StatusPending)
				sm.Save(s)
				sm.Unlock()
			}
		}
	}
}

// TriggerCompact manually triggers context compaction for a session.
func (a *App) TriggerCompact(projectPath, sessionID, providerID, model string) error {
	sm := a.getSessionManager(projectPath)
	sm.Lock()
	defer sm.Unlock()

	a.cancelMu.Lock()
	_, generating := a.cancelFuncs[sessionID]
	a.cancelMu.Unlock()
	if generating {
		return fmt.Errorf("session is currently generating, wait for it to complete before compacting")
	}

	s, err := sm.Load(sessionID)
	if err != nil {
		return fmt.Errorf("session %s not found: %w", sessionID, err)
	}

	if len(s.Messages) < 2 {
		return fmt.Errorf("not enough messages to compact")
	}

	providerEng, ok := a.providers[providerID]
	if !ok {
		return fmt.Errorf("provider %q not available", providerID)
	}

	conv := &agent2.Conversation{
		ID:              s.ID,
		Messages:        s.Messages,
		TokenCount:      s.TokenCount,
		TokenMax:        s.TokenMax,
		CompactionCount: s.CompactionCount,
		CompactionFrom:  s.CompactionFrom,
	}
	// Backward compat: if CompactionFrom not persisted, fall back to scanning
	if conv.CompactionFrom == 0 {
		for i := len(s.Messages) - 1; i >= 0; i-- {
			if s.Messages[i].Name == "compaction_summary" {
				conv.CompactionFrom = i
				break
			}
		}
	}

	opts := append([]agent2.LoopOption{}, a.loopOpts...)
	opts = append(opts,
		agent2.WithProjectDir(projectPath),
		agent2.WithProvider(providerID),
		agent2.WithModel(model),
		agent2.WithSessionID(sessionID),
	)
	if ctxLimit, outLimit := a.modelLimits(providerID, model); ctxLimit > 0 {
		opts = append(opts, agent2.WithContextLimit(ctxLimit), agent2.WithOutputLimit(outLimit))
	}
	generalAgent, _ := a.agentRegistry.Get("general")
	opts = append(opts, agent2.WithAgent(generalAgent))

	loop := agent2.NewLoop(providerEng, a.registry, opts...)

	go func() {
		ch := make(chan agent2.Event, 16)
		go func() {
			defer close(ch)
			if err := loop.RunCompaction(a.ctx, conv, ch); err != nil {
				ch <- agent2.Event{
					Type:    agent2.EventCompaction,
					Content: err.Error(),
					Compaction: &agent2.CompactionEvent{
						Summary:       "Compaction failed: " + err.Error(),
						BeforeTokens:  conv.TokenCount,
						AfterTokens:   conv.TokenCount,
						CompactionNum: conv.CompactionCount,
					},
				}
			}
		}()
		for ev := range ch {
			a.handleAgentEvent(sessionID, model, ev)
		}
		a.handleAgentEvent(sessionID, model, agent2.Event{Type: agent2.EventDone})

		s.Messages = conv.Messages
		s.TokenCount = conv.TokenCount
		s.TokenMax = conv.TokenMax
		s.CompactionCount = conv.CompactionCount
		s.CompactionFrom = conv.CompactionFrom

		summaryCount := 0
		for _, m := range s.Messages {
			if m.Name == "compaction_summary" {
				summaryCount++
			}
		}
		fmt.Fprintf(os.Stderr, "[monika] save: sid=%s messages=%d compactCount=%d compactFrom=%d summaries=%d\n",
			s.ID, len(s.Messages), s.CompactionCount, s.CompactionFrom, summaryCount)

		sm.Lock()
		if err := sm.Save(s); err != nil {
			fmt.Fprintf(os.Stderr, "[monika] TriggerCompact save error: %v\n", err)
		}
		sm.Unlock()
	}()

	return nil
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

func (a *App) CreateDir(projectPath, dirPath string) error {
	fs := a.getFileService(projectPath)
	if err := fs.CreateDir(dirPath); err != nil {
		return err
	}
	a.eventBus.Emit(StreamEvent{
		Type: "file_changed",
		FileChange: &FileChangeEvent{
			Path:   dirPath,
			Status: "added",
		},
	})
	return nil
}

func (a *App) Rename(projectPath, oldPath, newPath string) error {
	fs := a.getFileService(projectPath)
	if err := fs.Rename(oldPath, newPath); err != nil {
		return err
	}
	a.eventBus.Emit(StreamEvent{Type: "file_changed", FileChange: &FileChangeEvent{Path: oldPath, Status: "deleted"}})
	a.eventBus.Emit(StreamEvent{Type: "file_changed", FileChange: &FileChangeEvent{Path: newPath, Status: "added"}})
	return nil
}

func (a *App) DeleteItem(projectPath, filePath string) error {
	fs := a.getFileService(projectPath)
	if err := fs.Delete(filePath); err != nil {
		return err
	}
	a.eventBus.Emit(StreamEvent{Type: "file_changed", FileChange: &FileChangeEvent{Path: filePath, Status: "deleted"}})
	return nil
}

func (a *App) DuplicateItem(projectPath, filePath string) (string, error) {
	fs := a.getFileService(projectPath)
	newPath, err := fs.Duplicate(filePath)
	if err != nil {
		return "", err
	}
	a.eventBus.Emit(StreamEvent{Type: "file_changed", FileChange: &FileChangeEvent{Path: newPath, Status: "added"}})
	return newPath, nil
}

func (a *App) CopyItem(projectPath, srcPath, destDir string) error {
	fs := a.getFileService(projectPath)
	if err := fs.CopyItem(srcPath, destDir); err != nil {
		return err
	}
	dstPath := destDir + "/" + filepath.Base(srcPath)
	a.eventBus.Emit(StreamEvent{Type: "file_changed", FileChange: &FileChangeEvent{Path: dstPath, Status: "added"}})
	return nil
}

func (a *App) OpenInExplorer(projectPath, filePath string) error {
	fs := a.getFileService(projectPath)
	return fs.OpenInExplorer(filePath)
}

func (a *App) ListFileTree(projectPath string, showHidden bool) ([]FileNode, error) {
	fs := a.getFileService(projectPath)
	return fs.ListDir("", showHidden)
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

func (a *App) handleAgentEvent(sessionID, model string, ev agent2.Event) {
	// Route to child session if event carries its own session ID
	sid := sessionID
	if ev.SessionID != "" {
		sid = ev.SessionID
	}
	se := StreamEvent{
		SessionID: sid,
		Model:     model,
		Seq:       a.eventSeq.Add(1),
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
		// After bash execution, check if the git branch changed and notify the frontend.
		if ev.Tool != nil && ev.Tool.Name == "bash" {
			a.emitBranchChangeIfChanged()
		}
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
		Seq:       a.eventSeq.Add(1),
	}
	a.eventBus.Emit(se)
	application.Get().Event.Emit("stream", se)
}

// emitBranchChangeIfChanged reads the current git branch from disk and compares
// it with the cached value. If different, it emits a Wails event so the frontend
// can update the branch display in the title bar.
func (a *App) emitBranchChangeIfChanged() {
	projectPath := ""
	a.mu.RLock()
	// Find the project path that owns this session.
	for _, info := range a.projects {
		projectPath = info.Path
		break
	}
	storedBranch := ""
	if info, ok := a.projects[projectPath]; ok {
		storedBranch = info.Branch
	}
	a.mu.RUnlock()

	if projectPath == "" {
		return
	}

	cmd := command("git", "rev-parse", "--abbrev-ref", "HEAD")
	cmd.Dir = projectPath
	out, err := cmd.Output()
	if err != nil {
		return
	}
	currentBranch := strings.TrimSpace(string(out))
	if currentBranch == "" || currentBranch == storedBranch {
		return
	}

	a.setProjectBranch(projectPath, currentBranch)

	application.Get().Event.Emit("branch-changed", currentBranch)
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
			sm.SetStatus(s, StatusPending)
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

// RefreshBranch reads the current git branch from disk and updates in-memory state.
// Returns the current branch name, or "—" if not a git repo.
func (a *App) RefreshBranch(projectPath string) string {
	branch := ""
	cmd := command("git", "rev-parse", "--abbrev-ref", "HEAD")
	cmd.Dir = projectPath
	out, err := cmd.Output()
	if err == nil {
		branch = strings.TrimSpace(string(out))
	}
	if branch == "" {
		branch = "—"
	}
	a.setProjectBranch(projectPath, branch)
	return branch
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
		Seq:        a.eventSeq.Add(1),
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

// AskUser sends a question to the frontend and blocks until the user responds.
func (a *App) AskUser(ctx context.Context, sessionID, question string, title string, options []string) (string, error) {
	requestID := fmt.Sprintf("ask-%d", time.Now().UnixNano())
	ch := make(chan AskUserResponse, 1)
	a.askUserMu.Lock()
	if a.askUserRequests == nil {
		a.askUserRequests = make(map[string]chan AskUserResponse)
	}
	a.askUserRequests[requestID] = ch
	a.askUserMu.Unlock()

	ev := AskUserEvent{
		RequestID: requestID,
		SessionID: sessionID,
		Question:  question,
		Title:     title,
		Options:   options,
	}
	se := StreamEvent{
		Type:      "ask_user",
		SessionID: sessionID,
		AskUser:   &ev,
		Seq:       a.eventSeq.Add(1),
	}
	application.Get().Event.Emit("stream", se)

	select {
	case resp := <-ch:
		return resp.Answer, nil
	case <-ctx.Done():
		a.askUserMu.Lock()
		delete(a.askUserRequests, requestID)
		a.askUserMu.Unlock()
		return "", ctx.Err()
	}
}

// RespondAskUser handles the frontend's response to an ask_user request.
func (a *App) RespondAskUser(args json.RawMessage) error {
	var resp AskUserResponse
	if err := json.Unmarshal(args, &resp); err != nil {
		return err
	}
	a.askUserMu.Lock()
	ch, ok := a.askUserRequests[resp.RequestID]
	if ok {
		delete(a.askUserRequests, resp.RequestID)
	}
	a.askUserMu.Unlock()
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

// GetProjectPath returns the current project directory (exported for use by tools).
func (a *App) GetProjectPath() string {
	return a.projectPath()
}

// MCPServerInfo describes a configured MCP server and its connection status.
type MCPServerInfo struct {
	ID      string            `json:"id"`
	Type    string            `json:"type"`
	Command string            `json:"command"`
	Args    []string          `json:"args"`
	Env     map[string]string `json:"env"`
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers"`
	Status  string            `json:"status"` // "connected" | "disconnected"
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
// It also writes to the project-level config so that deletions and updates
// are not silently reverted on the next restart (both files are loaded and merged).
func (a *App) writeConfig() {
	data, err := json.MarshalIndent(&a.cfg, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "[monika] writeConfig marshal: %v\n", err)
		return
	}

	writeTo := func(configPath string) {
		tmp := configPath + ".tmp"
		if err := os.WriteFile(tmp, data, 0600); err != nil {
			fmt.Fprintf(os.Stderr, "[monika] writeConfig write: %v\n", err)
			return
		}
		os.Rename(tmp, configPath)
	}

	writeTo(filepath.Join(a.home, ".monika", "config.json"))

	if pp := a.projectPath(); pp != "" && pp != a.home {
		projectConfig := filepath.Join(pp, ".monika", "config.json")
		if _, err := os.Stat(projectConfig); err == nil {
			writeTo(projectConfig)
		}
	}
}

func (a *App) modelLimits(providerID, modelID string) (contextTokens, outputTokens int64) {
	pc, ok := a.cfg.ModelProviders[providerID]
	if !ok {
		return 0, 0
	}
	for _, m := range pc.Models {
		if m.ID == modelID {
			return m.ContextLimit, m.OutputLimit
		}
	}
	return 0, 0
}

// syncProviderFromModelsDev enriches a provider's model list from the models.dev
// catalog. It only populates missing context/output limits for existing models,
// and does NOT add new models. Users must explicitly add models through the Settings UI.
func (a *App) syncProviderFromModelsDev(providerID string) {
	pc, ok := a.cfg.ModelProviders[providerID]
	if !ok {
		return
	}

	catalog, err := modelsdev.Catalog(a.home)
	if err != nil {
		return
	}

	type info struct {
		Context  int64
		Output   int64
		Provider string
	}
	modelIndex := make(map[string]info, 4096)
	for pID, p := range catalog {
		for modelID, md := range p.Models {
			if md.Limit.Context > 0 {
				modelIndex[modelID] = info{
					Context:  md.Limit.Context,
					Output:   md.Limit.Output,
					Provider: pID,
				}
			}
		}
	}

	changed := false
	existingIDs := make(map[string]bool, len(pc.Models))

	// Enrich existing models with limits from models.dev.
	for i := range pc.Models {
		m := &pc.Models[i]
		existingIDs[m.ID] = true
		if info, ok := modelIndex[m.ID]; ok {
			if m.ContextLimit == 0 && info.Context > 0 {
				m.ContextLimit = info.Context
				changed = true
			}
			if m.OutputLimit == 0 && info.Output > 0 {
				m.OutputLimit = info.Output
				changed = true
			}
			if m.DisplayName == "" {
				m.DisplayName = m.ID
				changed = true
			}
		}
	}

	// Auto-detect modelsdev provider from existing models, or by
	// fuzzy-matching the provider ID.
	if pc.ModelsDevProvider == "" {
		for modelID, info := range modelIndex {
			if existingIDs[modelID] {
				pc.ModelsDevProvider = info.Provider
				changed = true
				break
			}
		}
		// Fallback: try matching provider ID directly.
		if pc.ModelsDevProvider == "" {
			normalized := normalizeProviderID(providerID)
			for pID := range catalog {
				if normalizeProviderID(pID) == normalized {
					pc.ModelsDevProvider = pID
					changed = true
					break
				}
			}
		}
	}

	// Do NOT auto-add new models from models.dev.
	// Users must explicitly add models through the Settings UI.

	if changed {
		a.cfg.ModelProviders[providerID] = pc
	}
}

// ListSkills discovers and returns skill metadata from configured skill paths.

// normalizeProviderID strips non-alphanumeric characters and lowercases for
// fuzzy matching user-configured provider IDs against models.dev provider IDs.
func normalizeProviderID(id string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(id) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}
func (a *App) ListSkills() []engine2.SkillMeta {
	eng, err := engine2.EngineByID("skill")
	if err != nil {
		return nil
	}
	skEng, ok := eng.(engine2.SkillEngine)
	if !ok {
		return nil
	}
	skills, err := skEng.Discover(context.Background(), a.home, a.projectPath(), a.cfg.Skill.Paths)
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
	skills, err := skEng.Discover(context.Background(), a.home, a.projectPath(), a.cfg.Skill.Paths)
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
		req.Scope = "global"
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
		req.Scope = "global"
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
	skills, err := skEng.Discover(context.Background(), a.home, a.projectPath(), a.cfg.Skill.Paths)
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
	return filepath.Join(a.projectPath(), ".monika", "skills")
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
			Type:    s.Type,
			Command: s.Command,
			Args:    s.Args,
			Env:     s.Env,
			URL:     s.URL,
			Headers: s.Headers,
			Status:  "disconnected",
		}
		if a.isMCPConnected(s.ID) {
			info.Status = "connected"
		}
		servers = append(servers, info)
	}
	return servers
}

// ImportMCPServers parses a standard mcpServers JSON block and adds the servers to config.
// The input format is: { "mcpServers": { "name": { "type": "stdio", "command": "...", ... } } }
// Returns the list of server IDs that were imported.
func (a *App) ImportMCPServers(args json.RawMessage) ([]string, error) {
	// The frontend sends the JSON string via Call.ByName, which wraps it as a JSON string.
	// Unwrap: if args is a JSON string literal, decode it first.
	if len(args) > 0 && args[0] == '"' {
		var raw string
		if err := json.Unmarshal(args, &raw); err == nil {
			args = json.RawMessage(raw)
		}
	}

	var raw struct {
		McpServers map[string]json.RawMessage `json:"mcpServers"`
	}
	if err := json.Unmarshal(args, &raw); err != nil {
		// Try as a bare map of name -> config
		var bare map[string]json.RawMessage
		if err2 := json.Unmarshal(args, &bare); err2 != nil {
			return nil, fmt.Errorf("invalid MCP server JSON: expected {\"mcpServers\": {...}} or {...}")
		}
		raw.McpServers = bare
	}

	if len(raw.McpServers) == 0 {
		return nil, fmt.Errorf("no servers found in JSON")
	}

	var imported []string
	for name, rawCfg := range raw.McpServers {
		var cfg struct {
			Type    string            `json:"type"`
			Command string            `json:"command"`
			Args    []string          `json:"args"`
			Env     map[string]string `json:"env"`
			URL     string            `json:"url"`
			Headers map[string]string `json:"headers"`
		}
		if err := json.Unmarshal(rawCfg, &cfg); err != nil {
			continue
		}
		srvType := cfg.Type
		if srvType == "" {
			if cfg.URL != "" {
				srvType = "http"
			} else {
				srvType = "stdio"
			}
		}
		entry := config2.MCPServerEntry{
			ID:      name,
			Type:    srvType,
			Command: cfg.Command,
			Args:    cfg.Args,
			Env:     cfg.Env,
			URL:     cfg.URL,
			Headers: cfg.Headers,
		}
		found := false
		for i, s := range a.cfg.MCP.Servers {
			if s.ID == name {
				a.cfg.MCP.Servers[i] = entry
				found = true
				break
			}
		}
		if !found {
			a.cfg.MCP.Servers = append(a.cfg.MCP.Servers, entry)
		}
		imported = append(imported, name)
	}
	a.writeConfig()
	return imported, nil
}

// TestMCPServer attempts to connect a server, list its tools, then disconnect.
// Returns the list of tool names on success.
func (a *App) TestMCPServer(args json.RawMessage) ([]string, error) {
	var req struct{ ID string }
	if err := json.Unmarshal(args, &req); err != nil {
		return nil, err
	}

	var entry *config2.MCPServerEntry
	for i := range a.cfg.MCP.Servers {
		if a.cfg.MCP.Servers[i].ID == req.ID {
			entry = &a.cfg.MCP.Servers[i]
			break
		}
	}
	if entry == nil {
		return nil, fmt.Errorf("server %q not found in config", req.ID)
	}

	eng, err := engine2.EngineByID("mcp")
	if err != nil {
		return nil, err
	}
	_ = eng.Init(context.Background(), nil)
	mcpEng, ok := eng.(engine2.MCPEngine)
	if !ok {
		return nil, fmt.Errorf("mcp engine not available")
	}

	// If already connected, test via a temporary duplicate connection.
	testID := "__test__" + entry.ID
	if mcpEng.IsConnected(testID) {
		_ = mcpEng.DisconnectServer(context.Background(), testID)
	}

	cfg := engine2.MCPServerConfig{
		ID: testID, Type: entry.Type, Command: entry.Command,
		Args: entry.Args, Env: entry.Env, URL: entry.URL, Headers: entry.Headers,
	}
	conn, err := mcpEng.ConnectServer(context.Background(), cfg)
	if err != nil {
		return nil, fmt.Errorf("connect failed: %w", err)
	}
	defer mcpEng.DisconnectServer(context.Background(), testID)

	tools, err := conn.ListTools(context.Background())
	if err != nil {
		return nil, fmt.Errorf("list tools failed: %w", err)
	}
	names := make([]string, len(tools))
	for i, t := range tools {
		names[i] = t.Name
	}
	return names, nil
}

// ReconnectMCPServer disconnects and reconnects a configured MCP server,
// then returns its available tool names.
func (a *App) ReconnectMCPServer(args json.RawMessage) ([]string, error) {
	var req struct{ ID string }
	if err := json.Unmarshal(args, &req); err != nil {
		return nil, err
	}

	eng, err := engine2.EngineByID("mcp")
	if err != nil {
		return nil, err
	}
	_ = eng.Init(context.Background(), nil)
	mcpEng, ok := eng.(engine2.MCPEngine)
	if !ok {
		return nil, fmt.Errorf("mcp engine not available")
	}

	// Disconnect if currently connected
	_ = mcpEng.DisconnectServer(context.Background(), req.ID)

	var entry *config2.MCPServerEntry
	for i := range a.cfg.MCP.Servers {
		if a.cfg.MCP.Servers[i].ID == req.ID {
			entry = &a.cfg.MCP.Servers[i]
			break
		}
	}
	if entry == nil {
		return nil, fmt.Errorf("server %q not found in config", req.ID)
	}

	cfg := engine2.MCPServerConfig{
		ID: entry.ID, Type: entry.Type, Command: entry.Command,
		Args: entry.Args, Env: entry.Env, URL: entry.URL, Headers: entry.Headers,
	}
	conn, err := mcpEng.ConnectServer(context.Background(), cfg)
	if err != nil {
		return nil, fmt.Errorf("reconnect failed: %w", err)
	}

	tools, err := conn.ListTools(context.Background())
	if err != nil {
		return nil, fmt.Errorf("list tools failed: %w", err)
	}
	names := make([]string, len(tools))
	for i, t := range tools {
		names[i] = t.Name
	}
	return names, nil
}

// TestMCPServerConfig tests a server config without saving it.
// It takes the same JSON format as ImportMCPServers but for a single server,
// connects, lists tools, then disconnects.
func (a *App) TestMCPServerConfig(args json.RawMessage) ([]string, error) {
	var cfg struct {
		Type    string            `json:"type"`
		Command string            `json:"command"`
		Args    []string          `json:"args"`
		Env     map[string]string `json:"env"`
		URL     string            `json:"url"`
		Headers map[string]string `json:"headers"`
	}
	if err := json.Unmarshal(args, &cfg); err != nil {
		return nil, err
	}

	srvType := cfg.Type
	if srvType == "" {
		if cfg.URL != "" {
			srvType = "http"
		} else {
			srvType = "stdio"
		}
	}

	eng, err := engine2.EngineByID("mcp")
	if err != nil {
		return nil, err
	}
	_ = eng.Init(context.Background(), nil)
	mcpEng, ok := eng.(engine2.MCPEngine)
	if !ok {
		return nil, fmt.Errorf("mcp engine not available")
	}

	testID := "__test__" + cfg.Command + cfg.URL
	mcpConfig := engine2.MCPServerConfig{
		ID: testID, Type: srvType, Command: cfg.Command,
		Args: cfg.Args, Env: cfg.Env, URL: cfg.URL, Headers: cfg.Headers,
	}
	conn, err := mcpEng.ConnectServer(context.Background(), mcpConfig)
	if err != nil {
		return nil, fmt.Errorf("connect failed: %w", err)
	}
	defer mcpEng.DisconnectServer(context.Background(), testID)

	tools, err := conn.ListTools(context.Background())
	if err != nil {
		return nil, fmt.Errorf("list tools failed: %w", err)
	}
	names := make([]string, len(tools))
	for i, t := range tools {
		names[i] = t.Name
	}
	return names, nil
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
	return mcpEng.IsConnected(id)
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
		if pc.ModelsDevProvider == "" {
			pc.ModelsDevProvider = existing.ModelsDevProvider
		}
	}
	a.cfg.ModelProviders[req.ID] = pc

	// Auto-populate model limits from models.dev on first save.
	if len(pc.Models) == 0 || pc.ModelsDevProvider == "" {
		a.syncProviderFromModelsDev(req.ID)
	}

	a.writeConfig()

	// Initialize engine at runtime so provider is immediately available.
	engineID := pc.WireAPI
	if engineID == "" {
		engineID = req.ID
	}
	template, err := engine2.EngineByID(engineID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[monika] SaveProvider: engine %q not registered: %v\n", engineID, err)
		return nil
	}
	eng := template.NewInstance()
	if err := eng.Init(a.ctx, map[string]any{
		"base_url": pc.BaseURL,
		"api_key":  pc.APIKey,
		"models":   pc.Models,
	}); err != nil {
		fmt.Fprintf(os.Stderr, "[monika] SaveProvider: init engine %q failed: %v\n", engineID, err)
		return nil
	}
	providerEng, ok := eng.(engine2.ProviderEngine)
	if !ok {
		fmt.Fprintf(os.Stderr, "[monika] SaveProvider: engine %q is not a provider engine\n", engineID)
		return nil
	}
	a.providers[req.ID] = providerEng

	return nil
}

// DeleteProvider removes a model provider from config by ID.
func (a *App) DeleteProvider(args json.RawMessage) error {
	var req struct{ ID string }
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	delete(a.cfg.ModelProviders, req.ID)
	delete(a.providers, req.ID)
	a.writeConfig()
	return nil
}

// GetAppVersion returns the application version information.
func (a *App) GetAppVersion() update.VersionInfo {
	return a.checker.GetVersion()
}

// CheckForUpdate checks GitHub for the latest release.
func (a *App) CheckForUpdate() (*update.UpdateInfo, error) {
	return a.checker.CheckForUpdate(context.Background())
}

// DownloadUpdate downloads the update for the given URL.
func (a *App) DownloadUpdate(args json.RawMessage) error {
	var req struct{ URL string }
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	return a.checker.DownloadUpdate(context.Background(), req.URL)
}

// InstallUpdate replaces the current binary and restarts.
func (a *App) InstallUpdate() error {
	return a.checker.InstallUpdate()
}

// GetUpdateStatus returns the current update process status.
func (a *App) GetUpdateStatus() update.UpdateStatus {
	return a.checker.Status()
}
