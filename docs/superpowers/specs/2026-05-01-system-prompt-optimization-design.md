# System Prompt Optimization Design

## Goal

Replace Monika's minimal 24-line `BuiltinSystemPrompt` with a modular, layered system prompt that follows the prompt engineering patterns proven by Claude Code and OpenCode — making the agent smarter, safer, and more efficient.

## Research Summary

Analyzed Claude Code's leaked system prompt (v2.1.50) and OpenCode's agent system. Key patterns identified:

1. **U-shaped attention curve** — critical rules at beginning (primacy) and end (recency), detailed workflows in the middle
2. **Negative instructions** — "NEVER do X" beats "please try to avoid X"
3. **Dedicated tool routing** — Read over cat, Grep over grep, Edit over sed
4. **Explicit parallel encouragement** — "invoke them in a single message"
5. **Three-layer separation** — Builtin prompt / Project-level (AGENTS.md) / Task-level
6. **Bidirectional safety** — declare both allowed and forbidden
7. **Progressive knowledge loading** — pointers and menus in the prompt, content in CLAUDE.md / AGENTS.md

## Architecture

### Module Structure

Six independent string constants in `internal/agent/system_prompt.go`, assembled in `main.go`:

```
Identity → ToolUsage → CodeQuality → ResponseStyle → SafetyBoundaries → Remember
(primacy)                                                          (recency)
```

Each module is a `const` in the `agent` package. `main.go` joins them with `"\n\n"` and appends AGENTS.md.

### Assembly Order (main.go)

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
if p := loadSystemPrompt(cwd); p != "" {
    systemParts = append(systemParts, p)
}
```

### What Belongs Where

| Layer | Content | Mechanism |
|-------|---------|-----------|
| Builtin (fixed) | Identity, tool rules, code quality, safety, response style | `system_prompt.go` constants |
| Project-specific | Language choice, repo structure, architecture rules, gotchas, coding preferences | `AGENTS.md` or `.monika/AGENTS.md` |

The builtin prompt stays language-agnostic and project-agnostic. Both project conventions and user coding preferences go in AGENTS.md — there is no separate user-level loading mechanism.

## Module Specifications

### 1. Identity (`PromptIdentity`)

Core identity, capabilities, and bedrock rules (NEVER generate URLs, grep before reading, absolute paths, ask before destructive actions).

### 2. ToolUsage (`PromptToolUsage`)

Grep-before-read workflow, parallel tool calls, precision reading with offset/limit, bash-as-last-resort, context management.

### 3. CodeQuality (`PromptCodeQuality`)

YAGNI ("three similar lines > premature abstraction"), no comments by default, validate only at system boundaries, OWASP awareness. Language-agnostic only.

### 4. ResponseStyle (`PromptResponseStyle`)

Conciseness (no trailing summaries, no narration), brief key-moment updates, GFM formatting, no emojis, match user's language.

### 5. SafetyBoundaries (`PromptSafetyBoundaries`)

Path safety (always absolute, never outside project), destructive op confirmation, git safety (no force push to main, prefer new commits over amend), tool confirmation handling.

### 6. Remember (`PromptRemember`)

NEVER/ALWAYS list at the end for recency effect: grep first, no URLs, no force push to main, no hardcoded secrets, absolute paths, edit over create, ask before destructive actions.

(See `internal/agent/system_prompt.go` for the full constant text of each module.)

## Success Criteria

- **Safety**: Zero path-escape violations in N test runs (previously unmeasured)
- **Efficiency**: Percentage of file_read calls using offset/limit (target >80%, up from unmeasured baseline)
- **Correctness**: No agent attempts to use bash for grep/glob/file_read operations
- **Token budget**: Builtin prompt under 1500 tokens (~1% of 128k context window)

## Tool Description Improvements (Final)

| Tool | Improved Description |
|------|---------------------|
| grep | "Search file contents using regular expressions. Returns file path, line number, and matching line content. Filter by file pattern using the include parameter. Capped at 200 results." |
| bash | "Execute a shell command. Prefer dedicated tools (grep, glob, file_read, file_write) for file operations. Use bash only when no dedicated tool exists. Commands timeout after 120 seconds." |
| glob | "Find files matching a glob pattern. Use to discover project structure before targeting specific files with grep or file_read. Supports standard glob syntax (e.g., '**/*.go', 'src/**/*.tsx')." |
| file_write | "Write a file to the local filesystem. Overwrites existing files at the target path. Creates parent directories automatically. Always use absolute paths within the project directory." |

## Tool Description Improvements

Tool descriptions are part of the effective prompt. Current descriptions are too sparse:

| Tool | Current | Improved |
|------|---------|----------|
| grep | "Search file contents using regular expressions." | Add output modes, include patterns, multiline support guidance |
| file_read | OK already | Already includes grep-first guidance |
| bash | "Execute a shell command." | Add safety constraints, timeout info, dedicated-tool preference |
| file_write | "Write a file to the local filesystem." | Add overwrite warning, encoding guidance |
| glob | "Find files matching a glob pattern." | Add usage examples |
| file_list | "List files and directories in a given path." | OK, minimal is fine |

## Implementation Plan

1. Rewrite `internal/agent/system_prompt.go` — replace single constant with 6 module constants
2. Update `main.go` — assembly using the 6 new constants
3. Improve tool descriptions in `internal/tool/builtin/*.go`
4. Update `AGENTS.md` — remove coding principles that are now in the builtin prompt (if any overlap)
5. Run `go test ./...` to verify no breakage
6. Manual review of assembled prompt output

## Non-Goals

- No conditional prompt injection (provider-specific tuning) — deferred to future work
- No skill auto-injection into system prompt — skills are loaded dynamically at runtime
- No prompt caching optimization — depends on provider support
