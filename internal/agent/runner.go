package agent

import (
	"context"
	"fmt"

	"monika/internal/tool"
	"monika/pkg/engine"
)

const MaxConcurrentSubtasks = 4

type TaskRunner struct {
	registry *AgentRegistry
	provider engine.ProviderEngine
	tools    *tool.ToolRegistry
	sem      chan struct{}
}

func NewTaskRunner(registry *AgentRegistry, provider engine.ProviderEngine, tools *tool.ToolRegistry) *TaskRunner {
	return &TaskRunner{
		registry: registry,
		provider: provider,
		tools:    tools,
		sem:      make(chan struct{}, MaxConcurrentSubtasks),
	}
}

func (r *TaskRunner) Dispatch(ctx context.Context, task SubTask, parent *AgentLoop) <-chan Event {
	resultCh := make(chan Event, 64)

	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				resultCh <- Event{Type: EventError, Content: fmt.Sprintf("child panic: %v", rec)}
			}
			close(resultCh)
		}()

		select {
		case r.sem <- struct{}{}:
		case <-ctx.Done():
			resultCh <- Event{Type: EventError, Content: "cancelled before dispatch"}
			return
		}
		defer func() { <-r.sem }()

		ag, ok := r.registry.Get(task.Agent)
		if !ok {
			resultCh <- Event{Type: EventError, Content: fmt.Sprintf("agent %q not found", task.Agent)}
			return
		}

		child := NewLoop(r.provider, r.tools,
			WithAgent(ag),
			WithParent(parent),
			WithSessionID(task.SessionID),
		)
		childConv := &Conversation{ID: task.SessionID}

		childCtx, cancel := context.WithCancel(ctx)
		defer cancel()

		for ev := range child.Run(childCtx, childConv, task.Prompt) {
			select {
			case resultCh <- ev:
			case <-ctx.Done():
				return
			}
		}
	}()

	return resultCh
}
