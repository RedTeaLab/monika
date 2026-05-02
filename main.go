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
	"monika/internal/tool"
	"monika/internal/tool/builtin"
	engine2 "monika/pkg/engine"

	_ "monika/internal/engines/mcp"
	_ "monika/internal/engines/provider/deepseek"
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
	loopOpts := []agent.LoopOption{
		agent.WithProjectDir(cwd),
		agent.WithModel(pr.Model),
		agent.WithSystemPrompt(systemPrompt),
	}

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

	// Create task runner for subagent dispatch.
	// onStart preregisters the child session so the frontend can open the tab during running.
	// onComplete stores the full execution results.
	var appService *api.App
	taskRunner := agent.NewTaskRunner(agentRegistry, pr.Provider, registry,
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

	appService = api.NewApp(home, cwd, pr.Config, pr.Provider, pr.Model, registry, loopOpts, taskStoreAccessor, agentRegistry, taskRunner)

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
