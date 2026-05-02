package builtin

import (
	"context"

	"monika/internal/agent"
	"monika/internal/tool"
)

func RegisterDefaults(r *tool.ToolRegistry, projectDir string) error {
	r.Register(NewFileRead(projectDir))
	r.Register(NewFileWrite(projectDir))
	r.Register(NewFileEdit(projectDir))
	r.Register(NewFileList(projectDir))
	r.Register(NewGlob(projectDir))
	r.Register(NewGrep(projectDir))
	sh, err := NewBash(projectDir)
	if err != nil {
		return err
	}
	r.Register(sh)
	return nil
}

// RegisterTasks registers the three task planning tools.
// Called separately after TaskStore is created in main.
func RegisterTasks(r *tool.ToolRegistry, store tool.TaskStore) {
	r.Register(NewTaskCreate(store))
	r.Register(NewTaskUpdate(store))
	r.Register(NewTaskList(store))
}

// RegisterSpawnAgent registers the SpawnAgent tool for dispatching subtasks to other agents.
// Called after AgentRegistry and TaskRunner are created in main.
func RegisterSpawnAgent(r *tool.ToolRegistry, registry *agent.AgentRegistry, dispatchFn func(ctx context.Context, task agent.SubTask) <-chan agent.Event, pendingStore func(parentID, childID string)) {
	r.Register(NewSpawnAgent(registry, dispatchFn, pendingStore))
}
