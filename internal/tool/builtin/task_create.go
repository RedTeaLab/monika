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
		"Use this to create a structured plan before starting work. " +
		"Calling this again replaces the entire previous list.\n\n" +
		"## When to Use\n" +
		"Use proactively in these scenarios:\n" +
		"1. Complex multi-step tasks — 3 or more distinct steps or actions\n" +
		"2. Non-trivial tasks — tasks that require careful planning or multiple operations\n" +
		"3. User explicitly requests todo list — \"plan this\", \"create tasks\", etc.\n" +
		"4. User provides multiple tasks — numbered or comma-separated lists\n" +
		"5. After receiving new instructions — immediately capture user requirements as tasks\n" +
		"6. After completing a task — mark it complete and add any new follow-up tasks\n" +
		"7. When you start working on a task — mark it in_progress via TaskUpdate\n\n" +
		"## When NOT to Use\n" +
		"Skip only when:\n" +
		"1. The task is purely informational (e.g., \"what does git status do?\")\n" +
		"2. The task is a single, trivial step (e.g., \"run npm install\")\n" +
		"3. The task can be completed in less than 3 trivial steps\n\n" +
		"## Task States\n" +
		"- pending: Not yet started\n" +
		"- in_progress: Currently working on (only ONE at a time)\n" +
		"- completed: Finished successfully\n" +
		"- cancelled: No longer needed\n\n" +
		"## Task Management\n" +
		"- Update task status in real-time as you work\n" +
		"- Mark tasks complete IMMEDIATELY after finishing — don't batch completions\n" +
		"- Only have ONE task in_progress at any time\n" +
		"- Complete current tasks before starting new ones\n" +
		"- Cancel tasks that become irrelevant\n" +
		"- Create specific, actionable items with clear, descriptive names\n" +
		"- Break complex tasks into smaller, manageable steps\n\n" +
		"When in doubt, use this tool. Proactive planning ensures complete requirements."
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
	data, err := json.Marshal(list)
	if err != nil {
		return tool.ExecutionResult{IsError: true, Content: fmt.Sprintf("failed to marshal tasks: %v", err)}, nil
	}
	return tool.ExecutionResult{Content: string(data)}, nil
}
