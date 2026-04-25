package engine

import (
	"context"
	"testing"
)

func TestRegisterAndResolve(t *testing.T) {
	Reset()
	Register(&stubEngine{id: "test"})

	got, err := EngineByID("test")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID() != "test" {
		t.Fatalf("expected test, got %s", got.ID())
	}
}

func TestRegisterDuplicatePanics(t *testing.T) {
	Reset()
	Register(&stubEngine{id: "dup"})
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected panic on duplicate register")
		}
	}()
	Register(&stubEngine{id: "dup"})
}

func TestResolveNotFound(t *testing.T) {
	Reset()
	_, err := EngineByID("nonexistent")
	if err == nil {
		t.Fatal("expected error for missing engine")
	}
}

func TestEnginesList(t *testing.T) {
	Reset()
	Register(&stubEngine{id: "a"})
	Register(&stubEngine{id: "b"})
	all := Engines()
	if len(all) != 2 {
		t.Fatalf("expected 2 engines, got %d", len(all))
	}
}

type stubEngine struct {
	id string
}

func (s *stubEngine) ID() string                                     { return s.id }
func (s *stubEngine) Init(_ context.Context, _ map[string]any) error { return nil }
func (s *stubEngine) Capabilities() []Capability                     { return nil }
func (s *stubEngine) Shutdown(_ context.Context) error               { return nil }
