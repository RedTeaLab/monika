package agent

import (
	"context"
	"fmt"

	"monika/internal/tool"
	"monika/pkg/engine"
)

const MaxConcurrentSubtasks = 4

// ChildSession holds the result of a completed child agent run.
type ChildSession struct {
	Messages   []engine.ChatMessage
	Agent      string
	ParentID   string
	Title      string
	TokenCount int64
}

type TaskRunner struct {
	registry   *AgentRegistry
	provider   engine.ProviderEngine            // default / fallback provider
	providers  map[string]engine.ProviderEngine // all available providers, keyed by ID
	tools      *tool.ToolRegistry
	sem        chan struct{}
	onStart    func(task SubTask, agentName string) // called before child runs
	onComplete func(task SubTask, child *ChildSession)
}

func NewTaskRunner(registry *AgentRegistry, provider engine.ProviderEngine, providers map[string]engine.ProviderEngine, tools *tool.ToolRegistry, onStart func(task SubTask, agentName string), onComplete func(task SubTask, child *ChildSession)) *TaskRunner {
	return &TaskRunner{
		registry:   registry,
		provider:   provider,
		providers:  providers,
		tools:      tools,
		sem:        make(chan struct{}, MaxConcurrentSubtasks),
		onStart:    onStart,
		onComplete: onComplete,
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

		// Notify before running so the frontend can open the tab immediately
		if r.onStart != nil {
			r.onStart(task, ag.Name)
		}

		opts := []LoopOption{
			WithAgent(ag),
			WithParent(parent),
			WithSessionID(task.SessionID),
		}
		// Resolve projectDir: task explicit > parent inheritance
		if task.ProjectDir != "" {
			opts = append(opts, WithProjectDir(task.ProjectDir))
		} else if parent != nil && parent.projectDir != "" {
			opts = append(opts, WithProjectDir(parent.projectDir))
		}
		// Resolve model: agent explicit > task override > parent inheritance
		if ag.Model == "" {
			if task.Model != "" {
				opts = append(opts, WithModel(task.Model))
			} else if parent != nil && parent.model != "" {
				opts = append(opts, WithModel(parent.model))
			}
		}
		// Resolve provider: agent explicit > task override > parent inheritance
		if ag.Provider == "" {
			if task.Provider != "" {
				opts = append(opts, WithProvider(task.Provider))
			} else if parent != nil && parent.providerID != "" {
				opts = append(opts, WithProvider(parent.providerID))
			}
		}
		// Resolve provider engine from task.Provider, falling back to default
		provEng := r.provider
		if task.Provider != "" {
			if p, ok := r.providers[task.Provider]; ok {
				provEng = p
			}
		}
		child := NewLoop(provEng, r.tools, opts...)
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

		// Notify completion so caller can persist the child session
		if r.onComplete != nil && len(childConv.Messages) > 0 {
			r.onComplete(task, &ChildSession{
				Messages:   childConv.Messages,
				Agent:      ag.Name,
				ParentID:   task.ParentID,
				Title:      task.Description,
				TokenCount: childConv.TokenCount,
			})
		}
	}()

	return resultCh
}
