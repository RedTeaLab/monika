package api

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	agent2 "monika/internal/agent"
	config2 "monika/internal/config"
	"monika/internal/dap"
	"monika/internal/dbdiscovery"
	copilotprovider "monika/internal/engines/provider/copilot"
	"monika/internal/mcpdiscovery"
	"monika/internal/lsp"
	"monika/internal/memory"
	"monika/internal/permission"
	tool2 "monika/internal/tool"
	"monika/internal/tool/builtin"
	"monika/internal/update"
	"monika/pkg/copilot"
	engine2 "monika/pkg/engine"
	"monika/pkg/modelsdev"
	"monika/pkg/proxy"

	"github.com/fsnotify/fsnotify"
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
	taskStoreAccessor TaskStoreAccessor

	mu       sync.RWMutex
	sessions map[string]*SessionManager
	projects map[string]*ProjectInfo
	fileSvc  map[string]*FileService

	eventBus    *EventBus
	cancelFuncs map[string]context.CancelFunc
	cancelMu    sync.Mutex

	agentRegistry   *agent2.AgentRegistry
	taskRunner      *agent2.TaskRunner
	childSessions   map[string]*agent2.ChildSession // keyed by child session ID
	pendingChildren map[string]string               // parentSessionID → childSessionID
	loopOpts        []agent2.LoopOption
	rawSystemPrompt string
	mcpRegistry     *engine2.MCPRegistry
	kbStore         *memory.KBStore

	permissionRequests map[string]chan permission.PermissionResponse
	permMu             sync.Mutex

	askUserRequests map[string]chan AskUserResponse
	askUserMu       sync.Mutex

	pipeline *permission.Pipeline
	checker  *update.Checker

	projectRules string // AGENTS.md content for current project, injected into system prompt
	dbSchemaNote string // one-shot DB availability hint, set on project switch

	trayMgr   *TrayManager
	tsBridge  *tsBridge
	bgTaskMgr *BackgroundTaskManager

	extractQueues   map[string]*memory.ExtractionQueue
	extractWorkers  map[string]struct{}
	extractWorkerMu sync.Mutex
	dbMgr           *DBManager

	dapManager *dap.DapManager
	debugAPI   *DebugAPI

	headWatcher    *fsnotify.Watcher
	watchedGitDirs map[string]string // gitDir → projectPath
	headDebounce   map[string]func() // gitDir → debounced refresh
	refsDebounce   map[string]func() // gitDir → debounced commit-history-changed

	eventSeq atomic.Int64
}

func NewApp(home, initialProject string, cfg config2.Config, providers map[string]engine2.ProviderEngine, model string, registry *tool2.ToolRegistry, loopOpts []agent2.LoopOption, taskStoreAccessor TaskStoreAccessor, agentRegistry *agent2.AgentRegistry, taskRunner *agent2.TaskRunner, mcpRegistry *engine2.MCPRegistry, kbStore *memory.KBStore, rawSystemPrompt string) *App {
	a := &App{
		home:              home,
		cfg:               cfg,
		providers:         providers,
		model:             model,
		registry:          registry,
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
		rawSystemPrompt:   rawSystemPrompt,
		mcpRegistry:       mcpRegistry,
		kbStore:           kbStore,
		checker:           update.NewChecker(),
		bgTaskMgr:         NewBackgroundTaskManager(filepath.Join(home, ".monika", "logs")),
		watchedGitDirs:    make(map[string]string),
		headDebounce:      make(map[string]func()),
		refsDebounce:      make(map[string]func()),
	}
	if initialProject != "" {
		a.OpenProject(initialProject)
	}
	return a
}

// AppendLoopOption appends a loop option to the internally stored slice.
func (a *App) AppendLoopOption(opt agent2.LoopOption) {
	a.loopOpts = append(a.loopOpts, opt)
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

	if w, err := fsnotify.NewWatcher(); err == nil {
		a.headWatcher = w
		go a.headWatchLoop()
	} else {
		fmt.Fprintf(os.Stderr, "[monika] head watcher init failed: %v\n", err)
	}

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
		a.safeEmit("update-available", *info)
	})

	go func() {
		for ev := range a.bgTaskMgr.Subscribe() {
			se := StreamEvent{
				Type: "bg_task",
				Seq:  a.eventSeq.Add(1),
			}
			data, _ := json.Marshal(ev)
			se.Content = string(data)
			a.safeEmit("stream", se)
		}
	}()

	go a.bgTaskMgr.CleanOldLogs()

	return nil
}

func (a *App) QuitApp() {
	application.Get().Quit()
}

func (a *App) GetCurrentProject() *ProjectInfo {
	a.mu.RLock()
	defer a.mu.RUnlock()

	if lastPath := a.loadLastProjectPath(); lastPath != "" {
		if info, ok := a.projects[lastPath]; ok {
			return info
		}
	}
	return nil
}

func (a *App) ServiceShutdown() error {
	a.cancelMu.Lock()
	for _, cancel := range a.cancelFuncs {
		cancel()
	}
	a.cancelMu.Unlock()
	a.bgTaskMgr.Cleanup()
	a.eventBus.Close()
	if a.headWatcher != nil {
		a.headWatcher.Close()
	}
	if a.dbMgr != nil {
		a.dbMgr.CloseAll()
	}
	return nil
}
func (a *App) ListBgTasks() []BgTaskInfo {
	return a.bgTaskMgr.List()
}

func (a *App) StopBgTask(taskID string) error {
	return a.bgTaskMgr.Stop(taskID)
}

func (a *App) StartBgTask(command string) (string, error) {
	return a.bgTaskMgr.Start(command, a.projectPath())
}

func (a *App) GetBgTaskLogs(taskID string) ([]string, error) {
	return a.bgTaskMgr.Logs(taskID, 100)
}

func (a *App) BgTaskLogLines(taskID string, offset, limit int) ([]string, error) {
	return a.bgTaskMgr.LogLines(taskID, offset, limit)
}

func (a *App) BgTaskManager() *BackgroundTaskManager {
	return a.bgTaskMgr
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
	worktrees, err := listGitWorktrees(path)
	if err != nil {
		// Silently continue — worktrees list is best-effort
		worktrees = nil
	}
	// Get initial commit hash for change detection
	lastCommitHash := ""
	cmd3 := command("git", "rev-parse", "HEAD")
	cmd3.Dir = path
	out3, err3 := cmd3.Output()
	if err3 == nil {
		lastCommitHash = strings.TrimSpace(string(out3))
	}

	info := &ProjectInfo{
		Path:           path,
		Name:           filepath.Base(path),
		Branch:         branch,
		Worktrees:      worktrees,
		LastCommitHash: lastCommitHash,
	}
	a.mu.Lock()
	a.projects[path] = info
	a.mu.Unlock()

	a.getSessionManager(path)
	// Reset any sessions left in StatusGenerating status from a previous crash
	a.resetStaleSessions(path)
	a.getFileService(path)
	a.bgTaskMgr.SetLogDir(filepath.Join(path, ".monika", "temp", "logs"))
	a.writeRecentProject(info.Path, info.Name)
	a.saveLastProjectPath(path)

	// Switch project knowledge base to the actual project directory.
	if a.kbStore != nil {
		wsRoot := memory.ResolveWorkspaceRoot(path)
		if err := a.kbStore.SetProjectDir(wsRoot); err != nil {
			fmt.Fprintf(os.Stderr, "[monika] kb switch project: %v\n", err)
		}
	}

	// Reload config so LSP servers are read from the actual project directory.
	a.reloadMergedConfig()

	// Re-register the LSP tool with the correct project directory.
	if t, ok := a.registry.Get("lsp"); ok {
		if lt, ok := t.(interface{ Manager() *lsp.Manager }); ok {
			lt.Manager().Stop()
		}
	}
	_ = builtin.RegisterLSP(a.registry, path, a.cfg.LSP.Servers, a.cfg.Formatters)
	builtin.WireLSPHooks(a.registry)
	a.saveLastProjectPath(path)
	a.watchProjectHead(path)
	a.onProjectSwitch(path)

	a.extractWorkerMu.Lock()
	q := a.getOrCreateExtractQueueLocked(path)
	if q != nil && q.Len() > 0 {
		fmt.Fprintf(os.Stderr, "[monika] resuming extraction queue: %d pending items\n", q.Len())
		a.startExtractionWorkerLocked(path, q)
	}
	a.extractWorkerMu.Unlock()

	return info, nil
}

// onProjectSwitch propagates the new project path to subsystems that were
// previously bound to cwd at startup: permission pipeline, DAP manager,
// AGENTS.md project rules, database discovery.
func (a *App) onProjectSwitch(path string) {
	if a.pipeline != nil {
		a.pipeline.SetProject(a.home, path)
		rules, _ := permission.LoadRules(a.home, path)
		a.pipeline.SetHardRules(permission.NewHardRuleEngine(rules, path))
	}
	if a.dapManager != nil {
		a.dapManager.SetProjectDir(path)
	}
	a.projectRules = loadProjectRules(path)
	a.discoverProjectDatabases(path)
	a.discoverProjectMCPServers(path)
	a.syncMCPServers()
}

// stripDBCredentialsIfNeeded saves real DSNs to credentials.json and rewrites
// databases.json with masked DSNs. The in-memory cache retains real DSNs.
// Idempotent: if credentials.json already has entries, only missing ones are added.
func stripDBCredentialsIfNeeded(cache *dbdiscovery.CacheFile, cachePath, credPath string) {
	if credPath == "" || cache == nil || len(cache.Connections) == 0 {
		return
	}
	store, _ := config2.LoadCredentials(credPath)
	if store.Entries == nil {
		store.Entries = make(map[string]config2.CredentialEntry)
	}

	var newCreds bool
	for _, c := range cache.Connections {
		if c.DSN != "" && config2.HasDSNCredentials(c.DSN) {
			key := "db/" + c.Name
			if existing, ok := store.Entries[key]; !ok || existing.DSN == "" {
				store.Entries[key] = config2.CredentialEntry{DSN: c.DSN}
				newCreds = true
			}
		}
	}

	if !newCreds {
		return
	}

	config2.SaveCredentials(credPath, store)

	masked := *cache
	masked.Connections = make([]dbdiscovery.DiscoveredDB, len(cache.Connections))
	for i, c := range cache.Connections {
		masked.Connections[i] = c
		masked.Connections[i].DSN = config2.MaskDSN(c.DSN)
	}
	data, err := json.MarshalIndent(masked, "", "  ")
	if err == nil {
		os.WriteFile(cachePath, data, 0o600)
	}
}

// applyDBCredentials replaces masked DSNs in the cache with real DSNs from credentials.json.
func applyDBCredentials(cache *dbdiscovery.CacheFile, credPath string) {
	if credPath == "" || cache == nil {
		return
	}
	store, err := config2.LoadCredentials(credPath)
	if err != nil {
		return
	}
	for i := range cache.Connections {
		key := "db/" + cache.Connections[i].Name
		if cred, ok := store.Entries[key]; ok && cred.DSN != "" {
			if !config2.HasDSNCredentials(cache.Connections[i].DSN) {
				cache.Connections[i].DSN = cred.DSN
			}
		}
	}
}

// discoverProjectDatabases scans the project for database connections and
// registers db tools if found. Called on project switch.
func (a *App) discoverProjectDatabases(projectPath string) {
	a.dbSchemaNote = ""
	if projectPath == "" {
		return
	}
	wsRoot := memory.ResolveWorkspaceRoot(projectPath)
	cache, err := dbdiscovery.LoadCache(wsRoot)
	if err != nil {
		cache, _ = dbdiscovery.Scan(wsRoot)
	}
	if cache == nil || len(cache.Connections) == 0 {
		return
	}
	credPath := a.credentialsPathForScope("project")
	cachePath := filepath.Join(wsRoot, ".monika", "databases.json")
	stripDBCredentialsIfNeeded(cache, cachePath, credPath)
	applyDBCredentials(cache, credPath)
	if a.dbMgr == nil {
		a.dbMgr = NewDBManager(wsRoot)
		a.dbMgr.Init(cache)
		a.dbMgr.StartSchemaBackground()
		builtin.RegisterDatabase(a.registry, a.dbMgr)
	} else {
		a.dbMgr.Reset(cache)
	}
	a.dbSchemaNote = "This project has connected databases. Use db_schema to inspect their structure."
}

func (a *App) discoverProjectMCPServers(projectPath string) {
	if projectPath == "" {
		return
	}
	wsRoot := memory.ResolveWorkspaceRoot(projectPath)
	servers, err := mcpdiscovery.Scan(wsRoot)
	if err != nil || len(servers) == 0 {
		return
	}
	var existingIDs []string
	a.mu.Lock()
	for _, s := range a.cfg.MCP.Servers {
		existingIDs = append(existingIDs, s.ID)
	}
	a.mu.Unlock()
	newServers := mcpdiscovery.FilterExisting(servers, existingIDs)
	if len(newServers) == 0 {
		return
	}
	fmt.Fprintf(os.Stderr, "[monika] mcpdiscovery: found %d new MCP server(s):\n%s\n",
		len(newServers), mcpdiscovery.FormatSummary(newServers))
	a.safeEmit("mcp-discovered", map[string]any{
		"count":   len(newServers),
		"servers": newServers,
	})
	scope := "project"
	credPath := a.credentialsPathForScope(scope)
	for _, s := range newServers {
		entry := config2.MCPServerEntry{
			ID:      s.ID,
			Type:    s.Type,
			Command: s.Command,
			Args:    s.Args,
			Env:     s.Env,
			URL:     s.URL,
			Headers: s.Headers,
		}
		cred := config2.StripCredentials(&entry)
		if err := a.writeConfigForScope(scope, func(cfg *config2.Config) {
			found := false
			for i, existing := range cfg.MCP.Servers {
				if existing.ID == entry.ID {
					cfg.MCP.Servers[i] = entry
					found = true
					break
				}
			}
			if !found {
				cfg.MCP.Servers = append(cfg.MCP.Servers, entry)
			}
		}); err != nil {
			fmt.Fprintf(os.Stderr, "[monika] mcpdiscovery: failed to save %s: %v\n", s.ID, err)
			continue
		}
		if credPath != "" && !cred.Empty() {
			if err := config2.UpdateCredentials(credPath, s.ID, cred); err != nil {
				fmt.Fprintf(os.Stderr, "[monika] mcpdiscovery: credentials write for %s: %v\n", s.ID, err)
			}
		}
	}
	a.reloadMergedConfig()
}

func loadProjectRules(projectDir string) string {
	paths := []string{
		filepath.Join(projectDir, "AGENTS.md"),
		filepath.Join(projectDir, ".monika", "AGENTS.md"),
	}
	for _, p := range paths {
		if data, err := os.ReadFile(p); err == nil {
			return `<project_rules>
The content below is your PROJECT RULES from AGENTS.md. These rules are NON-NEGOTIABLE — they represent the project's architectural decisions, coding conventions, and hard constraints. You MUST follow them as strictly as the rules above. Violating project rules is as serious as violating core safety boundaries.

` + string(data) + `
</project_rules>`
		}
	}
	return ""
}

func (a *App) ListSessions(projectPath string) ([]SessionInfo, error) {
	sm := a.getSessionManager(projectPath)
	return sm.List()
}

func (a *App) NewSession(projectPath, providerID, model string) (*SessionInfo, error) {
	if projectPath == "" {
		return nil, fmt.Errorf("no project open; open a project first")
	}
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
				ID:              m.ID,
				Name:            m.DisplayName,
				ContextLimit:    m.ContextLimit,
				OutputLimit:     m.OutputLimit,
				Enabled:         m.Enabled,
				SupportedInputs: m.SupportedInputs,
			})
		}
		result = append(result, ProviderInfo{
			ID:             id,
			DisplayName:    displayName,
			BaseURL:        pc.BaseURL,
			APIKey:         pc.APIKey,
			WireAPI:        pc.WireAPI,
			Models:         models,
			TokenExpiresAt: pc.TokenExpiresAt,
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
					ID:              modelID,
					Name:            displayName,
					ContextLimit:    md.Limit.Context,
					OutputLimit:     md.Limit.Output,
					SupportedInputs: md.Modalities.Input,
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
				Env:         p.Env,
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

func (a *App) GetProxyConfig() config2.ProxyConfig {
	return a.cfg.Proxy
}

func (a *App) SaveProxyConfig(args json.RawMessage) error {
	var req struct {
		Enabled bool   `json:"enabled"`
		URL     string `json:"url"`
	}
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	a.mu.Lock()
	a.cfg.Proxy = config2.ProxyConfig{Enabled: req.Enabled, URL: req.URL}
	a.mu.Unlock()

	if req.Enabled && req.URL != "" {
		proxy.SetURL(req.URL)
	} else {
		proxy.SetURL("")
	}

	return a.writeConfigForScope("global", func(cfg *config2.Config) {
		cfg.Proxy = config2.ProxyConfig{Enabled: req.Enabled, URL: req.URL}
	})
}

// TestProxyConnection tests connectivity to GitHub through the current proxy.
func (a *App) TestProxyConnection() (string, error) {
	client := &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			Proxy: proxy.Func(),
		},
	}
	resp, err := client.Get("https://github.com")
	if err != nil {
		return "", fmt.Errorf("connection failed: %w", err)
	}
	defer resp.Body.Close()
	return fmt.Sprintf("OK — GitHub reachable (HTTP %d)", resp.StatusCode), nil
}

func (a *App) GetModels(providerID string) ([]engine2.Model, error) {
	p, ok := a.providers[providerID]
	if !ok {
		return nil, fmt.Errorf("provider %q not available", providerID)
	}
	return p.ListModels(a.ctx)
}

func (a *App) PersistSelection(providerID, modelID string) {
	a.mu.Lock()
	a.cfg.ModelProvider = providerID
	a.cfg.Model = modelID
	a.mu.Unlock()

	if err := a.writeConfigForScope("global", func(cfg *config2.Config) {
		cfg.ModelProvider = providerID
		cfg.Model = modelID
	}); err != nil {
		fmt.Fprintf(os.Stderr, "[monika] WARNING: failed to persist model selection: %v\n", err)
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

func (a *App) SetSessionModel(projectPath, sessionID, providerID, model string) error {
	sm := a.getSessionManager(projectPath)
	sm.Lock()
	defer sm.Unlock()
	s, err := sm.Load(sessionID)
	if err != nil {
		return err
	}
	s.Provider = providerID
	s.Model = model
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
	if err := sm.Save(s); err != nil {
		return err
	}

	return nil
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

func copyConversationData(dst, src *Session, providerID, model string) {
	dst.Messages = src.Messages
	dst.TokenCount = src.TokenCount
	dst.TokenMax = src.TokenMax
	dst.CompactionCount = src.CompactionCount
	dst.CompactionFrom = src.CompactionFrom
	dst.Provider = providerID
	dst.Model = model
	dst.Title = src.Title
}

func (a *App) SendMessage(projectPath, sessionID, text, providerID, model string) error {
	sm := a.getSessionManager(projectPath)

	a.cancelMu.Lock()
	_, busy := a.cancelFuncs[sessionID]
	a.cancelMu.Unlock()

	sm.Lock()

	s, err := sm.Load(sessionID)
	if err != nil {
		sm.Unlock()
		return err
	}

	providerID, model = a.validateModel(providerID, model)
	if _, ok := a.providers[providerID]; !ok {
		sm.Unlock()
		return fmt.Errorf("provider %q not found", providerID)
	}
	// Enqueue only when the agent is generating or there are pending items;
	// otherwise send directly for immediate execution.
	if busy || sm.NextQueuedItem(s) != nil {
		item := QueuedMessage{
			ID:         generateID(),
			Text:       text,
			ProviderID: providerID,
			Model:      model,
			Status:     "queued",
			CreatedAt:  time.Now().Unix(),
		}
		sm.EnqueueQueueItem(s, item)
		if err := sm.Save(s); err != nil {
			sm.Unlock()
			return err
		}
		sm.Unlock()

		a.emitQueueUpdated(sessionID, s.Queue)
		return nil
	}

	// Agent is idle with an empty queue — execute directly.
	sm.Unlock()

	a.emitQueueItemStarted(sessionID, QueuedMessage{
		ID:         generateID(),
		Text:       text,
		ProviderID: providerID,
		Model:      model,
		Status:     "executing",
		CreatedAt:  time.Now().Unix(),
	})

	ctx, cancel := context.WithCancel(a.ctx)
	a.cancelMu.Lock()
	a.cancelFuncs[sessionID] = cancel
	a.cancelMu.Unlock()

	a.startAgentLoop(ctx, cancel, sm, s, sessionID, text, providerID, model, "")
	return nil
}

func (a *App) startAgentLoop(ctx context.Context, cancel context.CancelFunc, sm *SessionManager, s *Session, sessionID, text, providerID, model, queueItemID string) {
	// Route /skill-name [msg] to skill tool
	if strings.HasPrefix(text, "/") {
		parts := strings.SplitN(strings.TrimPrefix(text, "/"), " ", 2)
		skillName := parts[0]
		if skillName != "" {
			skills := a.ListSkills()
			for _, sk := range skills {
				if sk.Name == skillName {
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

	providerEng, _ := a.providers[providerID]

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
		agent2.WithProjectDir(a.resolveWorkingDir(sessionID)),
		agent2.WithProvider(providerID),
		agent2.WithModel(model),
		agent2.WithSessionID(sessionID),
		agent2.WithTaskStore(a.taskStoreAccessor.GetTaskStore(sessionID)),
	)

	if ctxLimit, outLimit := a.modelLimits(providerID, model); ctxLimit > 0 {
		opts = append(opts, agent2.WithContextLimit(ctxLimit), agent2.WithOutputLimit(outLimit))
	}
	generalAgent, _ := a.agentRegistry.Get("general")
	opts = append(opts,
		agent2.WithAgent(generalAgent),
		agent2.WithProjectRules(a.projectRules),
	)
	if a.dbSchemaNote != "" {
		opts = append(opts, agent2.WithDBSchemaNote(a.dbSchemaNote))
	}
	// Replace {{WorkingDirectory}} in the system prompt with the actual project directory.
	projectDir := a.resolveWorkingDir(sessionID)
	normalizedDir := strings.ReplaceAll(projectDir, "\\", "/")
	opts = append(opts, agent2.WithSystemPrompt(strings.ReplaceAll(a.rawSystemPrompt, "{{WorkingDirectory}}", normalizedDir)))

	loop := agent2.NewLoop(providerEng, a.registry, opts...)
	go func() {
		defer cancel()

		// Set generating status (reload from disk to preserve concurrent queue changes)
		sm.Lock()
		freshInit, errInit := sm.Load(sessionID)
		if errInit == nil {
			sm.SetStatus(freshInit, StatusGenerating)
			sm.Save(freshInit)
		} else {
			sm.SetStatus(s, StatusGenerating)
			sm.Save(s)
		}
		sm.Unlock()

		var hadError bool
		events := loop.Run(ctx, conv, text)
		for ev := range events {
			select {
			case <-ctx.Done():
				_ = ctx.Err()
			default:
			}
			if ev.Type == agent2.EventError {
				hadError = true
			}
			a.handleAgentEvent(sessionID, model, ev)
		}

		s.Messages = conv.Messages
		s.TokenCount = conv.TokenCount
		s.TokenMax = conv.TokenMax
		s.CompactionCount = conv.CompactionCount
		s.CompactionFrom = conv.CompactionFrom
		s.Provider = providerID
		s.Model = model
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

		// If context was cancelled during a queued message,
		// CancelQueueItem/CancelGeneration already set the item to "error".
		// Reload from disk to preserve that state, only updating conversation data.
		if ctx.Err() != nil && queueItemID != "" {
			sm.Lock()
			fresh, err := sm.Load(sessionID)
			if err == nil {
				copyConversationData(fresh, s, providerID, model)
				sm.SetStatus(fresh, StatusPending)
				sm.Save(fresh)
			}
			sm.Unlock()
			a.cancelMu.Lock()
			delete(a.cancelFuncs, sessionID)
			a.cancelMu.Unlock()
			return
		}

		// Error during queued message execution — pause queue
		if hadError && queueItemID != "" {
			sm.Lock()
			fresh2, err2 := sm.Load(sessionID)
			if err2 == nil {
				copyConversationData(fresh2, s, providerID, model)
				sm.UpdateQueueItem(fresh2, queueItemID, func(item *QueuedMessage) {
					item.Status = "error"
				})
				fresh2.QueuePaused = true
				sm.SetStatus(fresh2, StatusPending)
				sm.Save(fresh2)
			} else {
				copyConversationData(s, s, providerID, model)
				sm.UpdateQueueItem(s, queueItemID, func(item *QueuedMessage) {
					item.Status = "error"
				})
				s.QueuePaused = true
				sm.SetStatus(s, StatusPending)
				sm.Save(s)
			}
			sm.Unlock()
			a.emitQueueError(sessionID, queueItemID, "execution failed")
			a.cancelMu.Lock()
			delete(a.cancelFuncs, sessionID)
			a.cancelMu.Unlock()
			return // Skip normal completion + drain — queue is paused
		}

		// Auto-drain: reload from disk to preserve concurrent changes (e.g. PauseQueue)
		sm.Lock()
		fresh, err := sm.Load(sessionID)
		if err == nil {
			copyConversationData(fresh, s, providerID, model)
			if queueItemID != "" {
				sm.RemoveQueueItem(fresh, queueItemID)
			}
			sm.SetStatus(fresh, StatusPending)
			sm.Save(fresh)
			s.Queue = fresh.Queue
		} else {
			if queueItemID != "" {
				sm.RemoveQueueItem(s, queueItemID)
			}
			sm.SetStatus(s, StatusPending)
			sm.Save(s)
		}
		sm.Unlock()

		// Memory extraction: enqueue transcript for background processing.
		// The worker processes items one-by-one; later items supersede earlier
		// ones for the same session to avoid redundant LLM calls.
		msgSnapshot := make([]engine2.ChatMessage, len(s.Messages))
		copy(msgSnapshot, s.Messages)
		a.enqueueMemoryExtraction(sessionID, providerID, model, msgSnapshot)

		// Sync frontend with updated queue (completed item removed)
		if queueItemID != "" {
			a.emitQueueUpdated(sessionID, s.Queue)
		}

		// Clean up cancelFuncs BEFORE drainQueue so it sees the agent as idle
		a.cancelMu.Lock()
		delete(a.cancelFuncs, sessionID)
		a.cancelMu.Unlock()

		if ctx.Err() == nil {
			a.handleAgentEvent(sessionID, model, agent2.Event{
				Type:    agent2.EventSessionUpdated,
				Content: s.Title,
			})
			// Auto-drain only on normal completion (not on cancel)
			a.drainQueue(sm, sessionID)
		}
	}()
}

func (a *App) drainQueue(sm *SessionManager, sessionID string) {
	sm.Lock()
	defer sm.Unlock()

	s, err := sm.Load(sessionID)
	if err != nil {
		return
	}

	// Don't drain if paused
	if s.QueuePaused {
		return
	}

	// Find next queued item
	item := sm.NextQueuedItem(s)
	if item == nil {
		return
	}

	// Check not busy
	a.cancelMu.Lock()
	_, busy := a.cancelFuncs[sessionID]
	a.cancelMu.Unlock()
	if busy {
		return
	}

	// Mark as executing
	sm.UpdateQueueItem(s, item.ID, func(qi *QueuedMessage) {
		qi.Status = "executing"
	})
	sm.Save(s)

	// Notify frontend that this item is starting
	a.emitQueueItemStarted(sessionID, *item)

	// Set up cancel func
	ctx, cancel := context.WithCancel(a.ctx)
	a.cancelMu.Lock()
	a.cancelFuncs[sessionID] = cancel
	a.cancelMu.Unlock()

	// Start agent loop for this queued message
	a.startAgentLoop(ctx, cancel, sm, s, sessionID, item.Text, item.ProviderID, item.Model, item.ID)
}

func (a *App) ExecuteQueueItem(projectPath, sessionID, itemID string) error {
	sm := a.getSessionManager(projectPath)

	// Check agent is idle
	a.cancelMu.Lock()
	_, busy := a.cancelFuncs[sessionID]
	a.cancelMu.Unlock()
	if busy {
		return fmt.Errorf("agent is busy, cannot execute item")
	}

	sm.Lock()
	defer sm.Unlock()

	s, err := sm.Load(sessionID)
	if err != nil {
		return err
	}

	idx := sm.FindQueueItem(s, itemID)
	if idx < 0 {
		return fmt.Errorf("queue item %s not found", itemID)
	}
	if s.Queue[idx].Status != "queued" {
		return fmt.Errorf("can only execute queued items")
	}

	// Move item to front if not already
	if idx > 0 {
		item := s.Queue[idx]
		s.Queue = append([]QueuedMessage{item}, append(s.Queue[:idx], s.Queue[idx+1:]...)...)
	}

	// Mark as executing
	sm.UpdateQueueItem(s, itemID, func(qi *QueuedMessage) {
		qi.Status = "executing"
	})
	if err := sm.Save(s); err != nil {
		return err
	}

	// Notify frontend
	item := s.Queue[0]
	a.emitQueueItemStarted(sessionID, item)
	a.emitQueueUpdated(sessionID, s.Queue)

	// Set up cancel func
	ctx, cancel := context.WithCancel(a.ctx)
	a.cancelMu.Lock()
	a.cancelFuncs[sessionID] = cancel
	a.cancelMu.Unlock()

	// Start agent loop
	a.startAgentLoop(ctx, cancel, sm, s, sessionID, item.Text, item.ProviderID, item.Model, item.ID)
	return nil
}

func (a *App) GetQueue(projectPath, sessionID string) ([]QueuedMessage, error) {
	sm := a.getSessionManager(projectPath)
	sm.Lock()
	defer sm.Unlock()
	s, err := sm.Load(sessionID)
	if err != nil {
		return nil, err
	}
	return s.Queue, nil
}

func (a *App) EditQueueItem(projectPath, sessionID, itemID, newText string) error {
	sm := a.getSessionManager(projectPath)
	sm.Lock()
	defer sm.Unlock()
	s, err := sm.Load(sessionID)
	if err != nil {
		return err
	}
	idx := sm.FindQueueItem(s, itemID)
	if idx < 0 {
		return fmt.Errorf("queue item %s not found", itemID)
	}
	if s.Queue[idx].Status == "executing" {
		return fmt.Errorf("cannot edit an executing message")
	}
	sm.UpdateQueueItem(s, itemID, func(item *QueuedMessage) {
		item.Text = newText
	})
	if err := sm.Save(s); err != nil {
		return err
	}
	a.emitQueueUpdated(sessionID, s.Queue)
	return nil
}

func (a *App) ReorderQueue(projectPath, sessionID string, itemIDs []string) error {
	sm := a.getSessionManager(projectPath)
	sm.Lock()
	defer sm.Unlock()
	s, err := sm.Load(sessionID)
	if err != nil {
		return err
	}
	sm.ReorderQueue(s, itemIDs)
	if err := sm.Save(s); err != nil {
		return err
	}
	a.emitQueueUpdated(sessionID, s.Queue)
	return nil
}

func (a *App) CancelQueueItem(projectPath, sessionID, itemID string) error {
	sm := a.getSessionManager(projectPath)
	sm.Lock()
	s, err := sm.Load(sessionID)
	if err != nil {
		sm.Unlock()
		return err
	}
	idx := sm.FindQueueItem(s, itemID)
	if idx < 0 {
		sm.Unlock()
		return fmt.Errorf("queue item %s not found", itemID)
	}

	if s.Queue[idx].Status == "executing" {
		// Cancel current generation + pause queue
		sm.UpdateQueueItem(s, itemID, func(item *QueuedMessage) {
			item.Status = "error"
			item.Error = "cancelled by user"
		})
		s.QueuePaused = true
		if err := sm.Save(s); err != nil {
			sm.Unlock()
			return err
		}
		sm.Unlock()

		// Cancel the running agent loop
		a.cancelMu.Lock()
		cancel, ok := a.cancelFuncs[sessionID]
		a.cancelMu.Unlock()
		if ok {
			cancel()
		}

		a.emitQueueError(sessionID, itemID, "cancelled by user")
		return nil
	}

	// Simple removal for queued/error items
	sm.RemoveQueueItem(s, itemID)
	if err := sm.Save(s); err != nil {
		sm.Unlock()
		return err
	}
	sm.Unlock()
	a.emitQueueUpdated(sessionID, s.Queue)
	return nil
}

func (a *App) PauseQueue(projectPath, sessionID string) error {
	sm := a.getSessionManager(projectPath)
	sm.Lock()
	defer sm.Unlock()
	s, err := sm.Load(sessionID)
	if err != nil {
		return err
	}
	s.QueuePaused = true
	if err := sm.Save(s); err != nil {
		return err
	}
	a.emitQueueUpdated(sessionID, s.Queue)
	return nil
}

func (a *App) ResumeQueue(projectPath, sessionID string) error {
	sm := a.getSessionManager(projectPath)
	sm.Lock()
	s, err := sm.Load(sessionID)
	if err != nil {
		sm.Unlock()
		return err
	}
	s.QueuePaused = false
	if err := sm.Save(s); err != nil {
		sm.Unlock()
		return err
	}
	a.emitQueueUpdated(sessionID, s.Queue)
	sm.Unlock()
	a.cancelMu.Lock()
	_, busy := a.cancelFuncs[sessionID]
	a.cancelMu.Unlock()
	if !busy {
		a.drainQueue(sm, sessionID)
	}
	return nil
}

func (a *App) RetryQueueItem(projectPath, sessionID, itemID string) error {
	sm := a.getSessionManager(projectPath)
	sm.Lock()
	s, err := sm.Load(sessionID)
	if err != nil {
		sm.Unlock()
		return err
	}
	idx := sm.FindQueueItem(s, itemID)
	if idx < 0 {
		sm.Unlock()
		return fmt.Errorf("queue item %s not found", itemID)
	}
	if s.Queue[idx].Status != "error" {
		sm.Unlock()
		return fmt.Errorf("can only retry failed items")
	}
	sm.UpdateQueueItem(s, itemID, func(item *QueuedMessage) {
		item.Status = "queued"
		item.Error = ""
	})
	s.QueuePaused = false
	if err := sm.Save(s); err != nil {
		sm.Unlock()
		return err
	}
	sm.Unlock()

	// Trigger drain if idle
	a.cancelMu.Lock()
	_, busy := a.cancelFuncs[sessionID]
	a.cancelMu.Unlock()
	if !busy {
		a.drainQueue(sm, sessionID)
	}
	return nil
}

func (a *App) SkipQueueItem(projectPath, sessionID, itemID string) error {
	sm := a.getSessionManager(projectPath)
	sm.Lock()
	s, err := sm.Load(sessionID)
	if err != nil {
		sm.Unlock()
		return err
	}
	sm.RemoveQueueItem(s, itemID)
	s.QueuePaused = false
	if err := sm.Save(s); err != nil {
		sm.Unlock()
		return err
	}
	sm.Unlock()

	// Trigger drain if idle
	a.cancelMu.Lock()
	_, busy := a.cancelFuncs[sessionID]
	a.cancelMu.Unlock()
	if !busy {
		a.drainQueue(sm, sessionID)
	}
	return nil
}

func (a *App) safeEmit(eventName string, data any) {
	app := application.Get()
	if app == nil {
		return
	}
	app.Event.Emit(eventName, data)
}

func (a *App) emitQueueUpdated(sessionID string, queue []QueuedMessage) {
	se := StreamEvent{
		SessionID: sessionID,
		Type:      "queue_updated",
		Content:   queueToJSON(queue),
		Seq:       a.eventSeq.Add(1),
	}
	a.eventBus.Emit(se)
	a.safeEmit("stream", se)
}

func (a *App) emitQueueItemStarted(sessionID string, item QueuedMessage) {
	se := StreamEvent{
		SessionID: sessionID,
		Type:      "queue_item_started",
		Content:   queueItemToJSON(item),
		Seq:       a.eventSeq.Add(1),
	}
	a.eventBus.Emit(se)
	a.safeEmit("stream", se)
}

func (a *App) emitQueueError(sessionID, itemID, errorMsg string) {
	se := StreamEvent{
		SessionID: sessionID,
		Type:      "queue_error",
		Content:   fmt.Sprintf(`{"item_id":%q,"error":%q}`, itemID, errorMsg),
		Seq:       a.eventSeq.Add(1),
	}
	a.eventBus.Emit(se)
	a.safeEmit("stream", se)
}

func queueToJSON(queue []QueuedMessage) string {
	data, err := json.Marshal(queue)
	if err != nil {
		return "[]"
	}
	return string(data)
}

func queueItemToJSON(item QueuedMessage) string {
	data, err := json.Marshal(item)
	if err != nil {
		return "{}"
	}
	return string(data)
}

func (a *App) CancelGeneration(sessionID string) {
	a.cancelMu.Lock()
	cancel, ok := a.cancelFuncs[sessionID]
	a.cancelMu.Unlock()
	if ok {
		cancel()
		if sm := a.getSessionManagerForSession(sessionID); sm != nil {
			sm.Lock()
			s, err := sm.Load(sessionID)
			if err == nil {
				sm.SetStatus(s, StatusPending)
				for i := range s.Queue {
					if s.Queue[i].Status == "executing" {
						s.Queue[i].Status = "error"
					}
				}
				sm.Save(s)
			}
			sm.Unlock()
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

	providerID, model = a.validateModel(providerID, model)

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
		agent2.WithTaskStore(a.taskStoreAccessor.GetTaskStore(sessionID)),
	)

	if ctxLimit, outLimit := a.modelLimits(providerID, model); ctxLimit > 0 {
		opts = append(opts, agent2.WithContextLimit(ctxLimit), agent2.WithOutputLimit(outLimit))
	}
	generalAgent, _ := a.agentRegistry.Get("general")
	opts = append(opts,
		agent2.WithAgent(generalAgent),
		agent2.WithProjectRules(a.projectRules),
	)
	// Replace {{WorkingDirectory}} in the system prompt with the actual project directory.
	normalizedDir := strings.ReplaceAll(projectPath, "\\", "/")
	opts = append(opts, agent2.WithSystemPrompt(strings.ReplaceAll(a.rawSystemPrompt, "{{WorkingDirectory}}", normalizedDir)))

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

// ansiRE matches ANSI/VT escape sequences: OSC (title etc.), CSI (colors,
// cursor, private modes), and simple two-byte escapes (ESC 7, ESC =, ...).
var ansiRE = regexp.MustCompile(
	`\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)` + // OSC: ESC ] ... BEL or ST(ESC \)
		`|\x1b\[[0-?]*[ -/]*[@-~]` + // CSI: ESC [ params... final byte
		`|\x1b[NOMDX78=>]`) // Other simple 2-byte escapes

func stripANSI(s string) string {
	return ansiRE.ReplaceAllString(s, "")
}

// RunShellCommand executes a shell command in the project directory, streaming output via SSE.
// Returns nil after launching the command; output is delivered through shell_output/shell_done events.
func (a *App) RunShellCommand(projectPath, sessionID, command string) error {
	shell, shellArg := resolveShellAPI()
	if shell == "" {
		return fmt.Errorf("no shell found on system")
	}

	ctx, cancel := context.WithCancel(a.ctx)
	a.cancelMu.Lock()
	if _, exists := a.cancelFuncs[sessionID]; exists {
		a.cancelMu.Unlock()
		cancel()
		return fmt.Errorf("session %s is busy", sessionID)
	}
	a.cancelFuncs[sessionID] = cancel
	a.cancelMu.Unlock()

	cmd := exec.CommandContext(ctx, shell, shellArg, command)
	cmd.Dir = a.resolveWorkingDir(sessionID)
	hideWindow(cmd)

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		a.cancelMu.Lock()
		delete(a.cancelFuncs, sessionID)
		a.cancelMu.Unlock()
		cancel()
		return err
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		a.cancelMu.Lock()
		delete(a.cancelFuncs, sessionID)
		a.cancelMu.Unlock()
		cancel()
		return err
	}

	if err := cmd.Start(); err != nil {
		a.cancelMu.Lock()
		delete(a.cancelFuncs, sessionID)
		a.cancelMu.Unlock()
		cancel()
		return err
	}

	go func() {
		defer func() {
			a.cancelMu.Lock()
			delete(a.cancelFuncs, sessionID)
			a.cancelMu.Unlock()
			cancel()
		}()

		lineCh := make(chan string, 128)
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			scanner := bufio.NewScanner(stdoutPipe)
			scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
			for scanner.Scan() {
				lineCh <- scanner.Text()
			}
		}()
		go func() {
			defer wg.Done()
			scanner := bufio.NewScanner(stderrPipe)
			scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
			for scanner.Scan() {
				lineCh <- scanner.Text()
			}
		}()
		go func() { wg.Wait(); close(lineCh) }()

		var outputBuf strings.Builder
		for line := range lineCh {
			a.emitShellOutput(sessionID, line)
			outputBuf.WriteString(line)
			outputBuf.WriteByte('\n')
		}

		waitErr := cmd.Wait()
		exitCode := 0
		if waitErr != nil {
			var exitErr *exec.ExitError
			if errors.As(waitErr, &exitErr) {
				exitCode = exitErr.ExitCode()
			} else {
				sm := a.getSessionManagerForSession(sessionID)
				if sm != nil {
					fullContent := formatShellContent(command, -1, outputBuf.String()) + "\n[cancelled]"
					sm.AppendShellMessages(sessionID, []engine2.ChatMessage{
						{Role: "shell", Content: fullContent},
					})
				}
				a.emitShellError(sessionID, waitErr.Error())
				return
			}
		}

		a.emitShellDone(sessionID, exitCode, command)

		sm := a.getSessionManagerForSession(sessionID)
		if sm != nil {
			fullContent := formatShellContent(command, exitCode, outputBuf.String())
			sm.AppendShellMessages(sessionID, []engine2.ChatMessage{
				{Role: "shell", Content: fullContent},
			})
		}
	}()

	return nil
}

func (a *App) emitShellOutput(sessionID, line string) {
	se := StreamEvent{
		SessionID: sessionID,
		Type:      "shell_output",
		Content:   line,
		Seq:       a.eventSeq.Add(1),
	}
	a.eventBus.Emit(se)
	a.safeEmit("stream", se)
}

func (a *App) emitShellDone(sessionID string, exitCode int, command string) {
	content, _ := json.Marshal(map[string]any{"exitCode": exitCode, "command": command})
	se := StreamEvent{
		SessionID: sessionID,
		Type:      "shell_done",
		Content:   string(content),
		Seq:       a.eventSeq.Add(1),
	}
	a.eventBus.Emit(se)
	a.safeEmit("stream", se)
}

func (a *App) emitShellError(sessionID, errMsg string) {
	se := StreamEvent{
		SessionID: sessionID,
		Type:      "shell_error",
		Content:   errMsg,
		Seq:       a.eventSeq.Add(1),
	}
	a.eventBus.Emit(se)
	a.safeEmit("stream", se)
}

// CancelShellCommand cancels a running shell command for the given session.
func (a *App) CancelShellCommand(sessionID string) {
	a.cancelMu.Lock()
	cancel, ok := a.cancelFuncs[sessionID]
	a.cancelMu.Unlock()
	if ok {
		cancel()
	}
}

func formatShellContent(command string, exitCode int, output string) string {
	output = strings.TrimSpace(output)
	var sb strings.Builder
	sb.WriteString("$ ")
	sb.WriteString(command)
	if output != "" {
		sb.WriteString("\n\n")
		if exitCode != 0 {
			sb.WriteString(fmt.Sprintf("Shell output (exit code %d):\n", exitCode))
		} else {
			sb.WriteString("Shell output:\n")
		}
		sb.WriteString("```\n")
		sb.WriteString(output)
		sb.WriteString("\n```")
	} else if exitCode != 0 {
		sb.WriteString(fmt.Sprintf("\n\nShell output (exit code %d): no output", exitCode))
	}
	return sb.String()
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

// SetFileDirty notifies the backend that a file has unsaved user edits.
// The frontend calls this when the user starts/stops editing a file.
func (a *App) SetFileDirty(projectPath, filePath string, dirty bool) {
	absPath := filepath.Join(projectPath, filePath)
	tool2.SetFileDirty(absPath, dirty)
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
		if ev.Tool != nil && ev.Tool.Name == "bash" {
			a.emitCommitHistoryChangedIfChanged()
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
	case agent2.EventRetrying:
		se.Type = "retrying"
		se.Content = ev.Content
		se.RetryAttempt = ev.RetryAttempt
		se.RetryMax = ev.RetryMax
	case agent2.EventToolProgress:
		se.Type = "tool_progress"
		se.Content = ev.Content
	}

	a.eventBus.Emit(se)
	a.safeEmit("stream", se)
}

func (a *App) EmitTaskEvent(sessionID string, tasks []agent2.TaskItem) {
	se := StreamEvent{
		SessionID: sessionID,
		Type:      "task_updated",
		Tasks:     tasks,
		Seq:       a.eventSeq.Add(1),
	}
	a.eventBus.Emit(se)
	a.safeEmit("stream", se)
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

	a.safeEmit("branch-changed", currentBranch)
}

// setProjectLastCommitHash updates the in-memory last commit hash for a project.
func (a *App) setProjectLastCommitHash(projectPath, hash string) {
	a.mu.Lock()
	if info, ok := a.projects[projectPath]; ok {
		info.LastCommitHash = hash
	}
	a.mu.Unlock()
}

// emitCommitHistoryChangedIfChanged reads the current git HEAD hash from disk and compares
// it with the cached value. If different, it emits a Wails event so the frontend
// can refresh the commit history.
func (a *App) emitCommitHistoryChangedIfChanged() {
	projectPath := ""
	a.mu.RLock()
	// Find the project path that owns this session.
	for _, info := range a.projects {
		projectPath = info.Path
		break
	}
	storedHash := ""
	if info, ok := a.projects[projectPath]; ok {
		storedHash = info.LastCommitHash
	}
	a.mu.RUnlock()

	if projectPath == "" {
		return
	}

	cmd := command("git", "rev-parse", "HEAD")
	cmd.Dir = projectPath
	out, err := cmd.Output()
	if err != nil {
		return
	}
	currentHash := strings.TrimSpace(string(out))
	if currentHash == "" || currentHash == storedHash {
		return
	}

	a.setProjectLastCommitHash(projectPath, currentHash)

	a.safeEmit("commit-history-changed", currentHash)
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

// buildTranscript constructs a compact conversation transcript from session
// messages for memory extraction. Skips tool results, compaction summaries,
// and empty content. Tool results are noisy (file contents, grep output) and
// would consume the char budget without contributing extractable knowledge.
// When the transcript exceeds maxChars, keeps the MOST RECENT messages (which
// contain the freshest, most relevant knowledge) and drops older ones.
func buildTranscript(s *Session, maxChars int) string {
	type entry struct{ text string }
	var entries []entry
	total := 0
	for _, m := range s.Messages {
		if m.Name == "compaction_summary" || m.Role == "tool" {
			continue
		}
		content := strings.TrimSpace(m.Content)
		if content == "" {
			continue
		}
		role := m.Role
		if role == "" {
			role = "unknown"
		}
		line := fmt.Sprintf("[%s]: %s\n\n", role, content)
		entries = append(entries, entry{line})
		total += len(line)
	}
	if total <= maxChars {
		var b strings.Builder
		for _, e := range entries {
			b.WriteString(e.text)
		}
		return b.String()
	}
	// Keep most recent entries that fit within budget
	cutoff := len(entries)
	running := 0
	for i := len(entries) - 1; i >= 0; i-- {
		if running+len(entries[i].text) > maxChars {
			cutoff = i + 1
			break
		}
		running += len(entries[i].text)
		if i == 0 {
			cutoff = 0
		}
	}
	var b strings.Builder
	if cutoff > 0 {
		b.WriteString("…\n\n")
	}
	for i := cutoff; i < len(entries); i++ {
		b.WriteString(entries[i].text)
	}
	out := b.String()
	if len(out) > maxChars {
		r := []rune(out)
		c := 0
		byteLen := 0
		for _, ch := range r {
			if byteLen+len(string(ch)) > maxChars {
				break
			}
			byteLen += len(string(ch))
			c++
		}
		out = string(r[:c])
	}
	return out
}

func (a *App) enqueueMemoryExtraction(sessionID, _, _ string, msgs []engine2.ChatMessage) {
	if a.kbStore == nil {
		return
	}
	pp := a.resolveWorkingDir(sessionID)
	if pp == "" {
		return
	}
	transcript := buildTranscript(&Session{Messages: msgs}, 8000)
	if transcript == "" {
		return
	}
	a.extractWorkerMu.Lock()
	q := a.getOrCreateExtractQueueLocked(pp)
	if q == nil {
		a.extractWorkerMu.Unlock()
		return
	}
	item := memory.ExtractionItem{
		ID:         generateID(),
		SessionID:  sessionID,
		Transcript: transcript,
	}
	if err := q.EnqueueOrReplace(item); err != nil {
		fmt.Fprintf(os.Stderr, "[monika] extraction enqueue failed: %v\n", err)
		a.extractWorkerMu.Unlock()
		return
	}
	fmt.Fprintf(os.Stderr, "[monika] memory extraction enqueued (session=%s, queue=%d)\n", sessionID, q.Len())
	a.startExtractionWorkerLocked(pp, q)
	a.extractWorkerMu.Unlock()
}

func (a *App) getOrCreateExtractQueueLocked(projectPath string) *memory.ExtractionQueue {
	if a.extractQueues == nil {
		a.extractQueues = make(map[string]*memory.ExtractionQueue)
	}
	if q, ok := a.extractQueues[projectPath]; ok {
		return q
	}
	q, err := memory.NewExtractionQueue(projectPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[monika] extraction queue init failed: %v\n", err)
		return nil
	}
	a.extractQueues[projectPath] = q
	return q
}

func (a *App) startExtractionWorkerLocked(projectPath string, q *memory.ExtractionQueue) {
	if a.extractWorkers == nil {
		a.extractWorkers = make(map[string]struct{})
	}
	if _, running := a.extractWorkers[projectPath]; running {
		return
	}
	if q.Len() == 0 {
		return
	}
	a.extractWorkers[projectPath] = struct{}{}
	go func() {
		for {
			a.extractWorkerMu.Lock()
			item, ok := q.Dequeue()
			if !ok {
				delete(a.extractWorkers, projectPath)
				a.extractWorkerMu.Unlock()
				return
			}
			a.extractWorkerMu.Unlock()
			a.runExtraction(item)
			q.Complete(item.ID)
		}
	}()
}
func (a *App) runExtraction(item memory.ExtractionItem) {
	if a.kbStore == nil {
		return
	}
	providerID := a.cfg.ModelProvider
	model := a.cfg.Model
	providerEng, ok := a.providers[providerID]
	if !ok {
		fmt.Fprintf(os.Stderr, "[monika] extraction skipped: provider %q not available\n", providerID)
		return
	}
	llm := &memory.ProviderExtractionLLM{
		Provider: providerEng,
		Model:    model,
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	result, err := memory.ExtractMemories(ctx, llm, memory.ScopeProject, item.SessionID, item.Transcript)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[monika] memory extraction failed: %v\n", err)
		return
	}
	for _, c := range result.Candidates {
		switch c.Category {
		case "knowledge_update", "knowledge", "user_preference", "project_context":
			c.Category = memory.CategoryKnowledge
		case "lesson", memory.CategoryLesson:
			c.Category = memory.CategoryLesson
		case "topic", memory.CategoryTopic:
			c.Category = memory.CategoryTopic
		default:
			c.Category = memory.CategoryTopic
		}
		if c.Scope == "" {
			c.Scope = memory.ScopeProject
		}
		if strings.TrimSpace(c.Title) == "" {
			fmt.Fprintf(os.Stderr, "[monika] memory extraction skipped: empty title (category=%s)\n", c.Category)
			continue
		}
		if err := a.kbStore.WriteFile(c.Scope, c.Category, c.Title, c.Content, c.Tags, c.Confidence); err != nil {
			fmt.Fprintf(os.Stderr, "[monika] memory write failed '%s': %v\n", c.Title, err)
		} else {
			fmt.Fprintf(os.Stderr, "[monika] memory extracted: '%s' [%s] scope=%s\n", c.Title, c.Category, c.Scope)
			for _, rel := range c.Relations {
				if rel.Title != "" {
					_ = a.kbStore.LinkByTitle(c.Scope, c.Category, c.Title, rel.Title, rel.Relation)
				}
			}
		}
	}
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
		s, err := sm.Load(info.ID)
		if err != nil {
			continue
		}
		needsSave := false

		// Reset stale generating status
		if s.Status == StatusGenerating {
			s.Status = StatusPending
			needsSave = true
		}

		// Recover queue: reset "executing" items to "queued"
		for i := range s.Queue {
			if s.Queue[i].Status == "executing" {
				s.Queue[i].Status = "queued"
				needsSave = true
			}
		}

		if needsSave {
			sm.Lock()
			sm.Save(s)
			sm.Unlock()
		}

		// Auto-trigger queue if not paused and has queued items
		if !s.QueuePaused && s.Status != StatusGenerating {
			for _, item := range s.Queue {
				if item.Status == "queued" {
					go a.drainQueue(sm, info.ID)
					break
				}
			}
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

// resolveWorkingDir returns the effective working directory for a session.
// If the session has a valid WorktreePath, it returns that. Otherwise falls back to projectPath().
func (a *App) resolveWorkingDir(sessionID string) string {
	sm := a.getSessionManagerForSession(sessionID)
	if sm == nil {
		return a.projectPath()
	}
	s, err := sm.Load(sessionID)
	if err != nil || s.WorktreePath == "" {
		return a.projectPath()
	}
	if _, err := os.Stat(s.WorktreePath); err == nil {
		return s.WorktreePath
	}
	// Worktree was deleted; fall back silently.
	// Frontend shows the banner via VerifyWorktree on session switch.
	return a.projectPath()
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

// MakeDirectory creates a new directory at the given absolute path.
func (a *App) MakeDirectory(parentPath, name string) error {
	clean := filepath.Clean(parentPath)
	dirPath := filepath.Join(clean, name)
	return os.MkdirAll(dirPath, 0755)
}

// ListDrives returns available drive roots on Windows, or empty on other platforms.
func (a *App) ListDrives() []FileNode {
	return listDrives()
}

// GetHomePath returns the user's home directory path.
func (a *App) GetHomePath() string {
	return a.home
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
			Path:  filepath.ToSlash(filepath.Join(clean, entry.Name())),
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

func (a *App) StageFiles(projectPath string, paths []string) error {
	fs := a.getFileService(projectPath)
	return fs.StageFiles(paths)
}

func (a *App) UnstageFiles(projectPath string, paths []string) error {
	fs := a.getFileService(projectPath)
	return fs.UnstageFiles(paths)
}

func (a *App) GetStagedFileDiff(projectPath, filePath string) (*DiffResult, error) {
	fs := a.getFileService(projectPath)
	dr, err := fs.GetStagedDiff(filePath)
	if err != nil {
		return nil, err
	}
	return &dr, nil
}

func (a *App) Commit(projectPath string, message string) error {
	if strings.TrimSpace(message) == "" {
		return fmt.Errorf("commit message must not be empty")
	}
	cmd := command("git", "commit", "-m", message)
	cmd.Dir = projectPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("commit failed: %s. %s", err.Error(), strings.TrimSpace(string(out)))
	}
	a.emitCommitHistoryChangedIfChanged()
	return nil
}

func (a *App) GitFetch(projectPath string) error {
	cmd := command("git", "fetch", "--all", "--prune")
	cmd.Dir = projectPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("fetch failed: %s. %s", err.Error(), strings.TrimSpace(string(out)))
	}
	a.emitCommitHistoryChangedIfChanged()
	return nil
}

func (a *App) GitPull(projectPath string) error {
	cmd := command("git", "pull", "--ff-only")
	cmd.Dir = projectPath
	_, err := cmd.CombinedOutput()
	if err != nil {
		// ff-only failed — try rebase as fallback for diverging branches
		cmd2 := command("git", "pull", "--rebase", "--autostash")
		cmd2.Dir = projectPath
		out2, err2 := cmd2.CombinedOutput()
		if err2 != nil {
			return fmt.Errorf("pull failed: %s", strings.TrimSpace(string(out2)))
		}
	}
	a.emitCommitHistoryChangedIfChanged()
	return nil
}

func (a *App) CommitAndPush(projectPath string, message string) error {
	if err := a.Commit(projectPath, message); err != nil {
		return err
	}
	cmd := command("git", "push")
	cmd.Dir = projectPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("push failed (commit succeeded): %s. %s", err.Error(), strings.TrimSpace(string(out)))
	}
	return nil
}

func (a *App) GitShow(projectPath, hash string) (*CommitDetail, error) {
	cmd := command("git", "show", "--numstat", "--pretty=format:%H%n%an%n%ar%n%s", "--no-color", hash)
	cmd.Dir = projectPath
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git show failed: %s. %s", err.Error(), string(out))
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) < 4 {
		return nil, fmt.Errorf("unexpected git show output")
	}

	detail := &CommitDetail{
		Hash:    lines[0],
		Author:  lines[1],
		Date:    lines[2],
		Message: lines[3],
		Files:   make([]ChangeStat, 0),
	}

	for i := 4; i < len(lines); i++ {
		line := lines[i]
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		added, _ := strconv.Atoi(fields[0])
		deleted, _ := strconv.Atoi(fields[1])
		path := fields[2]
		if added == 0 && deleted == 0 && fields[0] == "-" && fields[1] == "-" {
			continue
		}
		detail.Files = append(detail.Files, ChangeStat{
			Path: path, Added: added, Deleted: deleted,
		})
	}

	return detail, nil
}

func (a *App) GetCommitFileDiff(projectPath, hash, filePath string) (*DiffResult, error) {
	oldCmd := command("git", "show", hash+"^:"+filePath)
	oldCmd.Dir = projectPath
	oldOut, oldErr := oldCmd.Output()
	oldContent := ""
	if oldErr == nil {
		oldContent = string(oldOut)
	}

	newCmd := command("git", "show", hash+":"+filePath)
	newCmd.Dir = projectPath
	newOut, newErr := newCmd.Output()
	newContent := ""
	if newErr == nil {
		newContent = string(newOut)
	}

	lines := computeUnifiedDiff(filePath, oldContent, newContent)
	return &DiffResult{
		FilePath: filePath,
		Lines:    lines,
		Old:      oldContent,
		New:      newContent,
	}, nil
}

func (a *App) CheckoutCommit(projectPath, hash string) error {
	if files := hasUnmergedFiles(projectPath); len(files) > 0 {
		return fmt.Errorf("UNMERGED_FILES:%s", strings.Join(files, ","))
	}

	stashed, err := autoStash(projectPath)
	if err != nil {
		return err
	}

	cmd := command("git", "checkout", hash)
	cmd.Dir = projectPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		if stashed {
			_ = autoStashPop(projectPath)
		}
		return fmt.Errorf("checkout failed: %s. %s", err.Error(), strings.TrimSpace(string(out)))
	}

	a.setProjectBranch(projectPath, hash[:7])
	if stashed {
		_ = autoStashPop(projectPath)
	}
	return nil
}

func (a *App) CreateTag(projectPath, hash, tagName string) error {
	if tagName == "" {
		return fmt.Errorf("tag name must not be empty")
	}
	cmd := command("git", "tag", tagName, hash)
	cmd.Dir = projectPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to create tag: %s. %s", err.Error(), strings.TrimSpace(string(out)))
	}
	return nil
}

func (a *App) CreateBranchAt(projectPath, hash, branchName string) error {
	if err := validateBranchName(branchName); err != nil {
		return err
	}
	cmd := command("git", "branch", branchName, hash)
	cmd.Dir = projectPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to create branch: %s. %s", err.Error(), strings.TrimSpace(string(out)))
	}
	return nil
}

// RevertCommit creates a new commit that reverses the specified commit.
func (a *App) RevertCommit(projectPath, hash string) error {
	cmd := command("git", "revert", "--no-edit", hash)
	cmd.Dir = projectPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("revert failed: %s. %s", err.Error(), strings.TrimSpace(string(out)))
	}
	a.emitCommitHistoryChangedIfChanged()
	return nil
}

// CherryPickCommit applies the changes from the specified commit onto the current branch.
func (a *App) CherryPickCommit(projectPath, hash string) error {
	cmd := command("git", "cherry-pick", hash)
	cmd.Dir = projectPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("cherry-pick failed: %s. %s", err.Error(), strings.TrimSpace(string(out)))
	}
	a.emitCommitHistoryChangedIfChanged()
	return nil
}

// ResetToCommit resets the current branch to the specified commit.
// mode must be "soft", "mixed", or "hard".
func (a *App) ResetToCommit(projectPath, hash, mode string) error {
	switch mode {
	case "soft", "mixed", "hard":
	default:
		return fmt.Errorf("invalid reset mode: %s (use soft, mixed, or hard)", mode)
	}
	cmd := command("git", "reset", "--"+mode, hash)
	cmd.Dir = projectPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("reset failed: %s. %s", err.Error(), strings.TrimSpace(string(out)))
	}
	a.emitCommitHistoryChangedIfChanged()
	return nil
}

// AmendMessage amends the HEAD commit's message.
func (a *App) AmendMessage(projectPath, message string) error {
	if strings.TrimSpace(message) == "" {
		return fmt.Errorf("commit message must not be empty")
	}
	cmd := command("git", "commit", "--amend", "-m", message)
	cmd.Dir = projectPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("amend failed: %s. %s", err.Error(), strings.TrimSpace(string(out)))
	}
	a.emitCommitHistoryChangedIfChanged()
	return nil
}

// GitLog returns recent git commits for the given project.
// It runs git log --all with structured output including parent hashes
// so the frontend can compute the commit graph topology.
func (a *App) GitLog(projectPath string) ([]CommitInfo, error) {
	cmd := command("git", "log", "--all", "--no-color", "--topo-order",
		"--pretty=format:%x00%H%x00%P%x00%an%x00%ar%x00%s%x00%D",
		"-200")
	cmd.Dir = projectPath
	out, err := cmd.Output()
	if err != nil {
		fmt.Fprintf(os.Stderr, "[monika] GitLog git log failed: %v\n", err)
		return nil, err
	}

	var commits []CommitInfo
	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		nulIdx := strings.IndexByte(line, 0x00)
		if nulIdx < 0 {
			continue
		}
		rest := line[nulIdx+1:]
		parts := strings.SplitN(rest, "\x00", 7)
		if len(parts) < 6 {
			continue
		}

		var parents []string
		if parts[1] != "" {
			parents = strings.Fields(parts[1])
		}

		commits = append(commits, CommitInfo{
			Hash:    parts[0][:7], // display short hash
			Author:  parts[2],
			Date:    parts[3],
			Message: parts[4],
			Refs:    parts[5],
			Parents: parents,
		})
	}
	return commits, nil
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

// headWatchLoop processes fsnotify events for .git/HEAD and .git/refs changes.
func (a *App) headWatchLoop() {
	for {
		select {
		case event, ok := <-a.headWatcher.Events:
			if !ok {
				return
			}
			if event.Has(fsnotify.Write) || event.Has(fsnotify.Create) || event.Has(fsnotify.Rename) {
				dir := filepath.Dir(event.Name)
				base := filepath.Base(event.Name)
				if base == "HEAD" {
					if fn, ok := a.headDebounce[dir]; ok {
						fn()
					}
				}
				// COMMIT_EDITMSG is written on every successful commit — use as
				// reliable signal on Windows where ref file events may be lost.
				// Also detect direct ref file changes and packed-refs as fallback.
				if base == "COMMIT_EDITMSG" || strings.Contains(filepath.ToSlash(event.Name), "/refs/") || base == "packed-refs" {
					a.mu.RLock()
					for gitDir, fn := range a.refsDebounce {
						if strings.HasPrefix(event.Name, gitDir) {
							fn()
							break
						}
					}
					a.mu.RUnlock()
				}
			}
		case err, ok := <-a.headWatcher.Errors:
			if !ok {
				return
			}
			fmt.Fprintf(os.Stderr, "[monika] head watcher error: %v\n", err)
		}
	}
}

// watchProjectHead resolves the .git directory for a project and starts
// watching its HEAD file for changes.
func (a *App) watchProjectHead(projectPath string) {
	if a.headWatcher == nil {
		return
	}

	gitDir := filepath.Join(projectPath, ".git")

	// Handle worktrees where .git is a file pointing to the actual git dir.
	if info, err := os.Stat(gitDir); err == nil && !info.IsDir() {
		data, err := os.ReadFile(gitDir)
		if err != nil {
			return
		}
		line := strings.TrimSpace(string(data))
		if strings.HasPrefix(line, "gitdir: ") {
			gitDir = line[len("gitdir: "):]
		}
	}

	headPath := filepath.Join(gitDir, "HEAD")
	if _, err := os.Stat(headPath); err != nil {
		return
	}

	if err := a.headWatcher.Add(gitDir); err != nil {
		fmt.Fprintf(os.Stderr, "[monika] watch git dir %s failed: %v\n", gitDir, err)
		return
	}

	a.mu.Lock()
	a.watchedGitDirs[gitDir] = projectPath
	a.mu.Unlock()

	// Debounce HEAD changes: 100ms to coalesce rapid writes (e.g. during rebase).
	var headTimer *time.Timer
	a.headDebounce[gitDir] = func() {
		if headTimer != nil {
			headTimer.Stop()
		}
		headTimer = time.AfterFunc(100*time.Millisecond, func() {
			a.onHeadChange(gitDir)
		})
	}

	// Debounce ref changes: 200ms to coalesce rapid writes (e.g. during push/fetch).
	var refsTimer *time.Timer
	a.refsDebounce[gitDir] = func() {
		if refsTimer != nil {
			refsTimer.Stop()
		}
		refsTimer = time.AfterFunc(200*time.Millisecond, func() {
			a.onRefsChange(gitDir)
		})
	}
}

// onHeadChange is called when .git/HEAD is modified. It reads the file
// directly and emits a branch-changed event if the branch differs from
// the cached value.
func (a *App) onHeadChange(gitDir string) {
	a.mu.RLock()
	projectPath, ok := a.watchedGitDirs[gitDir]
	if !ok {
		a.mu.RUnlock()
		return
	}
	storedBranch := ""
	if info, ok := a.projects[projectPath]; ok {
		storedBranch = info.Branch
	}
	a.mu.RUnlock()

	branch := readBranchFromHead(filepath.Join(gitDir, "HEAD"))
	if branch == "" || branch == storedBranch {
		return
	}

	a.setProjectBranch(projectPath, branch)
	a.safeEmit("branch-changed", branch)
}

// onRefsChange is called when .git/refs/ or .git/packed-refs changes.
// It reads HEAD directly to get the current commit hash and emits
// commit-history-changed if it differs from the cached value.
func (a *App) onRefsChange(gitDir string) {
	projectPath := ""
	a.mu.RLock()
	projectPath, ok := a.watchedGitDirs[gitDir]
	if !ok {
		a.mu.RUnlock()
		return
	}
	storedHash := ""
	if info, ok := a.projects[projectPath]; ok {
		storedHash = info.LastCommitHash
	}
	a.mu.RUnlock()

	// Read the commit hash HEAD points to without spawning git.
	// .git/HEAD is either "ref: refs/heads/<branch>" or a raw hash.
	headData, err := os.ReadFile(filepath.Join(gitDir, "HEAD"))
	if err != nil {
		return
	}
	line := strings.TrimSpace(string(headData))
	const refPrefix = "ref: "
	var currentHash string
	if strings.HasPrefix(line, refPrefix) {
		refPath := filepath.Join(gitDir, line[len(refPrefix):])
		data, err := os.ReadFile(refPath)
		if err != nil {
			return
		}
		currentHash = strings.TrimSpace(string(data))
	} else {
		currentHash = line
	}

	if currentHash == "" || currentHash == storedHash {
		return
	}

	a.setProjectLastCommitHash(projectPath, currentHash)
	a.safeEmit("commit-history-changed", currentHash)
}

// readBranchFromHead parses the branch name directly from the .git/HEAD
// file without spawning a subprocess.
//
// Format: "ref: refs/heads/<branch>\n" → returns <branch>
//
//	Detached: "<sha>\n"                  → returns "<sha>" (short)
func readBranchFromHead(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	line := strings.TrimSpace(string(data))
	const prefix = "ref: refs/heads/"
	if strings.HasPrefix(line, prefix) {
		return line[len(prefix):]
	}
	// Detached HEAD — return short hash.
	if len(line) > 7 {
		return line[:7]
	}
	return line
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
	a.safeEmit("stream", se)

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
	a.safeEmit("stream", se)

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

// SetPipeline stores the permission pipeline and configures it for the
// current project if one is already open (handles late binding after NewApp).
func (a *App) SetPipeline(p *permission.Pipeline) {
	a.pipeline = p
	if pp := a.projectPath(); pp != "" {
		p.SetProject(a.home, pp)
		rules, _ := permission.LoadRules(a.home, pp)
		p.SetHardRules(permission.NewHardRuleEngine(rules, pp))
	}
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

func (a *App) ListDatabaseConnections() []ConnectionInfo {
	if a.dbMgr == nil {
		return nil
	}
	return a.dbMgr.ListConnections()
}

func (a *App) TestDatabaseConnection(args json.RawMessage) error {
	if a.dbMgr == nil {
		return fmt.Errorf("no database connections configured")
	}
	var req struct{ Name string }
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	return a.dbMgr.TestConnection(context.Background(), req.Name)
}

func (a *App) RescanDatabases() ([]ConnectionInfo, error) {
	if a.dbMgr == nil {
		return nil, nil
	}
	cwd := a.projectPath()
	cache, err := dbdiscovery.Scan(cwd)
	if err != nil {
		return nil, err
	}
	credPath := a.credentialsPathForScope("project")
	cachePath := filepath.Join(cwd, ".monika", "databases.json")
	stripDBCredentialsIfNeeded(cache, cachePath, credPath)
	applyDBCredentials(cache, credPath)
	a.dbMgr.Reset(cache)
	return a.dbMgr.ListConnections(), nil
}

func (a *App) projectPath() string {
	if cp := a.GetCurrentProject(); cp != nil {
		return cp.Path
	}
	return ""
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
	Scope   string            `json:"scope"` // "project" | "global"
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
	if err := a.writeConfigForScope("global", func(cfg *config2.Config) {
		found := false
		for i, ag := range cfg.Agents {
			if ag.Name == entry.Name {
				cfg.Agents[i] = entry
				found = true
				break
			}
		}
		if !found {
			cfg.Agents = append(cfg.Agents, entry)
		}
	}); err != nil {
		return err
	}
	a.reloadMergedConfig()
	a.agentRegistry.MergeConfig(a.cfg.Agents)
	return nil
}

// DeleteAgent disables an agent by name (soft-delete via Disabled flag).
func (a *App) DeleteAgent(args json.RawMessage) error {
	var req struct{ Name string }
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	if err := a.writeConfigForScope("global", func(cfg *config2.Config) {
		found := false
		for i, ag := range cfg.Agents {
			if ag.Name == req.Name {
				cfg.Agents[i].Disabled = true
				found = true
				break
			}
		}
		if !found {
			cfg.Agents = append(cfg.Agents, config2.AgentEntry{
				Name: req.Name, Disabled: true,
			})
		}
	}); err != nil {
		return err
	}
	a.reloadMergedConfig()
	a.agentRegistry.MergeConfig(a.cfg.Agents)
	return nil
}

func (a *App) validateModel(providerID, modelID string) (resolvedProvider, resolvedModel string) {
	if providerID != "" {
		if _, ok := a.providers[providerID]; !ok {
			fmt.Fprintf(os.Stderr, "[monika] provider %q not found, falling back to default\n", providerID)
			return a.cfg.ModelProvider, a.cfg.Model
		}
	}
	if providerID != "" && modelID != "" {
		if pc, ok := a.cfg.ModelProviders[providerID]; ok {
			for _, m := range pc.Models {
				if m.ID == modelID {
					return providerID, modelID
				}
			}
			fmt.Fprintf(os.Stderr, "[monika] model %q not in provider %q model list, falling back to default\n", modelID, providerID)
			return a.cfg.ModelProvider, a.cfg.Model
		}
	}
	return providerID, modelID
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

// syncCopilotModels fetches the real model list from the Copilot API and writes
// it into the provider's config, replacing any models.dev-sourced entries.
func (a *App) syncCopilotModels(providerID, token string) {
	pc, ok := a.cfg.ModelProviders[providerID]
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()
	apiModels, err := copilot.FetchModels(ctx, token)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[monika] syncCopilotModels: %v\n", err)
		return
	}
	if len(apiModels) == 0 {
		return
	}
	models := make([]config2.ModelEntry, 0, len(apiModels))
	for _, m := range apiModels {
		if !m.ModelPickerEnabled {
			continue
		}
		models = append(models, config2.ModelEntry{
			ID:              m.ID,
			DisplayName:     m.Name,
			ContextLimit:    int64(m.Capabilities.Limits.MaxContextWindowTokens),
			OutputLimit:     int64(m.Capabilities.Limits.MaxOutputTokens),
			Enabled:         true,
			SupportedInputs: copilotSupportedInputs(m),
		})
	}
	pc.Models = models
	pc.ModelsDevProvider = "" // Copilot doesn't use models.dev
	a.cfg.ModelProviders[providerID] = pc
}

func copilotSupportedInputs(m copilot.CopilotModel) []string {
	inputs := []string{"text"}
	if m.Capabilities.Supports.Vision {
		inputs = append(inputs, "image")
	}
	return inputs
}

// syncProviderFromModelsDev enriches a provider's model list from the models.dev
// catalog. It populates missing context/output limits for existing models and
// auto-appends new catalog models (disabled). Providers themselves are never auto-added.
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
		Inputs   []string
	}
	modelIndex := make(map[string]info, 4096)
	for pID, p := range catalog {
		for modelID, md := range p.Models {
			if md.Limit.Context > 0 {
				modelIndex[modelID] = info{
					Context:  md.Limit.Context,
					Output:   md.Limit.Output,
					Provider: pID,
					Inputs:   md.Modalities.Input,
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
			if len(m.SupportedInputs) == 0 && len(info.Inputs) > 0 {
				m.SupportedInputs = info.Inputs
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

	// Auto-append new catalog models for this provider (disabled by default).
	// Users opt in by enabling them in the Settings UI.
	if devProv, ok := catalog[pc.ModelsDevProvider]; ok {
		newIDs := make([]string, 0, 16)
		for modelID, md := range devProv.Models {
			if !existingIDs[modelID] && md.Limit.Context > 0 {
				newIDs = append(newIDs, modelID)
			}
		}
		sort.Strings(newIDs)
		for _, modelID := range newIDs {
			md := devProv.Models[modelID]
			name := md.Name
			if name == "" {
				name = modelID
			}
			pc.Models = append(pc.Models, config2.ModelEntry{
				ID:              modelID,
				DisplayName:     name,
				ContextLimit:    md.Limit.Context,
				OutputLimit:     md.Limit.Output,
				SupportedInputs: modelIndex[modelID].Inputs,
				Enabled:         false,
			})
			existingIDs[modelID] = true
			changed = true
		}
	}

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
	if err := a.writeConfigForScope("global", func(cfg *config2.Config) {
		found := false
		filtered := make([]string, 0, len(cfg.Skill.DisabledSkills))
		for _, n := range cfg.Skill.DisabledSkills {
			if n == req.Name {
				found = true
			} else {
				filtered = append(filtered, n)
			}
		}
		if !found {
			filtered = append(filtered, req.Name)
		}
		cfg.Skill.DisabledSkills = filtered
	}); err != nil {
		return err
	}
	a.reloadMergedConfig()
	return nil
}

// AddSkillPath appends a directory to the skill search paths.
func (a *App) AddSkillPath(args json.RawMessage) error {
	var req struct{ Path string }
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	if err := a.writeConfigForScope("global", func(cfg *config2.Config) {
		cfg.Skill.Paths = append(cfg.Skill.Paths, req.Path)
	}); err != nil {
		return err
	}
	a.reloadMergedConfig()
	return nil
}

// RemoveSkillPath removes a directory from the skill search paths.
func (a *App) RemoveSkillPath(args json.RawMessage) error {
	var req struct{ Path string }
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	if err := a.writeConfigForScope("global", func(cfg *config2.Config) {
		filtered := make([]string, 0, len(cfg.Skill.Paths))
		for _, p := range cfg.Skill.Paths {
			if p != req.Path {
				filtered = append(filtered, p)
			}
		}
		cfg.Skill.Paths = filtered
	}); err != nil {
		return err
	}
	a.reloadMergedConfig()
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
	return a.installSkillsFromDir(extractDir, req.Scope)
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
	return a.installSkillsFromDir(extractDir, req.Scope)
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
	projIDs := make(map[string]bool)
	if projCfg, err := a.readConfigForScope("project"); err == nil {
		for _, s := range projCfg.MCP.Servers {
			projIDs[s.ID] = true
		}
	}
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
		if projIDs[s.ID] {
			info.Scope = "project"
		} else {
			info.Scope = "global"
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
// An optional "scope" field ("project" default, or "global") selects the target config.
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
		Scope      string                     `json:"scope"`
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

	scope := normalizeScope(raw.Scope)

	// Pre-parse all entries so we can apply them in a single scoped write.
	entries := make([]config2.MCPServerEntry, 0, len(raw.McpServers))
	creds := make(map[string]config2.CredentialEntry, len(raw.McpServers))
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
		cred := config2.StripCredentials(&entry)
		if !cred.Empty() {
			creds[name] = cred
		}
		entries = append(entries, entry)
		imported = append(imported, name)
	}

	if err := a.writeConfigForScope(scope, func(cfg *config2.Config) {
		existing := make(map[string]int, len(cfg.MCP.Servers))
		for i, s := range cfg.MCP.Servers {
			existing[s.ID] = i
		}
		for _, entry := range entries {
			if idx, ok := existing[entry.ID]; ok {
				cfg.MCP.Servers[idx] = entry
			} else {
				cfg.MCP.Servers = append(cfg.MCP.Servers, entry)
				existing[entry.ID] = len(cfg.MCP.Servers) - 1
			}
		}
	}); err != nil {
		return nil, err
	}
	if credPath := a.credentialsPathForScope(scope); credPath != "" && len(creds) > 0 {
		store, _ := config2.LoadCredentials(credPath)
		for id, cred := range creds {
			store.Entries[id] = cred
		}
		if err := config2.SaveCredentials(credPath, store); err != nil {
			fmt.Fprintf(os.Stderr, "[monika] ImportMCPServers: credentials write: %v\n", err)
		}
	}
	a.reloadMergedConfig()
	a.syncMCPServers()
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

// getMCPEngine returns the initialized MCP engine, or nil if unavailable.
func (a *App) getMCPEngine() engine2.MCPEngine {
	eng, err := engine2.EngineByID("mcp")
	if err != nil {
		return nil
	}
	_ = eng.Init(context.Background(), nil)
	mcpEng, ok := eng.(engine2.MCPEngine)
	if !ok {
		return nil
	}
	return mcpEng
}

// connectMCPServer connects a single MCP server and registers it in the registry.
func (a *App) connectMCPServer(entry config2.MCPServerEntry) error {
	mcpEng := a.getMCPEngine()
	if mcpEng == nil || a.mcpRegistry == nil {
		return fmt.Errorf("mcp engine or registry not available")
	}
	cfg := engine2.MCPServerConfig{
		ID: entry.ID, Type: entry.Type, Command: entry.Command,
		Args: entry.Args, Env: entry.Env, URL: entry.URL, Headers: entry.Headers,
	}
	mcpCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	conn, err := mcpEng.ConnectServer(mcpCtx, cfg)
	cancel()
	if err != nil {
		if mcpEng.IsConnected(entry.ID) {
			return nil
		}
		return fmt.Errorf("connect %q: %w", entry.ID, err)
	}
	tools, err := conn.ListTools(context.Background())
	if err != nil {
		_ = mcpEng.DisconnectServer(context.Background(), entry.ID)
		return fmt.Errorf("list tools %q: %w", entry.ID, err)
	}
	meta := conn.ServerMeta()
	a.mcpRegistry.AddServer(meta, conn, tools)
	fmt.Fprintf(os.Stderr, "[monika] MCP server %q connected (%d tools)\n", entry.ID, len(tools))
	return nil
}

// disconnectMCPServer disconnects a server and removes it from the registry.
func (a *App) disconnectMCPServer(id string) {
	mcpEng := a.getMCPEngine()
	if mcpEng != nil {
		_ = mcpEng.DisconnectServer(context.Background(), id)
	}
	if a.mcpRegistry != nil {
		a.mcpRegistry.RemoveServer(id)
	}
}

// syncMCPServers connects servers present in a.cfg but missing from the registry,
// and disconnects servers in the registry but absent from a.cfg.
func (a *App) syncMCPServers() {
	if a.mcpRegistry == nil {
		return
	}
	mcpEng := a.getMCPEngine()
	a.mu.RLock()
	configured := make(map[string]bool, len(a.cfg.MCP.Servers))
	var toConnect []config2.MCPServerEntry
	for _, s := range a.cfg.MCP.Servers {
		configured[s.ID] = true
		if _, ok := a.mcpRegistry.GetConnection(s.ID); ok {
			continue
		}
		if mcpEng != nil && mcpEng.IsConnected(s.ID) {
			continue
		}
		toConnect = append(toConnect, s)
	}
	a.mu.RUnlock()

	for _, s := range toConnect {
		if err := a.connectMCPServer(s); err != nil {
			fmt.Fprintf(os.Stderr, "[monika] syncMCPServers: %v\n", err)
		}
	}

	for _, meta := range a.mcpRegistry.GetServers() {
		if !configured[meta.ID] {
			a.disconnectMCPServer(meta.ID)
		}
	}
}

// ReconnectMCPServer disconnects and reconnects a configured MCP server,
// then returns its available tool names.
func (a *App) ReconnectMCPServer(args json.RawMessage) ([]string, error) {
	var req struct{ ID string }
	if err := json.Unmarshal(args, &req); err != nil {
		return nil, err
	}

	mcpEng := a.getMCPEngine()
	if mcpEng == nil {
		return nil, fmt.Errorf("mcp engine not available")
	}

	// Disconnect + remove from registry
	a.disconnectMCPServer(req.ID)

	var entry *config2.MCPServerEntry
	a.mu.RLock()
	for i := range a.cfg.MCP.Servers {
		if a.cfg.MCP.Servers[i].ID == req.ID {
			entry = &a.cfg.MCP.Servers[i]
			break
		}
	}
	a.mu.RUnlock()
	if entry == nil {
		return nil, fmt.Errorf("server %q not found in config", req.ID)
	}

	if err := a.connectMCPServer(*entry); err != nil {
		return nil, fmt.Errorf("reconnect failed: %w", err)
	}

	tools := a.mcpRegistry.GetToolsByServer(req.ID)
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

// SaveMCPServer creates or updates an MCP server entry in the given scope's config.
// The "scope" field in args defaults to "project" when empty.
func (a *App) SaveMCPServer(args json.RawMessage) error {
	var req struct {
		config2.MCPServerEntry
		Scope string `json:"scope"`
	}
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	scope := normalizeScope(req.Scope)
	srv := req.MCPServerEntry
	cred := config2.StripCredentials(&srv)
	if err := a.writeConfigForScope(scope, func(cfg *config2.Config) {
		found := false
		for i, s := range cfg.MCP.Servers {
			if s.ID == srv.ID {
				cfg.MCP.Servers[i] = srv
				found = true
				break
			}
		}
		if !found {
			cfg.MCP.Servers = append(cfg.MCP.Servers, srv)
		}
	}); err != nil {
		return err
	}
	if credPath := a.credentialsPathForScope(scope); credPath != "" {
		if err := config2.UpdateCredentials(credPath, srv.ID, cred); err != nil {
			fmt.Fprintf(os.Stderr, "[monika] SaveMCPServer: credentials write: %v\n", err)
		}
	}
	a.reloadMergedConfig()
	a.mu.RLock()
	saved := srv
	for _, s := range a.cfg.MCP.Servers {
		if s.ID == srv.ID {
			saved = s
			break
		}
	}
	a.mu.RUnlock()
	a.disconnectMCPServer(srv.ID)
	if err := a.connectMCPServer(saved); err != nil {
		fmt.Fprintf(os.Stderr, "[monika] SaveMCPServer: connect: %v\n", err)
	}
	return nil
}

// DeleteMCPServer removes an MCP server entry from the given scope by ID.
// The "scope" field in args defaults to "project" when empty.
func (a *App) DeleteMCPServer(args json.RawMessage) error {
	var req struct {
		ID    string `json:"id"`
		Scope string `json:"scope"`
	}
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	scope := normalizeScope(req.Scope)
	// Disconnect the server before removing from config
	a.disconnectMCPServer(req.ID)
	if err := a.writeConfigForScope(scope, func(cfg *config2.Config) {
		filtered := make([]config2.MCPServerEntry, 0, len(cfg.MCP.Servers))
		for _, s := range cfg.MCP.Servers {
			if s.ID != req.ID {
				filtered = append(filtered, s)
			}
		}
		cfg.MCP.Servers = filtered
	}); err != nil {
		return err
	}
	if credPath := a.credentialsPathForScope(scope); credPath != "" {
		if err := config2.DeleteCredentials(credPath, req.ID); err != nil {
			fmt.Fprintf(os.Stderr, "[monika] DeleteMCPServer: credentials delete: %v\n", err)
		}
	}
	a.reloadMergedConfig()
	return nil
}

// normalizeScope validates a scope string, defaulting to "project".
func normalizeScope(scope string) string {
	if scope == "global" {
		return "global"
	}
	return "project"
}

// SaveProvider creates or updates a model provider in config.
func (a *App) SaveProvider(args json.RawMessage) error {
	var req struct {
		ID             string               `json:"id"`
		Name           string               `json:"name"`
		BaseURL        string               `json:"base_url"`
		APIKey         string               `json:"api_key"`
		WireAPI        string               `json:"wire_api"`
		Models         []config2.ModelEntry `json:"models"`
		RefreshToken   string               `json:"refresh_token"`
		TokenExpiresAt int64                `json:"token_expires_at"`
	}
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	pc := config2.ProviderConfig{
		Name:           req.Name,
		BaseURL:        req.BaseURL,
		APIKey:         req.APIKey,
		WireAPI:        req.WireAPI,
		Models:         req.Models,
		RefreshToken:   req.RefreshToken,
		TokenExpiresAt: req.TokenExpiresAt,
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
		if pc.RefreshToken == "" {
			pc.RefreshToken = existing.RefreshToken
		}
		if pc.TokenExpiresAt == 0 {
			pc.TokenExpiresAt = existing.TokenExpiresAt
		}
	}
	if a.cfg.ModelProviders == nil {
		a.cfg.ModelProviders = make(map[string]config2.ProviderConfig)
	}
	a.cfg.ModelProviders[req.ID] = pc

	// Copilot providers: fetch real model list from the Copilot API instead of models.dev.
	if pc.WireAPI == "copilot" && pc.APIKey != "" {
		a.syncCopilotModels(req.ID, pc.APIKey)
	} else if len(pc.Models) == 0 || pc.ModelsDevProvider == "" {
		// Auto-populate model limits from models.dev on first save.
		a.syncProviderFromModelsDev(req.ID)
	}
	pc = a.cfg.ModelProviders[req.ID]

	if err := a.writeConfigForScope("global", func(cfg *config2.Config) {
		cfg.ModelProviders[req.ID] = pc
	}); err != nil {
		return err
	}
	a.reloadMergedConfig()

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
		"base_url":         pc.BaseURL,
		"api_key":          pc.APIKey,
		"models":           pc.Models,
		"refresh_token":    pc.RefreshToken,
		"token_expires_at": pc.TokenExpiresAt,
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

	// Inject token refresh callback for copilot providers.
	if cp, ok := providerEng.(*copilotprovider.CopilotProvider); ok {
		providerID := req.ID
		cp.SetOnTokenRefresh(func(at, rt string, exp int64) {
			a.updateCopilotToken(providerID, at, rt, exp)
		})
	}

	return nil
}

// StartCopilotLogin initiates GitHub Device Flow authentication.
func (a *App) StartCopilotLogin() (*CopilotLoginInfo, error) {
	resp, err := copilot.RequestDeviceCode(a.ctx)
	if err != nil {
		return nil, fmt.Errorf("copilot login: %w", err)
	}
	return &CopilotLoginInfo{
		DeviceCode:      resp.DeviceCode,
		UserCode:        resp.UserCode,
		VerificationURI: resp.VerificationURI,
		ExpiresIn:       resp.ExpiresIn,
		Interval:        resp.Interval,
	}, nil
}

// PollCopilotLogin polls the OAuth token endpoint once.
func (a *App) PollCopilotLogin(deviceCode string) (*CopilotTokenResult, error) {
	resp, err := copilot.PollForToken(a.ctx, deviceCode)
	if err != nil {
		switch {
		case errors.Is(err, copilot.ErrAuthorizationPending):
			return &CopilotTokenResult{Status: "pending"}, nil
		case errors.Is(err, copilot.ErrSlowDown):
			return &CopilotTokenResult{Status: "pending", Error: "slow_down"}, nil
		case errors.Is(err, copilot.ErrExpiredToken):
			return &CopilotTokenResult{Status: "error", Error: "Device code expired"}, nil
		case errors.Is(err, copilot.ErrAccessDenied):
			return &CopilotTokenResult{Status: "error", Error: "Access denied by user"}, nil
		default:
			return &CopilotTokenResult{Status: "error", Error: err.Error()}, nil
		}
	}
	return &CopilotTokenResult{
		AccessToken:  resp.AccessToken,
		RefreshToken: resp.RefreshToken,
		ExpiresIn:    resp.ExpiresIn,
		Status:       "success",
	}, nil
}

// updateCopilotToken persists refreshed tokens to config.
func (a *App) updateCopilotToken(providerID, accessToken, refreshToken string, expiresAt int64) {
	a.mu.Lock()
	if pc, ok := a.cfg.ModelProviders[providerID]; ok {
		pc.APIKey = accessToken
		if refreshToken != "" {
			pc.RefreshToken = refreshToken
		}
		pc.TokenExpiresAt = expiresAt
		a.cfg.ModelProviders[providerID] = pc
	}
	a.mu.Unlock()

	a.writeConfigForScope("global", func(cfg *config2.Config) {
		if pc, ok := cfg.ModelProviders[providerID]; ok {
			pc.APIKey = accessToken
			if refreshToken != "" {
				pc.RefreshToken = refreshToken
			}
			pc.TokenExpiresAt = expiresAt
			cfg.ModelProviders[providerID] = pc
		}
	})
}

// InjectCopilotRefreshCallbacks injects token refresh callbacks into all
// existing copilot providers. Called once after App creation in main.go.
func InjectCopilotRefreshCallbacks(a *App) {
	for id, eng := range a.providers {
		if cp, ok := eng.(*copilotprovider.CopilotProvider); ok {
			providerID := id
			cp.SetOnTokenRefresh(func(at, rt string, exp int64) {
				a.updateCopilotToken(providerID, at, rt, exp)
			})
		}
	}
}

// DeleteProvider removes a model provider from config by ID.
func (a *App) DeleteProvider(args json.RawMessage) error {
	var req struct{ ID string }
	if err := json.Unmarshal(args, &req); err != nil {
		return err
	}
	delete(a.providers, req.ID)
	if err := a.writeConfigForScope("global", func(cfg *config2.Config) {
		delete(cfg.ModelProviders, req.ID)
	}); err != nil {
		return err
	}
	a.reloadMergedConfig()
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

// SetTrayManager sets the tray manager for the application.
func (a *App) SetTrayManager(tm *TrayManager) {
	a.trayMgr = tm
}

// SendTrayNotification stores a notification and triggers tray blink.
func (a *App) SendTrayNotification(sessionID string, sessionTitle string, message string) {
	if a.trayMgr != nil {
		a.trayMgr.AddNotification(sessionID, sessionTitle, "notification", message)
		a.trayMgr.StartBlink()
	}
}

// ClearTrayNotifications clears all notifications and stops blink.
// Skipped when popup is visible to prevent webview focus from closing the popup.
func (a *App) ClearTrayNotifications() {
	if a.trayMgr != nil {
		if a.trayMgr.IsPopupVisible() {
			return
		}
		a.trayMgr.StopBlink()
		a.trayMgr.HidePopup()
		a.trayMgr.ClearNotifications()
	}
}

// DismissAllNotifications force-clears all notifications and closes the popup.
// Bypasses the popup-visible guard — used by the "Dismiss all" button.
func (a *App) DismissAllNotifications() {
	if a.trayMgr != nil {
		a.trayMgr.StopBlink()
		a.trayMgr.HidePopup()
		a.trayMgr.ClearNotifications()
	}
}

// GetTrayNotifications returns notifications for the popup window.
func (a *App) GetTrayNotifications() []NotificationData {
	if a.trayMgr != nil {
		return a.trayMgr.GetTrayNotifications()
	}
	return nil
}

// ActivateSession activates the main window and returns the session ID for the given notification.
func (a *App) ActivateSession(notifID string) string {
	if a.trayMgr != nil {
		return a.trayMgr.ActivateAndGetSessionID(notifID)
	}
	return ""
}

// DismissNotification removes a single notification without activating.
func (a *App) DismissNotification(notifID string) {
	if a.trayMgr != nil {
		a.trayMgr.RemoveNotification(notifID)
		a.trayMgr.emitNotificationsChanged()
		remaining := a.trayMgr.GetTrayNotifications()
		if len(remaining) == 0 {
			a.trayMgr.StopBlink()
		}
	}
}

// CancelPopupHide stops the popup hide debounce.
func (a *App) CancelPopupHide() {
	if a.trayMgr != nil {
		a.trayMgr.CancelPopupHide()
	}
}

// SchedulePopupHide starts a debounce to hide the popup.
func (a *App) SchedulePopupHide() {
	if a.trayMgr != nil {
		a.trayMgr.SchedulePopupHide()
	}
}

func (a *App) getLspManager() *lsp.Manager {
	t, ok := a.registry.Get("lsp")
	if !ok {
		return nil
	}
	type lspTool interface {
		Manager() *lsp.Manager
	}
	if lt, ok := t.(lspTool); ok {
		return lt.Manager()
	}
	return nil
}

func (a *App) LspOpenFile(projectPath, filePath string) error {
	mgr := a.getLspManager()
	if mgr == nil {
		return nil
	}
	absPath := resolvePath(projectPath, filePath)
	if !mgr.HasServerForFile(absPath) {
		return nil
	}
	client, serverName, err := mgr.ClientForFile(a.ctx, absPath)
	if err != nil {
		return err
	}
	_, _, err = mgr.EnsureFileOpen(a.ctx, client, absPath, serverName)
	return err
}

func (a *App) LspCloseFile(projectPath, filePath string) error {
	mgr := a.getLspManager()
	if mgr == nil {
		return nil
	}
	absPath := resolvePath(projectPath, filePath)
	client, _, err := mgr.ClientForFile(a.ctx, absPath)
	if err != nil {
		return nil
	}
	return mgr.CloseFile(a.ctx, client, absPath)
}

func (a *App) LspDidChange(projectPath, filePath, content string, version int) error {
	mgr := a.getLspManager()
	if mgr == nil {
		return nil
	}
	absPath := resolvePath(projectPath, filePath)
	if !mgr.HasServerForFile(absPath) {
		return nil
	}
	client, serverName, err := mgr.ClientForFile(a.ctx, absPath)
	if err != nil {
		return err
	}
	return mgr.SyncContentFromMemory(a.ctx, client, absPath, content, serverName)
}

// -- LSP read operations (definition, references, hover, symbols) --

func resolvePath(projectPath, filePath string) string {
	if filepath.IsAbs(filePath) {
		return filePath
	}
	return filepath.Join(projectPath, filePath)
}

func filePathToURI(path string) string {
	return "file:///" + filepath.ToSlash(path)
}

func uriToFilePath(uri string) string {
	const prefix = "file:///"
	if strings.HasPrefix(uri, prefix) {
		return filepath.FromSlash(uri[len(prefix):])
	}
	return uri
}

func locationsToLSPLocations(locs []lsp.Location) []LspLocation {
	result := make([]LspLocation, len(locs))
	for i, loc := range locs {
		result[i] = LspLocation{
			Path: uriToFilePath(loc.URI),
			Line: loc.Range.Start.Line,
			Col:  loc.Range.Start.Character,
		}
	}
	return result
}

func documentSymbolsToLSP(syms []lsp.DocumentSymbol, filePath string) []LspSymbol {
	result := make([]LspSymbol, len(syms))
	for i, s := range syms {
		result[i] = LspSymbol{
			Name:      s.Name,
			Kind:      int(s.Kind),
			Path:      filePath,
			StartLine: s.Range.Start.Line,
			StartCol:  s.Range.Start.Character,
			EndLine:   s.Range.End.Line,
			EndCol:    s.Range.End.Character,
			Children:  documentSymbolsToLSP(s.Children, filePath),
		}
	}
	return result
}

func diagnosticsToLSP(diags []lsp.Diagnostic) []LspDiagnostic {
	result := make([]LspDiagnostic, len(diags))
	for i, d := range diags {
		code := ""
		switch v := d.Code.(type) {
		case string:
			code = v
		case float64:
			code = fmt.Sprintf("%.0f", v)
		}
		result[i] = LspDiagnostic{
			StartLine: d.Range.Start.Line,
			StartCol:  d.Range.Start.Character,
			EndLine:   d.Range.End.Line,
			EndCol:    d.Range.End.Character,
			Severity:  int(d.Severity),
			Message:   d.Message,
			Source:    d.Source,
			Code:      code,
		}
	}
	return result
}

func (a *App) resolveLspClient(projectPath, filePath string) (*lsp.Client, string, string, error) {
	mgr := a.getLspManager()
	if mgr == nil {
		return nil, "", "", fmt.Errorf("no LSP manager available")
	}
	absPath := resolvePath(projectPath, filePath)
	if !mgr.HasServerForFile(absPath) {
		return nil, "", "", nil
	}
	client, serverName, err := mgr.ClientForFile(a.ctx, absPath)
	if err != nil {
		return nil, "", "", err
	}
	_, err = mgr.EnsureAndSync(a.ctx, client, absPath, serverName)
	if err != nil {
		return nil, "", "", err
	}
	uri := filePathToURI(absPath)
	return client, serverName, uri, nil
}

func (a *App) LspDiagnostics(projectPath, filePath string) ([]LspDiagnostic, error) {
	mgr := a.getLspManager()
	if mgr == nil {
		return nil, nil
	}
	absPath := resolvePath(projectPath, filePath)
	if !mgr.HasServerForFile(absPath) {
		return nil, nil
	}
	client, serverName, err := mgr.ClientForFile(a.ctx, absPath)
	if err != nil {
		return nil, err
	}
	if _, err := mgr.EnsureAndSync(a.ctx, client, absPath, serverName); err != nil {
		return nil, err
	}
	uri := filePathToURI(absPath)
	diags := client.Diagnostics(uri)
	return diagnosticsToLSP(diags), nil
}

func (a *App) LspGoToDefinition(projectPath, filePath string, line, col int) ([]LspLocation, error) {
	client, _, uri, err := a.resolveLspClient(projectPath, filePath)
	if err != nil {
		return nil, err
	}
	if client == nil {
		return nil, nil
	}
	locs, err := client.Definition(a.ctx, uri, lsp.Position{Line: line, Character: col})
	if err != nil {
		return nil, err
	}
	return locationsToLSPLocations(locs), nil
}

func (a *App) LspReferences(projectPath, filePath string, line, col int) ([]LspLocation, error) {
	client, _, uri, err := a.resolveLspClient(projectPath, filePath)
	if err != nil {
		return nil, err
	}
	if client == nil {
		return nil, nil
	}
	locs, err := client.References(a.ctx, uri, lsp.Position{Line: line, Character: col})
	if err != nil {
		return nil, err
	}
	return locationsToLSPLocations(locs), nil
}

func (a *App) LspHover(projectPath, filePath string, line, col int) (*LspHoverResult, error) {
	client, _, uri, err := a.resolveLspClient(projectPath, filePath)
	if err != nil {
		return nil, err
	}
	if client == nil {
		return nil, nil
	}
	hover, err := client.Hover(a.ctx, uri, lsp.Position{Line: line, Character: col})
	if err != nil {
		return nil, err
	}
	if hover == nil {
		return nil, nil
	}
	text := hover.ContentText()
	if text == "" {
		return nil, nil
	}
	return &LspHoverResult{Contents: text}, nil
}

func (a *App) LspCompletion(projectPath, filePath string, line, col int) (*LspCompletionResult, error) {
	client, _, uri, err := a.resolveLspClient(projectPath, filePath)
	if err != nil {
		return nil, err
	}
	if client == nil {
		return &LspCompletionResult{Items: []LspCompletionItem{}}, nil
	}
	result, err := client.Complete(a.ctx, uri, lsp.Position{Line: line, Character: col})
	if err != nil {
		return nil, err
	}
	if result == nil {
		return &LspCompletionResult{Items: []LspCompletionItem{}}, nil
	}
	items := make([]LspCompletionItem, 0, len(result.Items))
	for _, item := range result.Items {
		items = append(items, LspCompletionItem{
			Label:         item.Label,
			Kind:          item.Kind,
			Detail:        item.Detail,
			Documentation: item.Documentation,
			InsertText:    item.InsertText,
		})
	}
	return &LspCompletionResult{Items: items}, nil
}

func (a *App) LspDocumentSymbols(projectPath, filePath string) ([]LspSymbol, error) {
	log.Printf("[LSP] LspDocumentSymbols called: project=%s file=%s", projectPath, filePath)
	client, _, uri, err := a.resolveLspClient(projectPath, filePath)
	if err != nil {
		log.Printf("[LSP] resolveLspClient error: %v", err)
		return nil, err
	}
	if client == nil {
		return nil, nil
	}
	absPath := resolvePath(projectPath, filePath)
	log.Printf("[LSP] documentSymbols uri=%s", uri)
	for attempt := 0; attempt < 4; attempt++ {
		syms, err := client.DocumentSymbols(a.ctx, uri)
		if err != nil {
			log.Printf("[LSP] DocumentSymbols attempt %d error: %v", attempt, err)
			return nil, err
		}
		log.Printf("[LSP] DocumentSymbols attempt %d: got %d symbols", attempt, len(syms))
		if len(syms) > 0 {
			return documentSymbolsToLSP(syms, absPath), nil
		}
		if attempt < 3 {
			select {
			case <-a.ctx.Done():
				return documentSymbolsToLSP(syms, absPath), nil
			case <-time.After(500 * time.Millisecond):
			}
		}
	}
	log.Printf("[LSP] DocumentSymbols: no symbols after all retries")
	return nil, nil
}

func (a *App) LspTypeDefinition(projectPath, filePath string, line, col int) ([]LspLocation, error) {
	client, _, uri, err := a.resolveLspClient(projectPath, filePath)
	if err != nil {
		return nil, err
	}
	if client == nil {
		return nil, nil
	}
	locs, err := client.TypeDefinition(a.ctx, uri, lsp.Position{Line: line, Character: col})
	if err != nil {
		return nil, err
	}
	return locationsToLSPLocations(locs), nil
}

func (a *App) LspImplementation(projectPath, filePath string, line, col int) ([]LspLocation, error) {
	client, _, uri, err := a.resolveLspClient(projectPath, filePath)
	if err != nil {
		return nil, err
	}
	if client == nil {
		return nil, nil
	}
	locs, err := client.Implementation(a.ctx, uri, lsp.Position{Line: line, Character: col})
	if err != nil {
		return nil, err
	}
	return locationsToLSPLocations(locs), nil
}

func workspaceEditToLSP(edit *lsp.WorkspaceEdit) *LspWorkspaceEdit {
	if edit == nil {
		return nil
	}
	var changes []LspFileEdit
	for uri, edits := range edit.Changes {
		path := uriToFilePath(uri)
		lspEdits := make([]LspTextEdit, len(edits))
		for j, e := range edits {
			lspEdits[j] = LspTextEdit{
				StartLine: e.Range.Start.Line,
				StartCol:  e.Range.Start.Character,
				EndLine:   e.Range.End.Line,
				EndCol:    e.Range.End.Character,
				NewText:   e.NewText,
			}
		}
		changes = append(changes, LspFileEdit{Path: path, Edits: lspEdits})
	}
	for _, dc := range edit.DocumentChanges {
		if dc.TextDocument != nil {
			path := uriToFilePath(dc.TextDocument.TextDocument.URI)
			lspEdits := make([]LspTextEdit, len(dc.TextDocument.Edits))
			for j, e := range dc.TextDocument.Edits {
				lspEdits[j] = LspTextEdit{
					StartLine: e.Range.Start.Line,
					StartCol:  e.Range.Start.Character,
					EndLine:   e.Range.End.Line,
					EndCol:    e.Range.End.Character,
					NewText:   e.NewText,
				}
			}
			changes = append(changes, LspFileEdit{Path: path, Edits: lspEdits})
		}
	}
	return &LspWorkspaceEdit{Changes: changes}
}

func (a *App) LspRename(projectPath, filePath string, line, col int, newName string) (*LspWorkspaceEdit, error) {
	client, _, uri, err := a.resolveLspClient(projectPath, filePath)
	if err != nil {
		return nil, err
	}
	if client == nil {
		return nil, nil
	}
	wsEdit, err := client.Rename(a.ctx, uri, lsp.Position{Line: line, Character: col}, newName)
	if err != nil {
		return nil, err
	}
	return workspaceEditToLSP(wsEdit), nil
}

func (a *App) LspCodeActions(projectPath, filePath string, line, col int) ([]LspCodeAction, error) {
	client, _, uri, err := a.resolveLspClient(projectPath, filePath)
	if err != nil {
		return nil, err
	}
	if client == nil {
		return nil, nil
	}
	r := lsp.Range{
		Start: lsp.Position{Line: line, Character: col},
		End:   lsp.Position{Line: line, Character: col},
	}
	actions, err := client.CodeActions(a.ctx, uri, r, nil)
	if err != nil {
		return nil, err
	}
	result := make([]LspCodeAction, len(actions))
	for i, act := range actions {
		result[i] = LspCodeAction{
			Title: act.Title,
			Kind:  string(act.Kind),
			Edit:  workspaceEditToLSP(act.Edit),
		}
	}
	return result, nil
}

func (a *App) LspExecuteCodeAction(projectPath string, action LspCodeAction) (*LspWorkspaceEdit, error) {
	if action.Edit != nil {
		return action.Edit, nil
	}
	return nil, nil
}

func (a *App) configPathForScope(scope string) string {
	if scope == "project" {
		pp := a.projectPath()
		if pp == "" {
			return ""
		}
		return filepath.Join(pp, ".monika", "config.json")
	}
	return filepath.Join(a.home, ".monika", "config.json")
}

func (a *App) credentialsPathForScope(scope string) string {
	if scope == "project" {
		pp := a.projectPath()
		if pp == "" {
			return ""
		}
		return filepath.Join(pp, ".monika", "credentials.json")
	}
	return filepath.Join(a.home, ".monika", "credentials.json")
}

func (a *App) readConfigForScope(scope string) (config2.Config, error) {
	configPath := a.configPathForScope(scope)
	if configPath == "" {
		return config2.Config{}, fmt.Errorf("no project path for scope %q", scope)
	}
	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return config2.Config{}, nil
		}
		return config2.Config{}, err
	}
	var cfg config2.Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return config2.Config{}, fmt.Errorf("%s: %w", configPath, err)
	}
	return cfg, nil
}

func (a *App) writeConfigForScope(scope string, updateFn func(*config2.Config)) error {
	configPath := a.configPathForScope(scope)
	if configPath == "" {
		return fmt.Errorf("no project path for scope %q", scope)
	}
	cfg, err := a.readConfigForScope(scope)
	if err != nil {
		return err
	}
	updateFn(&cfg)
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(configPath), 0o755); err != nil {
		return err
	}
	tmp := configPath + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, configPath)
}

func (a *App) GetLSPConfig(scope string) map[string]lsp.ServerConfig {
	cfg, err := a.readConfigForScope(scope)
	if err != nil {
		return nil
	}
	if cfg.LSP.Servers == nil {
		return map[string]lsp.ServerConfig{}
	}
	return cfg.LSP.Servers
}

func (a *App) SaveLSPConfig(scope string, servers map[string]lsp.ServerConfig) error {
	if scope != "global" && scope != "project" {
		return fmt.Errorf("invalid scope %q (must be \"global\" or \"project\")", scope)
	}
	if err := a.writeConfigForScope(scope, func(cfg *config2.Config) {
		cfg.LSP.Servers = servers
	}); err != nil {
		return err
	}
	a.reloadMergedConfig()
	return nil
}

func (a *App) GetFormatterConfig(scope string) map[string]lsp.FormatterConfig {
	cfg, err := a.readConfigForScope(scope)
	if err != nil {
		return nil
	}
	if cfg.Formatters == nil {
		return map[string]lsp.FormatterConfig{}
	}
	return cfg.Formatters
}

func (a *App) SaveFormatterConfig(scope string, formatters map[string]lsp.FormatterConfig) error {
	if scope != "global" && scope != "project" {
		return fmt.Errorf("invalid scope %q (must be \"global\" or \"project\")", scope)
	}
	if err := a.writeConfigForScope(scope, func(cfg *config2.Config) {
		cfg.Formatters = formatters
	}); err != nil {
		return err
	}
	a.reloadMergedConfig()
	return nil
}

func (a *App) reloadMergedConfig() {
	// Migrate inline credentials before reading config files
	config2.MigrateInlineCredentials(a.configPathForScope("global"), a.credentialsPathForScope("global"))
	if pp := a.projectPath(); pp != "" {
		config2.MigrateInlineCredentials(a.configPathForScope("project"), a.credentialsPathForScope("project"))
	}

	var cfg config2.Config
	if globalCfg, err := a.readConfigForScope("global"); err == nil {
		cfg = globalCfg
	}
	if pp := a.projectPath(); pp != "" {
		if projCfg, err := a.readConfigForScope("project"); err == nil {
			config2.Merge(&cfg, projCfg)
		}
	}
	if credPath := a.credentialsPathForScope("global"); credPath != "" {
		if store, err := config2.LoadCredentials(credPath); err == nil {
			config2.ApplyCredentialsStore(&cfg, store)
		}
	}
	if pp := a.projectPath(); pp != "" {
		if credPath := a.credentialsPathForScope("project"); credPath != "" {
			if store, err := config2.LoadCredentials(credPath); err == nil {
				config2.ApplyCredentialsStore(&cfg, store)
			}
		}
	}
	a.mu.Lock()
	a.cfg = cfg
	a.mu.Unlock()
}

func (a *App) GetLSPStatus() []lsp.LSPServerStatus {
	mgr := a.getLspManager()
	if mgr == nil {
		return nil
	}
	return mgr.ServerStatuses()
}

// SetDapManager sets the DAP session manager and wires callbacks to the EventBus.
func (a *App) SetDapManager(mgr *dap.DapManager) {
	a.dapManager = mgr
	a.debugAPI = NewDebugAPI(mgr)
	mgr.OnSessionCreated(func(s dap.DapSessionSummary) {
		data, _ := json.Marshal(s)
		a.safeEmit("stream", StreamEvent{
			Type:    DebugSessionCreated,
			Content: string(data),
			Seq:     a.eventSeq.Add(1),
		})
	})
	mgr.OnSessionTerminated(func(s dap.DapSessionSummary) {
		data, _ := json.Marshal(s)
		a.safeEmit("stream", StreamEvent{
			Type:    DebugSessionTerminated,
			Content: string(data),
			Seq:     a.eventSeq.Add(1),
		})
	})
	mgr.OnStopped(func(s dap.DapSessionSummary) {
		data, _ := json.Marshal(s)
		a.safeEmit("stream", StreamEvent{
			Type:    DebugStopped,
			Content: string(data),
			Seq:     a.eventSeq.Add(1),
		})
	})
	mgr.OnContinued(func(s dap.DapSessionSummary) {
		data, _ := json.Marshal(s)
		a.safeEmit("stream", StreamEvent{
			Type:    DebugContinued,
			Content: string(data),
			Seq:     a.eventSeq.Add(1),
		})
	})
	mgr.OnStateChanged(func(s dap.DapSessionSummary) {
		data, _ := json.Marshal(s)
		a.safeEmit("stream", StreamEvent{
			Type:    DebugStateChanged,
			Content: string(data),
			Seq:     a.eventSeq.Add(1),
		})
	})
	mgr.OnOutput(func(sessionID string, output string) {
		a.safeEmit("stream", StreamEvent{
			Type:      DebugOutput,
			Content:   output,
			SessionID: sessionID,
			Seq:       a.eventSeq.Add(1),
		})
	})
	if pp := a.projectPath(); pp != "" {
		mgr.SetProjectDir(pp)
	}
}

// Debug API methods (delegate to debugAPI)

func (a *App) DebugLaunch(program string, args []string, adapter string, cwd string) (*dap.DapSessionSummary, error) {
	return a.debugAPI.Launch(program, args, adapter, cwd)
}

func (a *App) DebugAttach(pid int, port int, host string, adapter string, cwd string) (*dap.DapSessionSummary, error) {
	return a.debugAPI.Attach(pid, port, host, adapter, cwd)
}

func (a *App) DebugStop(sessionID string) {
	a.debugAPI.Stop(sessionID)
}

func (a *App) DebugContinue(sessionID string) (*dap.DapContinueOutcome, error) {
	return a.debugAPI.Continue(sessionID)
}

func (a *App) DebugStepOver(sessionID string) (*dap.DapContinueOutcome, error) {
	return a.debugAPI.StepOver(sessionID)
}

func (a *App) DebugStepIn(sessionID string) (*dap.DapContinueOutcome, error) {
	return a.debugAPI.StepIn(sessionID)
}

func (a *App) DebugStepOut(sessionID string) (*dap.DapContinueOutcome, error) {
	return a.debugAPI.StepOut(sessionID)
}

func (a *App) DebugPause(sessionID string) (*dap.DapSessionSummary, error) {
	return a.debugAPI.Pause(sessionID)
}

func (a *App) DebugGetState(sessionID string) (*dap.DapSessionSummary, error) {
	return a.debugAPI.GetState(sessionID)
}

func (a *App) DebugListSessions() []dap.DapSessionSummary {
	return a.debugAPI.ListSessions()
}

func (a *App) DebugGetOutput(sessionID string) (string, error) {
	return a.debugAPI.GetOutput(sessionID)
}

func (a *App) DebugGetVariables(sessionID string, variablesRef int) ([]dap.DapVariable, error) {
	return a.debugAPI.GetVariables(sessionID, variablesRef)
}

func (a *App) DebugSetBreakpoint(sessionID string, file string, line int, condition string) ([]dap.DapBreakpointRecord, error) {
	return a.debugAPI.SetBreakpoint(sessionID, file, line, condition)
}

func (a *App) DebugRemoveBreakpoint(sessionID string, file string, line int) ([]dap.DapBreakpointRecord, error) {
	return a.debugAPI.RemoveBreakpoint(sessionID, file, line)
}

func (a *App) DebugGetScopes(sessionID string, frameID int) ([]dap.DapScope, error) {
	return a.debugAPI.GetScopes(sessionID, frameID)
}

func (a *App) DebugGetStackTrace(sessionID string, levels int) ([]dap.DapStackFrame, error) {
	return a.debugAPI.GetStackTrace(sessionID, levels)
}

func (a *App) DebugGetThreads(sessionID string) ([]dap.DapThread, error) {
	return a.debugAPI.GetThreads(sessionID)
}

func (a *App) DebugGetKeys(sessionID string, scopesID int) ([]dap.DapScope, error) {
	return a.debugAPI.GetKeys(sessionID, scopesID)
}

// StartBackgroundTasks — 后台审查/技能生成，暂不实现
// func (a *App) StartBackgroundTasks() {
// 	if a.kbStore == nil {
// 		return
// 	}
// 	go func() {
// 		for {
// 			time.Sleep(24 * time.Hour)
// 			skillsDir := filepath.Join(a.home, ".monika", "skills")
// 			a.kbStore.BackgroundSkillGen(context.Background(), nil, skillsDir)
// 		}
// 	}()
// }

// PickMediaFiles opens a native file picker dialog filtered by the given
// supported input types (e.g. ["image","video","pdf","audio"]) and returns
// the selected file paths. Returns empty slice if the user cancels.
func (a *App) PickMediaFiles(supportedInputs []string) ([]string, error) {
	dialog := application.Get().Dialog.OpenFile()
	dialog.SetTitle("Select media file")
	dialog.CanChooseFiles(true)
	dialog.CanChooseDirectories(false)
	dialog.AllowsOtherFileTypes(true)

	for _, input := range supportedInputs {
		switch input {
		case "image":
			dialog.AddFilter("Images", "*.png;*.jpg;*.jpeg;*.webp;*.gif")
		case "video":
			dialog.AddFilter("Videos", "*.mp4;*.mov;*.webm;*.mkv;*.avi;*.m4v")
		case "pdf":
			dialog.AddFilter("PDF documents", "*.pdf")
		case "audio":
			dialog.AddFilter("Audio", "*.mp3;*.wav;*.flac;*.ogg;*.m4a;*.aac")
		}
	}

	paths, err := dialog.PromptForMultipleSelection()
	if err != nil {
		return nil, fmt.Errorf("file picker error: %w", err)
	}
	return paths, nil
}

// GetMediaThumbnails extracts up to maxN evenly-spaced thumbnails from a
// video file inside the project. Used by the frontend MediaToolBlock to
// lazily load frame strips without bloating the LLM-facing tool result.
func (a *App) GetMediaThumbnails(projectPath, filePath string, maxN int) ([]MediaThumbnail, error) {
	if projectPath == "" {
		return nil, fmt.Errorf("projectPath is required")
	}
	if filePath == "" {
		return nil, fmt.Errorf("filePath is required")
	}
	absProject, err := filepath.Abs(projectPath)
	if err != nil {
		return nil, fmt.Errorf("invalid project path: %w", err)
	}
	if real, err := filepath.EvalSymlinks(absProject); err == nil {
		absProject = real
	}
	absFile := filePath
	if !filepath.IsAbs(absFile) {
		absFile = filepath.Join(absProject, filePath)
	}
	if real, err := filepath.EvalSymlinks(absFile); err == nil {
		absFile = real
	}
	rel, err := filepath.Rel(absProject, absFile)
	if err != nil || strings.HasPrefix(rel, "..") {
		return nil, fmt.Errorf("path %s is outside project directory", filePath)
	}

	// Bound the total work so a request that outlives the caller (e.g.
	// the frontend unmounts the card mid-flight) still terminates. Wails
	// v3 doesn't propagate client cancellation through the RPC, so the
	// best we can do here is a hard timeout.
	ctx, cancel := context.WithTimeout(a.ctx, 2*time.Minute)
	defer cancel()
	thumbs, err := builtin.ExtractMediaThumbnails(ctx, absFile, maxN)
	if err != nil {
		return nil, err
	}
	out := make([]MediaThumbnail, 0, len(thumbs))
	for _, t := range thumbs {
		out = append(out, MediaThumbnail{T: t.T, URL: t.URL})
	}
	return out, nil
}
