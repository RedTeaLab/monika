package builtin

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"

	"monika/internal/tool"
)

type globTool struct {
	projectDir string
}

func NewGlob(projectDir string) tool.Tool {
	return &globTool{projectDir: projectDir}
}

func (g *globTool) Name() string        { return "glob" }
func (g *globTool) Description() string {
	return "Find files matching a glob pattern. Use to discover project structure before targeting specific files with grep or file_read. Supports standard glob syntax (e.g., '**/*.go', 'src/**/*.tsx')."
}

func (g *globTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"pattern": map[string]any{
				"type":        "string",
				"description": "The glob pattern to match files against",
			},
			"path": map[string]any{
				"type":        "string",
				"description": "The directory to search in. Defaults to the project directory.",
			},
		},
		"required": []string{"pattern"},
	}
}

func (g *globTool) Execute(ctx context.Context, args json.RawMessage) (tool.ExecutionResult, error) {
	var params struct {
		Pattern string `json:"pattern"`
		Path    string `json:"path"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	searchDir := tool.ProjectDirOrDefault(ctx, g.projectDir)
	if params.Path != "" {
		if !filepath.IsAbs(params.Path) {
			return tool.ExecutionResult{Content: "path must be absolute", IsError: true}, nil
		}
		var err error
		searchDir, err = filepath.Abs(params.Path)
		if err != nil {
			return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
		}
	}

	absProject, err := filepath.Abs(tool.ProjectDirOrDefault(ctx, g.projectDir))
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	rel, err := filepath.Rel(absProject, searchDir)
	if err != nil || strings.HasPrefix(rel, "..") {
		return tool.ExecutionResult{Content: fmt.Sprintf("path is outside project directory"), IsError: true}, nil
	}

	fullPattern := filepath.Join(searchDir, params.Pattern)
	matches, err := filepath.Glob(fullPattern)
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	if len(matches) == 0 {
		return tool.ExecutionResult{Content: "No matches found"}, nil
	}
	return tool.ExecutionResult{Content: strings.Join(dedupMatches(matches), "\n")}, nil
}

func dedupMatches(s []string) []string {
	seen := make(map[string]bool)
	var out []string
	for _, item := range s {
		if !seen[item] {
			seen[item] = true
			out = append(out, item)
		}
	}
	return out
}
