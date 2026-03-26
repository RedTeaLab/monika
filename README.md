# Monika

**Monika** is a Go-based AI coding agent designed for intelligent software development assistance. It integrates with DeepSeek API to provide an interactive terminal experience with thinking mode, tool execution, and task management capabilities.

## Vision

Monika aims to be a lightweight, efficient coding agent built entirely in Go, providing developers with intelligent assistance through natural language interaction and powerful built-in tools.

## Features

- **Thinking Mode Display**: See the reasoning process when using DeepSeek reasoning models
- **Multi-Tool Support**: Execute bash commands, read/write/edit files, and manage tasks
- **Task Management**: Built-in todo tool with progress tracking and status management
- **Progress Visualization**: Real-time task progress bar and status display
- **Smart Reminders**: Automatic reminders for pending tasks after inactivity
- **Clean Output**: Simple, flicker-free interface with native terminal scrolling
- **ANSI Colors**: Color-coded output for easy reading
- **Headless Mode**: Execute single commands via command-line arguments
- **Session Persistence**: Maintains conversation context across multiple interactions

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

### Interactive Mode

Run Monika without arguments to enter interactive mode:

```bash
./monika
```

Or on Windows:

```cmd
monika.exe
```

### Headless Mode

Execute a single command and exit:

```bash
./monika -message "List all Go files in the project"
```

### Example Session

```
=========================================
Monika Agent - Version 0.0.1
=========================================
Type your message and press Enter to send.
Type 'exit', 'quit', or '/exit' to leave the interactive mode.

> Read the main.go file

read_file({"file_path": "cmd/monika/main.go"})
│  package main
│
│  import (
│      ...
│  )

Assistant: The main.go file contains the entry point for the application...

> Create a todo plan for refactoring the code

todo({"action":"add","task":"Analyze current code structure"})
│  OK: Added todo item #1: Analyze current code structure (status: pending)

todo({"action":"add","task":"Refactor core agent logic"})
│  OK: Added todo item #2: Refactor core agent logic (status: pending)

todo({"action":"update_status","id":1,"status":"in_progress"})
│  OK: Updated todo item #1: Analyze current code structure (status: in_progress)

[PROGRESS] [==     ] 0% (0/2 done)
[> NOW] Analyze current code structure
[TODO] 1 pending

Assistant: I've created a todo plan with 2 tasks. I'll start by analyzing the current code structure...
```

## Available Tools

Monika comes with built-in tools for common development tasks:

### bash
Execute bash commands and return output.

**Parameters:**
- `command` (string): The bash command to execute

```json
{
  "command": "ls -la"
}
```

### read_file
Read the content of a file.

**Parameters:**
- `file_path` (string): The path to the file to read

```json
{
  "file_path": "README.md"
}
```

### write_file
Write content to a file.

**Parameters:**
- `file_path` (string): The path to the file to write
- `content` (string): The content to write to the file

```json
{
  "file_path": "test.txt",
  "content": "Hello, World!"
}
```

### edit_file
Edit the content of a file by replacing old_text with new_text.

**Parameters:**
- `file_path` (string): The path to the file to edit
- `old_text` (string): The text to be replaced
- `new_text` (string): The text to replace with

```json
{
  "file_path": "test.txt",
  "old_text": "Hello, World!",
  "new_text": "Hello, Monika!"
}
```

### todo
Manage todo items with status tracking.

**Parameters:**
- `action` (string): The action to perform - `add`, `update_status`, `list`, `delete`
- `task` (string): The task description (required for 'add' action)
- `id` (integer): The ID of the todo item (required for 'update_status' and 'delete' actions)
- `status` (string): The new status - `pending`, `in_progress`, `completed` (required for 'update_status' action)

**Examples:**

Add a task:
```json
{
  "action": "add",
  "task": "Implement feature X"
}
```

Update task status:
```json
{
  "action": "update_status",
  "id": 1,
  "status": "in_progress"
}
```

List all tasks:
```json
{
  "action": "list"
}
```

Delete a task:
```json
{
  "action": "delete",
  "id": 1
}
```

## Task Management System

Monika includes a built-in task management system that helps track and organize multi-step operations.

### Features

- **Status Tracking**: Tasks can be `pending`, `in_progress`, or `completed`
- **Progress Visualization**: Visual progress bar shows completion percentage
- **Smart Reminders**: Automatic reminders after 3 rounds without touching the todo tool
- **One Task at a Time**: Only one task can be `in_progress` at a time
- **Persistent Tracking**: Tasks are tracked throughout the session

### Output Format

The todo list displays:

```
Todo List (3 items)

Progress: [====================░░░░░░░░░░░] 66.7% (2/3)
Status:   2 completed, 0 in progress, 1 pending
--------------------------------------------------
[PENDING]    #3: Write documentation

[COMPLETED]  #1: Implement feature
[COMPLETED]  #2: Write tests
```

## Thinking Mode

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
Thinking:
 I need to analyze the request step by step...
 First, I'll check the current state...
 Then I'll determine the best approach...
```

## Output Format

- `[User]` - Your input messages (green)
- `[Thinking]` - AI reasoning process (yellow)
- `tool_name(arguments)` - Tool calls (green)
- `│ output` - Tool results (white with prefix)
- `[Assistant]` - AI assistant responses (blue)
- `[PROGRESS]` - Task progress bar (cyan)
- `[> NOW]` - Current in-progress task (yellow)
- `[TODO]` - Pending tasks count (gray)
- `[Reminder]` - Task reminders (magenta)

## Project Structure

```
monika/
├── cmd/
│   └── monika/
│       └── main.go              # Entry point (version 0.0.1)
├── internal/
│   ├── core/
│   │   └── agents.go            # Core agent logic and API integration
│   ├── resource/
│   │   └── system.go            # System prompt templates
│   ├── tools/
│   │   ├── common.go            # Tool interface and registry
│   │   ├── run_bash.go          # Bash tool implementation
│   │   ├── read_file.go         # Read file tool
│   │   ├── write_file.go        # Write file tool
│   │   ├── edit_file.go         # Edit file tool
│   │   ├── todo_manager.go      # Todo manager
│   │   └── todo_tool.go         # Todo tool
│   └── option/
│       └── option.go            # Configuration management
├── go.mod
├── go.sum
├── LICENSE
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
    RegisterTool(
        &BashTool{},
        &ReadFileTool{},
        &WriteFileTool{},
        &EditFileTool{},
        &YourTool{},
    )
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
