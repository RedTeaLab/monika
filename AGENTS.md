# AGENTS.md

## Repo Shape
- Go workspace (`go.work`) with five modules:
  - `engine/` — interfaces + registry, zero deps (module: `monika/engine`)
  - `core/` — agent loop, config, tools, CLI (module: `monika`)
  - `engines/provider/` — multi-backend LLM provider (module: `monika/engines/provider`)
  - `engines/skill/` — Agent Skills standard loader (module: `monika/engines/skill`)
  - `engines/mcp/` — MCP stdio transport (module: `monika/engines/mcp`)
- CLI entrypoint is `core/cmd/monika/main.go`, a cobra CLI with `engines` subcommand.
- Core internal packages:
  - `core/internal/agent/` — agent interface, streaming provider client, event aggregation
  - `core/internal/config/` — layered YAML config loader (global + project)
- Engine packages use `database/sql`-style `init()` registration via `engine.Register()`.

## Product Direction
- Monika's long-term goal is to become a general-purpose coding agent, not a single-provider chat wrapper.
- The target agent should support tool calling, multiple LLM providers, skills, MCP integration, and subagents.
- Keep the core focused on agent orchestration: message flow, tool execution, context/state handling, safety boundaries, and provider-agnostic contracts.

## Architecture Direction
- Build toward the intended final architecture from the start. Do not choose temporary protocols, throwaway abstractions, or "optimize later" paths when the target shape is already known.
- Do not bake vendor-specific request or response shapes into the agent layer.
- Engine registration follows `database/sql` pattern: each engine module calls `engine.Register()` in `init()`, and the binary imports them via blank imports (`_ "monika/engines/..."`).
- No go-plugin or gRPC — all engines are in-process, registered at startup.

## Commands
- Run full verification: test each module from its directory with `go test ./...`.
  - `cd engine && go test ./...`
  - `cd core && go test ./...`
  - `cd engines/provider && go test ./...`
  - `cd engines/skill && go test ./...`
  - `cd engines/mcp && go test ./...`
- Run a focused package check: `go test ./internal/agent`, `go test ./internal/config`, `go test ./cmd/monika`.
- Run a single test: `go test ./path/to/package -run TestName`.
- Format edited Go files: `gofmt -w <files>` before final verification.
- Run `go mod tidy` only when imports or dependencies change.
- Build the CLI: `go build ./core/cmd/monika` from workspace root, or `go build ./cmd/monika` from `core/`.

## Key Dependencies
- `github.com/spf13/cobra` — CLI framework
- `gopkg.in/yaml.v3` — config file parsing (core + skill engine)
- `encoding/json`, `os`, `os/exec`, `path/filepath` — stdlib only for engine implementations

## Gotchas
- `go.work` resolves local modules — no need to publish the `engine` module.
- `core/go.mod` uses `replace` directives for `monika/engine` and `monika/engines/*` during development.
- Run `go work sync` after adding new modules to the workspace.
- Each engine module must call `engine.Register()` in `init()`.
- The `engines` CLI subcommand lists all registered engines; blank imports in `main.go` trigger registration.
- No README, CI workflow, task runner, or linter config is present; prefer executable Go sources over assumptions.
