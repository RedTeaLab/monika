package mcp

import (
	"context"
	"testing"

	"monika/pkg/engine"
)

func TestMCPRegistersItself(t *testing.T) {
	engine.Reset()
	e := &MCPEngine{}
	engine.Register(e)
	got, err := engine.EngineByID("mcp")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID() != "mcp" {
		t.Fatalf("expected mcp, got %s", got.ID())
	}
}

func TestMCPCapabilities(t *testing.T) {
	e := &MCPEngine{}
	caps := e.Capabilities()
	if len(caps) != 1 || caps[0] != engine.CapMCP {
		t.Fatalf("expected [mcp], got %v", caps)
	}
}

func TestMCPConnectAndDisconnect(t *testing.T) {
	e := &MCPEngine{}
	if err := e.Init(context.Background(), nil); err != nil {
		t.Fatal(err)
	}

	_, err := e.ConnectServer(context.Background(), engine.MCPServerConfig{
		ID:      "test",
		Command: "echo",
		Args:    []string{"hello"},
	})
	if err != nil {
		t.Fatalf("ConnectServer failed: %v", err)
	}

	if err := e.DisconnectServer(context.Background(), "test"); err != nil {
		t.Fatalf("DisconnectServer failed: %v", err)
	}
}

func TestMCPConnectDuplicate(t *testing.T) {
	e := &MCPEngine{}
	_ = e.Init(context.Background(), nil)

	_, _ = e.ConnectServer(context.Background(), engine.MCPServerConfig{
		ID: "dup", Command: "echo", Args: []string{},
	})
	_, err := e.ConnectServer(context.Background(), engine.MCPServerConfig{
		ID: "dup", Command: "echo", Args: []string{},
	})
	if err == nil {
		t.Fatal("expected error for duplicate connection")
	}
	_ = e.DisconnectServer(context.Background(), "dup")
}

func TestMCPDisconnectNotFound(t *testing.T) {
	e := &MCPEngine{}
	_ = e.Init(context.Background(), nil)

	err := e.DisconnectServer(context.Background(), "nonexistent")
	if err == nil {
		t.Fatal("expected error for missing server")
	}
}
