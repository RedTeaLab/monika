# Model Config Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify model configuration so the dropdown list, default selection, and message sending all derive from `config.yaml`.

**Architecture:** Add a `models` list to each provider entry in `config.yaml`. Providers read this list in `ListModels()` instead of hardcoding. Default model comes from the top-level `model` field. `SendMessage` ensures the frontend-selected model overrides the config default by applying it last in the option chain.

**Tech Stack:** Go (config, provider, API), TypeScript (frontend store — no changes needed beyond existing fix)

---

### Task 1: Add Models field to config structs

**Files:**
- Modify: `internal/config/config.go:26-31` (ProviderConfig struct)
- Modify: `internal/config/config.go:86-127` (merge function)

- [ ] **Step 1: Add ModelEntry struct and Models field to ProviderConfig**

In `internal/config/config.go`, after the `ProviderConfig` struct (line 26-31), add:

```go
type ModelEntry struct {
    ID          string `yaml:"id"`
    DisplayName string `yaml:"name"`
}

type ProviderConfig struct {
    Name    string       `yaml:"name"`
    BaseURL string       `yaml:"base_url"`
    APIKey  string       `yaml:"api_key"`
    WireAPI string       `yaml:"wire_api"`
    Models  []ModelEntry `yaml:"models"`
}
```

- [ ] **Step 2: Update merge logic for Models field**

In the `merge` function, inside the `if len(src.ModelProviders) > 0` block, add Models merging after the WireAPI merge (after line 114):

```go
if len(provider.Models) > 0 {
    current.Models = provider.Models
}
```

This goes right before `dst.ModelProviders[key] = current` at line 115.

- [ ] **Step 3: Verify compilation**

```bash
cd d:/git/monika && go build ./internal/config/...
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add internal/config/config.go
git commit -m "feat: add Models field to ProviderConfig"
```

---

### Task 2: Pass models to provider Init and update setupConfig

**Files:**
- Modify: `internal/bootstrap/provider.go:47-53` (Init call)
- Modify: `internal/bootstrap/provider.go:71-86` (providerDefaults, writeConfig structs)
- Modify: `internal/bootstrap/provider.go:147-164` (setupConfig config assembly)

- [ ] **Step 1: Add default models map**

In `internal/bootstrap/provider.go`, replace `providerDefaults` (lines 71-74) with a richer structure:

```go
var providerDefaults = map[string]struct {
    baseURL, model string
    models         []config.ModelEntry
}{
    "deepseek": {
        "https://api.deepseek.com",
        "deepseek-chat",
        []config.ModelEntry{
            {ID: "deepseek-chat", DisplayName: "DeepSeek Chat"},
            {ID: "deepseek-reasoner", DisplayName: "DeepSeek Reasoner"},
        },
    },
    "openai": {
        "https://api.openai.com/v1",
        "gpt-4o",
        []config.ModelEntry{
            {ID: "gpt-4o", DisplayName: "GPT-4o"},
            {ID: "gpt-4o-mini", DisplayName: "GPT-4o Mini"},
        },
    },
}
```

- [ ] **Step 2: Pass models to provider Init**

In `InitProvider`, update the init config map (lines 47-50):

```go
initCfg := map[string]any{
    "base_url": providerCfg.BaseURL,
    "api_key":  providerCfg.APIKey,
    "models":   providerCfg.Models,
}
```

- [ ] **Step 3: Update writeConfig structs for setupConfig**

Replace `providerItem` (lines 82-86) with:

```go
type providerItem struct {
    Name    string             `yaml:"name"`
    BaseURL string             `yaml:"base_url"`
    APIKey  string             `yaml:"api_key"`
    Models  []config.ModelEntry `yaml:"models"`
}
```

- [ ] **Step 4: Write default models in setupConfig**

In `setupConfig()`, update the config assembly (lines 154-164). After getting `model` from user input, build the provider item with default models:

```go
defModels := []config.ModelEntry{}
if d, ok := providerDefaults[providerName]; ok {
    defModels = d.models
}

cfg := writeConfig{
    ModelProvider: providerName,
    Model:         model,
    ModelProviders: map[string]providerItem{
        providerName: {
            Name:    providerName,
            BaseURL: baseURL,
            APIKey:  apiKey,
            Models:  defModels,
        },
    },
}
```

- [ ] **Step 5: Verify compilation**

```bash
cd d:/git/monika && go build ./...
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add internal/bootstrap/provider.go
git commit -m "feat: pass models from config to provider Init, include defaults in setupConfig"
```

---

### Task 3: OpenAI provider reads models from config

**Files:**
- Modify: `internal/engines/provider/openai/openai.go:41-46` (ListModels)

- [ ] **Step 1: Read models from config in ListModels**

Replace the hardcoded `ListModels`:

```go
func (p *OpenAIProvider) ListModels(ctx context.Context) ([]engine.Model, error) {
    if p.config != nil {
        if raw, ok := p.config["models"]; ok {
            entries, ok := raw.([]config.ModelEntry)
            if ok && len(entries) > 0 {
                models := make([]engine.Model, len(entries))
                for i, e := range entries {
                    models[i] = engine.Model{ID: e.ID, DisplayName: e.DisplayName}
                }
                return models, nil
            }
        }
    }
    // Fallback for backward compatibility
    return []engine.Model{
        {ID: "gpt-4o", DisplayName: "GPT-4o"},
        {ID: "gpt-4o-mini", DisplayName: "GPT-4o Mini"},
    }, nil
}
```

Note: Add `"monika/internal/config"` to imports.

- [ ] **Step 2: Verify compilation**

```bash
cd d:/git/monika && go build ./internal/engines/provider/openai/...
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add internal/engines/provider/openai/openai.go
git commit -m "feat: openai provider reads models from config"
```

---

### Task 4: DeepSeek provider reads models from config

**Files:**
- Modify: `internal/engines/provider/deepseek/deepseek.go:42-47` (ListModels)

- [ ] **Step 1: Read models from config in ListModels**

Replace the hardcoded `ListModels`:

```go
func (p *DeepSeekProvider) ListModels(ctx context.Context) ([]engine.Model, error) {
    if p.config != nil {
        if raw, ok := p.config["models"]; ok {
            entries, ok := raw.([]config.ModelEntry)
            if ok && len(entries) > 0 {
                models := make([]engine.Model, len(entries))
                for i, e := range entries {
                    models[i] = engine.Model{ID: e.ID, DisplayName: e.DisplayName}
                }
                return models, nil
            }
        }
    }
    // Fallback for backward compatibility
    return []engine.Model{
        {ID: "deepseek-chat", DisplayName: "DeepSeek Chat"},
        {ID: "deepseek-reasoner", DisplayName: "DeepSeek Reasoner"},
    }, nil
}
```

Note: Add `"monika/internal/config"` to imports.

- [ ] **Step 2: Verify compilation**

```bash
cd d:/git/monika && go build ./internal/engines/provider/deepseek/...
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add internal/engines/provider/deepseek/deepseek.go
git commit -m "feat: deepseek provider reads models from config"
```

---

### Task 5: Fix SendMessage to respect frontend model selection

**Files:**
- Modify: `internal/api/app.go:252-255` (option ordering)

- [ ] **Step 1: Move WithModel to end of opts so it overrides config default**

Replace lines 252-255:

```go
opts := append([]agent2.LoopOption{
    agent2.WithModel(model),
    agent2.WithProjectDir(projectPath),
}, a.loopOpts...)
```

With:

```go
opts := append([]agent2.LoopOption{
    agent2.WithProjectDir(projectPath),
}, a.loopOpts...)
opts = append(opts, agent2.WithModel(model))
```

This ensures `WithModel(model)` (frontend selection) is applied last and overrides `WithModel(cfg.Model)` from `a.loopOpts`.

- [ ] **Step 2: Verify compilation**

```bash
cd d:/git/monika && go build ./...
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add internal/api/app.go
git commit -m "fix: frontend model selection overrides config default in SendMessage"
```

---

### Task 6: Verify full build and manual test

**Files:** None (verification only)

- [ ] **Step 1: Full Go build**

```bash
cd d:/git/monika && go build ./...
```

Expected: no errors.

- [ ] **Step 2: Frontend TypeScript check**

```bash
cd d:/git/monika/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual test checklist**

1. Start the app, open a project
2. Verify model dropdown shows models from your `config.yaml`
3. Select a model, send a message — verify the correct model is used (check logs or API call)
4. Switch models, send another message — verify the new model is used
5. Edit `config.yaml` to change `model` field, restart app — verify new default is selected
6. Edit `config.yaml` to add/remove models, restart app — verify dropdown updates
