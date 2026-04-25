package engine

import (
	"fmt"
	"sync"
)

var (
	mu      sync.RWMutex
	engines = map[string]Engine{}
)

func Register(e Engine) {
	mu.Lock()
	defer mu.Unlock()
	id := e.ID()
	if _, exists := engines[id]; exists {
		panic(fmt.Sprintf("engine: Register called twice for %q", id))
	}
	engines[id] = e
}

func EngineByID(id string) (Engine, error) {
	mu.RLock()
	defer mu.RUnlock()
	e, ok := engines[id]
	if !ok {
		return nil, fmt.Errorf("engine %q not registered", id)
	}
	return e, nil
}

func Engines() []Engine {
	mu.RLock()
	defer mu.RUnlock()
	out := make([]Engine, 0, len(engines))
	for _, e := range engines {
		out = append(out, e)
	}
	return out
}

func Reset() {
	mu.Lock()
	defer mu.Unlock()
	engines = map[string]Engine{}
}
