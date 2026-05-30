package builtin

import (
	"bufio"
	"context"
	"encoding/json"
	"os"
	"strings"

	"monika/internal/tool"
)

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
				"description": "Maximum number of lines to read. Defaults to 200.",
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

	if params.Offset < 1 {
		params.Offset = 1
	}
	if params.Limit < 1 {
		params.Limit = 200
	}

	safePath, err := f.resolvePath(ctx, params.FilePath)
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	return readFileLines(safePath, params.Offset, params.Limit)
}

func (f *fileRead) resolvePath(ctx context.Context, p string) (string, error) {
	return resolveToolPath(p, tool.ProjectDirOrDefault(ctx, f.projectDir))
}

func readFileLines(path string, offset, limit int) (tool.ExecutionResult, error) {
	f, err := os.Open(path)
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 1024*1024), 10*1024*1024)
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
