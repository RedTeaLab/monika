# Provider Selector Design

Add a combined provider+model picker (ModelPicker) as a popover, replacing the single `<select>` in ChatInputToolbar. Supports switching between all configured LLM providers and models at runtime.

## Motivation

Currently only one provider engine is initialized at startup (`model_provider` in config). Users must edit `config.yaml` and restart to switch providers. Models from all configured providers should be available without restart.

## Design Decisions

- **Provider source**: YAML `model_providers` map (only providers with API keys configured)
- **On switch**: auto-select first model of the new provider
- **Persistence**: write `model_provider` + `model` back to `~/.monika/config.yaml` on every selection
- **UI pattern**: single combined popover (OpenCode-style), not two separate dropdowns

## Architecture

```
Before:  App.provider ProviderEngine (single)
After:   App.providers map[string]ProviderEngine (all configured)
```

Startup initializes all providers in `cfg.ModelProviders`, skipping any that fail.

### Backend Changes

| File | Change |
|------|--------|
| `internal/bootstrap/provider.go` | `InitProvider()` returns `map[string]ProviderEngine` |
| `internal/api/app.go` | `providers` map field; new `GetProviders()`; `GetModels(providerID)`; `PersistSelection(providerID, modelID)`; `SendMessage(..., providerID)` |
| `internal/agent/system_prompt.go` | `WithProvider()` loop option, set `ChatRequest.Provider` |
| `pkg/engine/provider.go` | `ChatRequest.Provider` already exists, no change needed |

### Frontend Changes

| File | Change |
|------|--------|
| `src/store/index.ts` | Add `availableProviders: {ID, DisplayName}[]`, `selectedProvider`, `modelsByProvider: Record<string, ModelInfo[]>`, `loadProviders()`, `setSelectedProvider()`. Remove flat `availableModels` — derive from `modelsByProvider[selectedProvider]` |
| `src/components/Chat/ModelPicker.tsx` | **New** — popover with grouped provider+model list, search, keyboard nav |
| `src/components/Chat/ChatInputToolbar.tsx` | Replace `<select>` with `<ModelPicker>` |

## ModelPicker Component

### Trigger Button

Shows provider abbreviation + model name + chevron. Fixed 24px height, 11px font.

### Popover

- Placement: top-start, 4px gap
- Width: 260px, max-height: 280px
- Portal to `document.body` (z-1000)

### Sections

1. Search input (autofocus on open, filters by model name + provider name)
2. Provider group headers (hidden when single provider)
3. Model rows: display name left, model ID right, checkmark on selected
4. Selected row highlighted with accent background

### Interactions

- Click trigger → open popover
- Click model row → set provider + model → close popover → persist
- Escape → close
- Click outside → close
- Arrow keys → navigate rows, Enter → select highlighted
- Type in search → real-time filter

### Edge Cases

- No providers configured: trigger shows "No providers", disabled
- Single provider: no group header
- Provider with zero models: skipped entirely
- Selected model not in new provider: auto-select first model
- Config write fails: console warn, in-memory selection unaffected

## API Types

**GetProviders()** returns `[]ProviderInfo`:
```go
type ProviderInfo struct {
    ID          string `json:"id"`
    DisplayName string `json:"display_name"`
}
```
`ID` is the map key from `model_providers` (e.g. `"deepseek"`). `DisplayName` from `ProviderConfig.Name`, falling back to `ID`.

**GetModels(providerID string)** returns `[]engine.Model` as before, scoped to one provider.

**PersistSelection(providerID, modelID string)** writes updated config to `~/.monika/config.yaml`. No-op if the file cannot be written (logs warning).

**SendMessage(projectPath, sessionID, text, providerID, modelID string)** — adds `providerID` parameter before `modelID`.

## Data Flow

```
initProject()
  → App.GetCurrentProject()
  → loadProviders() → App.GetProviders() → ["deepseek", "openai"]
  → loadModels(selectedProvider) → App.GetModels(providerID)
  → auto-select: cfg.model if valid, else first model

User picks model:
  → setSelectedProvider(id) + setSelectedModel(id)
  → App.PersistSelection(providerID, modelID)  // writes config.yaml

SendMessage:
  → App.SendMessage(projectPath, sessionID, text, providerID, modelID)
  → agent loop uses provider + model in ChatRequest
```

## Persistence

`App.PersistSelection(providerID, modelID)` updates `cfg.ModelProvider` and `cfg.Model`, then writes `~/.monika/config.yaml` via `config.Load` + merge + yaml marshal + write file.

On failure: log warning, selection stays valid for current session.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `model_providers` empty | `GetProviders()` returns `[]`, trigger disabled |
| Provider init fails | Skip provider, log error, continue with others |
| `ListModels` returns empty | Provider excluded from picker |
| Model list load fails | Provider group shows "Failed to load" |
| Config write fails | Console warning, ephemeral selection |

## Testing

- `go test ./internal/config`: extend for multi-provider loading
- `go test ./internal/bootstrap`: test multi-engine init and single-engine failure
- `go test ./internal/api`: test GetProviders, GetModels(providerID), SendMessage with provider
- `cd frontend && npx tsc --noEmit`: type safety
- Manual: `wails3 dev` → switch provider → verify model list → send message → restart → verify persistence
