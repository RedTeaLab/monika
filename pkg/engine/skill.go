package engine

import "context"

type SkillMeta struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Path        string `json:"path"`
	Source      string `json:"source"` // "project-opencode" | "project-claude" | "project-agents" | "global-monika" | "global-claude" | "global-agents" | "manual"
	Enabled     *bool  `json:"enabled,omitempty"`
}

type SkillContent struct {
	Meta         SkillMeta `json:"meta"`
	Instructions string    `json:"instructions"`
}

type SkillEngine interface {
	Engine
	Discover(ctx context.Context, homeDir string, projectDir string, manualPaths []string) ([]SkillMeta, error)
	Activate(ctx context.Context, skill SkillMeta) (SkillContent, error)
	Deactivate(ctx context.Context, skill SkillMeta) error
}
