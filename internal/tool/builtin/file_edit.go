package builtin

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"monika/internal/tool"
)

type fileEdit struct {
	projectDir string
}

func NewFileEdit(projectDir string) tool.Tool {
	return &fileEdit{projectDir: projectDir}
}

func (f *fileEdit) Name() string { return "file_edit" }
func (f *fileEdit) Description() string {
	return "Performs exact string replacements in a file. When editing text, ensure you preserve the exact indentation (tabs/spaces) as it appears before. The edit will fail if old_string is not unique in the file. Use replace_all to replace every occurrence of old_string."
}

func (f *fileEdit) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"filePath": map[string]any{
				"type":        "string",
				"description": "The absolute path to the file to modify",
			},
			"old_string": map[string]any{
				"type":        "string",
				"description": "The text to replace",
			},
			"new_string": map[string]any{
				"type":        "string",
				"description": "The text to replace it with",
			},
			"replace_all": map[string]any{
				"type":        "boolean",
				"description": "Replace all occurrences of old_string (default false)",
			},
		},
		"required": []string{"filePath", "old_string", "new_string"},
	}
}

func (f *fileEdit) Execute(ctx context.Context, args json.RawMessage) (tool.ExecutionResult, error) {
	var params struct {
		FilePath   string `json:"filePath"`
		OldString  string `json:"old_string"`
		NewString  string `json:"new_string"`
		ReplaceAll bool   `json:"replace_all"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	if params.OldString == "" {
		return tool.ExecutionResult{Content: "old_string must not be empty", IsError: true}, nil
	}
	if params.OldString == params.NewString {
		return tool.ExecutionResult{Content: "new_string must be different from old_string", IsError: true}, nil
	}

	safePath, err := f.resolvePath(ctx, params.FilePath)
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	return f.editFile(safePath, params.OldString, params.NewString, params.ReplaceAll)
}

func (f *fileEdit) resolvePath(ctx context.Context, p string) (string, error) {
	return resolveToolPath(p, tool.ProjectDirOrDefault(ctx, f.projectDir))
}

func (f *fileEdit) editFile(path, oldString, newString string, replaceAll bool) (tool.ExecutionResult, error) {
	info, err := os.Stat(path)
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	rawContent := string(data)
	hadCRLF := strings.Contains(rawContent, "\r\n")

	content := strings.ReplaceAll(rawContent, "\r\n", "\n")
	oldString = strings.ReplaceAll(oldString, "\r\n", "\n")
	newString = strings.ReplaceAll(newString, "\r\n", "\n")
	count := strings.Count(content, oldString)
	if count == 0 {
		snippet := oldString
		if len(snippet) > 80 {
			snippet = snippet[:80] + "..."
		}
		return tool.ExecutionResult{Content: fmt.Sprintf("old_string not found in file: %q", snippet), IsError: true}, nil
	}
	if count > 1 && !replaceAll {
		return tool.ExecutionResult{
			Content: fmt.Sprintf("old_string found %d times in file. Use replace_all to replace all occurrences, or provide a larger string with more surrounding context to make it unique.", count),
			IsError: true,
		}, nil
	}

	result := strings.ReplaceAll(content, oldString, newString)
	if hadCRLF {
		result = strings.ReplaceAll(result, "\n", "\r\n")
	}
	if err := os.WriteFile(path, []byte(result), info.Mode()); err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	diffLines := computeDiff(path, content, result)

	return tool.ExecutionResult{
		Content:   fmt.Sprintf("Replaced %d occurrence(s) in %s", count, path),
		DiffLines: diffLines,
	}, nil
}
