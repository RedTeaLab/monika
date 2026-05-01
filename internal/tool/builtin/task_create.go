package builtin

import (
	"context"
	"encoding/json"
	"fmt"

	"monika/internal/tool"
)

type taskCreateTool struct {
	store tool.TaskStore
}

func NewTaskCreate(store tool.TaskStore) tool.Tool {
	return &taskCreateTool{store: store}
}

func (t *taskCreateTool) Name() string { return "TaskCreate" }

func (t *taskCreateTool) Description() string {
	return "Create or replace the task list for the current session. " +
		"Use this to create a structured plan before starting complex multi-step work. " +
		"Calling this again replaces the entire previous list."
}

func (t *taskCreateTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"tasks": map[string]any{
				"type":        "array",
				"description": "Task objects. Each must have id, subject, and status.",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"id":          map[string]any{"type": "string", "description": "Numeric or kebab-case ID, max 64 chars, alphanumeric + hyphens"},
						"subject":     map[string]any{"type": "string", "description": "Task title"},
						"description": map[string]any{"type": "string", "description": "Optional task description"},
						"status":      map[string]any{"type": "string", "description": "pending / in_progress / completed / cancelled"},
						"blockedBy":   map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "Task IDs this task depends on"},
					},
					"required": []string{"id", "subject", "status"},
				},
			},
		},
		"required": []string{"tasks"},
	}
}

func (t *taskCreateTool) Execute(ctx context.Context, args json.RawMessage) (tool.ExecutionResult, error) {
	sessionID := tool.SessionIDFromContext(ctx)
	if sessionID == "" {
		return tool.ExecutionResult{IsError: true, Content: "no session ID in context"}, nil
	}

	var params struct {
		Tasks []tool.Task `json:"tasks"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return tool.ExecutionResult{IsError: true, Content: fmt.Sprintf("invalid arguments: %v", err)}, nil
	}

	if err := t.store.Replace(sessionID, params.Tasks); err != nil {
		return tool.ExecutionResult{IsError: true, Content: err.Error()}, nil
	}

	list := t.store.List(sessionID)
	data, _ := json.Marshal(list)
	return tool.ExecutionResult{Content: string(data)}, nil
}
