package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"monika/internal/agent"
	"monika/internal/api"
	"monika/internal/bootstrap"
	config2 "monika/internal/config"
	"monika/internal/dap"
	"monika/internal/memory"
	"monika/internal/permission"
	"monika/internal/prompt"
	"monika/internal/tool"
	"monika/internal/tool/builtin"
	"monika/internal/update"
	engine2 "monika/pkg/engine"
	"monika/pkg/modelsdev"
	"monika/pkg/proxy"

	_ "monika/internal/engines/mcp"
	_ "monika/internal/engines/provider/copilot"
	_ "monika/internal/engines/provider/openai"
	_ "monika/internal/engines/skill"

	_ "monika/pkg/dbdriver/mongo"
	_ "monika/pkg/dbdriver/mysql"
	_ "monika/pkg/dbdriver/postgres"
	_ "monika/pkg/dbdriver/redis"
	_ "monika/pkg/dbdriver/sqlite"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed frontend/dist
var embeddedAssets embed.FS

//go:embed winres/icon.png
var iconPNG []byte

func main() {
	// Clean up leftover from previous update.
	if exe, err := os.Executable(); err == nil {
		update.CleanupOld(filepath.Dir(exe))
	}

	home, err := os.UserHomeDir()
	if err != nil {
		fmt.Fprintln(os.Stderr, "cannot determine home directory:", err)
		os.Exit(1)
	}

	// Refresh models.dev catalog (background, non-blocking).
	go func() {
		if err := modelsdev.Refresh(home); err != nil {
			fmt.Fprintf(os.Stderr, "[monika] models.dev refresh: %v\n", err)
		}
	}()

	ctx := context.Background()
	pr, err := bootstrap.InitProvider(ctx, home, "", "")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	// Sync models.dev model limits into config.
	// New models from models.dev are added with Enabled=false.
	syncModelsDev(home, &pr.Config)

	registry := tool.NewRegistry()

	// Create a standalone tsBridge for tree-sitter IPC (uses application.Get(), no app ref needed).
	tsBridge := api.NewTSBridge()
	tsQueryFn := tsBridge.QueryFunc()

	// Wire vision caller for image/video understanding tools. Captures the
	// already-initialized provider engines so tools can call into the same
	// configured model the user is chatting with.
	mediaCaller := builtin.NewDefaultMediaCaller(pr.Providers)
	builtin.RegisterDefaults(registry, "", home, builtin.TSQueryFunc(tsQueryFn), mediaCaller)
	builtin.RegisterLSP(registry, "", pr.Config.LSP.Servers, pr.Config.Formatters)
	builtin.WireLSPHooks(registry)

	taskStore := builtin.NewTaskStore(nil)
	builtin.RegisterTasks(registry, taskStore)

	// Create MCP registry and connect servers asynchronously
	mcpRegistry := engine2.NewMCPRegistry()
	mcpEng, err := engine2.EngineByID("mcp")
	if err == nil {
		if mcp, ok := mcpEng.(engine2.MCPEngine); ok {
			_ = mcp.Init(ctx, nil)
			if len(pr.Config.MCP.Servers) > 0 {
				go func() {
					for _, srv := range pr.Config.MCP.Servers {
						cfg := engine2.MCPServerConfig{
							ID: srv.ID, Type: srv.Type, Command: srv.Command,
							Args: srv.Args, Env: srv.Env, URL: srv.URL, Headers: srv.Headers,
						}
						if mcp.IsConnected(srv.ID) {
							continue
						}
						mcpCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
						conn, err := mcp.ConnectServer(mcpCtx, cfg)
						cancel()
						if err != nil {
							fmt.Fprintf(os.Stderr, "[monika] MCP server %q connect failed: %v\n", srv.ID, err)
							continue
						}
						tools, err := conn.ListTools(context.Background())
						if err != nil {
							fmt.Fprintf(os.Stderr, "[monika] MCP server %q list tools: %v\n", srv.ID, err)
							continue
						}
						meta := conn.ServerMeta()
						mcpRegistry.AddServer(meta, conn, tools)
						fmt.Fprintf(os.Stderr, "[monika] MCP server %q connected (%d tools)\n", srv.ID, len(tools))
					}
				}()
			}
		}
	}

	// Initialize skill engine
	var skEngine engine2.SkillEngine
	skillEng, err := engine2.EngineByID("skill")
	if err == nil {
		if sk, ok := skillEng.(engine2.SkillEngine); ok {
			skEngine = sk
		}
	}

	// Register skill tool for on-demand skill loading
	var appGetProjectPath func() string
	getCwd := func() string {
		if appGetProjectPath != nil {
			return appGetProjectPath()
		}
		return ""
	}
	if skEngine != nil {
		builtin.RegisterSkillTool(registry, skEngine, home, getCwd, &pr.Config)
		builtin.RegisterSkillSearchTool(registry, skEngine, home, getCwd, &pr.Config)
	}

	kbStore, err := memory.NewKBStore(home, "")
	if err != nil {
		fmt.Fprintf(os.Stderr, "[monika] kb init failed: %v\n", err)
	} else {
		builtin.RegisterMemory(registry, kbStore)
	}

	// Register skill management tools (install/uninstall) with deferred App binding
	var skillInstallFn func(url string, scope string) ([]string, error)
	var skillUninstallFn func(name string) error
	builtin.RegisterSkillManagement(registry,
		func(url string, scope string) ([]string, error) {
			if skillInstallFn == nil {
				return nil, fmt.Errorf("skill installation not available yet")
			}
			return skillInstallFn(url, scope)
		},
		func(name string) error {
			if skillUninstallFn == nil {
				return fmt.Errorf("skill uninstallation not available yet")
			}
			return skillUninstallFn(name)
		},
	)

	application.RegisterEvent[api.StreamEvent]("stream")
	application.RegisterEvent[api.TSRequest]("ts:request")
	application.RegisterEvent[update.UpdateInfo]("update-available")
	application.RegisterEvent[string]("branch-changed")
	application.RegisterEvent[[]api.NotificationData]("tray-notifications-changed")
	application.RegisterEvent[[]string]("media-drop")

	ps := agent.PromptForModel(pr.Model)
	shellPath, _ := builtin.ResolveShell()
	shellName := filepath.Base(shellPath)
	if shellName == "" {
		shellName = "sh"
	}
	shellName += " (mvdan/sh)"
	systemParts := []string{
		fmt.Sprintf("OS Version: %s\nShell: %s", runtime.GOOS, shellName),
		ps.Identity,
		`## Knowledge Base (Memory)

You have a self-evolving knowledge base that persists across sessions. It contains
past lessons (bugs, root causes, solutions), topics (architecture, patterns), and
core knowledge (your preferences, project conventions, persistent facts).

You are the PRIMARY maintainer of this knowledge base. A background process does
best-effort extraction as a fallback, but you should not rely on it.

**Reading memories — MANDATORY, not optional:**
- Each message is prefixed with a <recalled-memory> block — if any entry looks relevant, call memory_read(path) for full details BEFORE acting
- Before working on an unfamiliar file/module → memory_search for architecture notes
- When encountering a bug or unexpected behavior → memory_search for similar past issues
- When using a framework or library → memory_search for prior experience and conventions

**Writing memories — be proactive:**
- Solved a non-trivial bug → memory_write a lesson (root cause → fix → generalization)
- Discovered a project convention or architectural pattern → memory_write a topic
- Learned a user preference → memory_update existing knowledge
- Use memory_search first to avoid duplicates, then memory_write for new or memory_update for existing

Tools: memory_search, memory_read, memory_write, memory_update, memory_index.
Memory types: lessons (bugs/causes/solutions), topics (architecture/patterns),
knowledge (preferences/constraints/persistent facts).`,
		ps.ToolUsage,
		ps.Planning,
		ps.CodeQuality,
		ps.ResponseStyle,
		ps.SafetyBoundaries,
		ps.Remember,
	}
	dynamicCapabilities := `
## Dynamic Capabilities

Skills, MCP tools, and LSP servers are discoverable at runtime — their availability
changes as you install or configure them. Always search before assuming:

- **skill_search(query)** — fuzzy search installed skills by name or description
- **mcp_search(query)** — fuzzy search MCP tools by name, server, or capability
- **lsp_list** — list currently available language servers

	Once you identify the right skill or tool, load it with **skill** or call the MCP tool directly.`

	systemParts = append(systemParts, strings.TrimSpace(dynamicCapabilities))

	systemPrompt := strings.Join(systemParts, "\n\n")

	// {{WorkingDirectory}} is kept as a placeholder; it's replaced with the
	// actual project directory at agent-loop creation time (see app.go startAgentLoop).
	loopOpts := []agent.LoopOption{
		agent.WithProjectDir(""),
		agent.WithModel(pr.Model),
		agent.WithHomeDir(home),
	}
	// Memory auto-recall + immediate-write visibility.
	// memQueue is always wired (memory_write queues regardless of kbStore);
	// memSearchFn requires kbStore to perform a real search.
	memQueue := agent.NewMemoryQueue()
	loopOpts = append(loopOpts, agent.WithMemQueue(memQueue))

	if kbStore != nil {
		memSearchFn := func(query string) string {
			results, err := kbStore.Search(query, memory.ScopeAuto, 5)
			if err != nil || len(results) == 0 {
				return ""
			}
			var b strings.Builder
			for _, r := range results {
				fmt.Fprintf(&b, "- **%s** [%s] path: %s\n  snippet: %s\n",
					r.Title, r.Category, r.Path, r.Snippet)
				if len(r.LinkedTo) > 0 {
					fmt.Fprintf(&b, "  links_to: %s\n", strings.Join(r.LinkedTo, ", "))
				}
			}
			b.WriteString("\nUse memory_read(path) to get full content if any entry above looks relevant.")
			return b.String()
		}
		loopOpts = append(loopOpts, agent.WithMemSearchFn(memSearchFn))

		memIndexFn := func() string {
			idx, _ := kbStore.BuildIndex(memory.ScopeAuto, 50)
			return idx
		}
		loopOpts = append(loopOpts, agent.WithMemIndexFn(memIndexFn))
	}

	// Wire permission pipeline
	rules, _ := permission.LoadRules(home, "")
	hardRuleEngine := permission.NewHardRuleEngine(rules, "")
	pipeline := permission.NewPipeline(permission.Auto, hardRuleEngine, nil)
	pipeline.SetProject(home, "")
	loopOpts = append(loopOpts, agent.WithPermissionPipeline(pipeline))

	// MCP registry
	loopOpts = append(loopOpts, agent.WithMCPRegistry(mcpRegistry))

	// Register runtime discovery tools
	builtin.RegisterMCPSearchTool(registry, mcpRegistry)
	builtin.RegisterLSPListTool(registry)

	// Build agent registry with builtin agents
	exploreBasePrompt := systemPrompt + "\n\n" + prompt.ExplorePrompt
	planBasePrompt := systemPrompt + "\n\n" + prompt.PlanPrompt

	agentRegistry := agent.NewAgentRegistry([]agent.Agent{
		{
			Name:         "general",
			Description:  "General-purpose agent for research and multi-step tasks",
			SystemPrompt: systemPrompt,
		},
		{
			Name:         "explore",
			Description:  "Fast agent specialized for exploring codebases",
			SystemPrompt: exploreBasePrompt,
		},
		{
			Name:         "plan",
			Description:  "Read-only planning agent that analyzes and plans before implementation",
			SystemPrompt: planBasePrompt,
		},
		{
			Name:         "compaction",
			Description:  "Internal — conversation summarizer",
			SystemPrompt: agent.CompactionPrompt,
			Hidden:       true,
		},
	})
	agentRegistry.MergeConfig(pr.Config.Agents)

	// Resolve default provider engine for task runner
	defaultProvider, ok := pr.Providers[pr.Config.ModelProvider]
	if !ok {
		for _, p := range pr.Providers {
			defaultProvider = p
			break
		}
	}

	// Create task runner for subagent dispatch.
	var appService *api.App
	taskRunner := agent.NewTaskRunner(agentRegistry, defaultProvider, pr.Providers, registry,
		func(task agent.SubTask, agentName string) {
			if appService != nil {
				appService.SaveChildSession(task.SessionID, &agent.ChildSession{
					Agent:    agentName,
					Title:    task.Description,
					ParentID: task.ParentID,
					Messages: []engine2.ChatMessage{
						{Role: "user", Content: task.Prompt},
					},
				})
			}
		},
		func(task agent.SubTask, child *agent.ChildSession) {
			if appService != nil {
				appService.SaveChildSession(task.SessionID, child)
				appService.SaveChildSessionToDisk(task.SessionID, child)
			}
		})

	builtin.RegisterAskUser(registry)

	// Register SpawnAgent tool
	builtin.RegisterSpawnAgent(registry, agentRegistry,
		func(ctx context.Context, task agent.SubTask) <-chan agent.Event {
			return taskRunner.Dispatch(ctx, task, nil)
		},
		func(parentID, childID string) {
			if appService != nil {
				appService.PendingChildSession(parentID, childID)
			}
		})

	// Register Agent management tools (list/create/delete) with deferred App binding
	var agentSaveFn func(json.RawMessage) error
	var agentDeleteFn func(json.RawMessage) error
	agentListFn := func() []builtin.AgentInfo {
		if appService == nil {
			return nil
		}
		agents := appService.ListAgents()
		result := make([]builtin.AgentInfo, len(agents))
		for i, a := range agents {
			result[i] = builtin.AgentInfo{
				Name: a.Name, Description: a.Description, Model: a.Model,
				Provider: a.Provider, Hidden: a.Hidden, Disabled: a.Disabled,
				IsCustom: a.IsCustom, Source: a.Source, Permission: a.Permission,
			}
		}
		return result
	}
	agentCheckFn := func(name string) (bool, bool) {
		a, ok := agentRegistry.Get(name)
		if !ok {
			return false, false
		}
		return a.IsCustom, true
	}
	builtin.RegisterAgentManagement(registry,
		func(args json.RawMessage) error {
			if agentSaveFn == nil {
				return fmt.Errorf("agent management not available yet")
			}
			return agentSaveFn(args)
		},
		func(args json.RawMessage) error {
			if agentDeleteFn == nil {
				return fmt.Errorf("agent management not available yet")
			}
			return agentDeleteFn(args)
		},
		agentListFn,
		agentCheckFn,
	)

	var taskStoreAccessor api.TaskStoreAccessor
	if accessor, ok := taskStore.(api.TaskStoreAccessor); ok {
		taskStoreAccessor = accessor
	}

	appService = api.NewApp(home, "", pr.Config, pr.Providers, pr.Model, registry, loopOpts, taskStoreAccessor, agentRegistry, taskRunner, mcpRegistry, kbStore, systemPrompt)
	api.InjectCopilotRefreshCallbacks(appService)

	// Initialize proxy from saved config.
	if pr.Config.Proxy.Enabled && pr.Config.Proxy.URL != "" {
		proxy.SetURL(pr.Config.Proxy.URL)
	}

	appService.InitTSBridge(tsBridge)
	// Background memory maintenance: decay (archive/delete stale) + review (conflict/upgrade detection).
	if kbStore != nil {
		policy := memory.DefaultDecayPolicy()
		go func() {
			// Run decay on startup for both scopes if 24h+ since last run.
			for _, scope := range []string{memory.ScopeProject, memory.ScopeGlobal} {
				if time.Since(kbStore.LastDecayTime(scope)) >= 24*time.Hour {
					archived, deleted, _ := kbStore.RunDecay(scope, policy)
					if archived+deleted > 0 {
						fmt.Fprintf(os.Stderr, "[monika] memory decay (%s): %d archived, %d deleted\n", scope, archived, deleted)
					}
					kbStore.SetLastDecayTime(scope)
				}
			}
			// Then re-check every 24 hours.
			ticker := time.NewTicker(24 * time.Hour)
			defer ticker.Stop()
			for range ticker.C {
				for _, scope := range []string{memory.ScopeProject, memory.ScopeGlobal} {
					archived, deleted, _ := kbStore.RunDecay(scope, policy)
					if archived+deleted > 0 {
						fmt.Fprintf(os.Stderr, "[monika] memory decay (%s): %d archived, %d deleted\n", scope, archived, deleted)
					}
					kbStore.SetLastDecayTime(scope)
				}
			}
		}()

		// Periodic review uses the default provider, wrapped as a ReviewLLM.
		if defaultProvider != nil {
			reviewLLM := &memory.GoLLMAdapter{
				ChatFn: func(ctx context.Context, systemPrompt, userMessage string) (string, error) {
					msgs := []engine2.ChatMessage{{Role: "system", Content: systemPrompt}}
					if userMessage != "" {
						msgs = append(msgs, engine2.ChatMessage{Role: "user", Content: userMessage})
					}
					events, err := defaultProvider.StreamChat(ctx, engine2.ChatRequest{
						Provider: defaultProvider.ID(),
						Model:    pr.Model,
						Messages: msgs,
					})
					if err != nil {
						return "", err
					}
					var sb strings.Builder
					for ev := range events {
						if ev.Kind == engine2.EventContentDelta && ev.Text != "" {
							sb.WriteString(ev.Text)
						}
					}
					return sb.String(), nil
				},
			}
			go func() {
				time.Sleep(10 * time.Second)
				for _, scope := range []string{memory.ScopeProject, memory.ScopeGlobal} {
					kbStore.AutoReviewIfNeeded(context.Background(), reviewLLM, scope)
					clusterLLM := &memory.ProviderExtractionLLM{Provider: defaultProvider, Model: pr.Model}
					_ = kbStore.GenerateTopicSummaries(context.Background(), clusterLLM, scope)
				}
			}()
		}
	}
	appGetProjectPath = appService.GetProjectPath

	// Wire DAP debugger
	dapManager := dap.NewDapManager("")
	appService.SetDapManager(dapManager)
	builtin.RegisterDebug(registry, dapManager)

	// Wire background task manager to bash and background_task tools
	for _, name := range []string{"bash", "background_task"} {
		if t, ok := registry.Get(name); ok {
			if setter, ok := t.(interface{ SetBgManager(builtin.BgManager) }); ok {
				setter.SetBgManager(appService.BgTaskManager())
			}
		}
	}

	// Wire skill management callbacks to App
	skillInstallFn = func(url string, scope string) ([]string, error) {
		args, _ := json.Marshal(map[string]string{"url": url, "scope": scope})
		return appService.InstallSkillFromURL(args)
	}
	skillUninstallFn = func(name string) error {
		args, _ := json.Marshal(map[string]string{"Name": name})
		return appService.UninstallSkill(args)
	}

	// Wire agent management callbacks to App
	agentSaveFn = func(args json.RawMessage) error {
		return appService.SaveAgent(args)
	}
	agentDeleteFn = func(args json.RawMessage) error {
		return appService.DeleteAgent(args)
	}

	// Wire MCP management callbacks to App
	mcpSaveFn := func(args json.RawMessage) error {
		return appService.SaveMCPServer(args)
	}
	mcpDeleteFn := func(args json.RawMessage) error {
		return appService.DeleteMCPServer(args)
	}
	mcpReconnectFn := func(args json.RawMessage) ([]string, error) {
		return appService.ReconnectMCPServer(args)
	}
	mcpListFn := func() []builtin.MCPServerInfo {
		servers := appService.ListMCPServers()
		result := make([]builtin.MCPServerInfo, len(servers))
		for i, s := range servers {
			result[i] = builtin.MCPServerInfo{
				ID: s.ID, Type: s.Type, Command: s.Command,
				Args: s.Args, URL: s.URL, Status: s.Status, Scope: s.Scope,
			}
		}
		return result
	}
	builtin.RegisterMCPManagement(registry, mcpSaveFn, mcpDeleteFn, mcpReconnectFn, mcpListFn)

	pipeline.SetConfirmUI(appService)
	appService.SetPipeline(pipeline)

	// Wire task change callback so TaskStore mutations push events to the frontend
	builtin.SetTaskStoreCallback(taskStore, func(sessionID string, tasks []tool.Task) {
		taskItems := make([]agent.TaskItem, len(tasks))
		for i, t := range tasks {
			taskItems[i] = agent.TaskItem{
				ID: t.ID, Subject: t.Subject, Description: t.Description,
				Status: t.Status, BlockedBy: t.BlockedBy,
			}
		}
		appService.EmitTaskEvent(sessionID, taskItems)
	})

	appService.AppendLoopOption(agent.WithAskUserFunc(func(ctx context.Context, args tool.AskUserArgs) (string, error) {
		sessionID := tool.SessionIDFromContext(ctx)
		return appService.AskUser(ctx, sessionID, args.Question, args.Title, args.Options)
	}))

	assets, err := fs.Sub(embeddedAssets, "frontend/dist")
	if err != nil {
		fmt.Fprintln(os.Stderr, "failed to extract embedded assets:", err)
		os.Exit(1)
	}

	app := application.New(application.Options{
		Name:        "monika",
		Description: "Agentic coding editor",
		Services: []application.Service{
			application.NewService(appService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
			Middleware: func(next http.Handler) http.Handler {
				return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if r.URL.Path == "/__media__" || strings.HasPrefix(r.URL.Path, "/__media__/") {
						rawPath := r.URL.Query().Get("path")
						if rawPath == "" {
							http.NotFound(w, r)
							return
						}
						absPath, err := filepath.Abs(rawPath)
						if err != nil {
							http.NotFound(w, r)
							return
						}
						// Defense-in-depth: Clean the path to collapse any .. or . segments.
						// This endpoint intentionally allows reading from anywhere on disk
						// (media tools are read-only), but Clean prevents accidental path
						// injection through query parameter manipulation.
						absPath = filepath.Clean(absPath)
						ext := strings.ToLower(filepath.Ext(absPath))
						allowed := map[string]bool{
							".png": true, ".jpg": true, ".jpeg": true, ".webp": true, ".gif": true,
							".mp4": true, ".mov": true, ".webm": true, ".mkv": true, ".avi": true, ".m4v": true,
							".pdf": true,
							".mp3": true, ".wav": true, ".flac": true, ".ogg": true, ".m4a": true, ".aac": true,
						}
						if !allowed[ext] {
							http.NotFound(w, r)
							return
						}
						info, err := os.Stat(absPath)
						if err != nil || info.IsDir() {
							http.NotFound(w, r)
							return
						}
						http.ServeFile(w, r, absPath)
						return
					}
					if strings.HasPrefix(r.URL.Path, "/__local__/") {
						relPath := strings.TrimPrefix(r.URL.Path, "/__local__/")
						relPath = strings.TrimPrefix(relPath, "/")
						pp := appService.GetProjectPath()
						if pp == "" {
							http.NotFound(w, r)
							return
						}
						absPath := filepath.Join(pp, filepath.FromSlash(relPath))
						absPath = filepath.Clean(absPath)
						if !strings.HasPrefix(absPath, filepath.Clean(pp)) {
							http.NotFound(w, r)
							return
						}
						http.ServeFile(w, r, absPath)
						return
					}
					next.ServeHTTP(w, r)
				})
			},
		},
	})

	mainWindow := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Monika",
		Width:            1400,
		Height:           900,
		MinWidth:         900,
		MinHeight:        600,
		Frameless:        true,
		StartState:       application.WindowStateMaximised,
		Hidden:           true,
		BackgroundColour: application.NewRGB(24, 24, 30),
		EnableFileDrop:   true,
	})

	trayMgr := api.NewTrayManager(app, mainWindow, iconPNG)
	if err := trayMgr.Init(); err != nil {
		fmt.Fprintf(os.Stderr, "[monika] tray init failed: %v\n", err)
	} else {
		// Only intercept close if tray is active
		mainWindow.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
			mainWindow.Hide()
			e.Cancel()
		})
		appService.SetTrayManager(trayMgr)
	}

	mainWindow.RegisterHook(events.Common.WindowFilesDropped, func(e *application.WindowEvent) {
		files := e.Context().DroppedFiles()
		if len(files) > 0 {
			mainWindow.EmitEvent("media-drop", files)
		}
	})

	// Show the main window once WebView2 runtime is initialised.
	// Hidden: true prevents a title-bar flash on startup.
	mainWindow.OnWindowEvent(events.Common.WindowRuntimeReady, func(e *application.WindowEvent) {
		mainWindow.Show()
	})

	if err := app.Run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func syncModelsDev(home string, cfg *config2.Config) {
	catalog, err := modelsdev.Catalog(home)
	if err != nil {
		return
	}

	type modelInfo struct {
		Context  int64
		Output   int64
		Provider string
		Inputs   []string
	}
	modelIndex := make(map[string]modelInfo, 4096)
	for providerID, p := range catalog {
		for modelID, md := range p.Models {
			if md.Limit.Context > 0 {
				modelIndex[modelID] = modelInfo{
					Context:  md.Limit.Context,
					Output:   md.Limit.Output,
					Provider: providerID,
					Inputs:   md.Modalities.Input,
				}
			}
		}
	}

	changed := false

	// Enrich already-configured providers from models.dev: fill missing limits and
	// auto-append new catalog models (disabled). Providers themselves are never auto-added —
	// users must explicitly add providers through the Settings UI.
	if len(cfg.ModelProviders) > 0 {
		for key, pc := range cfg.ModelProviders {
			// Copilot providers are synced from the Copilot API, not models.dev.
			if pc.WireAPI == "copilot" {
				cfg.ModelProviders[key] = pc
				continue
			}
			existingIDs := make(map[string]bool, len(pc.Models))
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

			// Auto-detect models.dev provider if not set.
			if pc.ModelsDevProvider == "" {
				for modelID, info := range modelIndex {
					if existingIDs[modelID] {
						pc.ModelsDevProvider = info.Provider
						changed = true
						break
					}
				}
				if pc.ModelsDevProvider == "" {
					normalized := normalizeID(key)
					for pID := range catalog {
						if normalizeID(pID) == normalized {
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
						Enabled:         false,
						SupportedInputs: md.Modalities.Input,
					})
					existingIDs[modelID] = true
					changed = true
				}
			}

			cfg.ModelProviders[key] = pc
		}
	}

	if !changed {
		return
	}

	// Write back updated config.
	configPath := filepath.Join(home, ".monika", "config.json")
	_ = os.MkdirAll(filepath.Dir(configPath), 0755)
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(configPath, data, 0600)
}

func normalizeID(id string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(id) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}
