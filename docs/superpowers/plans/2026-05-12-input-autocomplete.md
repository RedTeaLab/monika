# Input Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Tab-triggered autocomplete dropdown to chat input for `$` shell commands, `/` slash commands, and `@` file mentions.

**Architecture:** New `AutocompleteDropdown` component renders below textarea with filtered suggestions. Backend provides `ListSystemCommands` for PATH executables. File completions reuse existing `ListFileTree`. ChatInput integrates trigger detection and keyboard navigation via a shared `acState` object.

**Tech Stack:** Go (backend), React 18 + TypeScript 5 (frontend), Wails v3 bindings

---

### Task 1: Backend — Add `ListSystemCommands` API

**File:**
- Modify: `internal/api/app.go`

- [ ] **Step 1: Add `ListSystemCommands` method**

Read the file to find a good location (near `RunShellCommand` or other RPC methods). Add:

```go
// ListSystemCommands searches PATH for executable files matching prefix.
// Returns up to 20 results, sorted alphabetically.
func (a *App) ListSystemCommands(prefix string) ([]string, error) {
	pathEnv := os.Getenv("PATH")
	if pathEnv == "" {
		return nil, nil
	}
	exts := []string{""}
	if runtime.GOOS == "windows" {
		pathext := os.Getenv("PATHEXT")
		if pathext != "" {
			for _, e := range strings.Split(pathext, ";") {
				exts = append(exts, strings.ToLower(e))
			}
		} else {
			exts = append(exts, ".exe", ".cmd", ".bat", ".ps1", ".com")
		}
	}

	seen := make(map[string]bool)
	var results []string
	lowerPrefix := strings.ToLower(prefix)

	for _, dir := range filepath.SplitList(pathEnv) {
		if len(results) >= 20 {
			break
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if len(results) >= 20 {
				break
			}
			name := entry.Name()
			if !strings.HasPrefix(strings.ToLower(name), lowerPrefix) {
				continue
			}
			if entry.IsDir() {
				continue
			}
			hasExt := false
			for _, ext := range exts {
				if ext == "" {
					continue
				}
				if strings.HasSuffix(strings.ToLower(name), ext) {
					hasExt = true
					break
				}
			}
			if !hasExt && len(exts) > 1 {
				continue
			}
			baseName := name
			for _, ext := range exts {
				if ext != "" && strings.HasSuffix(strings.ToLower(baseName), ext) {
					baseName = baseName[:len(baseName)-len(ext)]
					break
				}
			}
			if seen[baseName] {
				continue
			}
			seen[baseName] = true
			results = append(results, baseName)
		}
	}

	sort.Strings(results)
	return results, nil
}
```

This method only uses packages already imported (`os`, `runtime`, `strings`, `sort`, `path/filepath`). No new imports needed.

- [ ] **Step 2: Build to verify**

```bash
cd d:/git/monika && go build ./...
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd d:/git/monika && git add internal/api/app.go && git commit -m "feat: add ListSystemCommands API for autocomplete"
```

---

### Task 2: Create `AutocompleteDropdown` component

**File:**
- Create: `frontend/src/components/Chat/AutocompleteDropdown.tsx`

- [ ] **Step 1: Create the component file**

```tsx
import { useEffect, useRef, useCallback } from 'react'

export interface AcItem {
  name: string
  detail: string    // e.g. "system command", "file", "directory"
  icon: string      // single char or short text
  insert: string    // text to insert into input on selection
}

export interface AcState {
  open: boolean
  items: AcItem[]
  selectedIdx: number
  prefix: string    // trigger prefix: '$', '/', '@'
}

interface Props {
  state: AcState
  onSelect: (item: AcItem) => void
  onClose: () => void
}

const MAX_ITEMS = 8

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
}

function AutocompleteDropdown({ state, onSelect, onClose }: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  // scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selected = listRef.current.children[state.selectedIdx] as HTMLElement | undefined
    if (selected) selected.scrollIntoView({ block: 'nearest' })
  }, [state.selectedIdx])

  // close on click outside
  const handleBlur = useCallback((e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      onClose()
    }
  }, [onClose])

  if (!state.open || state.items.length === 0) return null

  const query = state.prefix === '/' ? '' : ''

  return (
    <div
      className="absolute z-50 rounded-md border shadow-lg overflow-hidden"
      style={{
        left: 0,
        right: 0,
        bottom: '100%',
        marginBottom: 4,
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
        maxHeight: `${MAX_ITEMS * 36 + 24}px`,
        animation: 'ac-enter 150ms ease-out',
      }}
      onBlur={handleBlur}
      tabIndex={-1}
    >
      <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: `${MAX_ITEMS * 36}px` }}>
        {state.items.slice(0, MAX_ITEMS).map((item, i) => (
          <div
            key={item.name}
            className="flex items-center gap-2 px-3 cursor-pointer text-[13px]"
            style={{
              height: 36,
              background: i === state.selectedIdx ? 'var(--bg-active)' : 'transparent',
            }}
            onMouseDown={(e) => { e.preventDefault(); onSelect(item) }}
            onMouseEnter={() => {
              // hover moves selection
            }}
          >
            <span className="shrink-0 w-4 text-center text-[11px]" style={{ color: 'var(--text-dim)' }}>
              {item.icon}
            </span>
            <span className="truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {highlightMatch(item.name, query)}
            </span>
            <span className="shrink-0 text-[10px] ml-auto" style={{ color: 'var(--text-dim)' }}>
              {item.detail}
            </span>
          </div>
        ))}
      </div>
      <div
        className="text-[10px] px-3 border-t"
        style={{
          height: 24,
          lineHeight: '24px',
          color: 'var(--text-dim)',
          borderColor: 'var(--border)',
          background: 'var(--bg-sidebar)',
        }}
      >
        Tab or Enter to select · Esc to close
      </div>
    </div>
  )
}

export default AutocompleteDropdown
```

The component must be placed inside a `position: relative` container (ChatInput's wrapper div).

- [ ] **Step 2: Add entry animation to CSS**

Read `frontend/src/index.css`, find a good spot, and add:

```css
@keyframes ac-enter {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 3: Check TypeScript compilation**

```bash
cd d:/git/monika/frontend && npx tsc --noEmit
```
Expected: No errors (unused component is fine).

- [ ] **Step 4: Commit**

```bash
cd d:/git/monika && git add frontend/src/components/Chat/AutocompleteDropdown.tsx frontend/src/index.css && git commit -m "feat: add AutocompleteDropdown component"
```

---

### Task 3: ChatInput — Integrate autocomplete

**File:**
- Modify: `frontend/src/components/Chat/ChatInput.tsx`

- [ ] **Step 1: Add imports and autocomplete state**

Add the new imports at the top:

```tsx
import { useState, KeyboardEvent, useEffect, useRef, useCallback } from 'react'
import AutocompleteDropdown, { AcItem, AcState } from './AutocompleteDropdown'
import { App } from '../../../bindings/monika'
```

Add state inside the component (after the existing `useState` calls):

```tsx
const [ac, setAc] = useState<AcState>({ open: false, items: [], selectedIdx: 0, prefix: '' })
const acDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
const projectPath = useStore((s) => s.projectPath)
```

- [ ] **Step 2: Add trigger detection and fetch logic**

Add this function before `handleSubmit`:

```tsx
const COMMANDS: AcItem[] = [
  { name: 'init', detail: 'Create agent.md from project analysis', icon: '/', insert: '/init' },
]

const getQueryAtCursor = (): { prefix: string; query: string; start: number } | null => {
  const el = textareaRef.current
  if (!el) return null
  const cursor = el.selectionStart
  const text = value.slice(0, cursor)

  // Check for $ at line start or after space
  const dollarMatch = text.match(/(?:^|\s)(\$)([^\s]*)$/)
  if (dollarMatch) {
    return { prefix: '$', query: dollarMatch[2], start: cursor - dollarMatch[2].length }
  }

  // Check for @ anywhere
  const atMatch = text.match(/@([^\s]*)$/)
  if (atMatch) {
    return { prefix: '@', query: atMatch[1], start: cursor - atMatch[1].length }
  }

  // Check for / at line start
  const slashMatch = text.match(/^\/([^\s]*)$/)
  if (slashMatch) {
    return { prefix: '/', query: slashMatch[1], start: cursor - slashMatch[1].length }
  }

  return null
}

const fetchAutocomplete = useCallback(async (prefix: string, query: string) => {
  let items: AcItem[] = []

  if (prefix === '/') {
    const lq = query.toLowerCase()
    items = COMMANDS.filter(c => c.name.toLowerCase().startsWith(lq))
  } else if (prefix === '$') {
    // Fetch system commands and project files in parallel
    const [commands, files] = await Promise.all([
      App.ListSystemCommands(query).catch(() => [] as string[]),
      projectPath ? App.ListFileTree(projectPath).catch(() => [] as { name: string; path: string; is_dir: boolean }[]) : Promise.resolve([] as { name: string; path: string; is_dir: boolean }[]),
    ])

    const lq = query.toLowerCase()
    const cmdItems: AcItem[] = (commands || [])
      .filter(c => c.toLowerCase().startsWith(lq))
      .map(c => ({ name: c, detail: 'system command', icon: '>', insert: `$ ${c} ` }))

    const fileItems: AcItem[] = (files || [])
      .filter(f => f.name.toLowerCase().startsWith(lq))
      .slice(0, 15)
      .map(f => ({
        name: f.name,
        detail: f.is_dir ? 'directory' : 'file',
        icon: f.is_dir ? '▸' : '▹',
        insert: `$ ${f.path} `,
      }))

    items = [...cmdItems, ...fileItems]
  } else if (prefix === '@') {
    const files = projectPath
      ? await App.ListFileTree(projectPath).catch(() => [] as { name: string; path: string; is_dir: boolean }[])
      : []

    const lq = query.toLowerCase()
    items = (files || [])
      .filter(f => f.path.toLowerCase().includes(lq) || f.name.toLowerCase().includes(lq))
      .slice(0, 15)
      .map(f => ({
        name: f.path,
        detail: f.is_dir ? 'directory' : 'file',
        icon: f.is_dir ? '▸' : '▹',
        insert: f.path,
      }))
  }

  setAc(s => {
    // Only update if query hasn't changed (debounce might be stale)
    return { open: true, items, selectedIdx: 0, prefix }
  })
}, [projectPath])

const updateAutocomplete = useCallback(() => {
  const match = getQueryAtCursor()
  if (!match) {
    setAc(s => s.open ? { ...s, open: false } : s)
    return
  }
  // Debounce 300ms
  if (acDebounceRef.current) clearTimeout(acDebounceRef.current)
  acDebounceRef.current = setTimeout(() => {
    fetchAutocomplete(match.prefix, match.query)
  }, 300)
}, [value, fetchAutocomplete])

// Trigger autocomplete on value change
useEffect(() => {
  updateAutocomplete()
}, [value, updateAutocomplete])
```

- [ ] **Step 3: Add Tab and arrow key handling**

Update `handleKeyDown` to handle autocomplete navigation:

```tsx
const handleKeyDown = (e: KeyboardEvent) => {
  // Autocomplete navigation
  if (ac.open && ac.items.length > 0) {
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault()
      const item = ac.items[ac.selectedIdx]
      if (item) {
        selectAcItem(item)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAc(s => ({ ...s, selectedIdx: Math.min(s.selectedIdx + 1, s.items.length - 1) }))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAc(s => ({ ...s, selectedIdx: Math.max(s.selectedIdx - 1, 0) }))
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setAc(s => ({ ...s, open: false }))
      return
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}
```

- [ ] **Step 4: Add `selectAcItem` function**

Add before `handleSubmit`:

```tsx
const selectAcItem = (item: AcItem) => {
  const match = getQueryAtCursor()
  if (!match) return

  const el = textareaRef.current!
  const text = value
  const cursor = el.selectionStart
  // Find the start of the current word atom (prefix + query)
  const textBefore = text.slice(0, cursor)
  const matchLen = match.prefix.length + match.query.length
  const replaceStart = cursor - match.query.length
  const newText = text.slice(0, replaceStart) + item.insert + text.slice(cursor)
  setValue(newText)
  setAc({ open: false, items: [], selectedIdx: 0, prefix: '' })

  // Set cursor after inserted text
  requestAnimationFrame(() => {
    const pos = replaceStart + item.insert.length
    el.setSelectionRange(pos, pos)
    el.focus()
  })
}
```

- [ ] **Step 5: Add onClose callback**

```tsx
const closeAutocomplete = useCallback(() => {
  setAc(s => ({ ...s, open: false }))
}, [])
```

- [ ] **Step 6: Render AutocompleteDropdown in JSX**

Add a `relative` wrapper around the textarea container and place the dropdown:

Change the outer div around the textarea from:
```tsx
<div
  className="rounded-md border transition-colors"
  style={{ ... }}
>
```
To:
```tsx
<div
  className="rounded-md border transition-colors relative"
  style={{ ... }}
>
  <AutocompleteDropdown
    state={ac}
    onSelect={selectAcItem}
    onClose={closeAutocomplete}
  />
```

Place it as the first child inside that div, before the textarea.

- [ ] **Step 7: Check TypeScript compilation**

```bash
cd d:/git/monika/frontend && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
cd d:/git/monika && git add frontend/src/components/Chat/ChatInput.tsx && git commit -m "feat: integrate autocomplete into ChatInput"
```

---

### Task 4: Regenerate bindings and verify

- [ ] **Step 1: Regenerate Wails bindings**

```bash
cd d:/git/monika && wails3 generate bindings
```
Expected: Output shows "1 Service, N Methods" including `ListSystemCommands`.

- [ ] **Step 2: Verify Go build**

```bash
cd d:/git/monika && go build ./...
```
Expected: No errors.

- [ ] **Step 3: Verify TypeScript**

```bash
cd d:/git/monika/frontend && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd d:/git/monika && git add frontend/bindings/ && git commit -m "chore: regenerate bindings with ListSystemCommands"
```

---

## Verification

- [ ] `wails3 build` passes
- [ ] `$` prefix triggers command + file autocomplete
- [ ] `/` prefix triggers command list
- [ ] `@` prefix triggers file path autocomplete
- [ ] Tab/Enter selects item, Esc closes dropdown
- [ ] Arrow keys navigate list
- [ ] Typing more characters refilters results
