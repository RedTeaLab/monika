package engine

import "context"

type Engine interface {
	ID() string
	Init(ctx context.Context, cfg map[string]any) error
	Capabilities() []Capability
	Shutdown(ctx context.Context) error
}

type Capability string

const (
	CapProvider Capability = "provider"
	CapSkill    Capability = "skill"
	CapMCP      Capability = "mcp"
)
