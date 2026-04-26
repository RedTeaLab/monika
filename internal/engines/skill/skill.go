package skill

import (
	"bytes"
	"context"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"

	"monika/pkg/engine"
)

func init() {
	engine.Register(&SkillEngine{})
}

type SkillEngine struct{}

func (e *SkillEngine) ID() string { return "skill" }

func (e *SkillEngine) Capabilities() []engine.Capability {
	return []engine.Capability{engine.CapSkill}
}

func (e *SkillEngine) Init(_ context.Context, _ map[string]any) error {
	return nil
}

func (e *SkillEngine) Shutdown(_ context.Context) error {
	return nil
}

func (e *SkillEngine) Discover(_ context.Context, paths []string) ([]engine.SkillMeta, error) {
	var skills []engine.SkillMeta
	for _, p := range paths {
		entries, err := os.ReadDir(p)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return nil, err
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			skillPath := filepath.Join(p, entry.Name())
			skillFile := filepath.Join(skillPath, "SKILL.md")
			data, err := os.ReadFile(skillFile)
			if err != nil {
				continue
			}
			name, desc := parseFrontmatter(data)
			if name == "" {
				continue
			}
			skills = append(skills, engine.SkillMeta{
				Name:        name,
				Description: desc,
				Path:        skillPath,
			})
		}
	}
	return skills, nil
}

func (e *SkillEngine) Activate(_ context.Context, skill engine.SkillMeta) (engine.SkillContent, error) {
	data, err := os.ReadFile(filepath.Join(skill.Path, "SKILL.md"))
	if err != nil {
		return engine.SkillContent{}, err
	}
	_, body := splitFrontmatter(data)
	return engine.SkillContent{
		Meta:         skill,
		Instructions: string(body),
	}, nil
}

func (e *SkillEngine) Deactivate(_ context.Context, _ engine.SkillMeta) error {
	return nil
}

type frontmatter struct {
	Name        string `yaml:"name"`
	Description string `yaml:"description"`
}

func parseFrontmatter(data []byte) (string, string) {
	fm, _ := splitFrontmatter(data)
	var fmObj frontmatter
	if err := yaml.Unmarshal(fm, &fmObj); err != nil {
		return "", ""
	}
	return fmObj.Name, fmObj.Description
}

func splitFrontmatter(data []byte) (frontmatter, body []byte) {
	delimiter := []byte("---\n")
	if !bytes.HasPrefix(data, delimiter) {
		return nil, data
	}
	rest := data[len(delimiter):]
	end := bytes.Index(rest, delimiter)
	if end == -1 {
		return nil, data
	}
	return rest[:end], rest[end+len(delimiter):]
}
