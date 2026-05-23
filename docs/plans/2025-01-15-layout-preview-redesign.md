# Layout Redesign: Editor → Preview, Files + Changes Below

## Overview

Replace the multi-tab editor with a read-only Preview panel. Move Files and Changes panels below the preview area, split into two exclusive panels. All panels (Session, Chat, Preview, Files, Changes) are single-tab and non-closable.

## Layout Changes

### Before
```
[session] [chat] [editor (multi-tab)] [filetree-group: FILES + CHANGES stacked]
```

### After
```
[session] [chat] [preview (read-only, single tab)]
                   [files (exclusive)] [changes (exclusive)]
```

## Panel Behavior

| Panel | Closable | Multi-tab | Header |
|---|---|---|---|
| Session | No | No | Hidden (tab container hidden) |
| Chat | No | No | Hidden (tab container hidden) |
| Preview | No | No | Hidden |
| Files | No | No | Hidden |
| Changes | No | No | Hidden |

## Preview Modes

1. **File content mode** — when user clicks a file in Files panel. Uses CodeMirror readonly.
2. **Diff mode** — when user clicks a file in Changes panel, or when agent calls `file_edit`/`file_write`. Side-by-side two-column view.

## Side-by-Side Diff

Backend provides `GetFileDiffSideBySide(filePath)` returning `{old: string, new: string}`.
Frontend renders left column (old, red highlights) and right column (new, green highlights)
with aligned line numbers.

## file_edit Trigger

When `updateToolDone` is called for `file_edit` or `file_write`, parse `filePath`
from tool input, set `lastEditedFile` in store. PreviewPanel watches this field
and fetches diff automatically.
