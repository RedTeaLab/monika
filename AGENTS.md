# AGENTS.md

## Repo Shape
- Single Go module (`go.mod`, module name `monika`), no go.work.
- `pkg/` — public packages (third parties can import):
  - `pkg/engine/` — Engine interfaces + registry, zero deps. The `database/sql/driver` equivalent.
  - `pkg/openai/` — OpenAI-compatible SSE streaming client, reusable by third-party providers.
- `internal/` — internal packages (not importable outside the module):
  - `internal/agent/` — agent interface, streaming provider client, event aggregation
  - `internal/config/` — layered YAML config loader (global + project)
  - `internal/engines/provider/` — provider adapter base + per-vendor adapters (deepseek/, openai/)
  - `internal/engines/skill/` — Agent Skills standard SKILL.md loader
  - `internal/engines/mcp/` — MCP stdio JSON-RPC transport
- `cmd/monika/` — CLI entrypoint, cobra-based with `engines` subcommand.
- Engine registration follows `database/sql` pattern: each engine calls `engine.Register()` in `init()`, binary triggers via blank imports.

## Product Direction
- Monika's long-term goal is to become a general-purpose coding agent, not a single-provider chat wrapper.
- The target agent should support tool calling, multiple LLM providers, skills, MCP integration, and subagents.
- Keep the core focused on agent orchestration: message flow, tool execution, context/state handling, safety boundaries, and provider-agnostic contracts.

## Architecture Direction
- Build toward the intended final architecture from the start. Do not choose temporary protocols, throwaway abstractions, or "optimize later" paths when the target shape is already known.
- Do not bake vendor-specific request or response shapes into the agent layer.
- `pkg/engine` is the only package third parties need to import for building adapters.
- `pkg/openai` provides a reusable OpenAI-compatible streaming client for anyone building on the OpenAI protocol.
- No go-plugin or gRPC — all engines are in-process, registered at startup.
- Third-party extensions go through MCP (external process). Third-party LLM providers fork + add import.

## Commands
- Run full verification from repo root: `go test ./...`
- Run a focused package: `go test ./internal/agent`, `go test ./pkg/engine`, etc.
- Run a single test: `go test ./path/to/package -run TestName`
- Format edited Go files: `gofmt -w <files>` before final verification.
- Run `go mod tidy` only when imports or dependencies change.
- Build the CLI: `go build ./cmd/monika`

## Key Dependencies
- `github.com/spf13/cobra` — CLI framework
- `gopkg.in/yaml.v3` — config file parsing (config + skill engine)
- `encoding/json`, `os`, `os/exec`, `path/filepath` — stdlib only for engine implementations

## Gotchas
- No go.work, no replace directives — single module, single `go.mod`.
- Each engine must call `engine.Register()` in `init()`.
- The `engines` CLI subcommand lists all registered engines; blank imports in `main.go` trigger registration.
- `pkg/engine.Reset()` is only for tests to avoid registration conflicts.
- The internal `openai` adapter uses an import alias (`oaiclient`) to avoid name collision with `pkg/openai`.
- No README, CI workflow, task runner, or linter config is present; prefer executable Go sources over assumptions.
