package engine

import "context"

type Engine interface {
	ID() string
	Init(ctx context.Context, cfg map[string]any) error
	Capabilities() []Capability
	Shutdown(ctx context.Context) error
	// NewInstance returns a fresh zero-value instance of this engine type.
	NewInstance() Engine
}

type Capability string

const (
	CapProvider Capability = "provider"
	CapSkill    Capability = "skill"
	CapMCP      Capability = "mcp"
)
