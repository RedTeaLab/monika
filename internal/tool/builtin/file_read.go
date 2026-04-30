package builtin

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"monika/internal/tool"
)

const defaultReadLimit = 200

type fileRead struct {
	projectDir string
}

func NewFileRead(projectDir string) tool.Tool {
	return &fileRead{projectDir: projectDir}
}

func (f *fileRead) Name() string { return "file_read" }
func (f *fileRead) Description() string {
	return "Read a section of a file from the local filesystem. Use grep first to find the relevant file and line range, then read only the section you need using offset and limit."
}

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
				"description": "The line number to start reading from (1-indexed). Defaults to 1.",
			},
			"limit": map[string]any{
				"type":        "integer",
				"description": fmt.Sprintf("Maximum number of lines to read. Defaults to %d.", defaultReadLimit),
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

	offset := params.Offset
	if offset <= 0 {
		offset = 1
	}
	limit := params.Limit
	if limit <= 0 {
		limit = defaultReadLimit
	}

	return readFileLines(safePath, offset, limit)
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

func readFileLines(path string, offset, limit int) (tool.ExecutionResult, error) {
	f, err := os.Open(path)
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	var lines []string
	lineNum := 0
	collected := 0

	for scanner.Scan() {
		lineNum++
		if lineNum < offset {
			continue
		}
		if collected >= limit {
			break
		}
		lines = append(lines, scanner.Text())
		collected++
	}
	if err := scanner.Err(); err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	return tool.ExecutionResult{Content: strings.Join(lines, "\n")}, nil
}
