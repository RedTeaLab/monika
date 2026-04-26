# AGENTS.md

## Repo Shape
- Single Go module (`go.mod`, module name `monika`), no go.work.
- Entry point: `main.go` at repo root — Wails v3 desktop application.
- `pkg/` — public packages (third parties can import):
  - `pkg/engine/` — Engine interfaces + registry, zero deps. The `database/sql/driver` equivalent.
  - `pkg/openai/` — OpenAI-compatible SSE streaming client, reusable by third-party providers.
- `internal/` — internal packages (not importable outside the module):
  - `internal/agent/` — agent loop, streaming event types, conversation management.
  - `internal/api/` — Wails frontend-backend contract: App service, EventBus, SessionManager, FileService.
  - `internal/bootstrap/` — provider initialization (shared between runtime and tests).
  - `internal/config/` — layered YAML config loader (global `~/.monika/` + project `.monika/`).
  - `internal/engines/provider/` — provider adapter base + per-vendor adapters (deepseek/, openai/).
  - `internal/engines/skill/` — Agent Skills standard SKILL.md loader.
  - `internal/engines/mcp/` — MCP stdio JSON-RPC transport.
  - `internal/tool/` — tool interface + builtin tools (file, grep, glob, bash).
- `frontend/` — React + TypeScript + Tailwind CSS + CodeMirror 6 desktop UI.
  - `src/components/` — TitleBar, SessionList, ChatArea, FileTree, Console, StatusBar.
  - `src/store/` — Zustand state management with Wails event listeners.
  - `bindings/` — Wails Go↔JS method bindings.
- `build/config.yml` — Wails v3 build configuration.
- Engine registration follows `database/sql` pattern: each engine calls `engine.Register()` in `init()`, binary triggers via blank imports in `main.go`.

## Product Direction
- Monika is an **agentic coding editor** — not a chat wrapper, not a file-oriented IDE.
- The editor gives the AI agent first-class access to code, files, and tools in a multi-panel desktop UI.
- Target: tool calling, multiple LLM providers, skills, MCP integration, and subagents.
- Core focus: agent orchestration — message flow, tool execution, context/state handling, safety boundaries, and provider-agnostic contracts.

## Architecture Direction
- Single Wails v3 desktop application — no CLI/REPL/TUI mode, no headless server.
- `pkg/engine` is the only package third parties need to import for building adapters.
- `pkg/openai` provides a reusable OpenAI-compatible streaming client.
- No go-plugin or gRPC — all engines are in-process, registered at startup.
- Third-party extensions go through MCP (external process). Third-party LLM providers fork + add import.

## Commands
- Run full verification: `go test ./...`
- Run a focused package: `go test ./internal/agent`, `go test ./internal/api`, etc.
- Run a single test: `go test ./path/to/package -run TestName`
- Format edited Go files: `gofmt -w <files>` before final verification.
- Run `go mod tidy` only when imports or dependencies change.
- Build: `go build .` (requires `cd frontend && npm run build` first).
- Dev mode: `wails3 dev` (auto-builds frontend + starts live reload).
- Build frontend: `cd frontend && npm run build`.

## Key Dependencies
- `github.com/wailsapp/wails/v3` — desktop app shell (WebView2 / WebKit).
- `gopkg.in/yaml.v3` — config file parsing.
- `encoding/json`, `os`, `os/exec`, `path/filepath` — stdlib only for engine implementations.

## Gotchas
- No go.work, no replace directives — single module, single `go.mod`.
- Each engine must call `engine.Register()` in `init()`.
- Blank imports in `main.go` trigger engine registration.
- `pkg/engine.Reset()` is only for tests to avoid registration conflicts.
- The internal `openai` adapter uses an import alias (`oaiclient`) to avoid name collision with `pkg/openai`.
- `//go:embed all:frontend/dist` in `main.go` requires frontend built before Go compilation.
- Wails v3 uses `app.Window.NewWithOptions()` for window creation (alpha API, may change).
- No README, CI workflow, task runner, or linter config is present; prefer executable Go sources over assumptions.
