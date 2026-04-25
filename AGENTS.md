# AGENTS.md

## Repo Shape
- Single Go module: `monika`, declared in `go.mod` with Go `1.25.5`.
- Main entrypoint is `cmd/monika/main.go`; reusable code is under `internal/agents` and `internal/provider`.
- Provider implementations self-register through `init()` into `provider.Providers`; `provider.NewProvider` panics if the selected provider was not registered.

## Product Direction
- Monika's long-term goal is to become a general-purpose coding agent, not a single-provider chat wrapper.
- The target agent should support tool calling, multiple LLM providers, skills, MCP integration, and subagents.
- Keep the core focused on agent orchestration: message flow, tool execution, context/state handling, safety boundaries, and provider-agnostic contracts.

## Architecture Direction
- Build toward the intended final architecture from the start. Do not choose temporary protocols, throwaway abstractions, or "optimize later" paths when the target shape is already known.
- Do not bake vendor-specific request or response shapes into the agent layer.

## Commands
- Run full verification with `go test ./...`; there are currently no test files, so this is mostly compile/package verification.
- Run a focused package check with `go test ./internal/provider`, `go test ./internal/agents`, or `go test ./cmd/monika`.
- Run a single Go test, once tests exist, with `go test ./path/to/package -run TestName`.
- Format edited Go files with `gofmt -w <files>` before final verification.
- Run `go mod tidy` only when imports or dependencies change.

## Gotchas
- Do not use `go run ./cmd/monika` as a routine smoke test: `main.go` sends a real DeepSeek chat-completions request.
- `cmd/monika/main.go` currently contains API credentials inline; do not copy them into docs, logs, commits, or final responses.
- No README, CI workflow, task runner, linter config, or existing repo instruction file was present when this file was created; prefer executable Go sources over assumptions.
