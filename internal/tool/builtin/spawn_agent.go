package builtin

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"strings"

	"monika/internal/agent"
	"monika/internal/tool"
)

type spawnAgentTool struct {
	registry   *agent.AgentRegistry
	dispatchFn func(ctx context.Context, task agent.SubTask) <-chan agent.Event
}

func NewSpawnAgent(registry *agent.AgentRegistry, dispatchFn func(ctx context.Context, task agent.SubTask) <-chan agent.Event) tool.Tool {
	return &spawnAgentTool{registry: registry, dispatchFn: dispatchFn}
}

func (t *spawnAgentTool) Name() string { return "SpawnAgent" }

func (t *spawnAgentTool) Description() string {
	return `Launch a new agent to handle complex, multi-step tasks. Each agent type has specific capabilities and tools available to it.

Available agent types and the tools they have access to:
- explore: Fast agent specialized for exploring codebases. Use when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase.
- general: General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks.

Usage notes:
- Provide a clear, specific prompt describing what the subagent should do and what format you want the result in.
- Use "blocking" mode (default) when you need the subagent's result before continuing.
- The subagent returns its full findings as a tool result.`
}

func (t *spawnAgentTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"description": map[string]any{
				"type":        "string",
				"description": "A short description of the task (3-5 words)",
			},
			"prompt": map[string]any{
				"type":        "string",
				"description": "The task for the agent to perform. Be specific about what you want the agent to investigate or produce.",
			},
			"subagent_type": map[string]any{
				"type":        "string",
				"description": "The type of agent to dispatch. Available: 'explore', 'general'.",
			},
			"mode": map[string]any{
				"type":        "string",
				"enum":        []string{"blocking"},
				"description": "Dispatch mode. Only 'blocking' is supported — parent waits for result.",
			},
		},
		"required": []string{"description", "prompt", "subagent_type"},
	}
}

func (t *spawnAgentTool) Execute(ctx context.Context, args json.RawMessage) (tool.ExecutionResult, error) {
	var params struct {
		Description  string `json:"description"`
		Prompt       string `json:"prompt"`
		SubagentType string `json:"subagent_type"`
		Mode         string `json:"mode"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return tool.ExecutionResult{}, fmt.Errorf("invalid arguments: %w", err)
	}

	ag, ok := t.registry.Get(params.SubagentType)
	if !ok {
		var available []string
		for _, a := range t.registry.List(false) {
			available = append(available, a.Name)
		}
		return tool.ExecutionResult{
			Content: fmt.Sprintf("agent %q not found. Available: %v", params.SubagentType, available),
			IsError: true,
		}, nil
	}

	if params.Mode == "" {
		params.Mode = "blocking"
	}

	if t.dispatchFn == nil {
		return tool.ExecutionResult{
			Content: "subtask dispatch is not configured",
			IsError: true,
		}, nil
	}

	task := agent.SubTask{
		ID:          generateSubTaskID(),
		Type:        agent.TaskSubtask,
		Agent:       ag.Name,
		Description: params.Description,
		Prompt:      params.Prompt,
		Status:      "pending",
	}

	resultCh := t.dispatchFn(ctx, task)
	var output strings.Builder
	for ev := range resultCh {
		switch ev.Type {
		case agent.EventTextDelta:
			output.WriteString(ev.Content)
		case agent.EventError:
			return tool.ExecutionResult{
				Content: fmt.Sprintf("subtask failed: %s", ev.Content),
				IsError: true,
			}, nil
		}
	}

	result := output.String()
	if result == "" {
		result = "(subtask completed with no output)"
	}

	return tool.ExecutionResult{
		Content: fmt.Sprintf("task_id: %s\n\n<task_result>\n%s\n</task_result>", task.ID, result),
	}, nil
}

func generateSubTaskID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return fmt.Sprintf("sub_%x", b)
}
