package tools

import (
	"encoding/json"
	"fmt"
	"os"
)

type ReadFileTool struct{}

func (r *ReadFileTool) Name() string {
	return "read_file"
}

func (r *ReadFileTool) Description() string {
	return "Reads the content of a file and returns it."
}

func (b *ReadFileTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"file_path": map[string]any{
				"type":        "string",
				"description": "The path to the file to read.",
			},
		},
		"required": []string{"file_path"},
	}
}

func (b *ReadFileTool) Execute(args ...string) string {
	if len(args) == 0 {
		return "Error: No arguments provided."
	}

	// Parse the JSON arguments
	var params struct {
		FilePath string `json:"file_path"`
	}
	if err := json.Unmarshal([]byte(args[0]), &params); err != nil {
		return fmt.Sprintf("Error: Invalid arguments format - %v", err)
	}

	if params.FilePath == "" {
		return "Error: No file path provided."
	}

	content, err := os.ReadFile(params.FilePath)
	if err != nil {
		return fmt.Sprintf("Error: Unable to read file - %v", err)
	}

	return string(content)
}
