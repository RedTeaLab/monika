# Monika — Agent Guidance

## Build / Run

```powershell
# Dev mode (hot reload): runs wails3 dev with Vite + Go rebuild
wails3 dev

# Build standalone (production)
cd frontend && npm run build && cd ..
go build .

# Or via Taskfile
task dev
task build

# Frontend dev server only (when Go backend is already running)
cd frontend && npm run dev

# Regenerate Wails bindings (after changing Go API types)
wails3 generate bindings -f "..." -ts
```

- **Prerequisites**: Go 1.25+, Node.js 18+, `wails3` CLI (`go install github.com/wailsapp/wails/v3/cmd/wails3@latest`)
- **Build orchestration**: `Taskfile.yml` at root, `build/Taskfile.yml` for common tasks, `build/windows/Taskfile.yml` for Windows-specific
- **Frontend build** depends on bindings generation (`wails3 generate bindings`) — the Go types in `internal/api/` are the source of truth for the TS bindings at `frontend/bindings/monika/`
- **Version injection**: `internal/version/version.go` vars are set via ldflags at build time
- **Tests**: standard `go test ./...`; frontend has no test runner configured yet

## Project Structure

```
monika/
├── main.go                  # Wails app entry point, embeds frontend/dist, wires all services
├── build/config.yml         # Wails v3 build configuration (dev mode, ignores, etc.)
├── Taskfile.yml             # Root task definitions
├── frontend/                # React 18 + TypeScript + Tailwind CSS v4
│   ├── src/
│   │   ├── App.tsx          # Root component with dockview panel layout
│   │   ├── store/index.ts   # Single Zustand store (~800+ lines, all app state)
│   │   ├── components/      # UI components organized by feature
│   │   └── hooks/           # Custom hooks (useChangeWatcher, etc.)
│   └── bindings/monika/     # Auto-generated Wails bindings (DO NOT EDIT)
├── internal/                # Go backend — private to this module
│   ├── agent/               # Agent loop, streaming, compaction, multiple agents
│   ├── api/                 # Wails services: App, SessionManager, FileService, EventBus
│   ├── bootstrap/           # Provider initialization from config
│   ├── config/              # YAML/JSON config loader (~/.monika/config.yaml)
│   ├── engines/             # Provider adapters + Skill + MCP engines
│   ├── permission/          # Tool permission pipeline (hard rules + security model)
│   ├── tool/                # Tool interface + registry
│   └── update/              # Self-update logic
└── pkg/                     # Public packages — reusable outside monika
    ├── engine/              # Engine interface, registry, ChatMessage types
    ├── openai/              # OpenAI-compatible SSE streaming client
    ├── modelsdev/           # models.dev catalog fetcher
    └── gitutil/             # Git helper utilities
```

## Engine Pattern

Every engine lives in `internal/engines/` and **must** follow the `pkg/engine.Engine` interface:

```go
type Engine interface {
    ID() string
    Init(ctx context.Context, cfg map[string]any) error
    Capabilities() []Capability   // "provider" | "skill" | "mcp"
    Shutdown(ctx context.Context) error
    NewInstance() Engine          // returns fresh zero-value instance
}
```

- Engines register themselves via `init()` calling `engine.Register()` — see `internal/engines/provider/openai/openai.go` for the canonical example
- `main.go` imports engines with `_` to trigger `init()` registration
- Provider engines additionally implement `engine.ProviderEngine` (adds `StreamChat`, `ListModels`)
- The bootstrap package (`internal/bootstrap/provider.go`) iterates config, calls `engine.EngineByID()`, then `NewInstance()` + `Init()` for each provider

## Tool Pattern

```go
type Tool interface {
    Name() string
    Description() string
    Parameters() map[string]any
    Execute(ctx context.Context, args json.RawMessage) (ExecutionResult, error)
}
```

- All builtin tools in `internal/tool/builtin/`, one file per tool
- `builtin/register.go` has composable registration functions: `RegisterDefaults`, `RegisterTasks`, `RegisterSpawnAgent`, `RegisterSkillTool`, `RegisterSkillManagement`, `RegisterMCPManagement`
- Tool lifecycle: created once in `main.go`, registered into `tool.ToolRegistry`, then registry passed to `AgentLoop`
- Tool names are snake_case and match what the system prompt describes

## Coding Conventions

### Go
- **Platform-specific files**: `*_windows.go` / `*_other.go` pattern (not build tags)
- **No generics** in the codebase; use interfaces and registry patterns
- **Error handling**: return errors up; log to stderr with `[monika]` prefix for non-fatal issues
- **Comments**: minimal — avoid docstrings, no multi-line comment blocks unless truly needed
- **Package naming**: short, lowercase, no underscores (except `builtin` which is a standard Go name)
- **Config structs** use both `yaml` and `json` struct tags (same field for both formats)
- **Test files**: follow `*_test.go` convention, colocated with source

### TypeScript / React
- **Single Zustand store** (`frontend/src/store/index.ts`) — all state in one file, use selectors to slice
- **Component structure**: one folder per component, PascalCase naming
- **Bindings**: auto-generated from Go types — run `wails3 generate bindings` after changing `internal/api/types.go`
- **Styling**: Tailwind CSS v4 utility classes
- **Panels**: `dockview` library for multi-panel layout; components registered in `App.tsx` components map

## Config System

- Config file: `~/.monika/config.yaml` (legacy) or `~/.monika/config.json` (new)
- Project-local overrides: `.monika/config.yaml` in project root
- Schema defined in `internal/config/config.go` (`Config` struct)
- Providers map keyed by provider ID (e.g. `deepseek`, `openai`), each with `base_url`, `api_key`, `wire_api` (which engine to use)
- Agents can be customized via `agents` array in config; custom agents are `IsCustom: true`, builtins have `Source: "builtin"`

## Agent System

- **Agent definitions**: hardcoded in `main.go` (the `agents` variable), can be overridden/extended via config
- **System prompt**: built in `internal/agent/system_prompt.go` as Go constants, combined at runtime
- **Agent loop**: in `internal/agent/agent_loop.go` — handles streaming, tool execution, compaction
- **Compaction**: when context exceeds limit, the agent summarizes older messages using a separate LLM call with `CompactionPrompt`
- **Multiple agents**: `internal/agent/runner.go` `TaskRunner` dispatches subtasks to child agents via semaphore (max 4 concurrent)
- **Session IDs**: parent sessions are UUIDs; child sessions prefixed `call_`, `sub_`, or `compact_`

## Key Cross-Cutting Concerns

- **Tool permissions**: `internal/permission/` implements a pipeline — hard rules (`hard_rule.go`) + security model (`security_model.go`). Every tool call goes through it before execution.
- **Wails API surface**: all Go → frontend communication goes through `internal/api/`. The `App` struct is registered as a Wails service. Events flow through `EventBus`.
- **File operations**: tools are scoped to `projectDir`; `internal/tool/context.go` provides `GetProjectDir` from context.
- **Session persistence**: JSON files per session, managed by `SessionManager` in `internal/api/session_manager.go`.
- **Git integration**: via `go-git/v5`, worktree-aware branch switching.
