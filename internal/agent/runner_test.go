package agent

import (
	"context"
	"testing"
	"time"
)

func TestTaskRunner_Dispatch_AgentNotFound(t *testing.T) {
	registry := NewAgentRegistry([]Agent{
		{Name: "general", SystemPrompt: "test"},
	})
	runner := NewTaskRunner(registry, nil, nil, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	task := SubTask{
		ID:     "test-1",
		Type:   TaskSubtask,
		Agent:  "nonexistent",
		Prompt: "do something",
	}
	ch := runner.Dispatch(ctx, task, nil)

	var gotError bool
	for ev := range ch {
		if ev.Type == EventError && ev.Content == `agent "nonexistent" not found` {
			gotError = true
		}
	}
	if !gotError {
		t.Error("expected error for nonexistent agent")
	}
}

func TestTaskRunner_Dispatch_Cancellation(t *testing.T) {
	registry := NewAgentRegistry([]Agent{
		{Name: "general", SystemPrompt: "test"},
	})
	runner := NewTaskRunner(registry, nil, nil, nil)

	// Fill all slots so Dispatch blocks on semaphore, giving cancel time to win
	for i := 0; i < MaxConcurrentSubtasks; i++ {
		runner.sem <- struct{}{}
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	task := SubTask{
		ID:     "test-2",
		Type:   TaskSubtask,
		Agent:  "general",
		Prompt: "do something",
	}
	ch := runner.Dispatch(ctx, task, nil)

	var gotCancelled bool
	for ev := range ch {
		if ev.Type == EventError && ev.Content == "cancelled before dispatch" {
			gotCancelled = true
		}
	}
	if !gotCancelled {
		t.Error("expected cancellation error")
	}

	// Drain slots
	for i := 0; i < MaxConcurrentSubtasks; i++ {
		<-runner.sem
	}
}
