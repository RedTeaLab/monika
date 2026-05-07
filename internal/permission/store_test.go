package permission

import (
	"os"
	"path/filepath"
	"testing"
)

func writeConfigYAML(t *testing.T, dir, content string) {
	t.Helper()
	cfgDir := filepath.Join(dir, ".monika")
	if err := os.MkdirAll(cfgDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(cfgDir, "config.yaml"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestLoadRules_NoConfig(t *testing.T) {
	tmp := t.TempDir()
	home := filepath.Join(tmp, "home")

	rules, err := LoadRules(home, "")
	if err != nil {
		t.Fatalf("LoadRules: %v", err)
	}
	if len(rules) != 0 {
		t.Errorf("got %d rules, want 0", len(rules))
	}
}

func TestLoadRules_GlobalOnly(t *testing.T) {
	tmp := t.TempDir()
	home := filepath.Join(tmp, "home")

	writeConfigYAML(t, home, `tools:
  rules:
    - tool: bash
      pattern: npm test
      decision: allow
    - tool: bash
      pattern: rm -rf
      decision: deny
`)

	rules, err := LoadRules(home, "")
	if err != nil {
		t.Fatalf("LoadRules: %v", err)
	}
	if len(rules) != 2 {
		t.Fatalf("got %d rules, want 2", len(rules))
	}
	if rules[0].Source != SourceGlobal {
		t.Errorf("global rule source = %q, want %q", rules[0].Source, SourceGlobal)
	}
	if rules[0].Tool != "bash" || rules[0].Pattern != "npm test" || rules[0].Decision != "allow" {
		t.Errorf("rule[0] = %+v", rules[0])
	}
}

func TestLoadRules_GlobalAndProject(t *testing.T) {
	tmp := t.TempDir()
	home := filepath.Join(tmp, "home")
	project := filepath.Join(tmp, "project")

	writeConfigYAML(t, home, `tools:
  rules:
    - tool: bash
      pattern: npm test
      decision: allow
`)
	writeConfigYAML(t, project, `tools:
  rules:
    - tool: glob
      pattern: "*.go"
      decision: allow
`)

	rules, err := LoadRules(home, project)
	if err != nil {
		t.Fatalf("LoadRules: %v", err)
	}
	if len(rules) != 2 {
		t.Fatalf("got %d rules, want 2", len(rules))
	}
	if rules[0].Source != SourceGlobal || rules[0].Tool != "bash" {
		t.Errorf("rule[0] = %+v, want source=global tool=bash", rules[0])
	}
	if rules[1].Source != SourceProject || rules[1].Tool != "glob" {
		t.Errorf("rule[1] = %+v, want source=project tool=glob", rules[1])
	}
}

func TestAddAlwaysAllowRule(t *testing.T) {
	tmp := t.TempDir()
	project := filepath.Join(tmp, "project")

	if err := AddAlwaysAllowRule(project, "bash", "npm test"); err != nil {
		t.Fatalf("AddAlwaysAllowRule: %v", err)
	}

	// Verify project config.yaml was created and contains the rule
	rules, err := LoadRules(filepath.Join(tmp, "empty-home"), project)
	if err != nil {
		t.Fatalf("LoadRules after add: %v", err)
	}
	if len(rules) != 1 {
		t.Fatalf("got %d rules, want 1", len(rules))
	}
	if rules[0].Tool != "bash" || rules[0].Pattern != "npm test" || rules[0].Decision != "allow" {
		t.Errorf("rule = %+v", rules[0])
	}
	if rules[0].Source != SourceProject {
		t.Errorf("source = %q, want %q", rules[0].Source, SourceProject)
	}
}

func TestAddAlwaysAllowRule_Appends(t *testing.T) {
	tmp := t.TempDir()
	project := filepath.Join(tmp, "project")

	writeConfigYAML(t, project, `tools:
  rules:
    - tool: bash
      pattern: go build
      decision: allow
`)

	if err := AddAlwaysAllowRule(project, "bash", "npm test"); err != nil {
		t.Fatalf("AddAlwaysAllowRule: %v", err)
	}

	rules, err := LoadRules(filepath.Join(tmp, "empty-home"), project)
	if err != nil {
		t.Fatalf("LoadRules after add: %v", err)
	}
	if len(rules) != 2 {
		t.Fatalf("got %d rules, want 2", len(rules))
	}
}

func TestDeleteRule_Global(t *testing.T) {
	tmp := t.TempDir()
	home := filepath.Join(tmp, "home")

	writeConfigYAML(t, home, `tools:
  rules:
    - tool: bash
      pattern: npm test
      decision: allow
    - tool: glob
      pattern: "*.go"
      decision: allow
`)

	if err := DeleteRule(home, "", "bash", "npm test", SourceGlobal); err != nil {
		t.Fatalf("DeleteRule: %v", err)
	}

	rules, err := LoadRules(home, "")
	if err != nil {
		t.Fatalf("LoadRules after delete: %v", err)
	}
	if len(rules) != 1 {
		t.Fatalf("got %d rules, want 1", len(rules))
	}
	if rules[0].Tool != "glob" {
		t.Errorf("remaining rule = %+v, want tool=glob", rules[0])
	}
}

func TestDeleteRule_Project(t *testing.T) {
	tmp := t.TempDir()
	project := filepath.Join(tmp, "project")

	writeConfigYAML(t, project, `tools:
  rules:
    - tool: bash
      pattern: npm test
      decision: allow
`)
	// Load (no home config) so rule shows as project
	rules, err := LoadRules(filepath.Join(tmp, "empty-home"), project)
	if err != nil {
		t.Fatalf("LoadRules: %v", err)
	}
	if len(rules) != 1 {
		t.Fatalf("got %d rules, want 1", len(rules))
	}

	if err := DeleteRule(filepath.Join(tmp, "empty-home"), project, "bash", "npm test", SourceProject); err != nil {
		t.Fatalf("DeleteRule: %v", err)
	}

	rules, err = LoadRules(filepath.Join(tmp, "empty-home"), project)
	if err != nil {
		t.Fatalf("LoadRules after delete: %v", err)
	}
	if len(rules) != 0 {
		t.Fatalf("got %d rules, want 0", len(rules))
	}
}
