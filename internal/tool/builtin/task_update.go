package builtin

import (
	"context"
	"encoding/json"
	"fmt"

	"monika/internal/tool"
)

type taskUpdateTool struct {
	store tool.TaskStore
}

func NewTaskUpdate(store tool.TaskStore) tool.Tool {
	return &taskUpdateTool{store: store}
}

func (t *taskUpdateTool) Name() string { return "TaskUpdate" }

func (t *taskUpdateTool) Description() string {
	return "Update a single task's fields. Only provided fields are updated; " +
		"others remain unchanged.\n\n" +
		"CRITICAL: Call TaskUpdate IMMEDIATELY when you:\n" +
		"- Start working on a task → set status to \"in_progress\"\n" +
		"- Finish a task → set status to \"completed\"\n" +
		"- Abandon a task → set status to \"cancelled\"\n\n" +
		"Do NOT batch updates — mark each task done right after finishing it, " +
		"before moving to the next one. Only ONE task in_progress at a time."
}

func (t *taskUpdateTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"taskId":       map[string]any{"type": "string", "description": "Target task ID"},
			"status":       map[string]any{"type": "string", "description": "pending / in_progress / completed / cancelled"},
			"subject":      map[string]any{"type": "string", "description": "New title"},
			"description":  map[string]any{"type": "string", "description": "New description"},
			"addBlockedBy": map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "Task IDs to add to blockedBy"},
		},
		"required": []string{"taskId"},
	}
}

func (t *taskUpdateTool) Execute(ctx context.Context, args json.RawMessage) (tool.ExecutionResult, error) {
	sessionID := tool.SessionIDFromContext(ctx)
	if sessionID == "" {
		return tool.ExecutionResult{IsError: true, Content: "no session ID in context"}, nil
	}

	var params struct {
		TaskID       string   `json:"taskId"`
		Status       *string  `json:"status"`
		Subject      *string  `json:"subject"`
		Description  *string  `json:"description"`
		AddBlockedBy []string `json:"addBlockedBy"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return tool.ExecutionResult{IsError: true, Content: fmt.Sprintf("invalid arguments: %v", err)}, nil
	}

	if err := t.store.Update(sessionID, params.TaskID, tool.TaskUpdateFields{
		Status:       params.Status,
		Subject:      params.Subject,
		Description:  params.Description,
		AddBlockedBy: params.AddBlockedBy,
	}); err != nil {
		return tool.ExecutionResult{IsError: true, Content: err.Error()}, nil
	}

	list := t.store.List(sessionID)
	data, err := json.Marshal(list)
	if err != nil {
		return tool.ExecutionResult{IsError: true, Content: fmt.Sprintf("failed to marshal tasks: %v", err)}, nil
	}
	return tool.ExecutionResult{Content: string(data)}, nil
}
