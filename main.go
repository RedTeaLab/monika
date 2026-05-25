package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"monika/internal/agent"
	"monika/internal/api"
	"monika/internal/bootstrap"
	config2 "monika/internal/config"
	"monika/internal/permission"
	"monika/internal/tool"
	"monika/internal/tool/builtin"
	"monika/pkg/modelsdev"
	engine2 "monika/pkg/engine"

	_ "monika/internal/engines/mcp"
	_ "monika/internal/engines/provider/deepseek"
	_ "monika/internal/engines/provider/openai"
	_ "monika/internal/engines/skill"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed frontend/dist
var embeddedAssets embed.FS

func main() {
	home, err := os.UserHomeDir()
	if err != nil {
		fmt.Fprintln(os.Stderr, "cannot determine home directory:", err)
		os.Exit(1)
	}
	cwd, err := os.Getwd()
	if err != nil {
		fmt.Fprintln(os.Stderr, "cannot determine working directory:", err)
		os.Exit(1)
	}

	// Refresh models.dev catalog (background, non-blocking).
	go func() {
		if err := modelsdev.Refresh(home); err != nil {
			fmt.Fprintf(os.Stderr, "[monika] models.dev refresh: %v\n", err)
		}
	}()

	ctx := context.Background()
	pr, err := bootstrap.InitProvider(ctx, home, cwd, "")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	// Sync models.dev model limits into config.
	// New models from models.dev are added with Enabled=false.
	syncModelsDev(home, &pr.Config)

	registry := tool.NewRegistry()
	builtin.RegisterDefaults(registry, cwd)

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
						mcpRegistry.AddServer(srv.ID, conn, tools)
						fmt.Fprintf(os.Stderr, "[monika] MCP server %q connected (%d tools)\n", srv.ID, len(tools))
					}
				}()
			}
		}
	}

	// Discover skills
	var skillList []engine2.SkillMeta
	var skEngine engine2.SkillEngine
	skillEng, err := engine2.EngineByID("skill")
	if err == nil {
		if sk, ok := skillEng.(engine2.SkillEngine); ok {
			skEngine = sk
			discovered, err := sk.Discover(ctx, home, cwd, pr.Config.Skill.Paths)
			if err != nil {
				fmt.Fprintf(os.Stderr, "[monika] skill discover: %v\n", err)
			} else {
				skillList = discovered
			}
		}
	}

	// Register skill tool for on-demand skill loading
	var appGetProjectPath func() string
	getCwd := func() string {
		if appGetProjectPath != nil {
			return appGetProjectPath()
		}
		return cwd
	}
	if skEngine != nil {
		builtin.RegisterSkillTool(registry, skEngine, home, getCwd, &pr.Config)
	}

	application.RegisterEvent[api.StreamEvent]("stream")

	systemParts := []string{
		fmt.Sprintf("OS Version: %s\nWorking directory: {{WorkingDirectory}}", runtime.GOOS),
		agent.PromptIdentity,
		agent.PromptToolUsage,
		agent.PromptPlanning,
		agent.PromptCodeQuality,
		agent.PromptResponseStyle,
		agent.PromptSafetyBoundaries,
		agent.PromptRemember,
	}
	if p := loadSystemPrompt(cwd); p != "" {
		systemParts = append(systemParts, p)
	}
	systemPrompt := strings.Join(systemParts, "\n\n")
	skillsPrompt := agent.BuildSkillsPrompt(skillList)
	systemPrompt = systemPrompt + skillsPrompt
	loopOpts := []agent.LoopOption{
		agent.WithProjectDir(cwd),
		agent.WithModel(pr.Model),
		agent.WithSystemPrompt(systemPrompt),
	}

	baseSystemPrompt := strings.Join(systemParts, "\n\n")

	// Wire permission pipeline
	rules, _ := permission.LoadRules(home, cwd)
	hardRuleEngine := permission.NewHardRuleEngine(rules, cwd)
	pipeline := permission.NewPipeline(permission.Auto, hardRuleEngine, nil)
	pipeline.SetProject(home, cwd)
	loopOpts = append(loopOpts, agent.WithPermissionPipeline(pipeline))

	// MCP registry
	loopOpts = append(loopOpts, agent.WithMCPRegistry(mcpRegistry))

	// Build agent registry with builtin agents
	agentRegistry := agent.NewAgentRegistry([]agent.Agent{
		{
			Name:         "general",
			Description:  "General-purpose agent for research and multi-step tasks",
			SystemPrompt: systemPrompt,
		},
		{
			Name:         "explore",
			Description:  "Fast agent specialized for exploring codebases",
			SystemPrompt: systemPrompt,
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

	var taskStoreAccessor api.TaskStoreAccessor
	if accessor, ok := taskStore.(api.TaskStoreAccessor); ok {
		taskStoreAccessor = accessor
	}

	appService = api.NewApp(home, cwd, pr.Config, pr.Providers, pr.Model, registry, loopOpts, taskStoreAccessor, agentRegistry, taskRunner, baseSystemPrompt)
	appGetProjectPath = appService.GetProjectPath

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
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:     "Monika",
		Width:     1400,
		Height:    900,
		MinWidth:  900,
		MinHeight: 600,
		Frameless: true,
		StartState: application.WindowStateMaximised,
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
	}
	modelIndex := make(map[string]modelInfo, 4096)
	for providerID, p := range catalog {
		for modelID, md := range p.Models {
			if md.Limit.Context > 0 {
				modelIndex[modelID] = modelInfo{
					Context:  md.Limit.Context,
					Output:   md.Limit.Output,
					Provider: providerID,
				}
			}
		}
	}

	changed := false

	// New user: no providers configured yet — populate from models.dev.
	if len(cfg.ModelProviders) == 0 {
		cfg.ModelProviders = make(map[string]config2.ProviderConfig, len(catalog))
		for pID, p := range catalog {
			models := make([]config2.ModelEntry, 0, len(p.Models))
			for modelID, md := range p.Models {
				if md.Limit.Context > 0 {
					models = append(models, config2.ModelEntry{
						ID:           modelID,
						DisplayName:  modelID,
						ContextLimit: md.Limit.Context,
						OutputLimit:  md.Limit.Output,
						Enabled:      false,
					})
				}
			}
			if len(models) > 0 {
				cfg.ModelProviders[pID] = config2.ProviderConfig{
					Name:              pID,
					ModelsDevProvider: pID,
					Models:            models,
				}
			}
		}
		changed = true
	} else {
		// Existing user: enrich provider models from models.dev.
		for key, pc := range cfg.ModelProviders {
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

			if pc.ModelsDevProvider != "" {
				for modelID, info := range modelIndex {
					if info.Provider == pc.ModelsDevProvider && !existingIDs[modelID] {
						pc.Models = append(pc.Models, config2.ModelEntry{
							ID:           modelID,
							DisplayName:  modelID,
							ContextLimit: info.Context,
							OutputLimit:  info.Output,
							Enabled:      false,
						})
						changed = true
					}
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

func loadSystemPrompt(projectDir string) string {
	paths := []string{
		filepath.Join(projectDir, "AGENTS.md"),
		filepath.Join(projectDir, ".monika", "AGENTS.md"),
	}
	for _, p := range paths {
		if data, err := os.ReadFile(p); err == nil {
			return string(data)
		}
	}
	return ""
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
