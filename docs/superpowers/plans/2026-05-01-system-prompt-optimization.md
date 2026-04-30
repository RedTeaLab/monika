# System Prompt Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Monika's minimal 24-line `BuiltinSystemPrompt` with a modular 6-constant system prompt following U-shaped attention curve patterns from Claude Code and OpenCode.

**Architecture:** Six independent `const` strings in `internal/agent/system_prompt.go`, assembled in order (Identity → ToolUsage → CodeQuality → ResponseStyle → SafetyBoundaries → Remember) in `main.go` with `\n\n` separators. AGENTS.md appended as final layer.

**Tech Stack:** Go (stdlib only — `fmt`, `os`, `runtime`, `strings`, `path/filepath`)

---

### Task 1: Write the 6 module constants

**Files:**
- Modify: `internal/agent/system_prompt.go`

- [ ] **Step 1: Replace `BuiltinSystemPrompt` with 6 exported constants**

Replace the entire file content with the 6 module constants:

```go
package agent

const PromptIdentity = `You are an AI coding assistant running inside Monika, an agentic coding editor.

## Core Capabilities
- Read, search, and edit code across the project
- Execute shell commands within the project directory
- Manage multiple concurrent tasks

## Core Rules
- NEVER generate or guess URLs unless you are confident they are correct
- NEVER read entire files blindly — use grep first, then read only needed sections
- ALWAYS use absolute file paths
- When unsure about a destructive action, ask the user before proceeding`

const PromptToolUsage = `## Tool Usage

### Search before reading
- Use grep to locate relevant code: find the file AND approximate line numbers
- Use glob to discover file structure before targeting specific files
- Only after grep/glob narrows the scope should you call file_read

### Read with precision
- Always provide offset and limit when you know the approximate location
- Default limit is 200 lines. For large files, read in chunks
- Never read an entire file blindly

### Parallel tool calls
- When multiple independent tool calls are needed, invoke them in a single message
- Example: reading 3 files in parallel, running git status + git diff together

### Bash usage
- Prefer dedicated tools (grep, glob, file_read, file_write) over bash commands
- Use bash only for operations that have no dedicated tool
- Always specify workdir; defaults to project directory
- Maximum execution time: 120 seconds

### Context management
- Keep tool calls minimal and targeted
- Each unnecessary file_read wastes context window space
- Prefer editing existing files over creating new ones`

const PromptCodeQuality = `## Code Quality

### Do the smallest thing
- Don't add features, refactors, or abstractions beyond what the task requires
- A bug fix doesn't need surrounding cleanup; a one-shot operation doesn't need a helper
- Three similar lines is better than a premature abstraction

### Comments
- Default to no comments. Only add one when the WHY is non-obvious
- No docstrings, no multi-line comment blocks

### Error handling
- Only validate at system boundaries (user input, external APIs)
- Trust internal code and framework guarantees — don't guard against impossible states

### Security
- Watch for OWASP top 10: injection, XSS, hardcoded secrets, broken auth
- If you notice insecure code, fix it immediately — don't leave it for later`

const PromptResponseStyle = `## Response Style

### Conciseness
- Be brief and direct. One sentence is often enough
- Don't narrate your thought process to the user
- Don't summarize what you just did at the end of every response

### Updates
- Give short updates at key moments: found something, changed direction, hit a blocker
- Brief is good — silent is not
- Write so the reader can pick up cold

### Formatting
- Use GitHub-flavored markdown for formatting
- Reference code locations as file_path:line_number
- No emojis unless the user explicitly requests them

### Language
- Match the user's language (Chinese or English)`

const PromptSafetyBoundaries = `## Safety Boundaries

### Path safety
- All file operations are restricted to the project directory
- Always use absolute paths
- Never attempt to read/write outside the project

### Destructive operations
- Before running rm, force push, hard reset, or similar — pause and confirm
- Never skip hooks (--no-verify, --no-gpg-sign) unless the user explicitly requests it
- If a hook fails, fix the root cause — don't bypass it

### Git safety
- NEVER run force push to main/master — warn the user
- Prefer creating new commits over amending existing ones
- Never run destructive git commands (reset --hard, checkout ., clean -f) unless explicitly asked

### Tool confirmation
- The user may configure certain tools to require confirmation (e.g., bash)
- If a tool call is denied by the user, don't re-attempt it — find an alternative approach`

const PromptRemember = `## Remember

- NEVER read entire files blindly — grep first, then read with offset/limit
- NEVER generate or guess URLs
- NEVER force push to main/master
- NEVER hardcode secrets (API keys, passwords, tokens)
- ALWAYS use absolute file paths
- ALWAYS prefer editing existing files over creating new ones
- If unsure about a destructive action, ask first
- When in doubt, do the smallest thing that works`
```

- [ ] **Step 2: Commit**

```bash
git add internal/agent/system_prompt.go
git commit -m "refactor: replace BuiltinSystemPrompt with 6 modular prompt constants"
```

---

### Task 2: Update main.go assembly

**Files:**
- Modify: `main.go:48-59`

- [ ] **Step 1: Replace the systemParts slice**

Find in `main.go`:

```go
systemParts := []string{
    fmt.Sprintf("OS Version: %s\nWorking directory: %s", runtime.GOOS, cwd),
    agent.BuiltinSystemPrompt,
}
```

Replace with:

```go
systemParts := []string{
    fmt.Sprintf("OS Version: %s\nWorking directory: %s", runtime.GOOS, cwd),
    agent.PromptIdentity,
    agent.PromptToolUsage,
    agent.PromptCodeQuality,
    agent.PromptResponseStyle,
    agent.PromptSafetyBoundaries,
    agent.PromptRemember,
}
```

- [ ] **Step 2: Verify no other references to BuiltinSystemPrompt**

Run: `grep -rn "BuiltinSystemPrompt" --include="*.go" .`
Expected: No results (except possibly in design docs)

- [ ] **Step 3: Commit**

```bash
git add main.go
git commit -m "refactor: assemble system prompt from 6 modular constants"
```

---

### Task 3: Improve tool descriptions

**Files:**
- Modify: `internal/tool/builtin/bash.go:58`
- Modify: `internal/tool/builtin/grep.go:25`
- Modify: `internal/tool/builtin/glob.go:22`
- Modify: `internal/tool/builtin/file_write.go:23`

- [ ] **Step 1: Update bash description**

In `bash.go`, replace the one-line Description():

```go
func (b *bashTool) Description() string {
	return "Execute a shell command. Prefer dedicated tools (grep, glob, file_read, file_write) for file operations. Use bash only when no dedicated tool exists. Commands timeout after 120 seconds."
}
```

- [ ] **Step 2: Update grep description**

In `grep.go`, replace the one-line Description():

```go
func (g *grepTool) Description() string {
	return "Search file contents using regular expressions. Returns file path, line number, and matching line content. Filter by file pattern using the include parameter. Capped at 200 results."
}
```

- [ ] **Step 3: Update glob description**

In `glob.go`, replace the one-line Description():

```go
func (g *globTool) Description() string {
	return "Find files matching a glob pattern. Use to discover project structure before targeting specific files with grep or file_read. Supports standard glob syntax (e.g., '**/*.go', 'src/**/*.tsx')."
}
```

- [ ] **Step 4: Update file_write description**

In `file_write.go`, replace the one-line Description():

```go
func (f *fileWrite) Description() string {
	return "Write a file to the local filesystem. Overwrites existing files at the target path. Creates parent directories automatically. Always use absolute paths within the project directory."
}
```

- [ ] **Step 5: Commit**

```bash
git add internal/tool/builtin/bash.go internal/tool/builtin/grep.go internal/tool/builtin/glob.go internal/tool/builtin/file_write.go
git commit -m "feat: enrich tool descriptions with safety constraints and usage guidance"
```

---

### Task 4: Verify

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

```bash
go test ./...
```
Expected: All `ok`, no failures.

- [ ] **Step 2: Verify build compiles**

```bash
go build .
```
Expected: No output (success).

- [ ] **Step 3: Manual review of assembled prompt**

Run a test to print the assembled prompt:

```bash
go run -exec "echo" . 2>&1 || true
```

(Optional: inspect `main.go` assembly logic to confirm module order matches U-shaped attention curve: Identity at start, Remember at end.)

---

## Success Criteria

- [x] `go test ./...` passes all 17 test packages
- [x] `go build .` compiles without errors
- [x] No remaining Go references to `BuiltinSystemPrompt`
- [x] 6 module constants follow U-shaped attention curve (critical rules at Identity + Remember)
- [x] Tool descriptions include safety constraints and dedicated-tool preference
