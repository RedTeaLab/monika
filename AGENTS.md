# AGENTS.md

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
  - `src/components/` — TitleBar, SessionList, ChatArea (ChatInput, MessageBubble, ToolCard), FileTree (FileEditor), Console, StatusBar.
  - `src/store/` — Zustand state management with Wails event listeners.
  - `src/index.css` — CSS custom properties (design tokens), Tailwind import, global resets, scrollbar styling.
  - `bindings/` — Wails Go↔JS method bindings (auto-generated).
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

### Design System (VS Code Dark+ inspired)
All tokens live as CSS custom properties in `:root` in `index.css`. Never hardcode colors in components — always reference `var(--token)` or Tailwind `[var(--token)]` syntax.

**Color tokens** (see `frontend/src/index.css` for exact values):
| Token | Role |
|---|---|
| `--bg-main` | Editor/chat area (`#1e1e1e`) |
| `--bg-sidebar` | Side panels (`#252526`) |
| `--bg-titlebar` | Title bar only (`#323233`) |
| `--bg-statusbar` | Status bar left side (`#007acc`) |
| `--bg-input` | Text input background (`#3c3c3c`) |
| `--bg-hover` | List item hover (`#2a2d2e`) |
| `--bg-active` | Selected list item (`#37373d`) |
| `--border` | Divider lines (`#3c3c3c`) |
| `--border-active` | Focus ring on inputs (`#007acc`) |
| `--text-primary` | Main content text (`#cccccc`) |
| `--text-secondary` | Section headers (`#999999`) |
| `--text-dim` | Placeholder/muted (`#858585`) |
| `--accent` | Primary action blue (`#007acc`) |
| `--green` | Success (`#4ec9b0`) |
| `--red` | Error (`#f14c4c`) |
| `--yellow` | Warning/running (`#cca700`) |

**Typography tokens**:
- `--font-ui`: `system-ui, -apple-system, 'Segoe UI', sans-serif` — all chrome/controls.
- `--font-mono`: `'Cascadia Code', 'JetBrains Mono', 'Fira Code', monospace` — code blocks, messages, console output.

**Z-index scale**: UI elements share the same stacking context. When a new stacking layer is needed (dropdowns, overlays), align with the team first — no `z-[9999]` hacks.

### Component Structure
Each component lives in `src/components/<Name>/<Name>.tsx`. No barrel `index.ts` re-export files. Keep one component per file; co-locate sub-components only when tightly coupled (e.g., `FileEditor` inside `FileTree/`).

**Layout (App.tsx)**:
```
+-- TitleBar (h-[30px], draggable region)
+-- Main flex row
|   +-- SessionList (left sidebar, w-56)
|   +-- ChatArea (center, flex-1)
|   +-- FileTree (right sidebar, w-64, togglable)
+-- Console (bottom panel, resizable, togglable)
+-- StatusBar (h-[22px])
```

**Sidebar conventions** (SessionList, FileTree):
- Background `--bg-sidebar`, not `--bg-main`.
- Section header: 11px, uppercase, `tracking-[0.05em]`, `--text-secondary`.
- Row: 13px, `leading-[22px]`, hover `--bg-hover`, active `--bg-active`.
- Indentation for tree: `depth * 16px + 8px` padding-left.
- Directory expand/collapse: unicode `\u25B6` / `\u25BC` (not ASCII `>` / `v`).

**Chat conventions** (ChatArea, ChatInput, MessageBubble, ToolCard):
- Message role labels: 12px, uppercase, `tracking-[0.03em]`, semibold. Roles: `You` (user, `--accent`), `Assistant` (`--green`), `System` (`--text-dim`), `Error` (`--red`).
- Message content: `var(--font-mono)`, 13px, `leading-[1.6]`.
- Tool cards: 3px left border by status color, monospace output, 11px uppercase status badge.
- Input field: `--bg-input` background, rounded `[2px]`, focus border `--border-active`.

**Panel conventions** (Console):
- Header bar: `--bg-sidebar` background, border-b, 11px uppercase section header.
- Content: `var(--font-mono)`, `--text-dim` color.
- Resize handle: 1px height, `cursor-ns-resize`, hover `--accent`.

**TitleBar conventions**:
- Height 30px, `--bg-titlebar`, `WebkitAppRegion: drag`.
- Window controls: 46px wide, no-drag region, normal hover `#3e3e40`, close hover `#e81123`.

**StatusBar conventions**:
- Height 22px, 12px text.
- Left side: `--bg-statusbar` (`#007acc`) background, white text, status indicator.
- Right side: `#68217a` background, white text, toggle buttons with 50% opacity when inactive.
- Middle: stretched `--bg-statusbar` to fill gap.

### State Management (Zustand)
- Single store in `src/store/index.ts` — `create<AppState>`.
- Store holds: `messages`, `generating`, `tokenCount`, `projectPath`, `activeSessionId`.
- Actions mutate state via `set()`. Always use immutable updates (never mutate in place).
- Tool events update the last assistant message's `tools[]` array by finding and patching.
- Wails events hook into store via `Events.On('stream', ...)` in `setupWailsEvents()`.
- Components read state with selectors: `useStore((s) => s.field)` to avoid re-renders.
- Welcome message: `[{ id: 'welcome', role: 'system', content: 'Welcome to Monika.' }]`.

### Wails Bindings
- Auto-generated in `frontend/bindings/monika/` (Do not edit manually).
- Import pattern: `import { App, SessionInfo, StreamEvent, FileNode } from '../../../bindings/monika'`.
- RPC calls: `App.SendMessage(projectPath, sessionId, text)` returns a Promise.
- Events: `Events.On('stream', (ev) => { ... })` receives typed `StreamEvent` payloads.

### CSS / Styling Rules
- Use Tailwind utility classes for layout, spacing, borders. Never write custom CSS rules in component files.
- Colors always via CSS custom properties: `bg-[var(--bg-main)]`, `text-[var(--text-primary)]`, `border-[var(--border)]`.
- Never use Tailwind v3 color classes (e.g., `bg-gray-800`) — they don't exist in v4 without a config and don't match our design tokens.
- No `transition-all` — specify properties (e.g., `transition-colors`).
- Focus states: always provide visible focus rings. Use `focus:border-[var(--border-active)]` on inputs, never `outline-none` alone.
- Scrollbar styling in `index.css` — WebKit-only, 10px width, `#424242` thumb.

### Accessibility Baseline
- All icon-only buttons need `aria-label` (applies to title bar window controls, close buttons).
- Interactive elements must have hover states (`bg-[var(--bg-hover)]`).
- Focus indicators must remain visible — never use `outline-none` without a replacement ring/border.
- Color is never the sole indicator of state; pair with text labels (e.g., tool status text alongside colored border).
- Scrollable regions use `overflow-y-auto` (not `overflow-hidden` that clips content).

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
- No README, CI workflow, task runner, or linter config is present; prefer executable Go sources over assumptions.
