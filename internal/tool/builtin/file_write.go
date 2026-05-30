package builtin

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

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

	safePath, err := resolveToolPath(params.FilePath, tool.ProjectDirOrDefault(ctx, f.projectDir))
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	dir := filepath.Dir(safePath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	var oldContent string
	if existing, err := os.ReadFile(safePath); err == nil {
		oldContent = string(existing)
	}

	if err := os.WriteFile(safePath, []byte(params.Content), 0o644); err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	diffLines := computeDiff(safePath, oldContent, params.Content)

	return tool.ExecutionResult{
		Content:   fmt.Sprintf("Wrote %d bytes to %s", len(params.Content), safePath),
		DiffLines: diffLines,
	}, nil
}
