package engine

import "context"

type SkillMeta struct {
	Name        string
	Description string
	Path        string
}

type SkillContent struct {
	Meta         SkillMeta
	Instructions string
}

type SkillEngine interface {
	Engine
	Discover(ctx context.Context, paths []string) ([]SkillMeta, error)
	Activate(ctx context.Context, skill SkillMeta) (SkillContent, error)
	Deactivate(ctx context.Context, skill SkillMeta) error
}
