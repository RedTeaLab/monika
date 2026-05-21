package agent

import (
	"testing"

	"monika/internal/config"
)

func TestAgentRegistryMergeConfig(t *testing.T) {
	builtin := []Agent{
		{Name: "general", Description: "built-in general", Model: ""},
		{Name: "explore", Description: "built-in explore", Model: "gpt-4"},
	}
	r := NewAgentRegistry(builtin)

	temp := 0.3
	configEntries := []config.AgentEntry{
		{Name: "general", Description: "overridden", Model: "gpt-4o"},
		{Name: "explore", Disabled: true},
		{Name: "custom", Description: "new agent", Model: "deepseek", Temperature: &temp},
	}
	r.MergeConfig(configEntries)

	// general should be overridden
	g, ok := r.Get("general")
	if !ok {
		t.Fatal("general should exist")
	}
	if g.Description != "overridden" {
		t.Fatalf("desc = %q", g.Description)
	}
	if g.Model != "gpt-4o" {
		t.Fatalf("model = %q", g.Model)
	}
	if g.IsCustom {
		t.Fatal("general should not be custom")
	}

	// explore should be disabled
	e, ok := r.Get("explore")
	if !ok {
		t.Fatal("explore should exist")
	}
	if !e.Disabled {
		t.Fatal("explore should be disabled")
	}

	// custom should exist
	c, ok := r.Get("custom")
	if !ok {
		t.Fatal("custom should exist")
	}
	if !c.IsCustom {
		t.Fatal("custom should be IsCustom")
	}
	if c.Source != "custom" {
		t.Fatalf("source = %q", c.Source)
	}
	if c.Temperature == nil || *c.Temperature != 0.3 {
		t.Fatal("temperature should be 0.3")
	}

	// List should exclude disabled
	list := r.List(false)
	if len(list) != 2 {
		t.Fatalf("List = %d, want 2", len(list))
	}

	// GetAll should include disabled
	all := r.GetAll()
	if len(all) != 3 {
		t.Fatalf("GetAll = %d, want 3", len(all))
	}
}
