package skill

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"monika/pkg/engine"
)

func TestSkillRegistersItself(t *testing.T) {
	engine.Reset()
	e := &SkillEngine{}
	engine.Register(e)
	got, err := engine.EngineByID("skill")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID() != "skill" {
		t.Fatalf("expected skill, got %s", got.ID())
	}
}

func TestSkillDiscoverFindsSKILLMD(t *testing.T) {
	dir := t.TempDir()
	skillDir := filepath.Join(dir, "my-skill")
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		t.Fatal(err)
	}
	content := "---\nname: my-skill\ndescription: A test skill\n---\n# My Skill\nDo stuff."
	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	e := &SkillEngine{}
	skills, err := e.Discover(context.Background(), []string{dir})
	if err != nil {
		t.Fatal(err)
	}
	if len(skills) != 1 {
		t.Fatalf("expected 1 skill, got %d", len(skills))
	}
	if skills[0].Name != "my-skill" {
		t.Fatalf("expected my-skill, got %s", skills[0].Name)
	}
	if skills[0].Description != "A test skill" {
		t.Fatalf("unexpected description: %s", skills[0].Description)
	}
}

func TestSkillDiscoverSkipsMissingDir(t *testing.T) {
	e := &SkillEngine{}
	skills, err := e.Discover(context.Background(), []string{"/nonexistent/path"})
	if err != nil {
		t.Fatal(err)
	}
	if len(skills) != 0 {
		t.Fatalf("expected 0 skills, got %d", len(skills))
	}
}

func TestSkillActivateReturnsContent(t *testing.T) {
	dir := t.TempDir()
	skillDir := filepath.Join(dir, "test-skill")
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		t.Fatal(err)
	}
	content := "---\nname: test-skill\ndescription: test\n---\n# Instructions\nDo this."
	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	e := &SkillEngine{}
	meta := engine.SkillMeta{Name: "test-skill", Path: skillDir}
	sc, err := e.Activate(context.Background(), meta)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(sc.Instructions, "# Instructions") {
		t.Fatalf("expected instructions to contain heading, got: %s", sc.Instructions)
	}
}
