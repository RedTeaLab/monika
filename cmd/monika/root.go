package main

import (
	"fmt"
	"os"

	"monika/pkg/engine"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "monika",
	Short: "Monika is a general-purpose coding agent",
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

func init() {
	rootCmd.AddCommand(engineListCmd)
}
