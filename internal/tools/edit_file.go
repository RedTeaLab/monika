package tools

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

type EditFileTool struct{}

func (t *EditFileTool) Name() string {
	return "edit_file"
}

func (t *EditFileTool) Description() string {
	return "Edit the content of a file by replacing old_text with new_text."
}

func (t *EditFileTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"file_path": map[string]any{
				"type":        "string",
				"description": "The path to the file to edit.",
			},
			"old_text": map[string]any{
				"type":        "string",
				"description": "The text to be replaced.",
			},
			"new_text": map[string]any{
				"type":        "string",
				"description": "The text to replace with.",
			},
		},
		"required": []string{"file_path", "old_text", "new_text"},
	}
}

func (t *EditFileTool) Execute(args ...string) string {
	if len(args) == 0 {
		return "Error: No arguments provided."
	}

	// Parse the JSON arguments
	var params struct {
		FilePath string `json:"file_path"`
		OldText  string `json:"old_text"`
		NewText  string `json:"new_text"`
	}
	if err := json.Unmarshal([]byte(args[0]), &params); err != nil {
		return fmt.Sprintf("Error: Invalid arguments format - %v", err)
	}

	if params.FilePath == "" {
		return "Error: file_path is required."
	}
	if params.OldText == "" {
		return "Error: old_text is required."
	}
	if params.NewText == "" {
		return "Error: new_text is required."
	}

	content, err := os.ReadFile(params.FilePath)
	if err != nil {
		return fmt.Sprintf("Error reading file: %v", err)
	}

	updatedContent := strings.ReplaceAll(string(content), params.OldText, params.NewText)

	err = os.WriteFile(params.FilePath, []byte(updatedContent), 0644)
	if err != nil {
		return fmt.Sprintf("Error writing to file: %v", err)
	}
	return fmt.Sprintf("Successfully edited file: %s", params.FilePath)
}
