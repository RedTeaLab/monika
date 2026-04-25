# AGENTS.md

## Repo Shape
- Single Go module: `monika`, declared in `go.mod` with Go `1.25.5`.
- Main entrypoint is `cmd/monika/main.go`; reusable code is under `internal/agents` and `internal/provider`.
- Provider implementations self-register through `init()` into `provider.Providers`; `provider.NewProvider` panics if the selected provider was not registered.

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
