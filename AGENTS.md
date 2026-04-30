# AGENTS.md

## 沟通语言
- 使用中文进行所有对话和交流。

## Repo Shape
- Single Go module (`go.mod`, module name `monika`), no go.work.
- Entry point: `main.go` at repo root — Wails v3 desktop application.
- `pkg/` — public packages (third parties can import):
  - `pkg/engine/` — Engine interfaces + registry, zero deps. The `database/sql/driver` equivalent.
  - `pkg/openai/` — OpenAI-compatible SSE streaming client, reusable by third-party providers.
- `internal/` — internal packages (not importable outside the module):
  - `internal/agent/` — agent loop, streaming event types, conversation management.
  - `internal/api/` — Wails frontend-backend contract: App service, EventBus, SessionManager, FileService.
  - `internal/bootstrap/` — provider initialization (shared between runtime and tests).
  - `internal/config/` — layered YAML config loader (global `~/.monika/` + project `.monika/`).
  - `internal/engines/provider/` — provider adapter base + per-vendor adapters (deepseek/, openai/).
  - `internal/engines/skill/` — Agent Skills standard SKILL.md loader.
  - `internal/engines/mcp/` — MCP stdio JSON-RPC transport.
  - `internal/tool/` — tool interface + builtin tools (file, grep, glob, bash).
- `frontend/` — React + TypeScript + Tailwind CSS v4 + CodeMirror 6 desktop UI.
  - `src/components/` — TitleBar, SessionList, TabBar, ChatArea (ChatInput, MessageBubble, ToolCard), FileTree (FileEditor), Console, StatusBar, ConfirmModal, DragDivider.
  - `src/store/` — Zustand state management with Wails event listeners. Multi-tab session and file state.
  - `src/index.css` — CSS custom properties (design tokens), Tailwind import, global resets, scrollbar styling, CodeMirror scrollbar styling.
  - `bindings/` — Wails Go↔JS method bindings (auto-generated).
  - `design-preview.html` — single source of truth for all visual design.
- `build/config.yml` — Wails v3 build configuration.
- Engine registration follows `database/sql` pattern: each engine calls `engine.Register()` in `init()`, binary triggers via blank imports in `main.go`.

## Product Direction
- Monika is an **agentic coding editor** — not a chat wrapper, not a file-oriented IDE.
- The editor gives the AI agent first-class access to code, files, and tools in a multi-panel desktop UI.
- Target: tool calling, multiple LLM providers, skills, MCP integration, and subagents.
- Core focus: agent orchestration — message flow, tool execution, context/state handling, safety boundaries, and provider-agnostic contracts.

## Architecture Direction
- Single Wails v3 desktop application — no CLI/REPL/TUI mode, no headless server.
- `pkg/engine` is the only package third parties need to import for building adapters.
- `pkg/openai` provides a reusable OpenAI-compatible streaming client.
- No go-plugin or gRPC — all engines are in-process, registered at startup.
- Third-party extensions go through MCP (external process). Third-party LLM providers fork + add import.

## Frontend Conventions

### Stack
- React 18 + TypeScript 5, no meta-framework (Vite dev server only).
- Tailwind CSS v4 (`@import "tailwindcss"` in `index.css`, no `tailwind.config.*`).
- CodeMirror 6 for code editing (`@codemirror/theme-one-dark`, language extensions per file extension).
- Zustand v5 for global state (single store, `create<AppState>`).
- `@wailsio/runtime` for Go↔JS: `App.*` for RPC calls, `Events.On(...)` for push events.

### Design System
All visual design — colors, typography, spacing, component states, motion — is defined in **`frontend/design-preview.html`**. Open it in a browser. It is the single source of truth. No style values belong in this file.

Hard rules (non-negotiable):
- All colors via CSS custom properties: `var(--token)` or Tailwind `[var(--token)]`. Never hardcode.
- Focus ring on every interactive element. Never `outline-none` alone.
- Respect `prefers-reduced-motion`.
- Z-index: dropdowns/overlays at z-1000 (TitleBar) or z-2000 (FileDialog). ConfirmModal at z-50. Prefer portal to `document.body` for overlays.

### Component Structure
Each component lives in `src/components/<Name>/<Name>.tsx`. No barrel `index.ts` re-export files. Co-locate sub-components only when tightly coupled (e.g., `FileEditor` inside `FileTree/`). All visual details belong in `design-preview.html`.

**Layout (App.tsx)**:
```
+-- TitleBar (draggable region)
+-- Main flex row (flex-1)
|   +-- [Chat pane] (layoutMode: chat|split)
|   |   +-- SessionList (left sidebar, togglable)
|   |   +-- ChatArea (center, flex-1)
|   +-- [DragDivider] (layoutMode: split only, draggable ratio)
|   +-- [Files pane] (layoutMode: split|files)
|   |   +-- FileEditor (center, flex-1)
|   |   +-- FileTree (right sidebar, togglable)
+-- Console (bottom panel, resizable, togglable)
+-- StatusBar
```
Layout modes: `chat`, `split`, `files`. Controlled by `layoutMode` in Zustand store.

**Component behavior** (see `design-preview.html` for all visual spec):
- **TabBar**: min-width 120px, max-width 200px, truncate. Status indicators (dot/checkmark). Close on active always, hover-revealed on inactive. Overflow via dropdown (ResizeObserver). ARIA: `role="tablist"`, `role="tab"`, keyboard nav.
- **ChatArea**: Multi-session via TabBar; messages cached in `sessionMessages[id]`; stream events routed by `session_id`. Variants: user, assistant, thinking, error, tool block, system.
- **FileEditor**: CodeMirror EditorView LRU cache (max 10). Each file: `absolute inset-0`, `display:block`/`none`. Tab switch: `view.requestMeasure()` + content sync. Dirty close: `ConfirmModal`.
- **Sidebar** (SessionList, FileTree): Tree indentation `depth * 16px + 8px`. Directory expand/collapse: unicode arrows.
- **TitleBar**: Left: app name, project/branch dropdowns. Center: drag region. Right: layout toggles, window controls. Dropdowns via `createPortal` to `document.body`.
- **Console**: Resize handle with `cursor-ns-resize`.
- **StatusBar**: Status indicator, branch name, token count, panel toggle buttons.

### State Management (Zustand)
- Single store in `src/store/index.ts` — `create<AppState>`.
- Store holds: `messages` (active session display), `openSessions`, `sessionMessages` (per-session cache), `generatingSessionId`, `openFiles`, `activeFilePath`, `tokenCount`, `projectPath`, `activeSessionId`, `layoutMode`, `splitRatio`.
- Multi-tab state: `openSessions` tracks session tabs, `sessionMessages: Record<string, Message[]>` caches per-session messages. `openFiles` tracks file tabs with `isDirty` flag.
- `generatingSessionId` replaces `generating: boolean` — tracks which session is generating.
- Stream events route by `session_id` via per-session actions (`updateSessionMessage`, `addSessionToolStart`, etc.).
- Session tab limit: max 8. CodeMirror cache limit: max 10 EditorView instances with LRU eviction.
- Actions mutate state via `set()`. Always use immutable updates (never mutate in place).
- Components read state with selectors: `useStore((s) => s.field)` to avoid re-renders.

### Wails Bindings
- Auto-generated in `frontend/bindings/monika/` (Do not edit manually).
- Import pattern: `import { App, SessionInfo, StreamEvent, FileNode } from '../../../bindings/monika'`.
- RPC calls: `App.SendMessage(projectPath, sessionId, text)` returns a Promise.
- Events: `Events.On('stream', (ev) => { ... })` receives typed `StreamEvent` payloads.

### Styling & Accessibility
- Use Tailwind utility classes for layout/spacing. Colors via CSS custom properties only. No Tailwind v3 color classes.
- No `transition-all` — specify properties (e.g., `transition-colors`).
- All icon-only buttons need `aria-label`. Focus indicators always visible. Color never the sole indicator of state.
- Scrollable regions use `overflow-y-auto`.

## Commands
- Run full verification: `go test ./...`
- Run typecheck frontend: `cd frontend && npx tsc --noEmit`
- Run a focused package: `go test ./internal/agent`, `go test ./internal/api`, etc.
- Run a single test: `go test ./path/to/package -run TestName`
- Format edited Go files: `gofmt -w <files>` before final verification.
- Run `go mod tidy` only when imports or dependencies change.
- Build: `go build .` (requires `cd frontend && npm run build` first).
- Dev mode: `wails3 dev` (auto-builds frontend + starts live reload).
- Build frontend: `cd frontend && npm run build`.

## Key Dependencies
- `github.com/wailsapp/wails/v3` — desktop app shell (WebView2 / WebKit).
- `gopkg.in/yaml.v3` — config file parsing.
- `encoding/json`, `os`, `os/exec`, `path/filepath` — stdlib only for engine implementations.

## Gotchas
- No go.work, no replace directives — single module, single `go.mod`.
- Each engine must call `engine.Register()` in `init()`.
- Blank imports in `main.go` trigger engine registration.
- `pkg/engine.Reset()` is only for tests to avoid registration conflicts.
- The internal `openai` adapter uses an import alias (`oaiclient`) to avoid name collision with `pkg/openai`.
- `//go:embed all:frontend/dist` in `main.go` requires frontend built before Go compilation.
- Wails v3 uses `app.Window.NewWithOptions()` for window creation (alpha API, may change).
- No CI workflow or linter config is present; prefer executable Go sources over assumptions.
