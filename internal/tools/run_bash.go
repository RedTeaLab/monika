package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"
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
			"timeout": map[string]any{
				"type":        "integer",
				"description": "Timeout in seconds for command execution (default: 30).",
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
		Timeout int    `json:"timeout"`
	}
	if err := json.Unmarshal([]byte(args[0]), &params); err != nil {
		return fmt.Sprintf("Error: Invalid arguments format - %v", err)
	}

	if params.Command == "" {
		return "Error: No command provided."
	}

	// Set default timeout to 120 seconds (2 minutes) for long-running commands
	timeout := 120
	if params.Timeout > 0 {
		timeout = params.Timeout
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

	// Create context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)
	defer cancel()

	// Start timing
	startTime := time.Now()

	// Execute the command and capture the output
	var stdout, stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, "bash", "-c", params.Command)
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// Run the command
	err := cmd.Run()

	// Calculate elapsed time
	elapsed := time.Since(startTime)

	// Build result header
	var result strings.Builder

	// For long-running commands (> 2 seconds), show timing info
	if elapsed.Seconds() > 2 {
		fmt.Fprintf(&result, "[Completed in %.2fs]\n", elapsed.Seconds())
	}

	// Check for errors
	if err != nil {
		// Check if the error is due to timeout
		if ctx.Err() == context.DeadlineExceeded {
			return fmt.Sprintf("Error: Command timed out after %d seconds", timeout)
		}

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

		// Include stdout even on error (might have partial output)
		stdoutStr := strings.TrimSpace(stdout.String())
		if stdoutStr != "" {
			result.WriteString(stdoutStr)
			result.WriteString("\n")
		}

		if cleanedStderr != "" {
			result.WriteString(fmt.Sprintf("Error: %v\nStderr: %s", err, cleanedStderr))
		} else {
			result.WriteString(fmt.Sprintf("Error: %v", err))
		}
		return result.String()
	}

	// Success case - include stdout
	stdoutStr := strings.TrimSpace(stdout.String())
	if stdoutStr != "" {
		result.WriteString(stdoutStr)
	}

	// If no output at all, show a success message
	resultStr := strings.TrimSpace(result.String())
	if resultStr == "" {
		return "[Command completed successfully with no output]"
	}

	return resultStr
}
