# Input Command Support Design

**Date**: 2026-05-11
**Status**: Approved

## Overview

Chat input supports `$` and `/` prefix commands.

- `$` — execute shell command in project directory, display output in chat
- `/init` — send AI a prompt to analyze the project and create `agent.md`

Reference: `d:\git\opencode` command system.

## Backend: RunShellCommand API

New RPC method exposed to frontend via Wails bindings.

```go
// internal/api/app.go

func (a *App) RunShellCommand(projectPath, command string) (string, error)
```

- Reuses shell resolution from `internal/tool/builtin/bash.go` (pwsh/powershell/cmd on Windows, sh/bash on Unix)
- Project directory as working directory
- 120s timeout
- Returns merged stdout+stderr

## Frontend: Command Detection and Routing

File: `frontend/src/components/Chat/ChatInput.tsx`

### Detection logic

- Input starts with `$` → extract command after `$`, call `App.RunShellCommand()`, insert result as shell message
- Input starts with `/init` → replace with init prompt template, call `App.SendMessage()`
- Other inputs → existing flow unchanged

### `$` command flow

1. Parse `$command` from input, clear input
2. Add user message: `{ role: 'user', content: '$command' }`
3. Call `App.RunShellCommand(projectPath, command)`
4. Add shell message: `{ role: 'shell', content: '$ command\n<output>' }`

### `/init` flow

1. Replace `/init` with the init prompt template
2. Call normal `App.SendMessage(projectPath, sessionId, templateText, provider, model)`

### Init prompt template

```
Please analyze this project and create an `agent.md` file in the project root. The file should contain:

1. Build, test, and run commands specific to this project
2. Project structure overview (key directories and their purposes)
3. Coding conventions and patterns used
4. Framework and library specifics

First, explore the codebase to understand the project, then create the agent.md file with compact, actionable information. Every line should answer "would an agent likely miss this without help?"
```

## Message Type Extension

File: `frontend/src/store/index.ts`

Add `'shell'` to the `Message.role` union type.

Shell message rendering in `MessageBubble.tsx`: monospace font, terminal-style appearance, similar to Console component.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `$` with empty command | Falls through to normal message |
| Shell command fails | `role: 'shell'` with error output |
| Shell command times out | Backend returns timeout error |
| `/` not followed by `init` | Falls through to normal message |

## Files Changed

| File | Change |
|------|--------|
| `internal/api/app.go` | Add `RunShellCommand` method |
| `frontend/src/components/Chat/ChatInput.tsx` | Add `$` and `/init` detection and routing |
| `frontend/src/store/index.ts` | Add `'shell'` role to Message |
| `frontend/src/components/Chat/MessageBubble.tsx` | Add shell message rendering |
