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

### Design System (Cool Dark)
All tokens live as CSS custom properties in `:root` in `index.css`. Never hardcode colors in components — always reference `var(--token)` or Tailwind `[var(--token)]` syntax.

**Color tokens** (see `frontend/src/index.css` for exact values):
| Token | Role |
|---|---|
| `--bg-main` | Root background (`#060609`) |
| `--bg-sidebar` | Side panels (`#09090d`) |
| `--bg-panel` | Panel backgrounds (`#09090d`) |
| `--bg-titlebar` | Title bar only (`#0b0b10`) |
| `--glass-strong` | Glass surface, strong (`rgba(255,255,255,0.07)`) |
| `--glass-medium` | Glass surface, medium (`rgba(255,255,255,0.05)`) |
| `--glass-light` | Glass surface, light (`rgba(255,255,255,0.03)`) |
| `--glass-hover` | Glass hover state (`rgba(255,255,255,0.08)`) |
| `--glass-active` | Glass active state (`rgba(255,255,255,0.10)`) |
| `--border` | Divider lines (`rgba(255,255,255,0.08)`) |
| `--border-light` | Lighter dividers (`rgba(255,255,255,0.05)`) |
| `--border-strong` | Strong borders (`rgba(255,255,255,0.12)`) |
| `--border-active` | Focus/border active (`#5b8def`) |
| `--text-primary` | Main content text (`#d0d0d8`) |
| `--text-secondary` | Secondary text (`#9d9db0`) |
| `--text-dim` | Placeholder/muted (`#78788a`) |
| `--text-link` | Hyperlinks (`#7cb8ff`) |
| `--accent` | Primary action blue (`#5b8def`) |
| `--accent-hover` | Accent hover state (`#7aa2f5`) |
| `--accent-glass` | Accent glass overlay (`rgba(91,141,239,0.10)`) |
| `--green` | Success (`#4ade80`) |
| `--red` | Error (`#f87171`) |
| `--yellow` | Warning/running (`#facc15`) |
| `--orange` | Highlights / inline code (`#fb923c`) |
| `--blue` | Headings / keywords (`#7cb8ff`) |
| `--purple` | Secondary accent (`#a78bfa`) |

**Typography tokens**:
- `--font-ui`: `system-ui, -apple-system, 'Segoe UI', sans-serif` — all chrome/controls.
- `--font-mono`: `'Cascadia Code', 'JetBrains Mono', 'Fira Code', monospace` — code blocks, messages, console output.

**Z-index scale**: `position: fixed` dropdowns/overlays use z-1000 (TitleBar dropdowns) or z-2000 (FileDialog). ConfirmModal uses z-50 (portal to body). TitleBar establishes a stacking context via `backdrop-filter`; popups rendered inside it need the TitleBar itself to have `position: relative; z-index: N` to lift the stacking context above the main content area. When adding a new stacking layer, prefer portal to `document.body` (see `BranchDropdown`, `ProjectDropdown`, `ConfirmModal`).

### Component Structure
Each component lives in `src/components/<Name>/<Name>.tsx`. No barrel `index.ts` re-export files. Keep one component per file; co-locate sub-components only when tightly coupled (e.g., `FileEditor` inside `FileTree/`).

**Layout (App.tsx)**:
```
+-- TitleBar (h-[32px], draggable region)
+-- Main flex row (flex-1)
|   +-- [Chat pane] (layoutMode: chat|split)
|   |   +-- SessionList (left sidebar, w-56, togglable)
|   |   +-- ChatArea (center, flex-1)
|   +-- [DragDivider] (layoutMode: split only, draggable ratio)
|   +-- [Files pane] (layoutMode: split|files)
|   |   +-- FileEditor (center, flex-1)
|   |   +-- FileTree (right sidebar, w-56, togglable)
+-- Console (bottom panel, resizable, togglable)
+-- StatusBar (h-[22px])
```

Layout modes: `chat` (chat-only), `split` (chat + files with draggable divider), `files` (files-only). Controlled by `layoutMode` in Zustand store.

**TabBar conventions** (ChatArea, FileEditor):
- Height 36px (`TAB_BAR_HEIGHT`), background `var(--glass-strong)`, border-b.
- Tab min-width 120px, max-width 200px, truncate with ellipsis.
- Active tab: `var(--bg-main)` background, `var(--text-primary)` text.
- Inactive tabs: transparent background, `var(--text-secondary)` text.
- Status indicators: generating (yellow pulsing dot), completed (green checkmark), error (red dot).
- Dirty indicator (file tabs): dim dot after label text.
- Close button: always visible on active tab, visible on hover for inactive tabs.
- Overflow: tabs exceeding container width collapse into `▼` dropdown menu (ResizeObserver-driven).
- ARIA: `role="tablist"`, `role="tab"` with `aria-selected`, `aria-controls`; keyboard nav (Left/Right, Enter/Space, Ctrl+W).
- Overflow button: `aria-haspopup="menu"`, `aria-expanded`.
- Drag-and-drop reorder deferred to later phase; `onReorder?` prop reserved.

**ChatArea conventions** (ChatArea, ChatInput, MessageBubble, ToolCard):
- Message role labels: 12px, uppercase, `tracking-[0.03em]`, semibold. Roles: `You` (user, `--accent`), `Assistant` (`--green`), `System` (`--text-dim`), `Error` (`--red`).
- Message content: `var(--font-mono)`, 13px, `leading-[1.6]`.
- Tool cards: 3px left border by status color, monospace output, 11px uppercase status badge.
- Input field: `--bg-input` background, rounded `[2px]`, focus border `--border-active`.
- Multi-session: TabBar manages open sessions; messages cached in `sessionMessages[id]`; stream events routed by `session_id`.

**FileEditor conventions** (FileEditor):
- TabBar manages open files; CodeMirror EditorView instances cached in `useRef<Map>` with LRU eviction (max 10).
- Each file gets a DOM container (`absolute inset-0`, `display:block`/`none` for visibility).
- Tab switch: `view.requestMeasure()` + content sync (`view.dispatch`) if store content differs from editor.
- Dirty close: `ConfirmModal` with `confirmLabel="Discard"` when `isDirty` is true.
- File content freshness: on tab select, re-read from backend via `App.ReadFile`.

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
- Height 32px, `--glass-strong` background, `backdrop-blur-md`, border-b.
- Left: app name ("Monika"), project dropdown (recent projects, open folder), branch dropdown (switch/create branches, git repos only).
- Center: empty (drag region).
- Right: layout mode toggles (chat/split/files), window controls (minimize/maximize/close).
- Dropdowns: `ProjectDropdown` and `BranchDropdown` use `createPortal` to `document.body`. `CreateBranchPanel` renders inline with `position: fixed`.
- Window controls: no-drag region, hover uses `--glass-hover`, close hover uses `--red`.

**StatusBar conventions**:
- Height 22px, 12px text.
- Left side: `--bg-statusbar` (`#007acc`) background, white text, status indicator.
- Right side: `#a78bfa`/`var(--purple)` blended background, white text, toggle buttons with 50% opacity when inactive.
- Middle: stretched `--bg-statusbar` to fill gap.

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
- No CI workflow or linter config is present; prefer executable Go sources over assumptions.
