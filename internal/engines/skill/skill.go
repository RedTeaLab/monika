package skill

import (
	"bytes"
	"context"
	"fmt"
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

func (e *SkillEngine) NewInstance() engine.Engine { return &SkillEngine{} }

func (e *SkillEngine) Capabilities() []engine.Capability {
	return []engine.Capability{engine.CapSkill}
}

func (e *SkillEngine) Init(_ context.Context, _ map[string]any) error {
	return nil
}

func (e *SkillEngine) Shutdown(_ context.Context) error {
	return nil
}

type scanLocation struct {
	root   string
	relDir string // e.g. ".opencode/skills" or ".claude/skills"
	source string
}

func (e *SkillEngine) Discover(_ context.Context, homeDir string, projectDir string, manualPaths []string) ([]engine.SkillMeta, error) {
	seen := make(map[string]bool)
	var skills []engine.SkillMeta

	locations := []scanLocation{
		{projectDir, ".monika/skills", "project"},
		{homeDir, ".monika/skills", "global"},
	}

	for _, loc := range locations {
		found := scanSkillDir(loc.root, loc.relDir, loc.source, seen)
		skills = append(skills, found...)
	}

	for _, p := range manualPaths {
		expanded := p
		if len(p) > 1 && p[:2] == "~/" {
			expanded = filepath.Join(homeDir, p[2:])
		}
		found := scanSkillDir(expanded, "", "manual", seen)
		skills = append(skills, found...)
	}

	return skills, nil
}

// scanSkillDir scans root/relDir for subdirectories containing SKILL.md.
// If relDir is empty, scans root directly.
func scanSkillDir(root, relDir, source string, seen map[string]bool) []engine.SkillMeta {
	var skills []engine.SkillMeta
	scanRoot := root
	if relDir != "" {
		scanRoot = filepath.Join(root, relDir)
	}
	entries, err := os.ReadDir(scanRoot)
	if err != nil {
		return nil
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		skillFile := filepath.Join(scanRoot, entry.Name(), "SKILL.md")
		data, err := os.ReadFile(skillFile)
		if err != nil {
			continue
		}
		name, desc := parseFrontmatter(data)
		if name == "" {
			continue
		}
		if seen[name] {
			fmt.Fprintf(os.Stderr, "[monika] skill: duplicate name %q, skipping %s\n", name, skillFile)
			continue
		}
		seen[name] = true
		skills = append(skills, engine.SkillMeta{
			Name:        name,
			Description: desc,
			Path:        filepath.Dir(skillFile),
			Source:      source,
		})
	}
	return skills
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
