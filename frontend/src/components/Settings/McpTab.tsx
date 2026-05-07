import { useState, useEffect, useCallback } from 'react'

interface MCPServerInfo {
  id: string
  command: string
  args: string
  env: string
  status: 'connected' | 'disconnected'
}

function emptyServer(): MCPServerInfo {
  return { id: '', command: '', args: '', env: '', status: 'disconnected' }
}

export default function McpTab() {
  const [servers, setServers] = useState<MCPServerInfo[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<MCPServerInfo>(emptyServer())

  useEffect(() => {
    try {
      const saved = localStorage.getItem('monika-mcp-servers')
      if (saved) setServers(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [])

  const persistServers = useCallback((s: MCPServerInfo[]) => {
    setServers(s)
    localStorage.setItem('monika-mcp-servers', JSON.stringify(s))
  }, [])

  const openAdd = useCallback(() => {
    setForm(emptyServer())
    setEditingId(null)
    setShowModal(true)
  }, [])

  const openEdit = useCallback((s: MCPServerInfo) => {
    setForm({ ...s })
    setEditingId(s.id)
    setShowModal(true)
  }, [])

  const handleSave = useCallback(() => {
    const trimmed = { ...form, id: form.id.trim(), command: form.command.trim() }
    if (!trimmed.id || !trimmed.command) return
    if (editingId !== null) {
      persistServers(servers.map((s) => (s.id === editingId ? { ...trimmed, status: s.status } : s)))
    } else {
      if (servers.some((s) => s.id === trimmed.id)) return
      persistServers([...servers, { ...trimmed, status: 'disconnected' }])
    }
    setShowModal(false)
    setForm(emptyServer())
    setEditingId(null)
  }, [form, editingId, servers, persistServers])

  const handleDelete = useCallback((id: string) => {
    persistServers(servers.filter((s) => s.id !== id))
  }, [servers, persistServers])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowModal(false)
      setForm(emptyServer())
      setEditingId(null)
    }
  }, [])

  const argsList = form.args ? form.args.split(',').map((a) => a.trim()).filter(Boolean) : []
  const envLines = form.env ? form.env.split('\n').filter((l) => l.includes('=')) : []

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold m-0 mb-1">MCP</h3>
          <p className="text-[11px] text-[var(--text-dim)] m-0">Manage MCP server connections</p>
        </div>
        <button
          className="px-3 py-1.5 text-[11px] font-medium rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
          onClick={openAdd}
        >
          + Add Server
        </button>
      </div>

      {servers.length > 0 ? (
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="text-left text-[var(--text-dim)] border-b border-[var(--border)]">
              <th className="py-2 pr-4 font-medium">ID</th>
              <th className="py-2 pr-4 font-medium">Command</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((s) => (
              <tr key={s.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-elevated)]">
                <td className="py-2 pr-4 text-[var(--text-primary)] font-mono text-[11px]">{s.id}</td>
                <td className="py-2 pr-4 text-[var(--text-primary)] font-mono text-[11px]">{s.command}</td>
                <td className="py-2 pr-4">
                  {s.status === 'connected' ? (
                    <>
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5"></span>
                      <span className="text-green-400 text-[11px]">connected</span>
                    </>
                  ) : (
                    <>
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5"></span>
                      <span className="text-red-400 text-[11px]">disconnected</span>
                    </>
                  )}
                </td>
                <td className="py-2 pr-4">
                  <div className="flex gap-2">
                    <button
                      className="text-[var(--text-dim)] hover:text-[var(--text-primary)] bg-transparent border-none cursor-pointer text-[11px] p-0"
                      onClick={() => openEdit(s)}
                    >
                      Edit
                    </button>
                    <button
                      className="text-[var(--text-dim)] hover:text-red-400 bg-transparent border-none cursor-pointer text-[11px] p-0"
                      onClick={() => handleDelete(s.id)}
                    >
                      Del
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="flex flex-col items-center justify-center h-48 text-[var(--text-dim)]">
          <span className="text-[13px]">No MCP servers configured.</span>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => { setShowModal(false); setForm(emptyServer()); setEditingId(null) }}
        >
          <div
            role="dialog"
            aria-modal
            className="bg-[var(--bg-elevated)] rounded-[var(--radius-lg)] w-[420px] p-5"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            <h4 className="text-[14px] font-semibold m-0 mb-4">
              {editingId !== null ? 'Edit Server' : 'Add Server'}
            </h4>

            <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">ID</label>
            <input
              className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] mb-3"
              placeholder="my-server"
              value={form.id}
              onChange={(e) => setForm({ ...form, id: e.target.value })}
              onKeyDown={handleKeyDown}
              autoFocus
              disabled={editingId !== null}
            />

            <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Command</label>
            <input
              className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] mb-3"
              placeholder="npx -y @anthropic/mcp-server"
              value={form.command}
              onChange={(e) => setForm({ ...form, command: e.target.value })}
              onKeyDown={handleKeyDown}
            />

            <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">
              Args <span className="text-[var(--text-dim)] font-normal">(comma-separated)</span>
            </label>
            <input
              className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] mb-3"
              placeholder="--port, 8080"
              value={form.args}
              onChange={(e) => setForm({ ...form, args: e.target.value })}
              onKeyDown={handleKeyDown}
            />
            {argsList.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {argsList.map((a, i) => (
                  <span key={i} className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-dim)]">
                    {a}
                  </span>
                ))}
              </div>
            )}

            <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">
              Env Vars <span className="text-[var(--text-dim)] font-normal">(KEY=VALUE per line)</span>
            </label>
            <textarea
              className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] mb-3 resize-none"
              rows={3}
              placeholder="API_KEY=xxx&#10;DEBUG=true"
              value={form.env}
              onChange={(e) => setForm({ ...form, env: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Escape') handleKeyDown(e) }}
            />
            {envLines.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {envLines.map((l, i) => (
                  <span key={i} className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-dim)]">
                    {l.trim()}
                  </span>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] px-3 py-1.5 text-[13px] rounded-[2px] transition-colors disabled:opacity-50"
                onClick={() => { setShowModal(false); setForm(emptyServer()); setEditingId(null) }}
              >
                Cancel
              </button>
              <button
                className="bg-[var(--accent)] text-white px-3 py-1.5 text-[13px] rounded-[2px] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleSave}
                disabled={!form.id.trim() || !form.command.trim()}
              >
                {editingId !== null ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
