# Monika CLI

**Monika** is a Go-based coding agent designed for intelligent software development assistance. It integrates with DeepSeek API to provide an interactive terminal experience with thinking mode and tool execution capabilities.

## Vision

Monika aims to be a lightweight, efficient coding agent built entirely in Go, providing developers with intelligent assistance through natural language interaction.

## Features

- **Thinking Mode Display**: See the reasoning process when using DeepSeek reasoning models
- **Tool Execution**: Execute bash commands directly from the AI assistant
- **Clean Output**: Simple, flicker-free interface with native terminal scrolling
- **Copy Support**: Full mouse text selection and copy functionality (Ctrl+C)
- **ANSI Colors**: Color-coded output for easy reading

## Prerequisites

- Go 1.25.5 or later
- DeepSeek API key

## Installation

### Build from Source

```bash
# Clone the repository
git clone https://github.com/RedTeaLab/monika.git
cd monika

# Build the executable
go build -o monika ./cmd/monika

# On Windows, the output will be monika.exe automatically
# Or explicitly specify:
# go build -o monika.exe ./cmd/monika
```

## Configuration

Monika can be configured via environment variables or an INI configuration file.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONIKA_BASE_URL` | DeepSeek API base URL | `https://api.deepseek.com` |
| `MONIKA_API_KEY` | Your DeepSeek API key | *(required)* |
| `MONIKA_MODEL` | Model to use | `deepseek-chat` |
| `MONIKA_THINKING` | Enable thinking mode | `false` |

### INI Configuration File

Create a configuration file at `~/.monika/config.ini`:

```ini
[monika]
base_url = https://api.deepseek.com
api_key = your_api_key_here
model = deepseek-chat
thinking = true
```

**Note**: Environment variables take precedence over INI configuration.

## Usage

Run Monika:

```bash
./monika
```

Or on Windows:

```cmd
monika.exe
```

### Example Session

```
────────────────────────────────────────────
  MONIKA CLI
────────────────────────────────────────────

Type your message and press Enter to send.
Press Ctrl+C to quit.
────────────────────────────────────────────

> List all Go files in the project

[User] List all Go files in the project

[Thinking] I need to find all Go files. I'll use the find command or ls with glob patterns.

bash(find . -name "*.go" -type f)
│  ./cmd/monika/main.go
│  ./internal/core/agents.go
│  ./internal/option/option.go
│  ./internal/tools/common.go
│  ./internal/tools/run_bash.go
│  ./internal/ui/ui.go

[Assistant] I found 6 Go files in the project:
- cmd/monika/main.go
- internal/core/agents.go
- internal/option/option.go
- internal/tools/common.go
- internal/tools/run_bash.go
- internal/ui/ui.go

────────────────────────────────────────────
```

### Available Tools

- **bash**: Execute bash commands and return output

Example usage within conversation:
```
> What files are in the current directory?
```

Monika will automatically use the bash tool to execute `ls` or similar commands.

### Thinking Mode

Enable thinking mode to see the AI's reasoning process:

```bash
export MONIKA_THINKING=true
./monika
```

Or set in `~/.monika/config.ini`:

```ini
thinking = true
```

When using reasoning models like `deepseek-reasoner`, you'll see the thinking process displayed as:

```
[Thinking] Let me analyze this step by step...
```

## Output Format

- `[User]` - Your input messages (green)
- `[Thinking]` - AI reasoning process (yellow)
- `bash(command)` - Tool calls (orange)
- `│ output` - Tool results (white with prefix)
- Plain text - AI assistant responses

## Project Structure

```
monika/
├── cmd/
│   └── monika/
│       └── main.go          # Entry point
├── internal/
│   ├── core/
│   │   └── agents.go        # Core agent logic and API integration
│   ├── ui/
│   │   └── ui.go            # CLI interface
│   ├── tools/
│   │   ├── common.go        # Tool interface
│   │   └── run_bash.go      # Bash tool implementation
│   └── option/
│       └── option.go        # Configuration management
├── go.mod
├── go.sum
└── README.md
```

## Development

### Dependencies

- [openai-go](https://github.com/openai/openai-go) - OpenAI API client (DeepSeek compatible)
- [ini.v1](https://github.com/go-ini/ini) - INI file parsing

### Adding New Tools

1. Create a new file in `internal/tools/`
2. Implement the `Tool` interface:

```go
type Tool interface {
    Name() string
    Description() string
    Parameters() map[string]any
    Execute(args ...string) string
}
```

3. Register the tool in `internal/tools/common.go`:

```go
func init() {
    RegisterTool(&BashTool{})
    RegisterTool(&YourTool{})
}
```

## License

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
