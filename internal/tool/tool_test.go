package tool

import (
	"context"
	"encoding/json"
	"testing"
)

type stubTool struct {
	name        string
	description string
	params      map[string]any
}

func (s *stubTool) Name() string               { return s.name }
func (s *stubTool) Description() string        { return s.description }
func (s *stubTool) Parameters() map[string]any { return s.params }
func (s *stubTool) Execute(_ context.Context, _ json.RawMessage) (ExecutionResult, error) {
	return ExecutionResult{Content: "ok"}, nil
}

func TestRegistryRegisterAndGet(t *testing.T) {
	r := NewRegistry()
	r.Register(&stubTool{name: "test"})

	tool, ok := r.Get("test")
	if !ok {
		t.Fatal("tool not found")
	}
	if tool.Name() != "test" {
		t.Fatalf("name = %q", tool.Name())
	}
}

func TestRegistryGetNotFound(t *testing.T) {
	r := NewRegistry()
	_, ok := r.Get("missing")
	if ok {
		t.Fatal("should not find missing tool")
	}
}

func TestRegistryList(t *testing.T) {
	r := NewRegistry()
	r.Register(&stubTool{name: "a"})
	r.Register(&stubTool{name: "b"})

	tools := r.List()
	if len(tools) != 2 {
		t.Fatalf("expected 2 tools, got %d", len(tools))
	}
}

func TestRegistryRemove(t *testing.T) {
	r := NewRegistry()
	r.Register(&stubTool{name: "test"})
	r.Remove("test")

	if _, ok := r.Get("test"); ok {
		t.Fatal("tool should be removed")
	}
}

func TestRegistryRegisterOverwrites(t *testing.T) {
	r := NewRegistry()
	r.Register(&stubTool{name: "test", description: "first"})
	r.Register(&stubTool{name: "test", description: "second"})

	tool, ok := r.Get("test")
	if !ok {
		t.Fatal("tool not found")
	}
	if tool.Description() != "second" {
		t.Fatalf("description = %q", tool.Description())
	}
}

func TestExecutionResult(t *testing.T) {
	r := ExecutionResult{Content: "output", IsError: false}
	if r.Content != "output" {
		t.Fatalf("content = %q", r.Content)
	}
	if r.IsError {
		t.Fatal("expected IsError to be false")
	}
}
