package builtin

import (
	"context"
	"encoding/json"

	"monika/internal/agent"
	"monika/internal/config"
	"monika/internal/tool"
	"monika/pkg/engine"
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

// RegisterAskUser registers the ask_user tool for user interaction.
func RegisterAskUser(r *tool.ToolRegistry) {
	r.Register(NewAskUser())
}

// RegisterTasks registers the three task planning tools.
// Called separately after TaskStore is created in main.
func RegisterTasks(r *tool.ToolRegistry, store tool.TaskStore) {
	r.Register(NewTaskCreate(store))
	r.Register(NewTaskAppend(store))
	r.Register(NewTaskUpdate(store))
	r.Register(NewTaskList(store))
}

// RegisterSpawnAgent registers the SpawnAgent tool for dispatching subtasks to other agents.
// Called after AgentRegistry and TaskRunner are created in main.
func RegisterSpawnAgent(r *tool.ToolRegistry, registry *agent.AgentRegistry, dispatchFn func(ctx context.Context, task agent.SubTask) <-chan agent.Event, pendingStore func(parentID, childID string)) {
	r.Register(NewSpawnAgent(registry, dispatchFn, pendingStore))
}

// RegisterSkillTool registers the skill tool for on-demand skill loading.
func RegisterSkillTool(r *tool.ToolRegistry, skEng engine.SkillEngine, home string, getCwd func() string, cfg *config.Config) {
	r.Register(NewSkillTool(skEng, home, getCwd, cfg))
}

// RegisterSkillManagement registers install_skill and uninstall_skill tools.
// The installFn and uninstallFn callbacks are typically wired to App methods.
func RegisterSkillManagement(r *tool.ToolRegistry, installFn func(url string, scope string) ([]string, error), uninstallFn func(name string) error) {
	r.Register(NewSkillInstallTool(installFn))
	r.Register(NewSkillUninstallTool(uninstallFn))
}

// RegisterMCPManagement registers install_mcp_server, uninstall_mcp_server, and list_mcp_servers tools.
// The callbacks are typically wired to App methods.
func RegisterMCPManagement(
	r *tool.ToolRegistry,
	saveFn func(json.RawMessage) error,
	deleteFn func(json.RawMessage) error,
	reconnectFn func(json.RawMessage) ([]string, error),
	listFn func() []MCPServerInfo,
) {
	r.Register(NewMCPInstallTool(saveFn, reconnectFn))
	r.Register(NewMCPUninstallTool(deleteFn))
	r.Register(NewMCPListTool(listFn))
}
