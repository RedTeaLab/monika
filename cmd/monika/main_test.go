package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func resetChatState() {
	chatModel = ""
	chatVerbose = false
	_ = chatCmd.Flags().Set("help", "false")
	_ = chatCmd.Flags().Set("model", "")
	_ = chatCmd.Flags().Set("verbose", "false")
	chatCmd.SilenceUsage = false
}

func TestRootHelp(t *testing.T) {
	out := new(bytes.Buffer)
	rootCmd.SetOut(out)
	rootCmd.SetArgs([]string{"--help"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "Monika") {
		t.Fatalf("help missing Monika: %s", out.String())
	}
}

func TestEngineListOutput(t *testing.T) {
	out := new(bytes.Buffer)
	rootCmd.SetOut(out)
	rootCmd.SetArgs([]string{"engines"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	output := out.String()
	if !strings.Contains(output, "provider") {
		t.Fatalf("engines list missing provider: %s", output)
	}
	if !strings.Contains(output, "skill") {
		t.Fatalf("engines list missing skill: %s", output)
	}
	if !strings.Contains(output, "mcp") {
		t.Fatalf("engines list missing mcp: %s", output)
	}
}

func TestChatHelp(t *testing.T) {
	resetChatState()
	out := new(bytes.Buffer)
	rootCmd.SetOut(out)
	rootCmd.SetArgs([]string{"chat", "--help"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "message") {
		t.Fatalf("chat help missing 'message': %s", out.String())
	}
}

func TestChatNoArgs(t *testing.T) {
	resetChatState()
	buf := new(bytes.Buffer)
	rootCmd.SetOut(buf)
	rootCmd.SetErr(buf)
	rootCmd.SetArgs([]string{"chat"})
	err := rootCmd.Execute()
	if err == nil {
		t.Fatalf("expected error when chat has no args, output: %s", buf.String())
	}
}

func resetRootState() {
	rootContinue = false
	rootSessionID = ""
}

func TestContinueFlag(t *testing.T) {
	resetRootState()
	defer resetRootState()
	f := rootCmd.Flags().Lookup("continue")
	if f == nil {
		t.Fatal("expected --continue flag to be registered")
	}
	if f.DefValue != "false" {
		t.Errorf("expected default false, got %s", f.DefValue)
	}
}

func TestSessionFlag(t *testing.T) {
	resetRootState()
	defer resetRootState()
	f := rootCmd.Flags().Lookup("session")
	if f == nil {
		t.Fatal("expected --session flag to be registered")
	}
	if f.DefValue != "" {
		t.Errorf("expected default empty, got %s", f.DefValue)
	}
}

func TestMutuallyExclusiveFlags(t *testing.T) {
	resetRootState()
	defer resetRootState()
	err := rootCmd.ValidateFlagGroups()
	if err != nil {
		t.Fatalf("flag groups should be valid: %s", err)
	}
	rootCmd.Flags().Set("continue", "true")
	rootCmd.Flags().Set("session", "abc")
	err = rootCmd.ValidateFlagGroups()
	if err == nil {
		t.Fatal("expected error for mutually exclusive flags")
	}
	resetRootState()
}

func TestChatWithConfigFile(t *testing.T) {
	resetChatState()
	tmp := t.TempDir()
	t.Setenv("USERPROFILE", tmp)
	t.Setenv("HOME", tmp)

	// Write a minimal config so the command attempts to init the provider
	configDir := filepath.Join(tmp, ".monika")
	if err := os.MkdirAll(configDir, 0o755); err != nil {
		t.Fatal(err)
	}
	cfg := `model_provider: deepseek
model: deepseek-chat
model_providers:
  deepseek:
    name: deepseek
    base_url: https://api.deepseek.com
    api_key: sk-test
`
	if err := os.WriteFile(filepath.Join(configDir, "config.yaml"), []byte(cfg), 0o644); err != nil {
		t.Fatal(err)
	}

	buf := new(bytes.Buffer)
	rootCmd.SetOut(buf)
	rootCmd.SetErr(buf)
	rootCmd.SetArgs([]string{"chat", "hello"})
	err := rootCmd.Execute()
	// Will fail because deepseek needs a real HTTP server, but should NOT fail
	// on "no model_provider configured" — that proves config loading works.
	msg := ""
	if err != nil {
		msg = err.Error()
	}
	if strings.Contains(msg, "model_provider") {
		t.Fatalf("config should have been loaded, got: %s", msg)
	}
}
