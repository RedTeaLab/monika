# AGENTS.md

## Repo Shape
- Single Go module: `monika`, declared in `go.mod` with Go `1.25.5`.
- Main entrypoint is `cmd/monika/main.go`, a cobra CLI with `provider` subcommands.
- Reusable code under `internal/`:
  - `internal/agent/` — agent interface, streaming provider client, event aggregation
  - `internal/config/` — layered YAML config loader (global + project)
  - `internal/plugin/host/` — go-plugin host skeleton (handshake, lifecycle)
  - `internal/plugin/registry/` — JSON-based plugin registry (install tracking)
  - `internal/provider/install/` — provider install planning utilities
- Generated protobuf/gRPC code lives in `gen/provider/v1/`, source in `proto/provider/v1/`.
- External providers are managed via HashiCorp go-plugin and communicate over gRPC with the protocol defined in `proto/provider/v1/provider.proto`.

## Product Direction
- Monika's long-term goal is to become a general-purpose coding agent, not a single-provider chat wrapper.
- The target agent should support tool calling, multiple LLM providers, skills, MCP integration, and subagents.
- Keep the core focused on agent orchestration: message flow, tool execution, context/state handling, safety boundaries, and provider-agnostic contracts.

## Architecture Direction
- Build toward the intended final architecture from the start. Do not choose temporary protocols, throwaway abstractions, or "optimize later" paths when the target shape is already known.
- Do not bake vendor-specific request or response shapes into the agent layer.
- Provider plugins are external binaries (go-plugin), not in-process registrations.

## Commands
- Run full verification with `go test ./...`.
- Run a focused package check with `go test ./internal/agent`, `go test ./internal/config`, `go test ./internal/plugin/host`, `go test ./internal/plugin/registry`, `go test ./internal/provider/install`, or `go test ./cmd/monika`.
- Run a single Go test with `go test ./path/to/package -run TestName`.
- Format edited Go files with `gofmt -w <files>` before final verification.
- Regenerate protobuf code with:
  ```
  protoc --go_out=. --go_opt=module=monika --go-grpc_out=. --go-grpc_opt=module=monika proto/provider/v1/provider.proto
  ```
- Run `go mod tidy` only when imports or dependencies change.
- Run `go build ./cmd/monika` to verify the CLI binary compiles (safe, no real API calls).

## Key Dependencies
- `github.com/spf13/cobra` — CLI framework
- `github.com/hashicorp/go-plugin` — external plugin host/protocol
- `google.golang.org/grpc` / `google.golang.org/protobuf` — provider plugin protocol
- `gopkg.in/yaml.v3` — config file parsing
- `encoding/json`, `os`, `path/filepath` — registry persistence (stdlib)

## Gotchas
- `go run ./cmd/monika` is safe — it no longer sends real API requests; it prints cobra help.
- The proto `go_package` is `monika/gen/provider/v1;providerv1`; generated files land in `gen/provider/v1/`.
- Provider plugin binaries are not yet built or installed automatically — the `install` command only registers entries in `~/.monika/providers.json`.
- No README, CI workflow, task runner, or linter config is present; prefer executable Go sources over assumptions.
