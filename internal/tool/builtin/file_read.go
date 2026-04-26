package builtin

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"monika/internal/tool"
)

type fileRead struct {
	projectDir string
}

func NewFileRead(projectDir string) tool.Tool {
	return &fileRead{projectDir: projectDir}
}

func (f *fileRead) Name() string        { return "file_read" }
func (f *fileRead) Description() string { return "Read a file from the local filesystem." }

func (f *fileRead) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"filePath": map[string]any{
				"type":        "string",
				"description": "The absolute path to the file to read",
			},
			"offset": map[string]any{
				"type":        "integer",
				"description": "The line number to start reading from (1-indexed)",
			},
			"limit": map[string]any{
				"type":        "integer",
				"description": "The maximum number of lines to read",
			},
		},
		"required": []string{"filePath"},
	}
}

func (f *fileRead) Execute(ctx context.Context, args json.RawMessage) (tool.ExecutionResult, error) {
	var params struct {
		FilePath string `json:"filePath"`
		Offset   int    `json:"offset"`
		Limit    int    `json:"limit"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	safePath, err := f.resolvePath(params.FilePath)
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	return readFile(safePath, params.Offset, params.Limit)
}

func (f *fileRead) resolvePath(p string) (string, error) {
	if !filepath.IsAbs(p) {
		return "", fmt.Errorf("filePath must be absolute")
	}
	absPath, err := filepath.Abs(p)
	if err != nil {
		return "", err
	}
	absProject, err := filepath.Abs(f.projectDir)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(absProject, absPath)
	if err != nil || strings.HasPrefix(rel, "..") {
		return "", fmt.Errorf("path %s is outside project directory", p)
	}
	return absPath, nil
}

func readFile(path string, offset, limit int) (tool.ExecutionResult, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	content := string(data)
	lines := strings.Split(content, "\n")

	if offset > 0 {
		if offset > len(lines) {
			return tool.ExecutionResult{Content: ""}, nil
		}
		lines = lines[offset-1:]
	}
	if limit > 0 && limit < len(lines) {
		lines = lines[:limit]
	}

	return tool.ExecutionResult{Content: strings.Join(lines, "\n")}, nil
}
