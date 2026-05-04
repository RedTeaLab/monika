package builtin

import (
	"context"
	"encoding/json"
	"fmt"

	"monika/internal/tool"
)

type taskListTool struct {
	store tool.TaskStore
}

func NewTaskList(store tool.TaskStore) tool.Tool {
	return &taskListTool{store: store}
}

func (t *taskListTool) Name() string { return "task_list" }

func (t *taskListTool) Description() string {
	return "List all tasks for the current session. Use this to check progress before deciding the next step."
}

func (t *taskListTool) Parameters() map[string]any {
	return map[string]any{
		"type":       "object",
		"properties": map[string]any{},
	}
}

func (t *taskListTool) Execute(ctx context.Context, _ json.RawMessage) (tool.ExecutionResult, error) {
	sessionID := tool.SessionIDFromContext(ctx)
	if sessionID == "" {
		return tool.ExecutionResult{IsError: true, Content: "no session ID in context"}, nil
	}

	list := t.store.List(sessionID)
	if list == nil {
		list = []tool.Task{}
	}
	data, err := json.Marshal(list)
	if err != nil {
		return tool.ExecutionResult{IsError: true, Content: fmt.Sprintf("failed to marshal tasks: %v", err)}, nil
	}
	return tool.ExecutionResult{Content: string(data)}, nil
}
