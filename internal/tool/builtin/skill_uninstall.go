package builtin

import (
	"context"
	"encoding/json"
	"fmt"

	"monika/internal/tool"
)

type skillUninstallTool struct {
	uninstallFn func(name string) error
}

func NewSkillUninstallTool(uninstallFn func(name string) error) tool.Tool {
	return &skillUninstallTool{uninstallFn: uninstallFn}
}

func (t *skillUninstallTool) Name() string { return "uninstall_skill" }

func (t *skillUninstallTool) Description() string {
	return `Uninstall (remove) an installed skill by name.

Use this tool when the user asks to remove, uninstall, or delete a skill. The skill name must match one of the currently installed skills.`
}

func (t *skillUninstallTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"name": map[string]any{
				"type":        "string",
				"description": "The name of the skill to uninstall",
			},
		},
		"required": []string{"name"},
	}
}

func (t *skillUninstallTool) Execute(_ context.Context, args json.RawMessage) (tool.ExecutionResult, error) {
	var params struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return tool.ExecutionResult{}, fmt.Errorf("uninstall_skill: invalid args: %w", err)
	}
	if params.Name == "" {
		return tool.ExecutionResult{Content: "Error: name is required", IsError: true}, nil
	}

	if err := t.uninstallFn(params.Name); err != nil {
		return tool.ExecutionResult{Content: fmt.Sprintf("Failed to uninstall skill: %s", err), IsError: true}, nil
	}

	return tool.ExecutionResult{
		Content: fmt.Sprintf("Successfully uninstalled skill %q.", params.Name),
	}, nil
}
