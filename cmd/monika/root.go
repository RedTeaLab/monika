package main

import (
	"context"
	"fmt"
	"os"

	"monika/internal/session"
	"monika/pkg/engine"

	"github.com/spf13/cobra"
)

var rootContinue bool
var rootSessionID string

var rootCmd = &cobra.Command{
	Use:           "monika",
	Short:         "Monika is a general-purpose coding agent",
	SilenceErrors: true,
	SilenceUsage:  true,
	RunE:          runInteractive,
}

func init() {
	rootCmd.Flags().BoolVar(&rootContinue, "continue", false, "Resume last session")
	rootCmd.Flags().StringVar(&rootSessionID, "session", "", "Resume a specific session by ID")
	rootCmd.MarkFlagsMutuallyExclusive("continue", "session")
	rootCmd.AddCommand(engineListCmd)
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

var engineListCmd = &cobra.Command{
	Use:   "engines",
	Short: "List registered engines",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		for _, e := range engine.Engines() {
			caps := e.Capabilities()
			capStrs := make([]string, len(caps))
			for i, c := range caps {
				capStrs[i] = string(c)
			}
			_, _ = fmt.Fprintf(cmd.OutOrStdout(), "%s [%v]\n", e.ID(), capStrs)
		}
		return nil
	},
}

func runInteractive(cmd *cobra.Command, args []string) error {
	ctx := context.Background()

	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("cannot determine home directory: %w", err)
	}
	cwd, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("cannot determine working directory: %w", err)
	}

	pr, err := initProvider(ctx, home, cwd, "")
	if err != nil {
		return err
	}

	r := newREPL(home, cwd, pr)

	var sess *session.Session

	if rootSessionID != "" {
		path := session.FilePath(home, cwd, rootSessionID)
		sess, err = session.Load(path)
		if err != nil {
			return fmt.Errorf("session %q not found: %w", rootSessionID, err)
		}
	} else if rootContinue {
		sess, err = session.Latest(home, cwd)
		if err != nil {
			return fmt.Errorf("failed to find last session: %w", err)
		}
		if sess == nil {
			fmt.Fprintln(os.Stderr, "No previous session found. Starting new session.")
		}
	}

	if sess == nil {
		sess = session.New(cwd, pr.model, pr.config.ModelProvider)
	}

	r.run(sess)
	return nil
}
