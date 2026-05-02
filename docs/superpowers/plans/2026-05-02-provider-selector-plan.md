# Provider Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single-model `<select>` with a combined provider+model popover picker, supporting runtime provider switching across all configured LLM backends.

**Architecture:** Bootstrap initializes all providers from `cfg.ModelProviders` into `map[string]ProviderEngine`. App exposes `GetProviders()`, `GetModels(providerID)`, `PersistSelection()`, and `SendMessage(..., providerID)`. Frontend ModelPicker popover groups models by provider with search and keyboard navigation.

**Tech Stack:** Go (Wails v3), React 18 + TypeScript 5 + Zustand v5 + Tailwind CSS v4

---

## File Structure

- **Create:** `frontend/src/components/Chat/ModelPicker.tsx` — popover component
- **Modify:** `internal/bootstrap/provider.go` — return multi-provider map
- **Modify:** `internal/api/app.go` — multi-provider App, new API methods
- **Modify:** `internal/agent/agent_loop.go` — WithProvider, set ChatRequest.Provider
- **Modify:** `frontend/src/store/index.ts` — provider state, per-provider model cache
- **Modify:** `frontend/src/components/Chat/ChatInputToolbar.tsx` — use ModelPicker
- **Modify:** `main.go` — wire multi-provider result to NewApp
- **Test:** `internal/bootstrap/provider_test.go` — multi-provider init
- **Test:** `internal/api/app_test.go` — new API methods

---

### Task 1: Add WithProvider loop option and set ChatRequest.Provider

**Files:**
- Modify: `internal/agent/agent_loop.go:331-379`

- [ ] **Step 1: Add providerID field and WithProvider option**

Open `internal/agent/agent_loop.go`. Find the AgentLoop struct definition (around line 300-310) and add `providerID` field:

```go
// AgentLoop holds per-loop configuration.
// ...
// Find existing fields and add providerID:
type AgentLoop struct {
    provider         engine.ProviderEngine
    tools            *tool.ToolRegistry
    systemPrompt     string
    confirmFn        func(tool.Tool, json.RawMessage) bool
    projectDir       string
    model            string
    sessionID        string
    providerID       string // NEW: identifies which configured provider (e.g. "deepseek")
    modelContextLimit int64
}
```

After `WithModel` (line ~335), add `WithProvider`:

```go
func WithProvider(id string) LoopOption {
    return func(a *AgentLoop) {
        a.providerID = id
    }
}
```

- [ ] **Step 2: Set ChatRequest.Provider in all three call sites**

Add `Provider: a.providerID` to every `engine.ChatRequest{...}` in agent_loop.go:

Line ~221 (compaction):
```go
req := engine.ChatRequest{
    Provider: a.providerID,
    Model:    a.model,
    Messages: prompt,
}
```

Line ~375 (Run):
```go
req := engine.ChatRequest{
    Provider: a.providerID,
    Model:    a.model,
    Messages: messages,
    Tools:    tools,
}
```

Line ~505 (RunStreaming — find by searching `ChatRequest{`):
```go
req := engine.ChatRequest{
    Provider: a.providerID,
    Model:    a.model,
    Messages: messages,
    Tools:    tools,
}
```

- [ ] **Step 3: Run tests**

```bash
go test ./internal/agent/...
```

Expected: PASS (existing tests pass; no new tests for WithProvider since it's a simple setter)

- [ ] **Step 4: Commit**

```bash
git add internal/agent/agent_loop.go
git commit -m "feat: add WithProvider loop option, set ChatRequest.Provider"
```

---

### Task 2: Multi-provider bootstrap

**Files:**
- Modify: `internal/bootstrap/provider.go`
- Modify: `main.go:42-80`

- [ ] **Step 1: Change InitProvider to return multi-provider map**

In `internal/bootstrap/provider.go`, change `Result` to hold multiple providers:

```go
type Result struct {
    Providers map[string]engine.ProviderEngine
    Model     string
    Config    config.Config
}
```

Replace the single-provider init logic in `InitProvider` (after config validation, around line 38-60):

```go
func InitProvider(ctx context.Context, home, cwd, modelOverride string) (*Result, error) {
    cfg, err := config.Load(config.Options{HomeDir: home, ProjectDir: cwd})
    if err != nil {
        return nil, fmt.Errorf("config: %w", err)
    }
    if cfg.ModelProvider == "" {
        if err := setupConfig(home); err != nil {
            return nil, err
        }
        fmt.Println()
        cfg, err = config.Load(config.Options{HomeDir: home, ProjectDir: cwd})
        if err != nil {
            return nil, fmt.Errorf("config reload: %w", err)
        }
    }

    providers := make(map[string]engine.ProviderEngine)
    for providerID, providerCfg := range cfg.ModelProviders {
        eng, err := engine.EngineByID(providerID)
        if err != nil {
            fmt.Fprintf(os.Stderr, "[monika] skipping provider %q: engine not registered\n", providerID)
            continue
        }
        initCfg := map[string]any{
            "base_url": providerCfg.BaseURL,
            "api_key":  providerCfg.APIKey,
            "models":   providerCfg.Models,
        }
        if err := eng.Init(ctx, initCfg); err != nil {
            fmt.Fprintf(os.Stderr, "[monika] skipping provider %q: init failed: %v\n", providerID, err)
            continue
        }
        providerEng, ok := eng.(engine.ProviderEngine)
        if !ok {
            fmt.Fprintf(os.Stderr, "[monika] skipping provider %q: not a provider engine\n", providerID)
            continue
        }
        providers[providerID] = providerEng
    }
    if len(providers) == 0 {
        return nil, fmt.Errorf("no providers could be initialized from model_providers")
    }

    model := modelOverride
    if model == "" {
        model = cfg.Model
    }

    return &Result{
        Providers: providers,
        Model:     model,
        Config:    cfg,
    }, nil
}
```

- [ ] **Step 2: Update main.go wiring**

In `main.go`, update the `NewApp` call (line ~80):

```go
pr, err := bootstrap.InitProvider(ctx, home, cwd, "")
if err != nil {
    // existing error handling ...
}

// Before: appService := api.NewApp(home, cwd, pr.Config, pr.Provider, pr.Model, registry, loopOpts, taskStoreAccessor)
// After:
appService := api.NewApp(home, cwd, pr.Config, pr.Providers, pr.Model, registry, loopOpts, taskStoreAccessor)
```

- [ ] **Step 3: Run tests to verify bootstrap changes**

```bash
go test ./internal/bootstrap/...
```

Expected: PASS. If a test relies on single-provider result shape, update it to check `pr.Providers[providerID]`.

- [ ] **Step 4: Commit**

```bash
git add internal/bootstrap/provider.go main.go
# also add any updated test files
git commit -m "feat: multi-provider bootstrap, initialize all configured providers"
```

---

### Task 3: Update App struct and NewApp for multi-provider

**Files:**
- Modify: `internal/api/app.go:23-62`

- [ ] **Step 1: Change provider field to providers map**

Change the `App` struct (line 23-44):

```go
type App struct {
    ctx context.Context

    home       string
    cfg        config2.Config
    providers  map[string]engine2.ProviderEngine // was: provider engine2.ProviderEngine
    model      string
    registry   *tool2.ToolRegistry
    startupCwd string

    mu       sync.RWMutex
    sessions map[string]*SessionManager
    projects map[string]*ProjectInfo
    fileSvc  map[string]*FileService

    eventBus    *EventBus
    cancelFuncs map[string]context.CancelFunc
    cancelMu    sync.Mutex

    loopOpts          []agent2.LoopOption
    taskStoreAccessor TaskStoreAccessor
}
```

- [ ] **Step 2: Update NewApp constructor**

```go
func NewApp(home, cwd string, cfg config2.Config, providers map[string]engine2.ProviderEngine, model string, registry *tool2.ToolRegistry, loopOpts []agent2.LoopOption, tsa TaskStoreAccessor) *App {
    return &App{
        home:              home,
        cfg:               cfg,
        providers:         providers,
        model:             model,
        registry:          registry,
        startupCwd:        cwd,
        sessions:          make(map[string]*SessionManager),
        projects:          make(map[string]*ProjectInfo),
        fileSvc:           make(map[string]*FileService),
        eventBus:          NewEventBus(),
        cancelFuncs:       make(map[string]context.CancelFunc),
        loopOpts:          loopOpts,
        taskStoreAccessor: tsa,
    }
}
```

- [ ] **Step 3: Verify build compiles**

```bash
cd internal/api && go vet ./...
```

Expected: no errors from the changed fields.

- [ ] **Step 4: Commit**

```bash
git add internal/api/app.go
git commit -m "refactor: multi-provider App struct, providers map replaces single provider field"
```

---

### Task 4: Add GetProviders, update GetModels, add PersistSelection

**Files:**
- Modify: `internal/api/app.go` (add new methods, modify existing)
- Modify: `internal/api/types.go` (add ProviderInfo)

- [ ] **Step 1: Add ProviderInfo type**

In `internal/api/types.go`, add:

```go
type ProviderInfo struct {
    ID          string `json:"id"`
    DisplayName string `json:"display_name"`
}
```

- [ ] **Step 2: Add GetProviders method**

In `internal/api/app.go`, add after `NewApp`:

```go
func (a *App) GetProviders() []ProviderInfo {
    result := make([]ProviderInfo, 0, len(a.cfg.ModelProviders))
    for id, pc := range a.cfg.ModelProviders {
        displayName := pc.Name
        if displayName == "" {
            displayName = id
        }
        result = append(result, ProviderInfo{ID: id, DisplayName: displayName})
    }
    sort.Slice(result, func(i, j int) bool {
        return result[i].ID < result[j].ID
    })
    return result
}
```

- [ ] **Step 3: Update GetModels to accept providerID**

Replace the existing `GetModels` (line 192-194):

```go
func (a *App) GetModels(providerID string) ([]engine2.Model, error) {
    p, ok := a.providers[providerID]
    if !ok {
        return nil, fmt.Errorf("provider %q not available", providerID)
    }
    return p.ListModels(a.ctx)
}
```

- [ ] **Step 4: Add PersistSelection method**

```go
func (a *App) PersistSelection(providerID, modelID string) {
    a.cfg.ModelProvider = providerID
    a.cfg.Model = modelID

    configPath := filepath.Join(a.home, ".monika", "config.yaml")
    data, err := yaml.Marshal(a.cfg)
    if err != nil {
        fmt.Fprintf(os.Stderr, "[monika] WARNING: failed to marshal config: %v\n", err)
        return
    }
    if err := os.WriteFile(configPath, data, 0600); err != nil {
        fmt.Fprintf(os.Stderr, "[monika] WARNING: failed to write config: %v\n", err)
    }
}
```

You'll need to add `"gopkg.in/yaml.v3"` to the imports:
```go
import (
    // ... existing imports
    "gopkg.in/yaml.v3"
)
```

- [ ] **Step 5: Update SendMessage to accept and use providerID**

Change `SendMessage` signature (line 215):

```go
func (a *App) SendMessage(projectPath, sessionID, text, providerID, model string) error {
```

Inside `SendMessage`, select the correct provider engine (around line 244-250):

```go
providerEng, ok := a.providers[providerID]
if !ok {
    return fmt.Errorf("provider %q not available", providerID)
}

opts := append([]agent2.LoopOption{}, a.loopOpts...)
opts = append(opts, agent2.WithProjectDir(projectPath), agent2.WithProvider(providerID), agent2.WithModel(model), agent2.WithSessionID(sessionID))

// ... later:
loop := agent2.NewLoop(providerEng, a.registry, opts...)
```

Also update `NewSession` to accept providerID:

```go
func (a *App) NewSession(projectPath, providerID, model string) (*SessionInfo, error) {
    sm := a.getSessionManager(projectPath)
    s, err := sm.New(model, providerID)
    // ... rest unchanged
}
```

- [ ] **Step 6: Update resolveModelContextLimit to accept providerID**

```go
func (a *App) resolveModelContextLimit(providerID, modelID string) int64 {
    if pc, ok := a.cfg.ModelProviders[providerID]; ok {
        for _, m := range pc.Models {
            if m.ID == modelID && m.ContextLimit.Int64() > 0 {
                return m.ContextLimit.Int64()
            }
        }
    }
    return 0
}
```

And update the call site in SendMessage:
```go
if limit := a.resolveModelContextLimit(providerID, model); limit > 0 {
```

- [ ] **Step 7: Run go vet and fix compilation errors**

```bash
go vet ./internal/api/...
```

Expected: no errors. If existing callers of `SendMessage` or `NewSession` break, fix them in subsequent tasks.

- [ ] **Step 8: Commit**

```bash
git add internal/api/app.go internal/api/types.go
git commit -m "feat: add GetProviders, provider-scoped GetModels, PersistSelection"
```

---

### Task 5: Update remaining callers of old API signatures

**Files:**
- Modify: `internal/api/app.go` (SessionManager.New calls)
- Modify: `internal/api/app_test.go` if exists

- [ ] **Step 1: Fix NewSession caller**

Find and fix any call to `sm.New(model, a.cfg.ModelProvider)` — this should now pass the providerID from the caller:

In `NewSession` (already updated above in Task 4), the signature takes `providerID` directly.

- [ ] **Step 2: Search for other callers of changed signatures**

```bash
rg "\.NewSession\(" internal/
rg "\.SendMessage\(" internal/
rg "\.GetModels\(" internal/
rg "resolveModelContextLimit" internal/
```

- [ ] **Step 3: Fix the Wails bindings generator issue**

Since Wails auto-generates bindings from the App methods, the method signature changes will be reflected after a rebuild. The frontend bindings will be regenerated in a later task when we build the frontend. For now, just ensure the Go side compiles.

- [ ] **Step 4: Verify compilation**

```bash
go build ./...
```

Expected: successful build. Fix any remaining compilation errors.

- [ ] **Step 5: Commit**

```bash
git add internal/api/app.go
git commit -m "fix: update callers for new multi-provider API signatures"
```

---

### Task 6: Regenerate Wails bindings

**Files:**
- Regenerate: `frontend/bindings/monika/` (auto-generated)

- [ ] **Step 1: Build frontend to regenerate bindings**

```bash
cd frontend && npm run build
```

This triggers Wails to regenerate Go↔JS bindings from the updated App methods.

- [ ] **Step 2: Verify new binding signatures**

Check that `frontend/bindings/monika/internal/api/app.ts` has updated method signatures:

```bash
rg "GetProviders|GetModels|PersistSelection|SendMessage|NewSession" frontend/bindings/monika/internal/api/app.ts
```

Expected: `GetProviders()` with no params, `GetModels(providerID: string)`, `PersistSelection(providerID, modelID)`, `SendMessage(projectPath, sessionID, text, providerID, model)`.

- [ ] **Step 3: Check ProviderInfo binding exists**

```bash
rg "ProviderInfo" frontend/bindings/monika/internal/api/models.ts
```

- [ ] **Step 4: Commit**

```bash
git add frontend/bindings/
git commit -m "chore: regenerate Wails bindings for multi-provider API"
```

---

### Task 7: Update Zustand store for provider state

**Files:**
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: Add provider-related types and state fields**

After `availableModels` and before `selectedModel` in the `AppState` interface:

```typescript
import type { ProviderInfo } from '../../bindings/monika'

// In AppState interface, add:
availableProviders: ProviderInfo[]
selectedProvider: string
modelsByProvider: Record<string, ModelInfo[]>

// Remove: availableModels: ModelInfo[]
// Keep: selectedModel: string
// Replace availableModels with a derived getter (computed at call sites)
```

- [ ] **Step 2: Add loadProviders action**

In the actions section of `AppState`:

```typescript
loadProviders: () => Promise<void>
setSelectedProvider: (providerId: string) => void
```

- [ ] **Step 3: Update store defaults**

In `create<AppState>((set, get) => ({`:

```typescript
// Add:
availableProviders: [],
selectedProvider: '',
modelsByProvider: {},

// Remove:
// availableModels: [],

// Keep selectedModel: '',
```

- [ ] **Step 4: Implement loadProviders**

```typescript
loadProviders: async () => {
  let providers: ProviderInfo[] = [];
  try {
    providers = await App.GetProviders();
  } catch {
    // Keep providers empty on failure
  }
  const state = get();
  const valid = state.selectedProvider && providers.some((p) => p.id === state.selectedProvider);
  set({
    availableProviders: providers,
    selectedProvider: valid ? state.selectedProvider : (providers.length > 0 ? providers[0].id : ''),
  });
  if (providers.length > 0) {
    const pid = valid ? state.selectedProvider : providers[0].id;
    await get().loadModelsForProvider(pid);
  }
},
```

- [ ] **Step 5: Implement setSelectedProvider**

```typescript
setSelectedProvider: async (providerId: string) => {
  set({ selectedProvider: providerId });
  await get().loadModelsForProvider(providerId);
},
```

- [ ] **Step 6: Implement loadModelsForProvider (replaces old loadModels)**

```typescript
loadModelsForProvider: async (providerId: string) => {
  let models: ModelInfo[] = [];
  try {
    models = await App.GetModels(providerId);
  } catch {
    // Keep empty on failure
  }
  const state = get();
  const valid = state.selectedModel && models.some((m) => m.ID === state.selectedModel);
  set({
    modelsByProvider: { ...state.modelsByProvider, [providerId]: models },
    selectedModel: valid ? state.selectedModel : (models.length > 0 ? models[0].ID : ''),
  });
},
```

- [ ] **Step 7: Update resetProjectState to clear new fields**

In `resetProjectState`:

```typescript
// Remove: availableModels: [],
// Add:
availableProviders: [],
selectedProvider: '',
modelsByProvider: {},
```

- [ ] **Step 8: Remove old loadModels**

Remove the existing `loadModels: async () => { ... }` function body and replace with `loadModelsForProvider` (already added above).

Update `initProject` to call `loadProviders()` instead of `loadModels()`:

```typescript
export async function initProject() {
  console.log('[monika] initProject called')
  try {
    const info = await App.GetCurrentProject()
    if (info) {
      useStore.getState().setProjectPath(info.path)
      useStore.getState().setBranch(info.branch)
      useStore.getState().loadProviders()  // was: loadModels()
    }
  } catch (err) {
    console.error('[monika] initProject failed:', err)
  }
}
```

- [ ] **Step 9: Type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat: add provider state to Zustand store, per-provider model caching"
```

---

### Task 8: Create ModelPicker component

**Files:**
- Create: `frontend/src/components/Chat/ModelPicker.tsx`

- [ ] **Step 1: Create ModelPicker.tsx**

```typescript
import { useState, useRef, useEffect, useMemo } from 'react'
import { useStore } from '../../store'

interface ProviderGroup {
  providerId: string
  providerName: string
  models: { ID: string; DisplayName: string }[]
}

function ModelPicker() {
  const availableProviders = useStore((s) => s.availableProviders)
  const selectedProvider = useStore((s) => s.selectedProvider)
  const selectedModel = useStore((s) => s.selectedModel)
  const modelsByProvider = useStore((s) => s.modelsByProvider)
  const setSelectedProvider = useStore((s) => s.setSelectedProvider)
  const setSelectedModel = useStore((s) => s.setSelectedModel)

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const modelName = useMemo(() => {
    const models = modelsByProvider[selectedProvider] || []
    return models.find((m) => m.ID === selectedModel)?.DisplayName || selectedModel || 'Select model'
  }, [modelsByProvider, selectedProvider, selectedModel])

  const providerAbbr = useMemo(() => {
    const p = availableProviders.find((p) => p.id === selectedProvider)
    const name = p?.display_name || selectedProvider || ''
    return name.slice(0, 2).toUpperCase() || '??'
  }, [availableProviders, selectedProvider])

  const groups = useMemo((): ProviderGroup[] => {
    const q = search.toLowerCase().trim()
    return availableProviders
      .map((p) => ({
        providerId: p.id,
        providerName: p.display_name || p.id,
        models: (modelsByProvider[p.id] || [])
          .filter((m) =>
            !q || m.DisplayName.toLowerCase().includes(q) || p.display_name.toLowerCase().includes(q) || m.ID.toLowerCase().includes(q)
          ),
      }))
      .filter((g) => g.models.length > 0)
  }, [availableProviders, modelsByProvider, search])

  const flatItems = useMemo(() => {
    const items: { providerId: string; modelId: string; displayName: string; modelID: string }[] = []
    for (const g of groups) {
      for (const m of g.models) {
        items.push({ providerId: g.providerId, modelId: m.ID, displayName: m.DisplayName, modelID: m.ID })
      }
    }
    return items
  }, [groups])

  // Reset highlight when search changes
  useEffect(() => {
    setHighlightIndex(0)
  }, [search])

  // Focus search input when opened
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus()
    }
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleSelect = async (providerId: string, modelId: string) => {
    // Switch provider first so loadModelsForProvider runs, then override with chosen model
    if (providerId !== selectedProvider) {
      await setSelectedProvider(providerId)
    }
    setSelectedModel(modelId)
    setOpen(false)
    setSearch('')

    // Persist to config
    try {
      const { App } = await import('../../../bindings/monika')
      await (App as any).PersistSelection(providerId, modelId)
    } catch {
      // silent — selection stays in-memory
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((prev) => Math.min(prev + 1, flatItems.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((prev) => Math.max(prev - 1, 0))
      return
    }
    if (e.key === 'Enter' && flatItems[highlightIndex]) {
      const item = flatItems[highlightIndex]
      handleSelect(item.providerId, item.modelId)
    }
  }

  if (availableProviders.length === 0) {
    return (
      <div className="flex items-center px-[14px] py-[2px]" style={{ background: 'transparent' }}>
        <select
          disabled
          className="text-[11px] px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-dim)] outline-none appearance-none"
        >
          <option>No providers</option>
        </select>
      </div>
    )
  }

  return (
    <div className="flex items-center px-[14px] py-[2px]" style={{ background: 'transparent' }}>
      <div ref={containerRef} style={{ position: 'relative', zIndex: 1000 }}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] cursor-pointer outline-none hover:border-[var(--text-dim)]"
          style={{ height: 24 }}
        >
          <span className="text-[10px] font-semibold opacity-60">{providerAbbr}</span>
          <span className="truncate max-w-[140px]">{modelName}</span>
          <span className="text-[9px] opacity-40 ml-auto">▾</span>
        </button>

        {open && (
          <div
            className="flex flex-col rounded-md border border-[var(--border)] bg-[var(--bg-card)] shadow-lg overflow-hidden"
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 4px)',
              left: 0,
              width: 260,
            }}
          >
            <div className="p-2">
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search models..."
                className="w-full text-[11px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] outline-none"
              />
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: 280, padding: '0 8px 8px' }}>
              {groups.length === 0 && (
                <div className="text-[11px] text-[var(--text-dim)] px-2 py-4 text-center">
                  No models found
                </div>
              )}
              {groups.map((g) => (
                <div key={g.providerId}>
                  {availableProviders.length > 1 && (
                    <div
                      className="text-[10px] text-[var(--text-dim)] px-2 py-1 mt-1"
                      style={{ letterSpacing: '0.5px' }}
                    >
                      {g.providerName}
                    </div>
                  )}
                  {g.models.map((m) => {
                    const flatIdx = flatItems.findIndex(
                      (fi) => fi.providerId === g.providerId && fi.modelId === m.ID,
                    )
                    const isSelected = m.ID === selectedModel && g.providerId === selectedProvider
                    const isHighlighted = flatIdx === highlightIndex
                    return (
                      <div
                        key={m.ID}
                        onClick={() => handleSelect(g.providerId, m.ID)}
                        className="flex justify-between items-center text-[11px] px-2 py-1.5 rounded cursor-default"
                        style={{
                          background: isHighlighted || isSelected ? 'var(--accent-bg, #1e3a5f)' : 'transparent',
                          color: isSelected ? 'var(--text-primary, #fff)' : 'var(--text-dim, #888)',
                        }}
                      >
                        <span>{m.DisplayName}</span>
                        <span className="text-[9px] opacity-50 ml-2 shrink-0">{m.ID}</span>
                        {isSelected && <span className="text-[9px] ml-1 opacity-70">✓</span>}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ModelPicker
```

- [ ] **Step 2: Verify component compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Chat/ModelPicker.tsx
git commit -m "feat: add ModelPicker popover component"
```

---

### Task 9: Update ChatInputToolbar to use ModelPicker

**Files:**
- Modify: `frontend/src/components/Chat/ChatInputToolbar.tsx`

- [ ] **Step 1: Replace the old select with ModelPicker**

```typescript
import ModelPicker from './ModelPicker'

function ChatInputToolbar() {
  return <ModelPicker />
}

export default ChatInputToolbar
```

Replace the entire existing component content. The old component had loading states handled inside — the new ModelPicker handles empty providers internally.

- [ ] **Step 2: Type check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Chat/ChatInputToolbar.tsx
git commit -m "refactor: replace model select with ModelPicker in ChatInputToolbar"
```

---

### Task 10: Update all SendMessage and NewSession call sites to pass providerID

**Files:**
- Modify: `frontend/src/components/Chat/ChatArea.tsx:58-69`
- Modify: `frontend/src/components/TitleBar/dropdownHelpers.ts:16-41`
- Modify: `frontend/src/components/Sidebar/SessionList.tsx:42-45`

- [ ] **Step 1: Update ChatArea.tsx**

Add `selectedProvider` selector and use it in SendMessage:

```typescript
const selectedProvider = useStore((s) => s.selectedProvider)
const selectedModel = useStore((s) => s.selectedModel)

// In handleSend, update the SendMessage call:
await App.SendMessage(projectPath, activeSessionId, text, selectedProvider, selectedModel)
```

- [ ] **Step 2: Update dropdownHelpers.ts**

Read both provider and model, pass to both NewSession and SendMessage:

```typescript
export function useNewSessionHelper() {
  const store = useStore
  return async () => {
    const state = store.getState()
    const info = await App.NewSession(state.projectPath, state.selectedProvider, state.selectedModel)
    // ... rest unchanged
  }
}

// In sendMessage helper:
await App.SendMessage(projectPath, sid, prompt, store.selectedProvider, store.selectedModel)
```

- [ ] **Step 3: Update SessionList.tsx**

Pass providerID to NewSession:

```typescript
const selectedProvider = useStore((s) => s.selectedProvider)
const selectedModel = useStore((s) => s.selectedModel)

// In the NewSession call:
const info = await App.NewSession(projectPath, selectedProvider, selectedModel)
```

- [ ] **Step 4: Type check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Chat/ChatArea.tsx frontend/src/components/TitleBar/dropdownHelpers.ts frontend/src/components/Sidebar/SessionList.tsx
git commit -m "fix: pass providerID to all SendMessage and NewSession call sites"
```

---

### Task 11: End-to-end verification

- [ ] **Step 1: Build frontend**

```bash
cd frontend && npm run build
```

- [ ] **Step 2: Build Go**

```bash
go build .
```

Expected: successful build.

- [ ] **Step 3: Run all Go tests**

```bash
go test ./...
```

Expected: PASS. If any tests fail, fix them before proceeding.

- [ ] **Step 4: Type check frontend**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Manual smoke test**

```bash
wails3 dev
```

Verify:
1. ModelPicker button shows in ChatInputToolbar
2. Click opens popover with provider groups
3. Search filters models
4. Selecting a model closes popover, updates button text
5. Send a message — verify it uses the selected provider+model
6. Restart app — verify the last selected provider+model persists

- [ ] **Step 6: Commit remaining changes**

```bash
git add -A
git commit -m "chore: final fixes and verification for provider selector"
```
