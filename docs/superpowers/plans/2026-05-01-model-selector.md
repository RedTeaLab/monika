# Model Selector in Chat Input Toolbar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a model selection dropdown in a transparent toolbar below the chat input, allowing per-message model switching within the current provider.

**Architecture:** Go backend gains `GetModels()` API and modified `SendMessage`/`handleAgentEvent`/`NewSession` signatures to carry per-message model. Frontend adds `loadModels` to store, a `ChatInputToolbar` component with `ModelSelector` dropdown below the textarea.

**Tech Stack:** Go 1.25 (Wails v3 backend), TypeScript/React (Zustand store, Tailwind CSS)

---

### Task 1: Go backend — GetModels API

**Files:**
- Modify: `internal/api/app.go` (add method below `NewSession`)

- [ ] **Step 1: Add GetModels method**

Add after the `NewSession` method (around line 187):

```go
func (a *App) GetModels() ([]engine.Model, error) {
	return a.provider.ListModels(a.ctx)
}
```

- [ ] **Step 2: Build check**

Run: `cd d:/git/monika && go build .`
Expected: compiles cleanly (0 errors).

- [ ] **Step 3: Commit**

```bash
git add internal/api/app.go
git commit -m "feat: add GetModels API to list available provider models"
```

---

### Task 2: Go backend — Add model parameter to SendMessage

**Files:**
- Modify: `internal/api/app.go:199`

- [ ] **Step 1: Change SendMessage signature**

Change line 199 from:
```go
func (a *App) SendMessage(projectPath, sessionID, text string) error {
```
to:
```go
func (a *App) SendMessage(projectPath, sessionID, text, model string) error {
```

- [ ] **Step 2: Replace hardcoded model with parameter**

Change line 220 from:
```go
agent2.WithModel(a.model),
```
to:
```go
agent2.WithModel(model),
```

- [ ] **Step 3: Pass model to handleAgentEvent**

Change line 235 from:
```go
a.handleAgentEvent(sessionID, ev)
```
to:
```go
a.handleAgentEvent(sessionID, model, ev)
```

- [ ] **Step 4: Build check**

Run: `cd d:/git/monika && go build .`
Expected: compiles cleanly.

Note: `handleAgentEvent` signature doesn't match yet — that's fixed in Task 3. If the build fails early, it's expected — proceed to Task 3.

- [ ] **Step 5: Commit**

```bash
git add internal/api/app.go
git commit -m "feat: add model parameter to SendMessage, wire into agent loop"
```

---

### Task 3: Go backend — Fix handleAgentEvent to use per-message model

**Files:**
- Modify: `internal/api/app.go:302`

- [ ] **Step 1: Change handleAgentEvent signature**

Change line 302 from:
```go
func (a *App) handleAgentEvent(sessionID string, ev agent2.Event) {
```
to:
```go
func (a *App) handleAgentEvent(sessionID, model string, ev agent2.Event) {
```

- [ ] **Step 2: Replace hardcoded model**

Change line 305 from:
```go
Model:     a.model,
```
to:
```go
Model:     model,
```

- [ ] **Step 3: Update the done-event call site**

Change line 241 from:
```go
a.handleAgentEvent(sessionID, agent2.Event{
```
to:
```go
a.handleAgentEvent(sessionID, model, agent2.Event{
```

Note: `model` is already in scope at this call site (it's in the parent goroutine closure), so no additional changes needed.

- [ ] **Step 4: Build check**

Run: `cd d:/git/monika && go build .`
Expected: compiles cleanly (all call sites now match).

- [ ] **Step 5: Commit**

```bash
git add internal/api/app.go
git commit -m "feat: pass per-message model through handleAgentEvent to frontend"
```

---

### Task 4: Go backend — Add model parameter to NewSession

**Files:**
- Modify: `internal/api/app.go:172`

- [ ] **Step 1: Change NewSession signature**

Change line 172 from:
```go
func (a *App) NewSession(projectPath string) (*SessionInfo, error) {
```
to:
```go
func (a *App) NewSession(projectPath, model string) (*SessionInfo, error) {
```

- [ ] **Step 2: Use the parameter instead of a.model**

Change line 174 from:
```go
s, err := sm.New(a.model, a.cfg.ModelProvider)
```
to:
```go
s, err := sm.New(model, a.cfg.ModelProvider)
```

- [ ] **Step 3: Build check**

Run: `cd d:/git/monika && go build .`
Expected: compiles cleanly.

- [ ] **Step 4: Commit**

```bash
git add internal/api/app.go
git commit -m "feat: add model parameter to NewSession"
```

---

### Task 5: Frontend bindings — Add GetModels, update SendMessage and NewSession

**Files:**
- Modify: `frontend/bindings/monika/index.ts`

- [ ] **Step 1: Add Model type and GetModels binding**

Add after the `GetCurrentProject` binding (around line 93):

```ts
export interface ModelInfo {
  ID: string;
  DisplayName: string;
}

// Bindings — add inside the App object:
GetModels(): Promise<ModelInfo[]> {
  return Call.ByName(`${serviceName}.GetModels`);
},
```

- [ ] **Step 2: Update SendMessage binding**

Change from:
```ts
SendMessage(projectPath: string, sessionID: string, text: string): Promise<void> {
  return Call.ByName(`${serviceName}.SendMessage`, projectPath, sessionID, text);
},
```
to:
```ts
SendMessage(projectPath: string, sessionID: string, text: string, model: string): Promise<void> {
  return Call.ByName(`${serviceName}.SendMessage`, projectPath, sessionID, text, model);
},
```

- [ ] **Step 3: Update NewSession binding**

Change from:
```ts
NewSession(projectPath: string): Promise<SessionInfo> {
  return Call.ByName(`${serviceName}.NewSession`, projectPath);
},
```
to:
```ts
NewSession(projectPath: string, model: string): Promise<SessionInfo> {
  return Call.ByName(`${serviceName}.NewSession`, projectPath, model);
},
```

- [ ] **Step 4: TypeScript check**

Run: `cd d:/git/monika/frontend && npx tsc --noEmit`
Expected: no new errors from our changes.

- [ ] **Step 5: Commit**

```bash
git add frontend/bindings/monika/index.ts
git commit -m "feat: add GetModels binding, update SendMessage/NewSession with model param"
```

---

### Task 6: Frontend store — Add model state and loadModels action

**Files:**
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: Add ModelInfo import and new fields to AppState interface**

Add import at top:
```ts
import type { ModelInfo } from '../../bindings/monika'
```

Add fields to `AppState` interface (after `allBranches`):
```ts
availableModels: ModelInfo[]
selectedModel: string
```

- [ ] **Step 2: Add loadModels action signature**

Add to `AppState` interface:
```ts
loadModels: () => Promise<void>
```

- [ ] **Step 3: Add initial values in create(...)**

After `allBranches: []`:
```ts
availableModels: [],
selectedModel: '',
```

- [ ] **Step 4: Implement loadModels**

Add after the `loadBranches` implementation:

```ts
loadModels: async () => {
  let models: ModelInfo[] = [];
  try {
    models = await App.GetModels();
  } catch {
    // Keep models empty on failure — dropdown will show "No models"
  }
  const state = get();
  set({
    availableModels: models,
    selectedModel: state.selectedModel || (models.length > 0 ? models[0].ID : ''),
  });
},
```

- [ ] **Step 5: Wire loadModels into initProject**

In the `initProject` function at bottom of file, after `useStore.getState().setBranch(info.branch)`:
```ts
useStore.getState().loadModels()
```

- [ ] **Step 6: TypeScript check**

Run: `cd d:/git/monika/frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat: add availableModels, selectedModel, loadModels to store"
```

---

### Task 7: Frontend — Create ChatInputToolbar component

**Files:**
- Create: `frontend/src/components/Chat/ChatInputToolbar.tsx`

- [ ] **Step 1: Create the component file**

```tsx
import { useStore } from '../../store'

function ChatInputToolbar() {
  const availableModels = useStore((s) => s.availableModels)
  const selectedModel = useStore((s) => s.selectedModel)

  if (availableModels.length === 0) {
    return (
      <div
        className="flex items-center px-[10px] py-[6px]"
        style={{ background: 'transparent' }}
      >
        <select
          disabled
          className="text-[12px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-dim)]"
        >
          <option>No models</option>
        </select>
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-2 px-[10px] py-[6px]"
      style={{ background: 'transparent' }}
    >
      <select
        value={selectedModel}
        onChange={(e) => useStore.setState({ selectedModel: e.target.value })}
        className="text-[12px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] cursor-pointer outline-none"
      >
        {availableModels.map((m) => (
          <option key={m.ID} value={m.ID}>
            {m.DisplayName}
          </option>
        ))}
      </select>
    </div>
  )
}

export default ChatInputToolbar
```

- [ ] **Step 2: Verify the component compiles**

Run: `cd d:/git/monika/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Chat/ChatInputToolbar.tsx
git commit -m "feat: add ChatInputToolbar with ModelSelector dropdown"
```

---

### Task 8: Frontend — Wire toolbar into ChatArea, pass model on send

**Files:**
- Modify: `frontend/src/components/Chat/ChatArea.tsx`

- [ ] **Step 1: Import ChatInputToolbar and ModelInfo**

Add at top:
```ts
import ChatInputToolbar from './ChatInputToolbar'
```

- [ ] **Step 2: Read selectedModel from store**

Add in `ChatArea` component:
```ts
const selectedModel = useStore((s) => s.selectedModel)
```

- [ ] **Step 3: Pass model in handleSend**

Change the `App.SendMessage` call from:
```ts
await App.SendMessage(projectPath, activeSessionId, text)
```
to:
```ts
await App.SendMessage(projectPath, activeSessionId, text, selectedModel || '')
```

- [ ] **Step 4: Render ChatInputToolbar below ChatInput**

In the JSX, right after the `<ChatInput ... />` line, add:
```tsx
<ChatInputToolbar />
```

So the bottom of the component looks like:
```tsx
      {hasActiveSession && (
        <>
          <ChatInput
            key={activeSessionId}
            onSend={handleSend}
            disabled={generatingSessionId !== ''}
          />
          <ChatInputToolbar />
        </>
      )}
```

Note: Wrap in `<>...</>` (fragment) since we now have two siblings.

- [ ] **Step 5: TypeScript check**

Run: `cd d:/git/monika/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Chat/ChatArea.tsx
git commit -m "feat: wire ChatInputToolbar into ChatArea, pass model on send"
```

---

### Task 9: Integration — Full build and smoke test

- [ ] **Step 1: Build Go backend**

Run: `cd d:/git/monika && go build .`
Expected: 0 errors.

- [ ] **Step 2: Build frontend**

Run: `cd d:/git/monika/frontend && npm run build`
Expected: builds without errors.

- [ ] **Step 3: Smoke test with go vet**

Run: `cd d:/git/monika && go vet ./...`
Expected: no issues.

- [ ] **Step 4: Run Go tests**

Run: `cd d:/git/monika && go test ./...`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
# Only if any lint/test fixes were needed
git commit -m "chore: final integration fixes"
```
