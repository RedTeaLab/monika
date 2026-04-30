package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"monika/internal/agent"
	"monika/internal/api"
	"monika/internal/bootstrap"
	"monika/internal/tool"
	"monika/internal/tool/builtin"

	_ "monika/internal/engines/mcp"
	_ "monika/internal/engines/provider/deepseek"
	_ "monika/internal/engines/skill"

	"github.com/wailsapp/wails/v3/pkg/application"
)

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

	application.RegisterEvent[api.StreamEvent]("stream")

	systemParts := []string{
		fmt.Sprintf("OS Version: %s\nWorking directory: %s", runtime.GOOS, cwd),
		agent.BuiltinSystemPrompt,
	}
	if p := loadSystemPrompt(cwd); p != "" {
		systemParts = append(systemParts, p)
	}
	loopOpts := []agent.LoopOption{
		agent.WithProjectDir(cwd),
		agent.WithModel(pr.Model),
		agent.WithSystemPrompt(strings.Join(systemParts, "\n\n")),
	}

	appService := api.NewApp(home, cwd, pr.Config, pr.Provider, pr.Model, registry, loopOpts)

	app := application.New(application.Options{
		Name:        "monika",
		Description: "Agentic coding editor",
		Services: []application.Service{
			application.NewService(appService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(os.DirFS("frontend/dist")),
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
