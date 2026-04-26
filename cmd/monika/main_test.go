package main

import (
	"bytes"
	"strings"
	"testing"
)

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
