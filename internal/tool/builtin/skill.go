package builtin

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"monika/internal/config"
	"monika/internal/tool"
	"monika/pkg/engine"
)

func xmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	return s
}

type skillTool struct {
	skEng engine.SkillEngine
	home  string
	cwd   string
	cfg   *config.Config
}

func NewSkillTool(skEng engine.SkillEngine, home, cwd string, cfg *config.Config) tool.Tool {
	return &skillTool{skEng: skEng, home: home, cwd: cwd, cfg: cfg}
}

func (t *skillTool) Name() string { return "skill" }

func (t *skillTool) Description() string {
	return `Load a specialized skill when the task at hand matches one of the skills listed in the system prompt.

Use this tool to inject the skill's instructions and resources into current conversation. The output may contain detailed workflow guidance as well as references to scripts, files, etc in the same directory as the skill.

The skill name must match one of the skills listed in your system prompt.`
}

func (t *skillTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"name": map[string]any{
				"type":        "string",
				"description": "The name of the skill from available_skills",
			},
		},
		"required": []string{"name"},
	}
}

func (t *skillTool) Execute(ctx context.Context, args json.RawMessage) (tool.ExecutionResult, error) {
	var params struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return tool.ExecutionResult{}, fmt.Errorf("skill: invalid args: %w", err)
	}

	skills, err := t.skEng.Discover(ctx, t.home, t.cwd, t.cfg.Skill.Paths)
	if err != nil {
		return tool.ExecutionResult{}, fmt.Errorf("skill: discovery failed: %w", err)
	}

	var meta *engine.SkillMeta
	for i := range skills {
		if skills[i].Name == params.Name {
			meta = &skills[i]
			break
		}
	}
	if meta == nil {
		names := make([]string, 0, len(skills))
		for _, s := range skills {
			names = append(names, s.Name)
		}
		return tool.ExecutionResult{
			Content: fmt.Sprintf("Skill %q not found. Available skills: %s", params.Name, strings.Join(names, ", ")),
			IsError: true,
		}, nil
	}

	content, err := t.skEng.Activate(ctx, *meta)
	if err != nil {
		return tool.ExecutionResult{}, fmt.Errorf("skill: failed to activate %q: %w", params.Name, err)
	}

	var files []string
	entries, _ := os.ReadDir(meta.Path)
	for _, e := range entries {
		if e.Name() == "SKILL.md" {
			continue
		}
		files = append(files, filepath.Join(meta.Path, e.Name()))
		if len(files) >= 10 {
			break
		}
	}

	var fileLines []string
	for _, f := range files {
		fileLines = append(fileLines, fmt.Sprintf("<file>%s</file>", xmlEscape(f)))
	}

	output := fmt.Sprintf(
		"<skill_content name=\"%s\">\n# Skill: %s\n\n%s\n\nBase directory for this skill: %s\nRelative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.\nNote: file list is sampled.\n\n<skill_files>\n%s\n</skill_files>\n</skill_content>",
		xmlEscape(meta.Name),
		meta.Name,
		strings.TrimSpace(content.Instructions),
		meta.Path,
		strings.Join(fileLines, "\n"),
	)

	return tool.ExecutionResult{Content: output}, nil
}
