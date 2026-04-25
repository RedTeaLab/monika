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
