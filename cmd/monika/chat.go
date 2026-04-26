package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"monika/internal/agent"
	"monika/internal/tool"
	"monika/internal/tool/builtin"

	"github.com/spf13/cobra"
)

var chatModel string
var chatVerbose bool

var chatCmd = &cobra.Command{
	Use:   `chat [message]`,
	Short: "Send a message to the AI",
	Long:  "Send a message to the configured AI provider.\nConfigure provider in .monika/config.yaml.",
	Args:  cobra.MinimumNArgs(1),
	RunE:  runChat,
}

func init() {
	chatCmd.Flags().StringVarP(&chatModel, "model", "m", "", "Model override (takes precedence over config)")
	chatCmd.Flags().BoolVarP(&chatVerbose, "verbose", "v", false, "Show tool calls and thinking process")
	rootCmd.AddCommand(chatCmd)
}

func runChat(cmd *cobra.Command, args []string) error {
	message := strings.Join(args, " ")
	ctx := context.Background()

	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("cannot determine home directory: %w", err)
	}
	cwd, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("cannot determine working directory: %w", err)
	}

	pr, err := initProvider(ctx, home, cwd, chatModel)
	if err != nil {
		return err
	}

	registry := tool.NewRegistry()
	if err := builtin.RegisterDefaults(registry, cwd); err != nil {
		return fmt.Errorf("register tools: %w", err)
	}

	loopOpts := []agent.LoopOption{
		agent.WithProjectDir(cwd),
		agent.WithModel(pr.model),
	}

	if prompt := loadSystemPrompt(cwd); prompt != "" {
		prompt = fmt.Sprintf("OS Version: %s\nWorking directory: %s\n\n%s", runtime.GOOS, cwd, prompt)
		loopOpts = append(loopOpts, agent.WithSystemPrompt(prompt))
	}

	if chatVerbose {
		loopOpts = append(loopOpts, agent.WithVerbose(cmd.ErrOrStderr()))
	}

	loop := agent.NewLoop(pr.provider, registry, loopOpts...)

	result, err := loop.Run(ctx, nil, message)
	if err != nil {
		return err
	}

	fmt.Fprint(cmd.OutOrStdout(), result.Content)
	fmt.Fprintln(cmd.OutOrStdout())
	if result.Usage.TotalTokens > 0 {
		fmt.Fprintf(os.Stderr, "[tokens: in=%d out=%d total=%d]\n",
			result.Usage.InputTokens, result.Usage.OutputTokens, result.Usage.TotalTokens)
	}
	return nil
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
