package tools

import (
	"encoding/json"
	"fmt"
	"os"
)

type WriteFileTool struct{}

func (t *WriteFileTool) Name() string {
	return "write_file"
}

func (t *WriteFileTool) Description() string {
	return "Write content to a file."
}

func (t *WriteFileTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"file_path": map[string]any{
				"type":        "string",
				"description": "The path to the file to write.",
			},
			"content": map[string]any{
				"type":        "string",
				"description": "The content to write to the file.",
			},
		},
		"required": []string{"file_path", "content"},
	}
}

func (t *WriteFileTool) Execute(args ...string) string {
	if len(args) == 0 {
		return "Error: No arguments provided."
	}

	// Parse the JSON arguments
	var params struct {
		FilePath string `json:"file_path"`
		Content  string `json:"content"`
	}
	if err := json.Unmarshal([]byte(args[0]), &params); err != nil {
		return fmt.Sprintf("Error: Invalid arguments format - %v", err)
	}

	if params.FilePath == "" {
		return "Error: file_path is required."
	}

	err := os.WriteFile(params.FilePath, []byte(params.Content), 0644)
	if err != nil {
		return fmt.Sprintf("Error writing to file: %v", err)
	}
	return fmt.Sprintf("Successfully wrote to file: %s", params.FilePath)
}
