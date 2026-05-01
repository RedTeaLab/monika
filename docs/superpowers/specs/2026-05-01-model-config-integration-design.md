# Model Config Integration

## Summary

Unify model configuration so the model dropdown, default model selection, and message sending all read from a single source: `~/.monika/config.yaml`. Currently three separate sources exist (hardcoded provider lists, config default, frontend state) and they conflict — the config default overrides the user's dropdown selection when sending.

## Current Problems

1. `ListModels()` is hardcoded per provider — ignores config entirely
2. `SendMessage` appends `a.loopOpts` (which includes `WithModel(cfg.Model)`) AFTER the frontend's `WithModel(model)`, so config always wins and the dropdown selection is ignored
3. `doSwitchProject` in TitleBar never calls `loadModels()`, leaving `selectedModel` empty after project switch

## Design

### Config Format

Add `models` to each provider entry:

```yaml
# ~/.monika/config.yaml
model_provider: openai
model: gpt-4o

model_providers:
  openai:
    name: openai
    base_url: https://api.openai.com/v1
    api_key: sk-xxx
    models:
      - id: gpt-4o
        name: GPT-4o
      - id: gpt-4o-mini
        name: GPT-4o Mini
```

### Data Flow (After)

```
config.yaml
─────────────────
model_providers.xxx.models  →  Provider.Init(cfg)  →  ListModels() reads p.config
                                                        ↓
                                                  下拉列表渲染

model: "gpt-4o"             →  initProject/doSwitchProject
                                ↓
                               loadModels(): 选中 cfg.model 对应的项
                               如果不在列表里 → 回退到 models[0]

SendMessage(selectedModel)  →  WithModel(model) 放在 opts 最后
                                确保覆盖 loopOpts 中的默认值
```

### Default Model Fallback

When `cfg.model` is not in the provider's model list (e.g., user switched providers):

1. `loadModels()` checks if `selectedModel` exists in the new model list
2. If not, silently falls back to `models[0].ID` (first model in the provider's list)

Frontend store already has this logic in `loadModels()`:
```typescript
const valid = state.selectedModel && models.some((m) => m.ID === state.selectedModel)
set({
    availableModels: models,
    selectedModel: valid ? state.selectedModel : (models.length > 0 ? models[0].ID : ''),
});
```

## Changes

| Layer | File | Change |
|-------|------|--------|
| Config | `internal/config/config.go` | Add `Models []ModelEntry` to `ProviderConfig`; add `ModelEntry{ID, DisplayName}` struct |
| Bootstrap | `internal/bootstrap/provider.go` | Pass `models` to provider `Init()`; include default models in `setupConfig()` |
| Provider | `openai/openai.go` | `ListModels()` reads from `p.config["models"]`, falls back to hardcoded list |
| Provider | `deepseek/deepseek.go` | Same as above |
| API | `internal/api/app.go` | Fix `SendMessage` option ordering: put `WithModel(model)` last so it overrides config default |
| Engine | `pkg/engine/engine.go` | Add `ID`/`DisplayName` fields to `Model` struct (already exists, verify) |
| Frontend | `components/TitleBar/TitleBar.tsx` | Add `loadModels()` to `doSwitchProject` (already done) |

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Provider has no `models` in config | Fall back to provider's hardcoded default list |
| `cfg.model` not in provider's model list | Fall back to first model in list |
| `models` list is empty | Dropdown shows "No models", send uses provider's hardcoded default |
| User edits config.yaml while app is running | Needs project reload to pick up changes |
| First-time setup (no config.yaml) | `setupConfig` writes default models based on chosen provider |
