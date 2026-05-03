# Dockview Panel System Design

## Overview

Replace the hardcoded App.tsx layout with a dynamic panel system using the `dockview` library, unifying SessionList、ChatArea、FileEditor、FileTree、Console into dockview panels with custom Tab headers.

## Motivation

- 5 components share similar structure (header/tab + content) but implement it differently
- Resize logic is duplicated in App.tsx (PanelResizeHandle, DragDivider, Console resize handle)
- Layout is rigid — no panel reordering, splitting, or floating
- Adding a new panel type requires manual App.tsx changes

## Library Choice: dockview v5.2.0

- Zero dependencies, MIT license
- React 18.x compatible (matches current `react@^18.2.0`)
- Full docking: tabs, groups, grids, split-views, floating panels, popout windows
- Layout JSON serialization/deserialization
- Custom tab components per panel type
- ~61KB minified

## Architecture

```
App.tsx
├── TitleBar
├── <DockviewReact>          ← new
│   components:
│     'chat'     → ChatArea   (TabBar removed)
│     'editor'   → FileEditor (TabBar removed)
│     'filetree' → FileTree
│     'session'  → SessionList
│     'console'  → Console    (resize handle removed)
│   tabComponents:
│     'chat-tab'     → ChatTab      (status indicator + close)
│     'editor-tab'   → EditorTab    (more-menu + close)
│     'session-tab'  → DefaultTab   (close only)
│     'filetree-tab' → DefaultTab   (close only)
│     'console-tab'  → DefaultTab   (close only)
├── StatusBar (精简，去掉 panel toggle)
```

## Component Changes

### App.tsx
- Remove: `PanelResizeHandle`, `DragDivider`, all `useState` layout dimensions
- Remove: `showSidebar`, `showChat`, `showFileTree`, `showFileEditor`, `showConsole` state
- Add: `DockviewReact` wrapper
- Keep: TitleBar, StatusBar

### ChatArea
- Remove internal `<TabBar>` usage — each session becomes a dockview panel
- Multiple chat sessions stack as tabs within the same dockview group (TabGroup)
- Single-session view: one panel fills the group, tab shows session title
- Multi-session view: all panels in same group, user switches via dockview tabs

### FileEditor
- Remove internal `<TabBar>` usage — files become dockview tabs
- Use `renderer: 'always'` to preserve CodeMirror instances on tab switch
- More-menu in tab header for Edit View / Diff View toggle

### Console
- Remove resize handle (dockview manages panel sizing)
- Header/"Console" title becomes dockview tab

### FileTree & SessionList
- Minimal changes — wrap content, no TabBar needed (single-tab panels)

### TabBar.tsx
- Removed. dockview's built-in tab system replaces it.
- Overflow menu, close button, status indicators are re-implemented in custom tabComponents.
- ModelPicker moves to dockview's header actions area (per-group, right side of tab bar).

### StatusBar
- Remove: Chat/Console/FileTree/Editor toggle buttons
- Keep: status indicator, branch name, token count

## Custom Tab Design

Each panel type gets a tailored tabComponent:

### ChatTab
- Status indicator dot (idle/generating/completed/error)
- Title text (session title)
- Close button (×)

### EditorTab
- Title text (filename)
- Dirty indicator (●)
- More-menu button (···) with dropdown: Edit View / Diff View
- Close button (×)

### DefaultTab (SessionList, FileTree, Console)
- Title text
- Close button (×)

## State Management

### Zustand Store Changes

Removed:
- `splitRatio` — dockview manages
- `layoutMode` — dockview manages
- `sidebarWidth` / `fileTreeWidth` — dockview manages

Added:
- `dockviewApi: DockviewApi | null` — reference for programmatic control

Kept (business state):
- `openSessions`, `sessionMessages`, `activeSessionId`
- `openFiles`, `activeFilePath`
- `tokenCount`, `consoleLines`
- `generatingSessionId`
- `todoCollapsed`

### Boundary

| dockview manages | Zustand manages |
|------------------|-----------------|
| Panel position, size, split ratio | Session/message data |
| Tab drag-and-drop, grouping | File content, editor state |
| Layout serialization | Business logic state |
| Panel lifecycle (show/hide) | Token counts, console lines |

### Bridge
- Panel content components read Zustand via `useStore()`
- dockview events (`onDidRemovePanel`, `onDidAddPanel`) update Zustand panel visibility
- `params` only for static serializable data (sessionId, filePath)
- Dynamic data (title, status) always from Zustand, never `api.setTitle()`

## Layout Persistence

- Default layout defined as JSON config
- User adjustments auto-saved via `onDidLayoutChange` + debounce 500ms → `api.toJSON()` → localStorage (keyed by project path)
- First open or corrupted layout → restore from default

### Default Layout

```
┌──────────┬──────────────┬──────────────────────┬──────────┐
│ session  │  chat        │  editor              │ filetree │
│ (224px)  │  (flex)      │  (flex)              │ (224px)  │
│          │              │                      │          │
│          │              │                      │          │
├──────────┴──────────────┴──────────────────────┴──────────┤
│ console (200px)                                            │
└───────────────────────────────────────────────────────────┘
```

- session (左) | chat (中左) | editor (中右) | filetree (右) — 水平排列
- 底部: console
- Chat 和 editor 各占 flex 空间，通过 split 分隔
- 每个 panel 可通过 tab × 关闭；StatusBar toggle 已移除

## Key Interactions

### Dirty File Close Guard
- EditorTab's custom close button checks dirty state BEFORE calling `api.close()`
- If file is dirty, show ConfirmModal inline
- User cancels → do nothing (never call `api.close()`)
- User confirms → destroy CodeMirror instance, clear from LRU cache, then `api.close()`

### Sub-Agent Sessions
- `SpawnAgent` creates child session → `api.addPanel({ component: 'chat', params: { sessionId } })` in the chat group

### Console Toggle
- Ctrl+` → `api.getPanel('console')` ? `api.removePanel(...)` : `api.addPanel({ id: 'console', ... })`

### Session List Toggle
- Ctrl+B → toggle session panel visibility via `api.addPanel` / `api.removePanel`

## Migration Steps

1. Install `dockview` npm package
2. Create custom tabComponents (ChatTab, EditorTab, DefaultTab)
3. Refactor each panel component — remove TabBar/resize handles, add dockview props interface
4. Rewrite App.tsx — replace layout with DockviewReact
5. Update Zustand store — remove layout fields, add dockviewApi
6. Wire up layout persistence (defaultLayout + localStorage)
7. Clean up StatusBar toggle buttons
8. Test key interactions (dirty close, child sessions, console toggle)
9. Remove unused code (DragDivider, PanelResizeHandle, old layout state)
