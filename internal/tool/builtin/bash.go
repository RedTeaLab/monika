package builtin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"monika/internal/tool"
)

type bashTool struct {
	projectDir string
	shell      string
	shellArg   string
}

func NewBash(projectDir string) (tool.Tool, error) {
	shell, shellArg := resolveShell()
	if shell == "" {
		return nil, fmt.Errorf("no shell found on system")
	}
	return &bashTool{
		projectDir: projectDir,
		shell:      shell,
		shellArg:   shellArg,
	}, nil
}

func resolveShell() (string, string) {
	if runtime.GOOS == "windows" {
		if path, err := exec.LookPath("pwsh"); err == nil {
			return path, "-Command"
		}
		if path, err := exec.LookPath("powershell"); err == nil {
			return path, "-Command"
		}
		if path, err := exec.LookPath("cmd"); err == nil {
			return path, "/C"
		}
		return "", ""
	}
	if path, err := exec.LookPath("sh"); err == nil {
		return path, "-c"
	}
	if path, err := exec.LookPath("bash"); err == nil {
		return path, "-c"
	}
	return "", ""
}

func (b *bashTool) Name() string        { return "bash" }
func (b *bashTool) Description() string { return "Execute a shell command." }

func (b *bashTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"command": map[string]any{
				"type":        "string",
				"description": "The command to execute",
			},
			"workdir": map[string]any{
				"type":        "string",
				"description": "The working directory. Defaults to the project directory.",
			},
		},
		"required": []string{"command"},
	}
}

func (b *bashTool) Execute(ctx context.Context, args json.RawMessage) (tool.ExecutionResult, error) {
	var params struct {
		Command string `json:"command"`
		Workdir string `json:"workdir"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	workdir := b.projectDir
	if params.Workdir != "" {
		if !filepath.IsAbs(params.Workdir) {
			return tool.ExecutionResult{Content: "workdir must be absolute", IsError: true}, nil
		}
		absProject, err := filepath.Abs(b.projectDir)
		if err != nil {
			return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
		}
		absWD, err := filepath.Abs(params.Workdir)
		if err != nil {
			return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
		}
		rel, err := filepath.Rel(absProject, absWD)
		if err != nil || strings.HasPrefix(rel, "..") {
			return tool.ExecutionResult{Content: "workdir is outside project directory", IsError: true}, nil
		}
		workdir = absWD
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()

	cmd := exec.CommandContext(timeoutCtx, b.shell, b.shellArg, params.Command)
	cmd.Dir = workdir

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	out := stdout.String()
	if errStderr := stderr.String(); errStderr != "" {
		if out != "" {
			out += "\n"
		}
		out += errStderr
	}
	if out == "" && err != nil {
		out = err.Error()
	}

	isError := err != nil
	return tool.ExecutionResult{Content: strings.TrimSpace(out), IsError: isError}, nil
}
