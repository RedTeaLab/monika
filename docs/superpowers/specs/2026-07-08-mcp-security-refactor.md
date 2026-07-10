# MCP Security Refactor — Design Spec

**Date**: 2026-07-08
**Branch**: `feat/mcp-security-refactor`
**Status**: Implemented

## Summary

Refactor MCP (Model Context Protocol) server management to enforce strict separation between configuration and credentials, prevent sensitive data from leaking into LLM context, and add auto-discovery of third-party MCP configurations.

## Motivation

Before this refactor:
- MCP server credentials (env vars, headers, URL auth) were stored inline in `config.json` — visible to any `file_read` call
- The `list_mcp_servers` tool exposed `env` and raw URLs to the LLM
- All config writes went to a single global file — no project-level scoping
- MCP servers had no lifecycle management after save/delete — required app restart
- No auto-discovery of existing MCP configs from `.cursor/mcp.json` etc.

## Goals

1. **Credential isolation**: `env`/`headers`/URL auth stored in `credentials.json` (0600), never in `config.json`
2. **LLM blindness**: Agent cannot see or read credentials via any tool
3. **Project/global scope**: Config split between global (`~/.monika/`) and project (`<project>/.monika/`)
4. **Auto-discovery**: Scan `.cursor/mcp.json`, `.claude/mcp.json`, `mcp.json` on project open
5. **Lifecycle management**: Save/delete/reconnect wire through the full connect/disconnect cycle
6. **Backward compatibility**: Old configs with inline credentials auto-migrate on load

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Disk                                                    │
│                                                          │
│  ~/.monika/config.json          (global config, no creds)│
│  ~/.monika/credentials.json     (global creds, 0600)     │
│                                                          │
│  <project>/.monika/config.json (project config, no creds)│
│  <project>/.monika/credentials.json (project, 0600)      │
│  <project>/.cursor/mcp.json     (third-party, read-only) │
│  <project>/.claude/mcp.json     (third-party, read-only) │
│  <project>/mcp.json             (third-party, read-only) │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  Load Flow                                               │
│                                                          │
│  1. MigrateInlineCredentials()  ── strip inline creds    │
│  2. Read global config.json                              │
│  3. Merge project config.json (MCP dedup by ID)          │
│  4. Load global credentials.json → ApplyCredentialsStore │
│  5. Load project credentials.json → ApplyCredentialsStore│
│                                                          │
│  Result: in-memory Config with creds applied,            │
│          disk files have creds stripped                  │
└─────────────────────────────────────────────────────────┘
         │
         ├──────────────────┐
         ▼                  ▼
┌─────────────────┐  ┌──────────────────────────────────┐
│  Wails API      │  │  LLM Tools                       │
│  (for frontend) │  │  (for agent)                     │
│                 │  │                                  │
│  ListMCPServers │  │  list_mcp_servers                │
│  → returns env, │  │  → no Env field                  │
│    headers, url │  │  → maskURL() redacts URL auth    │
│    (user needs  │  │  → LLM cannot see credentials    │
│     to edit)    │  │                                  │
└─────────────────┘  └──────────────────────────────────┘
```

---

## Implementation Details

### 1. Credential Separation (`internal/config/credentials.go`)

**Structures:**

```go
type CredentialEntry struct {
    Env     map[string]string  // env vars
    Headers map[string]string  // HTTP headers
    URLAuth string             // URL-embedded auth (user:pass)
}

type CredentialStore struct {
    Entries map[string]CredentialEntry  // keyed by server ID
}
```

**Core functions:**

| Function | Purpose |
|----------|---------|
| `StripCredentials(entry)` | Removes `Env`/`Headers`/URL auth from server entry, returns them as `CredentialEntry` |
| `ApplyCredentials(entry, cred)` | Re-injects credentials into in-memory entry |
| `ApplyCredentialsStore(cfg, store)` | Applies all credentials to a Config |
| `SplitURL(rawURL)` → `(clean, auth)` | Regex-based URL auth extraction (avoids `net/url` percent-encoding) |
| `JoinURL(clean, auth)` | Reverse of SplitURL |
| `LoadCredentials(path)` | Reads credentials.json, returns empty store if not exists |
| `SaveCredentials(path, store)` | Atomic write (tmp + rename), 0600 permission |
| `UpdateCredentials(path, id, cred)` | Load → upsert → save (deletes file if empty) |
| `DeleteCredentials(path, id)` | Load → delete entry → save (deletes file if empty) |
| `MigrateInlineCredentials(configPath, credPath)` | One-time migration: scans config for inline creds, strips to credentials.json. Idempotent. |

**URL auth extraction** uses regex `(://)([^/@]+)@` rather than `net/url` to avoid percent-encoding edge cases.

### 2. Config Scope Split (`internal/api/app.go`)

| Helper | Returns |
|--------|---------|
| `configPathForScope("global")` | `~/.monika/config.json` |
| `configPathForScope("project")` | `<project>/.monika/config.json` |
| `credentialsPathForScope("global")` | `~/.monika/credentials.json` |
| `credentialsPathForScope("project")` | `<project>/.monika/credentials.json` |
| `normalizeScope(scope)` | Validates, defaults `"project"` |

All config writes go through `writeConfigForScope(scope, mutatorFn)`.

`reloadMergedConfig()` reads both scopes, merges (MCP dedup by ID: project overrides global), then applies credentials from both scopes.

### 3. LLM Data Hiding

**`list_mcp_servers` tool** (`internal/tool/builtin/mcp_list.go`):
- `MCPServerInfo` struct has **no `Env` field** — LLM never sees environment variables
- `maskURL()` redacts URL credentials: `https://user:pass@host` → `https://***@host`

**`file_read`/`file_edit`/`patch` blacklist** (`internal/permission/hard_rule.go`):
- `defaultBuiltinBlacklist()` denies all three tools on pattern `.monika/credentials.json`
- `CheckBuiltinBlacklist()` uses `strings.Contains` with path normalization (`\` → `/`) instead of `strings.HasPrefix` — matches absolute paths correctly

**Important**: Two separate code paths for MCP server data:
- **Wails `ListMCPServers()`** → returns full data including `Env`/`Headers`/`URL` — for the **frontend Settings UI** (user needs to see/edit their own credentials)
- **Tool `list_mcp_servers`** → strips `Env`, masks URL — for the **LLM** (zero sensitive data in context)

### 4. MCP Auto-Discovery (`internal/mcpdiscovery/mcpdiscovery.go`)

On project open, scans for:
- `.cursor/mcp.json`
- `.claude/mcp.json`
- `mcp.json` (project root)

Flow:
1. `Scan(projectDir)` → reads all files, parses `mcpServers` map
2. `FilterExisting(servers, configuredIDs)` → skip already-configured
3. For each new server: `StripCredentials` → write to project config → write to project credentials
4. `reloadMergedConfig()` → `syncMCPServers()` connects them
5. Emit `mcp-discovered` event → frontend shows toast notification

Discovery is **pure backend** — no LLM involvement. Servers are imported to project scope.

### 5. MCP Lifecycle Management

Four helper methods in `app.go`:

| Method | What it does |
|--------|-------------|
| `getMCPEngine()` | Returns initialized MCPEngine (reduces boilerplate) |
| `connectMCPServer(entry)` | Connect via MCPEngine → ListTools → `mcpRegistry.AddServer()` |
| `disconnectMCPServer(id)` | `MCPEngine.DisconnectServer()` → `mcpRegistry.RemoveServer()` |
| `syncMCPServers()` | Diff `a.cfg` vs registry: connect new servers, disconnect stale ones |

Wired into:
- **`SaveMCPServer`**: disconnect old → save config → connect new
- **`DeleteMCPServer`**: disconnect → delete from config
- **`ReconnectMCPServer`**: disconnect → connect (now registers in registry)
- **`onProjectSwitch`**: `syncMCPServers()` after `reloadMergedConfig()`
- **`ImportMCPServers`**: `syncMCPServers()` after reload

### 6. Inline Credential Auto-Migration

`MigrateInlineCredentials(configPath, credPath)`:
1. Reads config file (JSON or YAML)
2. For each MCP server: calls `StripCredentials`
3. If any credentials stripped:
   - Rewrites config file (without secrets)
   - Merges credentials into existing `credentials.json`
4. Idempotent — no-op if no inline credentials found

Called from:
- `config.Load()` — before loading, for both global and project scopes
- `reloadMergedConfig()` — before reading, for both scopes

### 7. Frontend Changes

- **Scope selector**: Add modal has dropdown to choose `project` / `global` scope
- **Auto-discovery toast**: Listens for `mcp-discovered` Wails event, shows toast with discovered server names, auto-refreshes server list
- **Scope badge**: ServerCard shows project/global badge with tooltip indicating storage location

---

## Files Changed

### New Files

| File | Purpose | Tests |
|------|---------|-------|
| `internal/config/credentials.go` | Credential store: Strip/Apply/Load/Save/Update/Delete + Migrate | — |
| `internal/config/credentials_test.go` | URL split/join, strip/apply round-trip, save/load, update/delete, migration | 13 tests |
| `internal/mcpdiscovery/mcpdiscovery.go` | Scan third-party MCP configs, parse, filter, format | — |
| `internal/mcpdiscovery/mcpdiscovery_test.go` | Cursor/Claude/root scan, dedup, filter, summary | 7 tests |
| `internal/tool/builtin/mcp_list_test.go` | URL masking tests | 5 tests |

### Modified Files

| File | Changes |
|------|---------|
| `internal/config/config.go` | `Load()`: migration + credential loading; `Merge()`: MCP dedup by ID |
| `internal/api/app.go` | Scope helpers, credential helpers, lifecycle helpers (connect/disconnect/sync), all MCP CRUD uses scope+credentials, migration in reload, auto-discovery, `mcp-discovered` event |
| `internal/permission/hard_rule.go` | `defaultBuiltinBlacklist()`, `CheckBuiltinBlacklist()` (Contains + normalization), `extractMatchValue()` adds `file_read` |
| `internal/agent/agent_loop.go` | Permission check moved to top of both tool execution loops |
| `internal/tool/builtin/mcp_list.go` | `MCPServerInfo` removes `Env`; `maskURL()` |
| `internal/tool/builtin/mcp_install.go` | `scope` parameter |
| `internal/tool/builtin/mcp_uninstall.go` | `scope` parameter |
| `main.go` | MCP startup connection (unchanged logic, reads from merged config) |
| `frontend/src/components/Settings/McpTab.tsx` | Scope selector in Add modal, scope injection in handleImport |
| `frontend/src/store/index.ts` | `mcp-discovered` event listener → toast + reload |

---

## Security Model

### What the LLM CAN see
- MCP server IDs, types (stdio/http), commands, args
- Server URLs with auth redacted (`https://***@host`)
- Connection status (connected/disconnected)
- Tool counts and names

### What the LLM CANNOT see
- Environment variables (`env`)
- HTTP headers (`headers`)
- URL credentials (`user:pass@`)
- Contents of `credentials.json` (blocked by `file_read`/`file_edit`/`patch` blacklist)
- Contents of `config.json` MCP `env`/`headers` fields (stripped on save)

### Defense layers
1. **Storage**: Credentials in `credentials.json` (0600), not in `config.json`
2. **Tool output**: `list_mcp_servers` strips `Env`, masks URL
3. **File access**: Blacklist denies `file_read`/`file_edit`/`patch` on `credentials.json`
4. **Path matching**: `strings.Contains` + normalization (not `HasPrefix`) ensures blacklist works on absolute paths

---

## Backward Compatibility

- Old configs with inline credentials continue to work
- `MigrateInlineCredentials` runs transparently on every `config.Load()` and `reloadMergedConfig()`
- First save after migration splits credentials automatically
- YAML configs are handled (stripped as YAML, later converted to JSON by existing `migrateToJSON`)
- `credentials.json` auto-deleted when no entries remain (no orphan files)

---

## Known Limitations

1. **Startup**: `bootstrap.InitProvider` is called with `projectDir=""`, so only global MCP servers connect at startup. Project-level servers connect when a project is opened via `syncMCPServers()`.
2. **Wails `ListMCPServers`** returns full credentials to the frontend — this is intentional (user needs to edit them in Settings UI). The security boundary is between frontend and LLM, not between disk and frontend.
3. **`TestMCPServerConfig`** accepts raw env/headers from frontend for connection testing — not persisted, only used for the test.
4. **`isMCPConnected`** has a FIXME comment about using a probe-based approach — pre-existing, not addressed in this refactor.
