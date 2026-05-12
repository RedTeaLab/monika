# Input Autocomplete Design

**Date**: 2026-05-12
**Status**: Approved

## Overview

Chat input supports Tab-triggered autocomplete dropdown for `$` shell commands, `/` slash commands, and `@` file mentions.

## Trigger Rules

| Prefix | Position | Completes | Data Source |
|--------|----------|-----------|-------------|
| `$` | Line start or after space | System commands + project files | `ListSystemCommands` + `ListFileTree` |
| `/` | Line start | Slash commands | Frontend static list |
| `@` | Any position | Project file paths | `ListFileTree` |

## Architecture

```
ChatInput (existing)
  └── AutocompleteDropdown (new)
        ├── Detect trigger prefix: $ / @
        ├── Fetch candidates via backend API
        ├── 300ms debounce
        ├── Up to 8 items, scrollable
        └── Keyboard nav: ↑↓ select, Tab/Enter confirm, Esc close
```

## Backend: ListSystemCommands API

New RPC method:

```go
// ListSystemCommands searches PATH executables matching prefix.
// Returns up to 20 results, sorted alphabetically.
func (a *App) ListSystemCommands(prefix string) ([]string, error)
```

File list reuses existing `ListFileTree` API. Frontend merges and sorts results for `$` prefix.

## Dropdown UI

- Positioned directly below textarea, right-aligned to input left edge
- Width 360px, max 8 items, scrollable overflow
- Each item shows: icon (type), name (matching chars highlighted), type label (dimmed, right-aligned)
- Selected row uses `var(--bg-active)` background
- Footer hint: "Tab or Enter to select · Esc to close"
- Icons: `>` for system commands, file icon for files, folder icon for directories
- Entry animation: fade in + slide down 4px, 150ms

## Slash Commands

Frontend static list:

```ts
const COMMANDS = [
  { name: 'init', description: 'Create agent.md from project analysis' },
]
```

Extensible by adding entries to the array.

## @ File Mention

- `@` triggers autocomplete immediately
- Fuzzy match on file name and path
- Typing more characters narrows results
- Selection replaces `@query` with the file path in the input text

## Interaction Summary

| Action | Behavior |
|--------|----------|
| Tab | Select highlighted item, insert text |
| ↑/↓ | Navigate list (wrap at edges) |
| Enter | Select highlighted item, insert text |
| Esc | Close dropdown |
| Click item | Select and insert |
| Keep typing | Refilter list with debounce |
| No matches | Show "No matches" message |

## Files Changed

| File | Change |
|------|--------|
| `internal/api/app.go` | Add `ListSystemCommands` method |
| `frontend/src/components/Chat/AutocompleteDropdown.tsx` | New dropdown component |
| `frontend/src/components/Chat/ChatInput.tsx` | Integrate autocomplete trigger and keyboard handling |
| `frontend/bindings/` | Regenerated with new API |
