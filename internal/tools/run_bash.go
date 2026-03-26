package tools

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
)

type BashTool struct{}

func (b *BashTool) Name() string {
	return "bash"
}

func (b *BashTool) Description() string {
	return "Executes a bash command and returns the output."
}

func (b *BashTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"command": map[string]any{
				"type":        "string",
				"description": "The bash command to execute.",
			},
		},
		"required": []string{"command"},
	}
}

func (b *BashTool) Execute(args ...string) string {
	if len(args) == 0 {
		return "Error: No arguments provided."
	}

	// Parse the JSON arguments
	var params struct {
		Command string `json:"command"`
	}
	if err := json.Unmarshal([]byte(args[0]), &params); err != nil {
		return fmt.Sprintf("Error: Invalid arguments format - %v", err)
	}

	if params.Command == "" {
		return "Error: No command provided."
	}

	// Basic safety check to prevent execution of dangerous commands
	// Trim leading spaces and extract the first word (the actual command)
	trimmedCmd := strings.TrimLeft(params.Command, " \t")
	firstWord := strings.Fields(trimmedCmd)
	if len(firstWord) > 0 {
		dangerousCommands := map[string]bool{
			"rm":       true,
			"shutdown": true,
			"reboot":   true,
			"poweroff": true,
		}
		if dangerousCommands[firstWord[0]] {
			return fmt.Sprintf("Error: Command '%s' is blocked for safety.", firstWord[0])
		}
	}

	// Execute the command and capture the output
	var stdout, stderr bytes.Buffer
	cmd := exec.Command("bash", "-c", params.Command)
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		stderrStr := stderr.String()
		// Clean up non-printable characters from stderr (common on Windows)
		cleanedStderr := strings.Map(func(r rune) rune {
			if r < 32 && r != '\n' && r != '\r' && r != '\t' {
				return -1 // Remove control characters
			}
			if r > 126 && r < 256 {
				return -1 // Remove extended ASCII that often appears as garbage
			}
			return r
		}, stderrStr)

		if cleanedStderr != "" {
			return fmt.Sprintf("Error: %v\nStderr: %s", err, cleanedStderr)
		}
		return fmt.Sprintf("Error: %v", err)
	}

	return strings.TrimSpace(stdout.String())
}
