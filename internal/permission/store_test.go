package permission

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadRules_NewFile(t *testing.T) {
	tmpDir := t.TempDir()
	projectSlug := "test-project"

	rules, err := LoadRules(tmpDir, projectSlug)
	if err != nil {
		t.Fatalf("LoadRules on non-existent file: %v", err)
	}
	if rules != nil {
		t.Errorf("LoadRules = %v, want nil", rules)
	}
}

func TestSaveAndLoadRules(t *testing.T) {
	tmpDir := t.TempDir()
	projectSlug := "test-project"

	want := []Rule{
		{Tool: "bash", Pattern: "npm test", Decision: "allow", Source: "user_always"},
		{Tool: "bash", Pattern: "rm -rf *", Decision: "deny", Source: "builtin"},
	}

	if err := SaveRules(tmpDir, projectSlug, want); err != nil {
		t.Fatalf("SaveRules: %v", err)
	}

	got, err := LoadRules(tmpDir, projectSlug)
	if err != nil {
		t.Fatalf("LoadRules: %v", err)
	}
	if len(got) != len(want) {
		t.Fatalf("LoadRules returned %d rules, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i].Tool != want[i].Tool || got[i].Pattern != want[i].Pattern ||
			got[i].Decision != want[i].Decision || got[i].Source != want[i].Source {
			t.Errorf("rule[%d] = %+v, want %+v", i, got[i], want[i])
		}
	}
}

func TestAddAlwaysAllowRule(t *testing.T) {
	tmpDir := t.TempDir()
	projectSlug := "test-project"

	// Add initial rule
	if err := AddAlwaysAllowRule(tmpDir, projectSlug, "bash", "npm test"); err != nil {
		t.Fatalf("AddAlwaysAllowRule: %v", err)
	}

	rules, err := LoadRules(tmpDir, projectSlug)
	if err != nil {
		t.Fatalf("LoadRules after first add: %v", err)
	}
	if len(rules) != 1 {
		t.Fatalf("got %d rules, want 1", len(rules))
	}
	if rules[0].Tool != "bash" || rules[0].Pattern != "npm test" {
		t.Errorf("rule = %+v, want {Tool: bash, Pattern: npm test}", rules[0])
	}
	if rules[0].Decision != "allow" {
		t.Errorf("decision = %q, want %q", rules[0].Decision, "allow")
	}
	if rules[0].Source != "user_always" {
		t.Errorf("source = %q, want %q", rules[0].Source, "user_always")
	}

	// Add second rule
	if err := AddAlwaysAllowRule(tmpDir, projectSlug, "file_read", "/safe/path/*"); err != nil {
		t.Fatalf("AddAlwaysAllowRule second call: %v", err)
	}

	rules, err = LoadRules(tmpDir, projectSlug)
	if err != nil {
		t.Fatalf("LoadRules after second add: %v", err)
	}
	if len(rules) != 2 {
		t.Fatalf("got %d rules, want 2", len(rules))
	}
}

func TestAddAlwaysAllowRule_CreatesFile(t *testing.T) {
	tmpDir := t.TempDir()
	projectSlug := "brand-new-project"

	// Verify directory does not exist yet
	rulesPath := filepath.Join(tmpDir, ".monika", "projects", projectSlug, "rules.json")
	if _, err := os.Stat(rulesPath); !os.IsNotExist(err) {
		t.Fatal("rules.json should not exist before AddAlwaysAllowRule")
	}

	if err := AddAlwaysAllowRule(tmpDir, projectSlug, "glob", "*.go"); err != nil {
		t.Fatalf("AddAlwaysAllowRule on new project: %v", err)
	}

	// Verify file was created
	if _, err := os.Stat(rulesPath); os.IsNotExist(err) {
		t.Fatal("rules.json should exist after AddAlwaysAllowRule")
	}

	// Verify content
	rules, err := LoadRules(tmpDir, projectSlug)
	if err != nil {
		t.Fatalf("LoadRules after AddAlwaysAllowRule: %v", err)
	}
	if len(rules) != 1 {
		t.Fatalf("got %d rules, want 1", len(rules))
	}
	if rules[0].Tool != "glob" || rules[0].Pattern != "*.go" {
		t.Errorf("rule = %+v, want {Tool: glob, Pattern: *.go}", rules[0])
	}
}
