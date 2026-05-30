package builtin

import (
	"context"
	"encoding/json"
	"fmt"

	"monika/internal/tool"
)

type taskAppendTool struct {
	store tool.TaskStore
}

func NewTaskAppend(store tool.TaskStore) tool.Tool {
	return &taskAppendTool{store: store}
}

func (t *taskAppendTool) Name() string { return "task_append" }

func (t *taskAppendTool) Description() string {
	return "Append new tasks to the existing task list for the current session. " +
		"Unlike task_create which replaces the entire list, this tool adds tasks to the end of the current list.\n\n" +
		"## When to Use\n" +
		"Use when you need to add new tasks without losing the current task list and its progress.\n" +
		"For example:\n" +
		"1. User adds new requirements mid-work\n" +
		"2. You discover additional steps needed after starting\n" +
		"3. A completed task reveals follow-up work\n\n" +
		"## When NOT to Use\n" +
		"- When you want to reorganize the entire task list — use task_create instead\n" +
		"- When you only need to update an existing task's status — use task_update instead"
}

func (t *taskAppendTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"tasks": map[string]any{
				"type":        "array",
				"description": "New task objects to append. Each must have id, subject, and status.",
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

func (t *taskAppendTool) Execute(ctx context.Context, args json.RawMessage) (tool.ExecutionResult, error) {
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

	if err := t.store.Append(sessionID, params.Tasks); err != nil {
		return tool.ExecutionResult{IsError: true, Content: err.Error()}, nil
	}

	list := t.store.List(sessionID)
	data, err := json.Marshal(list)
	if err != nil {
		return tool.ExecutionResult{IsError: true, Content: fmt.Sprintf("failed to marshal tasks: %v", err)}, nil
	}
	return tool.ExecutionResult{Content: string(data)}, nil
}
