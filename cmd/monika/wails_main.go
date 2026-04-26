//go:build wails

package main

import (
	"context"
	"fmt"
	"os"
	"runtime"

	"monika/internal/agent"
	"monika/internal/api"
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
	pr, err := initProvider(ctx, home, cwd, "")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	registry := tool.NewRegistry()
	builtin.RegisterDefaults(registry, cwd)

	loopOpts := []agent.LoopOption{
		agent.WithProjectDir(cwd),
		agent.WithModel(pr.model),
	}
	if prompt := loadSystemPrompt(cwd); prompt != "" {
		sysPrompt := fmt.Sprintf("OS Version: %s\nWorking directory: %s\n\n%s", runtime.GOOS, cwd, prompt)
		loopOpts = append(loopOpts, agent.WithSystemPrompt(sysPrompt))
	}

	appService := api.NewApp(home, pr.config, pr.provider, pr.model, registry, loopOpts)

	app := application.New(application.Options{
		Name:        "monika",
		Description: "Agentic coding editor",
		Services: []application.Service{
			application.NewService(appService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(os.DirFS("../../frontend/dist")),
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:     "Monika",
		Width:     1400,
		Height:    900,
		MinWidth:  900,
		MinHeight: 600,
	})

	if err := app.Run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
