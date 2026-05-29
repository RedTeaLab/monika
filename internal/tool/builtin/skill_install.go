package builtin

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"monika/internal/tool"
)

type skillInstallTool struct {
	installFn func(url string, scope string) ([]string, error)
}

func NewSkillInstallTool(installFn func(url string, scope string) ([]string, error)) tool.Tool {
	return &skillInstallTool{installFn: installFn}
}

func (t *skillInstallTool) Name() string { return "install_skill" }

func (t *skillInstallTool) Description() string {
	return `Install skills from a GitHub repository URL.

Use this tool when the user asks to install, add, or download a skill from a GitHub URL. The tool downloads the repository, scans for SKILL.md files, and installs any skills found.

After installation, the skills become available in the current and future sessions.`
}

func (t *skillInstallTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"url": map[string]any{
				"type":        "string",
				"description": "GitHub repository URL (e.g. https://github.com/owner/repo)",
			},
			"scope": map[string]any{
				"type":        "string",
				"description": "Installation scope: 'project' (only this project) or 'global' (all projects). Defaults to 'global'.",
				"enum":        []string{"project", "global"},
			},
		},
		"required": []string{"url"},
	}
}

func (t *skillInstallTool) Execute(_ context.Context, args json.RawMessage) (tool.ExecutionResult, error) {
	var params struct {
		URL   string `json:"url"`
		Scope string `json:"scope"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return tool.ExecutionResult{}, fmt.Errorf("install_skill: invalid args: %w", err)
	}
	if params.URL == "" {
		return tool.ExecutionResult{Content: "Error: url is required", IsError: true}, nil
	}
	if params.Scope == "" {
		params.Scope = "global"
	}

	installed, err := t.installFn(params.URL, params.Scope)
	if err != nil {
		return tool.ExecutionResult{Content: fmt.Sprintf("Failed to install skills: %s", err), IsError: true}, nil
	}

	if len(installed) == 0 {
		return tool.ExecutionResult{
			Content: "No skills found in the repository. Make sure the repository contains directories with SKILL.md files.",
		}, nil
	}

	return tool.ExecutionResult{
		Content: fmt.Sprintf("Successfully installed %d skill(s): %s", len(installed), strings.Join(installed, ", ")),
	}, nil
}
