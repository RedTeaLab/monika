package main

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"monika/internal/agent"
	"monika/internal/api"
	"monika/internal/bootstrap"
	"monika/internal/permission"
	"monika/internal/tool"
	"monika/internal/tool/builtin"
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

	ctx := context.Background()
	pr, err := bootstrap.InitProvider(ctx, home, cwd, "")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	registry := tool.NewRegistry()
	builtin.RegisterDefaults(registry, cwd)

	taskStore := builtin.NewTaskStore(nil)
	builtin.RegisterTasks(registry, taskStore)

	// Connect MCP servers and collect tools
	var mcpConns map[string]engine2.MCPServerConnection
	var mcpToolList []engine2.MCPTool
	mcpEng, err := engine2.EngineByID("mcp")
	if err == nil {
		if mcp, ok := mcpEng.(engine2.MCPEngine); ok {
			mcpConns = make(map[string]engine2.MCPServerConnection)
			for _, srv := range pr.Config.MCP.Servers {
				cfg := engine2.MCPServerConfig{
					ID: srv.ID, Command: srv.Command,
					Args: srv.Args, Env: srv.Env,
				}
				conn, err := mcp.ConnectServer(ctx, cfg)
				if err != nil {
					fmt.Fprintf(os.Stderr, "[monika] MCP server %q connect failed: %v\n", srv.ID, err)
					continue
				}
				mcpConns[srv.ID] = conn
				tools, err := conn.ListTools(ctx)
				if err != nil {
					fmt.Fprintf(os.Stderr, "[monika] MCP server %q list tools: %v\n", srv.ID, err)
					continue
				}
				mcpToolList = append(mcpToolList, tools...)
			}
		}
	}

	// Discover skills
	var skillList []engine2.SkillMeta
	skillEng, err := engine2.EngineByID("skill")
	if err == nil {
		if sk, ok := skillEng.(engine2.SkillEngine); ok {
			discovered, err := sk.Discover(ctx, pr.Config.Skill.Paths)
			if err != nil {
				fmt.Fprintf(os.Stderr, "[monika] skill discover: %v\n", err)
			} else {
				skillList = discovered
			}
		}
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

	// Wire permission pipeline
	rules, _ := permission.LoadRules(home, cwd)
	hardRuleEngine := permission.NewHardRuleEngine(rules, cwd)
	securityModel := permission.NewSecurityModel(nil, "") // provider wired later
	pipeline := permission.NewPipeline(permission.Auto, hardRuleEngine, securityModel, nil)
	pipeline.SetProject(home, cwd)
	loopOpts = append(loopOpts, agent.WithPermissionPipeline(pipeline))

	// MCP tools and connections
	loopOpts = append(loopOpts,
		agent.WithMCPTools(mcpToolList),
		agent.WithMCPConnections(mcpConns),
	)

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
	// onStart preregisters the child session so the frontend can open the tab during running.
	// onComplete stores the full execution results.
	var appService *api.App
	taskRunner := agent.NewTaskRunner(agentRegistry, defaultProvider, pr.Providers, registry,
		func(task agent.SubTask, agentName string) {
			if appService != nil {
				// Save a minimal session immediately so the tab can be opened
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

	appService = api.NewApp(home, cwd, pr.Config, pr.Providers, pr.Model, registry, loopOpts, taskStoreAccessor, agentRegistry, taskRunner)

	// Wire permission pipeline ConfirmUI to appService so the pipeline
	// can request user confirmation via the frontend.
	// The RespondPermission method on App is automatically available as a
	// Wails service bound method via Call.ByName.
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
	})

	if err := app.Run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
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
