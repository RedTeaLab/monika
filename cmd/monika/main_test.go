package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRootHelpContainsProviderCommands(t *testing.T) {
	out := new(bytes.Buffer)
	rootCmd.SetOut(out)
	rootCmd.SetArgs([]string{"--help"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	usage := out.String()
	if !strings.Contains(usage, "provider") {
		t.Fatalf("help missing provider: %s", usage)
	}
	if !strings.Contains(usage, "Monika") {
		t.Fatalf("help missing Monika: %s", usage)
	}
}

func TestProviderListEmptyRegistry(t *testing.T) {
	tmp := t.TempDir()
	registryPath = filepath.Join(tmp, "providers.json")

	out := new(bytes.Buffer)
	rootCmd.SetOut(out)
	rootCmd.SetArgs([]string{"provider", "list"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "No provider plugins installed") {
		t.Fatalf("unexpected output: %s", out.String())
	}
}

func TestProviderInstallAndList(t *testing.T) {
	tmp := t.TempDir()
	registryPath = filepath.Join(tmp, "providers.json")

	out := new(bytes.Buffer)
	rootCmd.SetOut(out)
	rootCmd.SetArgs([]string{"provider", "install", "github.com/acme/monika-provider-openai@v0.3.1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "Registered") {
		t.Fatalf("unexpected output: %s", out.String())
	}

	out.Reset()
	rootCmd.SetOut(out)
	rootCmd.SetArgs([]string{"provider", "list"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "monika-provider-openai") {
		t.Fatalf("list missing installed plugin: %s", out.String())
	}

	_, err := os.Stat(registryPath)
	if err != nil {
		t.Fatalf("registry file not created: %v", err)
	}
}

func TestProviderInstallDuplicate(t *testing.T) {
	tmp := t.TempDir()
	registryPath = filepath.Join(tmp, "providers.json")

	rootCmd.SetOut(new(bytes.Buffer))
	rootCmd.SetArgs([]string{"provider", "install", "github.com/acme/monika-provider-openai@v0.3.1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	out := new(bytes.Buffer)
	rootCmd.SetOut(out)
	rootCmd.SetArgs([]string{"provider", "install", "github.com/acme/monika-provider-openai@v0.3.1"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "already installed") {
		t.Fatalf("unexpected output: %s", out.String())
	}
}
