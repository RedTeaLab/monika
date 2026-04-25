package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
)

var registryPath string

var rootCmd = &cobra.Command{
	Use:   "monika",
	Short: "Monika is a general-purpose coding agent",
	Long: `Monika is a general-purpose coding agent that supports tool calling,
multiple LLM providers, skills, MCP integration, and subagents.

Provider-backed agent execution is not wired yet.`,
}

// Execute runs the root cobra command and exits on error.
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func defaultRegistryPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".monika", "providers.json")
	}
	return filepath.Join(home, ".monika", "providers.json")
}

func init() {
	rootCmd.PersistentFlags().StringVar(&registryPath, "registry", defaultRegistryPath(), "path to provider registry JSON file")
}
