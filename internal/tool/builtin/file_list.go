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

type fileList struct {
	projectDir string
}

func NewFileList(projectDir string) tool.Tool {
	return &fileList{projectDir: projectDir}
}

func (f *fileList) Name() string        { return "file_list" }
func (f *fileList) Description() string { return "List files and directories in a given path." }

func (f *fileList) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"dirPath": map[string]any{
				"type":        "string",
				"description": "The absolute path to the directory to list",
			},
		},
		"required": []string{"dirPath"},
	}
}

func (f *fileList) Execute(ctx context.Context, args json.RawMessage) (tool.ExecutionResult, error) {
	var params struct {
		DirPath string `json:"dirPath"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	if !filepath.IsAbs(params.DirPath) {
		return tool.ExecutionResult{Content: "dirPath must be absolute", IsError: true}, nil
	}
	absPath, err := filepath.Abs(params.DirPath)
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	absProject, err := filepath.Abs(tool.ProjectDirOrDefault(ctx, f.projectDir))
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	rel, err := filepath.Rel(absProject, absPath)
	if err != nil || strings.HasPrefix(rel, "..") {
		return tool.ExecutionResult{Content: fmt.Sprintf("path %s is outside project directory", params.DirPath), IsError: true}, nil
	}

	entries, err := os.ReadDir(absPath)
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	var lines []string
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() {
			name += "/"
		}
		lines = append(lines, name)
	}
	return tool.ExecutionResult{Content: strings.Join(lines, "\n")}, nil
}
