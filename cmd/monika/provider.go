package main

import (
	"fmt"

	"monika/internal/plugin/registry"
	"monika/internal/provider/install"

	"github.com/spf13/cobra"
)

var providerCmd = &cobra.Command{
	Use:   "provider",
	Short: "Manage provider plugins",
	Long:  "Install, list, and manage AI provider plugins.",
}

var providerInstallCmd = &cobra.Command{
	Use:   "install <package[@version]>",
	Short: "Install a provider plugin",
	Long: `Install a provider plugin from a Go module package reference.

Examples:
  monika provider install github.com/acme/monika-provider-openai@v0.3.1
  monika provider install github.com/acme/monika-provider-deepseek@latest`,
	Args: cobra.ExactArgs(1),
	RunE: runProviderInstall,
}

var providerListCmd = &cobra.Command{
	Use:   "list",
	Short: "List installed provider plugins",
	Long:  "List all installed provider plugins and their exposed AI providers.",
	Args:  cobra.NoArgs,
	RunE:  runProviderList,
}

func init() {
	providerCmd.AddCommand(providerInstallCmd)
	providerCmd.AddCommand(providerListCmd)
	rootCmd.AddCommand(providerCmd)
}

func runProviderInstall(cmd *cobra.Command, args []string) error {
	packageRef := args[0]
	binary := install.InferBinary(packageRef, "")
	pkg := install.PackagePath(packageRef)

	reg, err := registry.Load(registryPath)
	if err != nil {
		return fmt.Errorf("load registry: %w", err)
	}

	for _, plugin := range reg.Plugins {
		if plugin.Package == pkg {
			_, _ = fmt.Fprintf(cmd.OutOrStdout(), "Provider plugin %s is already installed (version %s)\n", plugin.ID, plugin.Version)
			return nil
		}
	}

	newPlugin := registry.Plugin{
		ID:         binary,
		Package:    pkg,
		PackageRef: packageRef,
		Binary:     binary,
	}

	reg.Plugins = append(reg.Plugins, newPlugin)
	if err := registry.Save(registryPath, reg); err != nil {
		return fmt.Errorf("save registry: %w", err)
	}

	_, _ = fmt.Fprintf(cmd.OutOrStdout(), "Registered %s (%s)\n", binary, packageRef)
	_, _ = fmt.Fprintln(cmd.OutOrStdout(), "Binary download and installation is not yet implemented.")
	return nil
}

func runProviderList(cmd *cobra.Command, args []string) error {
	reg, err := registry.Load(registryPath)
	if err != nil {
		return fmt.Errorf("load registry: %w", err)
	}

	if len(reg.Plugins) == 0 {
		_, _ = fmt.Fprintln(cmd.OutOrStdout(), "No provider plugins installed.")
		return nil
	}

	for _, plugin := range reg.Plugins {
		pkgRef := plugin.Package
		if plugin.Version != "" {
			pkgRef += "@" + plugin.Version
		}
		_, _ = fmt.Fprintf(cmd.OutOrStdout(), "%s (%s)\n", plugin.ID, pkgRef)
		for _, provider := range plugin.Providers {
			_, _ = fmt.Fprintf(cmd.OutOrStdout(), "  provider: %s (%s)\n", provider.ID, provider.Name)
		}
	}
	return nil
}
