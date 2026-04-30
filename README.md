# Monika

Agentic coding editor — a Wails v3 desktop application with React frontend that gives an AI agent first-class access to code, files, and tools through a multi-panel GUI.

## Quick Start

```powershell
# Prerequisites: Go 1.25+, Node.js 18+, Wails v3 CLI
go install github.com/wailsapp/wails/v3/cmd/wails3@latest

# Clone and install
git clone https://github.com/RedTeaLab/monika.git
cd monika
cd frontend && npm install && cd ..

# Configure provider (first run will prompt)
# Or create ~/.monika/config.yaml manually:
#   model_provider: deepseek
#   model: deepseek-chat
#   model_providers:
#     deepseek:
#       name: deepseek
#       base_url: https://api.deepseek.com
#       api_key: sk-xxx

# Run dev mode (hot reload)
wails3 dev

# Or build standalone
cd frontend && npm run build && cd ..
go build .
./monika.exe
```

## Architecture

```
monika/
├── main.go              # Wails entry point, embeds frontend
├── build/config.yml     # Wails build configuration
├── frontend/            # React + TypeScript + Tailwind CSS
│   └── src/components/  # TitleBar, SessionList, TabBar, ChatArea, FileTree, FileEditor, Console, StatusBar, DragDivider
├── internal/
│   ├── agent/           # Agent loop, event streaming, conversation
│   ├── api/             # Wails service: App, EventBus, SessionManager, FileService
│   ├── bootstrap/       # Provider initialization
│   ├── config/          # YAML config loader (~/.monika/ + .monika/)
│   ├── engines/         # Provider adapters (deepseek, openai), Skill, MCP
│   └── tool/            # Tool interface + builtin tools (file, grep, glob, bash)
└── pkg/
    ├── engine/           # Public engine interfaces + registry
    └── openai/           # OpenAI-compatible SSE streaming client
```

## Supported Providers

| Provider | Engine ID | Default Model |
|----------|-----------|---------------|
| DeepSeek | `deepseek` | `deepseek-chat` |
| OpenAI | `openai` | `gpt-4o` |

## Features

- **Multi-panel GUI** — Session list, chat area, file tree with CodeMirror 6 editor, console, status bar
- **Layout modes** — Chat, split (chat + files), and files-only views with draggable divider
- **Project management** — Open recent projects, switch projects with dirty-file guards
- **Branch switching** — List local/remote branches, create and switch branches, worktree-aware
- **Multi-tab sessions** — Up to 8 concurrent session tabs, per-session message caching
- **Streaming agent loop** — Real-time text deltas, tool execution cards, token usage tracking
- **Tool calling** — file_read, file_write, file_list, glob, grep, bash (multi-platform)
- **Session persistence** — JSON-backed session history per project
- **Git integration** — File change tracking, diff viewing, worktree support
- **Skills** — Agent Skills standard (SKILL.md loader)
- **MCP** — Model Context Protocol (stdio JSON-RPC transport)

## Development

```powershell
go test ./...            # Run all tests
go vet ./...             # Static analysis
gofmt -w .               # Format Go files
cd frontend && npm run build  # Build frontend
go mod tidy              # Tidy dependencies
```

## License

MIT
