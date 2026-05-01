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

type fileWrite struct {
	projectDir string
}

func NewFileWrite(projectDir string) tool.Tool {
	return &fileWrite{projectDir: projectDir}
}

func (f *fileWrite) Name() string        { return "file_write" }
func (f *fileWrite) Description() string {
	return "Write a file to the local filesystem. Overwrites existing files at the target path. Creates parent directories automatically. Always use absolute paths within the project directory."
}

func (f *fileWrite) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"filePath": map[string]any{
				"type":        "string",
				"description": "The absolute path to the file to write",
			},
			"content": map[string]any{
				"type":        "string",
				"description": "The content to write to the file",
			},
		},
		"required": []string{"filePath", "content"},
	}
}

func (f *fileWrite) Execute(ctx context.Context, args json.RawMessage) (tool.ExecutionResult, error) {
	var params struct {
		FilePath string `json:"filePath"`
		Content  string `json:"content"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	if !filepath.IsAbs(params.FilePath) {
		return tool.ExecutionResult{Content: "filePath must be absolute", IsError: true}, nil
	}
	absPath, err := filepath.Abs(params.FilePath)
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	absProject, err := filepath.Abs(tool.ProjectDirOrDefault(ctx, f.projectDir))
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	rel, err := filepath.Rel(absProject, absPath)
	if err != nil || strings.HasPrefix(rel, "..") {
		return tool.ExecutionResult{Content: fmt.Sprintf("path %s is outside project directory", params.FilePath), IsError: true}, nil
	}

	dir := filepath.Dir(absPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	if err := os.WriteFile(absPath, []byte(params.Content), 0o644); err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	return tool.ExecutionResult{Content: fmt.Sprintf("Wrote %d bytes to %s", len(params.Content), absPath)}, nil
}
