# Interactive Mode & Session Design

## Overview

Add two execution modes to monika:

- **Interactive mode** (`monika`) — REPL with multi-turn conversation and session persistence
- **Headless mode** (`monika chat <message>`) — unchanged, one-shot send and exit

## Command Structure

```
monika                          → interactive mode (new session)
monika --continue               → interactive mode (resume last session)
monika --session <id>           → interactive mode (resume specific session)
monika chat <message>           → headless mode (unchanged)
monika engines                  → list engines (unchanged)
```

`rootCmd` gains `RunE` as the interactive entry point. `--continue` and `--session` are mutually exclusive flags on the root command. `chat` subcommand is untouched.

## New Files

```
cmd/monika/
  main.go          — unchanged
  root.go          — add --continue/--session flags, add RunE entry
  chat.go          — unchanged (headless mode)
  repl.go          — new: interactive REPL loop
internal/session/
  session.go       — new: Session struct + persistence logic
```

## Session Package (`internal/session`)

### Data Model

```go
type Session struct {
    ID         string
    Title      string
    ProjectDir string
    Messages   []engine.ChatMessage
    Model      string
    Provider   string
    CreatedAt  time.Time
    UpdatedAt  time.Time
}
```

### Storage Path

```
~/.monika/projects/<slug>/sessions/<session-id>.json
```

The slug is derived from the project's absolute path: lowercase, replace path separators with `-`, trim colons and leading dashes.

| Absolute Path | Slug |
|---|---|
| `D:\git\monika` | `d-git-monika` |
| `/home/user/projects/myapp` | `home-user-projects-myapp` |

Session IDs are UUID v4. Titles are the first 40 characters of the user's first message.

### Core Operations

| Function | Purpose |
|---|---|
| `New(projectDir string) *Session` | Create session, generate ID, set timestamps |
| `Load(path string) (*Session, error)` | Deserialize from JSON file |
| `Save(s *Session) error` | Serialize to disk, update UpdatedAt |
| `List(projectDir string) ([]SessionMeta, error)` | List sessions for project (lightweight metadata only, no Messages) |
| `Latest(projectDir string) (*Session, error)` | Find most recently updated session for project |
| `Dir(home, projectDir string) string` | Compute storage directory path |

`List` and `Latest` return `SessionMeta` (ID, Title, UpdatedAt only) to avoid loading full message history.

## REPL (`cmd/monika/repl.go`)

### Library

Use `github.com/c-bata/go-prompt` for the REPL — lightweight, supports up/down arrow history, Tab completion, multi-line input.

### Flow

```
REPL start
  │
  ├─ Show prompt: "> "
  │
  ├─ Read user input (up/down arrow history)
  │    │
  │    ├─ Empty input → ignore, continue
  │    ├─ /exit       → save session, print title and ID, exit
  │    ├─ /help       → print available commands, continue
  │    ├─ /clear      → clear session.Messages, continue
  │    ├─ /compact    → placeholder, print notice, continue
  │    └─ Normal text → loop.Run(ctx, session.Conv, input)
  │                     print assistant reply
  │                     session.Save()
  │                     continue
  │
  ├─ Ctrl+C → captured, do not exit (allows copy/paste)
  └─ Ctrl+D → exit (same as /exit)
```

### Streaming Output

Version 1 waits for the full response before printing. Streaming token-by-token output via a callback option (`WithOnToken`) is deferred to a future iteration.

## Integration with Agent Loop

`agent.Conversation.Messages` is `[]engine.ChatMessage`, same type as `Session.Messages`. No conversion needed.

```
REPL start:
  session.Messages → agent.Conversation{Messages: session.Messages}

Each turn:
  loop.Run(ctx, conv, userInput)
  result.Conversation.Messages → session.Messages
  session.Save()
```

The system prompt is NOT stored in the session. It is reloaded from `AGENTS.md` at each REPL startup via the existing `loadSystemPrompt()` logic, ensuring it always reflects the latest file contents.

### Shared Provider Initialization

Extract the provider init logic from `chat.go` into a shared function `initProvider(ctx, cfg, modelOverride)` returning `(engine.ProviderEngine, string)`. Both `repl.go` and `chat.go` call it.

## Error Handling

| Scenario | Behavior |
|---|---|
| Session file corrupted / JSON parse error | Print warning, create new session, do not block |
| Session directory does not exist | Auto-create via `os.MkdirAll` on first `Save()` |
| `--continue` with no previous session | Print "No previous session found", create new session |
| `--session <id>` not found | Print error and exit |
| Provider init failure | Print error and exit (same as chat) |
| Single-turn LLM error | Print error, do not exit REPL, user can continue |
| `Save()` failure | Print warning, do not block conversation |

## Testing

- `internal/session/` — file IO tests using `t.TempDir()`: create, load, save, list, find latest
- `cmd/monika/repl.go` — slash command parsing extracted into testable functions
- `TestRootNoArgs` — verify `monika` without args does not error
- `TestContinueFlag` — verify `--continue` flag registration
- `TestSessionFlag` — verify `--session` flag registration

## Unchanged

- `agent` package — no changes (streaming callback deferred)
- `chat.go` headless mode — no changes
- `pkg/` public packages — no changes
