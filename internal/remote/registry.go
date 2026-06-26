package remote

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
)

// Handler is a function that takes JSON params and returns a JSON result.
type Handler func(ctx context.Context, params json.RawMessage) (json.RawMessage, error)

// MethodRegistry holds a whitelist of methods callable via remote RPC.
type MethodRegistry struct {
	mu      sync.RWMutex
	methods map[string]Handler
}

// NewMethodRegistry creates an empty method registry.
func NewMethodRegistry() *MethodRegistry {
	return &MethodRegistry{
		methods: make(map[string]Handler),
	}
}

// Register adds a named method to the registry.
func (r *MethodRegistry) Register(name string, fn Handler) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.methods[name] = fn
}

// Call invokes a registered method by name.
func (r *MethodRegistry) Call(ctx context.Context, name string, params json.RawMessage) (json.RawMessage, error) {
	r.mu.RLock()
	fn, ok := r.methods[name]
	r.mu.RUnlock()
	if !ok {
		return nil, &RPCError{Code: ErrCodeMethodNotFound, Message: fmt.Sprintf("method not found: %s", name)}
	}
	return fn(ctx, params)
}

// Names returns the names of all registered methods.
func (r *MethodRegistry) Names() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	names := make([]string, 0, len(r.methods))
	for name := range r.methods {
		names = append(names, name)
	}
	return names
}
