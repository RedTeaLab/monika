import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../../store'
import Modal, { ModalHeader, ModalBody, ModalFooter, ModalButton } from '../ui/Modal'
import ConfirmModal from '../Chat/ConfirmModal'
import { IconServer, IconTrash, IconPlus, IconZap, IconRefresh, IconEdit } from '../Icons'

function ServerCard({ srv, onDelete, onTest, onReconnect, onEdit, testResult }: {
  srv: ReturnType<typeof useStore.getState>['mcpServers'][0]
  onDelete: () => void
  onTest: () => void
  onReconnect: () => void
  onEdit: () => void
  testResult: { loading: boolean; tools?: string[]; error?: string }
}) {
  const isStdio = srv.type !== 'http' && srv.type !== 'sse'
  return (
    <div
      className="rounded-lg px-4 py-3 w-full relative group/card"
      style={{ background: 'var(--bg-card)' }}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0" style={{ color: 'var(--text-dim)' }}>
          <IconServer size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono text-[14px] font-semibold text-[var(--text-primary)]">{srv.id}</span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-sm font-medium"
              style={{
                background: isStdio ? 'var(--bg-input)' : 'var(--bg-sidebar)',
                border: '1px solid var(--border)',
                color: 'var(--text-dim)',
              }}
            >
              {srv.type || 'stdio'}
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-sm font-medium"
              style={{
                background: srv.scope === 'global' ? 'var(--bg-sidebar)' : 'var(--bg-input)',
                border: '1px solid var(--border)',
                color: 'var(--text-dim)',
              }}
              title={srv.scope === 'global' ? 'Stored in ~/.monika/config.json' : 'Stored in .monika/config.json'}
            >
              {srv.scope || 'project'}
            </span>
            {srv.status === 'connected' ? (
              <span className="inline-flex items-center gap-1 text-green-400 text-[10px]">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
                connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-red-400 text-[10px]">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                disconnected
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-dim)]">
            {isStdio ? (
              <span className="font-mono text-[11px]">{srv.command} {(srv.args || []).join(' ')}</span>
            ) : (
              <span className="font-mono text-[11px]">{srv.url}</span>
            )}
          </div>
          {testResult.tools && (
            <div className="mt-1 text-[10px] text-green-400">
              {testResult.tools.length} tool{testResult.tools.length !== 1 ? 's' : ''}: {testResult.tools.slice(0, 5).join(', ')}{testResult.tools.length > 5 ? '...' : ''}
            </div>
          )}
          {testResult.error && (
            <div className="mt-1 text-[10px] text-[var(--red)]">{testResult.error}</div>
          )}
        </div>
        <div className="opacity-0 group-hover/card:opacity-100 transition-opacity flex gap-1 shrink-0">
          <button
            onClick={onTest}
            disabled={testResult.loading}
            title="Test connection"
            className="inline-flex items-center text-[var(--text-dim)] hover:text-[var(--accent)] text-[11px] px-1.5 py-0.5 cursor-pointer bg-transparent border-none rounded transition-colors"
            aria-label={`Test ${srv.id}`}
          >
            <IconZap size={14} />
          </button>
          <button
            onClick={onReconnect}
            title="Reconnect"
            className="inline-flex items-center text-[var(--text-dim)] hover:text-[var(--accent)] text-[11px] px-1.5 py-0.5 cursor-pointer bg-transparent border-none rounded transition-colors"
            aria-label={`Reconnect ${srv.id}`}
          >
            <IconRefresh size={14} />
          </button>
          <button
            onClick={onEdit}
            title="Edit"
            className="inline-flex items-center text-[var(--text-dim)] hover:text-[var(--accent)] text-[11px] px-1.5 py-0.5 cursor-pointer bg-transparent border-none rounded transition-colors"
            aria-label={`Edit ${srv.id}`}
          >
            <IconEdit size={13} />
          </button>
          <button
            onClick={onDelete}
            className="inline-flex items-center text-[var(--text-dim)] hover:text-[var(--red)] text-[11px] px-1.5 py-0.5 cursor-pointer bg-transparent border-none rounded transition-colors"
            aria-label={`Delete ${srv.id}`}
          >
            <IconTrash size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

function parseMcpJson(text: string): { servers: { id: string; type: string; command: string; args: string[]; env: Record<string, string>; url: string; headers: Record<string, string> }[]; error: string } {
  const trimmed = text.trim()
  if (!trimmed) return { servers: [], error: '' }

  let parsed: any
  try {
    parsed = JSON.parse(trimmed)
  } catch (e: any) {
    return { servers: [], error: `Invalid JSON: ${e.message}` }
  }

  let serverMap = parsed.mcpServers || parsed
  if (typeof serverMap !== 'object' || Array.isArray(serverMap)) {
    return { servers: [], error: 'Expected { "mcpServers": { ... } } or { "server-name": { ... } }' }
  }

  const servers: any[] = []
  for (const [name, cfg] of Object.entries(serverMap)) {
    if (typeof cfg !== 'object' || Array.isArray(cfg)) continue
    const c = cfg as any
    const type = c.type || (c.url ? 'http' : 'stdio')
    servers.push({
      id: name,
      type,
      command: c.command || '',
      args: c.args || [],
      env: c.env || {},
      url: c.url || '',
      headers: c.headers || {},
    })
  }

  if (servers.length === 0) {
    return { servers: [], error: 'No servers found in JSON' }
  }
  return { servers, error: '' }
}

export default function McpTab() {
  const servers = useStore((s) => s.mcpServers)
  const loadServers = useStore((s) => s.loadMCPServers)
  const deleteServer = useStore((s) => s.deleteMCPServer)
  const importServers = useStore((s) => s.importMCPServers)
  const testServer = useStore((s) => s.testMCPServer)
  const testServerConfig = useStore((s) => s.testMCPServerConfig)
  const reconnectServer = useStore((s) => s.reconnectMCPServer)
  const saveServer = useStore((s) => s.saveMCPServer)

  const [showAddModal, setShowAddModal] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importScope, setImportScope] = useState<'project' | 'global'>('project')
  const [addTestResult, setAddTestResult] = useState<Record<string, { loading: boolean; tools?: string[]; error?: string }>>({})
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [testStates, setTestStates] = useState<Record<string, { loading: boolean; tools?: string[]; error?: string }>>({})
  const [editServer, setEditServer] = useState<typeof servers[0] | null>(null)
  const [editJsonText, setEditJsonText] = useState('')
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => { loadServers() }, [loadServers])

  const parsed = parseMcpJson(jsonText)

  const handleImport = useCallback(async () => {
    if (!parsed.servers.length) return
    setImporting(true); setImportError('')
    try {
      let payload = jsonText
      try {
        const parsedJson = JSON.parse(jsonText)
        if (parsedJson && !parsedJson.scope) parsedJson.scope = importScope
        payload = JSON.stringify(parsedJson)
      } catch { /* pass through raw json */ }
      await importServers(payload)
      setJsonText('')
      setShowAddModal(false)
      setAddTestResult({})
    } catch (e: any) {
      setImportError(e?.message || 'Failed to import servers')
    } finally { setImporting(false) }
  }, [jsonText, parsed, importServers, importScope])

  const handleAddTest = useCallback(async (srvId: string) => {
    const srv = parsed.servers.find(s => s.id === srvId)
    if (!srv) return
    setAddTestResult((s) => ({ ...s, [srvId]: { loading: true } }))
    try {
      const tools = await testServerConfig({
        type: srv.type,
        command: srv.command,
        args: srv.args,
        env: srv.env,
        url: srv.url,
        headers: srv.headers,
      })
      setAddTestResult((s) => ({ ...s, [srvId]: { loading: false, tools } }))
    } catch (e: any) {
      setAddTestResult((s) => ({ ...s, [srvId]: { loading: false, error: e?.message || 'Connection failed' } }))
    }
  }, [parsed, testServerConfig])

  const handleTest = useCallback(async (id: string) => {
    setTestStates((s) => ({ ...s, [id]: { loading: true } }))
    try {
      const tools = await testServer(id)
      setTestStates((s) => ({ ...s, [id]: { loading: false, tools } }))
    } catch (e: any) {
      setTestStates((s) => ({ ...s, [id]: { loading: false, error: e?.message || 'Connection failed' } }))
    }
  }, [testServer])

  const handleReconnect = useCallback(async (id: string) => {
    setTestStates((s) => ({ ...s, [id]: { loading: true } }))
    try {
      const tools = await reconnectServer(id)
      setTestStates((s) => ({ ...s, [id]: { loading: false, tools } }))
    } catch (e: any) {
      setTestStates((s) => ({ ...s, [id]: { loading: false, error: e?.message || 'Reconnect failed' } }))
    }
  }, [reconnectServer])

  const handleEditOpen = useCallback((srv: typeof servers[0]) => {
    const isStdio = srv.type !== 'http' && srv.type !== 'sse'
    const serverObj: Record<string, any> = {
      type: srv.type || (isStdio ? 'stdio' : 'http'),
    }
    if (srv.command) serverObj.command = srv.command
    if (srv.args?.length) serverObj.args = srv.args
    if (srv.env && Object.keys(srv.env).length) serverObj.env = srv.env
    if (srv.url) serverObj.url = srv.url
    if (srv.headers && Object.keys(srv.headers).length) serverObj.headers = srv.headers
    const json = JSON.stringify({ mcpServers: { [srv.id]: serverObj } }, null, 2)
    setEditServer(srv)
    setEditJsonText(json)
    setEditError('')
    setEditSaving(false)
  }, [])

  const handleEditSave = useCallback(async () => {
    if (!editServer) return
    const parsed = parseMcpJson(editJsonText)
    if (parsed.error || !parsed.servers.length) {
      setEditError(parsed.error || 'No servers found in JSON')
      return
    }
    setEditSaving(true); setEditError('')
    try {
      for (const s of parsed.servers) {
        await saveServer({
          id: s.id,
          type: s.type,
          command: s.command,
          args: s.args,
          env: s.env,
          url: s.url,
          headers: s.headers,
          status: editServer.status,
          scope: editServer.scope,
        })
      }
      setEditServer(null)
    } catch (e: any) {
      setEditError(e?.message || 'Failed to save')
    } finally { setEditSaving(false) }
  }, [editServer, editJsonText, saveServer])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold m-0 mb-1">MCP Servers</h3>
          <p className="text-[11px] text-[var(--text-dim)] m-0">Manage MCP server connections</p>
        </div>
          <button
            onClick={() => { setShowAddModal(true); setJsonText(''); setImportError(''); setImportScope('project'); setAddTestResult({}) }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
        >
          <IconPlus size={12} />
          Add
        </button>
      </div>

      {/* Server list */}
      {servers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-dim)]">
          <IconServer size={32} />
          <span className="text-[13px] mt-3">No MCP servers configured.</span>
          <span className="text-[11px] mt-1">Click "Add" to paste JSON config.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map((srv) => (
            <ServerCard
              key={srv.id}
              srv={srv}
              onDelete={() => setConfirmDelete(srv.id)}
              onTest={() => handleTest(srv.id)}
              onReconnect={() => handleReconnect(srv.id)}
              onEdit={() => handleEditOpen(srv)}
              testResult={testStates[srv.id] || { loading: false }}
            />
          ))}
        </div>
      )}

      {/* Add modal */}
      {showAddModal && (
        <Modal onClose={() => setShowAddModal(false)} loading={importing} width={540}>
          <ModalHeader icon={<IconServer size={15} />}>
            <h4 className="text-[14px] font-semibold m-0">Add MCP Server</h4>
          </ModalHeader>
          <ModalBody>
            <div className="flex items-center gap-2 mb-3">
              <label className="text-[11px] font-medium text-[var(--text-secondary)]">Scope:</label>
              <select
                value={importScope}
                onChange={(e) => setImportScope(e.target.value as 'project' | 'global')}
                className="text-[11px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-primary)] outline-none cursor-pointer"
              >
                <option value="project">project (.monika/config.json)</option>
                <option value="global">global (~/.monika/config.json)</option>
              </select>
            </div>
            <textarea
              value={jsonText}
              onChange={(e) => { setJsonText(e.target.value); setImportError('') }}
              placeholder={'{\n  "mcpServers": {\n    "server-name": {\n      "type": "stdio",\n      "command": "npx",\n      "args": ["-y", "@scope/package"],\n      "env": { "API_KEY": "..." }\n    }\n  }\n}'}
              className="w-full text-[12px] font-mono px-3 py-2.5 rounded-md resize-y outline-none focus:border-[var(--border-strong)] form-input-glow transition-colors duration-150"
              style={{
                background: 'var(--bg-console)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                minHeight: '160px',
              }}
              rows={8}
              autoFocus
            />

            {importError && (
              <p className="text-[11px] text-[var(--red)] m-0 mt-3">{importError}</p>
            )}

            {parsed.error && jsonText.trim() && (
              <p className="text-[11px] text-[var(--red)] m-0 mt-3">{parsed.error}</p>
            )}

            {parsed.servers.length > 0 && !parsed.error && (
              <div className="mt-4 space-y-2">
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-2">Detected Servers</label>
                {parsed.servers.map((s) => {
                  const result = addTestResult[s.id]
                  const isStdio = s.type !== 'http' && s.type !== 'sse'
                  return (
                    <div
                      key={s.id}
                      className="rounded-md px-3 py-2.5 flex items-center gap-3"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                    >
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-sm font-medium shrink-0"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}
                      >
                        {s.type}
                      </span>
                      <span className="font-mono text-[12px] font-semibold text-[var(--text-primary)]">{s.id}</span>
                      <span className="font-mono text-[11px] text-[var(--text-dim)] truncate flex-1 min-w-0">
                        {isStdio ? `${s.command} ${s.args.join(' ')}` : s.url}
                      </span>
                      <button
                        onClick={() => handleAddTest(s.id)}
                        disabled={result?.loading}
                        title="Test connection"
                        className="inline-flex items-center text-[var(--text-dim)] hover:text-[var(--accent)] text-[11px] px-1.5 py-0.5 cursor-pointer bg-transparent border-none rounded transition-colors shrink-0"
                      >
                        <IconZap size={14} />
                      </button>
                      <div className="shrink-0 text-[10px] min-w-0">
                        {result?.loading && <span className="text-[var(--text-dim)]">Testing...</span>}
                        {result?.tools && <span className="text-green-400">{result.tools.length} tools</span>}
                        {result?.error && <span className="text-[var(--red)]">{result.error}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <ModalButton onClick={() => setShowAddModal(false)} disabled={importing}>Cancel</ModalButton>
            <ModalButton
              variant="primary"
              onClick={handleImport}
              disabled={importing || parsed.servers.length === 0 || !!parsed.error}
            >
              {importing ? 'Importing...' : 'Import'}
            </ModalButton>
          </ModalFooter>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete MCP Server"
          message={`Are you sure you want to delete "${confirmDelete}"? This action cannot be undone.`}
          confirmLabel="Delete"
          icon={<IconTrash size={15} />}
          onConfirm={async () => {
            const srv = servers.find(s => s.id === confirmDelete)
            await deleteServer(confirmDelete, srv?.scope)
            setConfirmDelete(null)
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Edit modal */}
      {editServer && (
        <Modal onClose={() => setEditServer(null)} loading={editSaving} width={540}>
          <ModalHeader icon={<IconEdit size={15} />}>
            <h4 className="text-[14px] font-semibold m-0">Edit MCP Server</h4>
          </ModalHeader>
          <ModalBody>
            <textarea
              value={editJsonText}
              onChange={(e) => { setEditJsonText(e.target.value); setEditError('') }}
              className="w-full text-[12px] font-mono px-3 py-2.5 rounded-md resize-y outline-none focus:border-[var(--border-strong)] form-input-glow transition-colors duration-150"
              style={{
                background: 'var(--bg-console)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                minHeight: '180px',
              }}
              rows={10}
              autoFocus
            />
            {editError && (
              <p className="text-[11px] text-[var(--red)] m-0 mt-3">{editError}</p>
            )}
          </ModalBody>
          <ModalFooter>
            <ModalButton onClick={() => setEditServer(null)} disabled={editSaving}>Cancel</ModalButton>
            <ModalButton
              variant="primary"
              onClick={handleEditSave}
              disabled={editSaving}
            >
              {editSaving ? 'Saving...' : 'Save'}
            </ModalButton>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}
