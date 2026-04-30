# Model Selector in Chat Input Toolbar

## Summary

Add a model selection dropdown in a transparent toolbar below the chat input, allowing users to switch models per message within the current provider. Models are fetched at startup and cached; no per-message latency for opening the dropdown.

## Scope

- Model selector dropdown in a new transparent toolbar below the textarea
- Per-message model selection (change before each send)
- Show only models from the currently configured provider
- Toolbar designed for future extension (additional tool buttons)

## Architecture

### Data Flow

```
Startup:
  initProject() → App.GetModels() → provider.ListModels() → store.availableModels

Send:
  user types + selected model → App.SendMessage(path, session, text, model)
    → agent2.WithModel(model) → provider.StreamChat(ChatRequest{Model: model, ...})
```

### Go Backend

**New API** (`internal/api/app.go`):

```go
func (a *App) GetModels() ([]engine.Model, error) {
    return a.provider.ListModels(a.ctx)
}
```

**Modified API** — `SendMessage` signature: `(projectPath, sessionID, text, model string)`.
Replaces the hardcoded `WithModel(a.model)` with `WithModel(model)` from the parameter.
The `WithModel` option already exists in agent loop, no changes needed there.

**`handleAgentEvent`** — must pass the per-message model instead of `a.model` (line 305).
The model is already available in the agent loop via `WithModel(model)`; events carry it implicitly.
Change `handleAgentEvent` to accept a `model` parameter: `func (a *App) handleAgentEvent(sessionID, model string, ev agent2.Event)`.
Set `se.Model = model` instead of `se.Model = a.model`.

**`NewSession`** — currently uses `a.model` to stamp sessions with the config model.
Add a `model` parameter so the frontend can pass `selectedModel` when creating sessions.

### Frontend Bindings

`frontend/bindings/monika/index.ts`:

- **New**: `GetModels() → Promise<{ID: string, DisplayName: string}[]>`
- **Modified**: `SendMessage` adds `model` parameter at the end

### Frontend Store

New fields in `AppState`:

| Field | Type | Purpose |
|---|---|---|
| `availableModels` | `Model[]` | Cached model list from provider |
| `selectedModel` | `string` | Currently selected model ID |

New action: `loadModels()` — calls `App.GetModels()`, stores result in `availableModels`, sets `selectedModel` to config default if empty.

### Component Tree

```
ChatArea
├── TabBar
├── message list
├── ChatInput              (textarea, unchanged)
└── ChatInputToolbar       (new, transparent background)
    └── ModelSelector      (<select> dropdown, left-aligned)
```

**ChatInputToolbar** — a flex row below the textarea with `background: transparent` and `padding: 6px 10px`. ModelSelector is left-aligned; empty space to the right reserved for future tool buttons.

**ModelSelector** — reads `availableModels` and `selectedModel` from store. On change, updates `selectedModel`.

**ChatArea.handleSend** — reads `selectedModel` from store, passes it to `App.SendMessage`.

### Default Model Strategy

1. `GetModels()` returns the model list (`[]engine.Model`), sourced from `provider.ListModels()`
2. On project load, `loadModels()` calls `GetModels()` and sets `selectedModel` from the config's `model` field (read via `App.GetCurrentProject()` or similar)
3. If config doesn't specify a model, default to the first model in the list
4. User's last selection persists in store for the session lifetime

## Edge Cases

| Scenario | Behavior |
|---|---|
| Models loading (async fetch pending) | Dropdown disabled, shows "Loading models..." placeholder |
| `ListModels` API fails | Dropdown shows "No models" placeholder; previous selection preserved |
| Only one model available | Dropdown shows single option, still functional |
| No model selected on send | Default to first available model |
| Provider has no models | Dropdown disabled, tooltip "No models available" |

## Files Changed

| File | Change |
|---|---|
| `internal/api/app.go` | Add `GetModels`, modify `SendMessage`/`handleAgentEvent`/`NewSession` signatures |
| `frontend/bindings/monika/index.ts` | Add `GetModels` binding, update `SendMessage` |
| `frontend/src/store/index.ts` | Add `availableModels`, `selectedModel`, `loadModels` |
| `frontend/src/components/Chat/ChatArea.tsx` | Pass model in `handleSend` |
| `frontend/src/components/Chat/ChatInputToolbar.tsx` | **New** — toolbar + model dropdown |
