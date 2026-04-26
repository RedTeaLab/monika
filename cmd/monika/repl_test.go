package main

import (
	"testing"
)

func TestParseSlashCommand(t *testing.T) {
	tests := []struct {
		input string
		cmd   string
		ok    bool
	}{
		{"/exit", "exit", true},
		{"/help", "help", true},
		{"/clear", "clear", true},
		{"/compact", "compact", true},
		{"/Exit", "", false},
		{"/unknown", "", false},
		{"hello", "", false},
		{"", "", false},
	}
	for _, tt := range tests {
		cmd, ok := parseSlashCommand(tt.input)
		if cmd != tt.cmd || ok != tt.ok {
			t.Errorf("parseSlashCommand(%q) = (%q, %v), want (%q, %v)", tt.input, cmd, ok, tt.cmd, tt.ok)
		}
	}
}
