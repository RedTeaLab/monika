import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../../store'
import Modal, { ModalActions, ModalButton } from '../ui/Modal'

export default function McpTab() {
  const servers = useStore((s) => s.mcpServers)
  const loadServers = useStore((s) => s.loadMCPServers)
  const saveServer = useStore((s) => s.saveMCPServer)
  const deleteServer = useStore((s) => s.deleteMCPServer)

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [id, setId] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [envStr, setEnvStr] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadServers() }, [loadServers])

  const openAdd = () => {
    setEditingId(null); setId(''); setCommand(''); setArgs(''); setEnvStr(''); setError('')
    setShowModal(true)
  }

  const openEdit = (srv: typeof servers[0]) => {
    setEditingId(srv.id); setId(srv.id); setCommand(srv.command)
    setArgs((srv.args || []).join(', '))
    setEnvStr(''); setError('')
    setShowModal(true)
  }

  const handleSave = useCallback(async () => {
    if (!id.trim() || !command.trim()) { setError('ID and Command are required'); return }
    setLoading(true); setError('')
    const argList = args.split(',').map(s => s.trim()).filter(Boolean)
    const env: Record<string, string> = {}
    if (envStr.trim()) {
      envStr.split('\n').forEach(line => {
        const eq = line.indexOf('=')
        if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
      })
    }
    try {
      await saveServer({ id: id.trim(), command: command.trim(), args: argList, status: 'disconnected' } as any)
      setShowModal(false)
    } catch { setError('Failed to save server') }
    finally { setLoading(false) }
  }, [id, command, args, envStr, saveServer])

  const handleDelete = useCallback(async (serverId: string) => {
    await deleteServer(serverId)
  }, [deleteServer])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold m-0 mb-1">MCP</h3>
          <p className="text-[11px] text-[var(--text-dim)] m-0">Manage MCP server connections</p>
        </div>
        <button onClick={openAdd} className="px-3 py-1.5 text-[11px] font-medium rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors">+ Add Server</button>
      </div>

      {servers.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-[var(--text-dim)]">
          <span className="text-[13px]">No MCP servers configured.</span>
        </div>
      ) : (
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="text-left text-[var(--text-dim)] border-b border-[var(--border)]">
              <th className="py-2 pr-4 font-medium">ID</th>
              <th className="py-2 pr-4 font-medium">Command</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 font-medium w-[100px]"></th>
            </tr>
          </thead>
          <tbody>
            {servers.map((srv) => (
              <tr key={srv.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-elevated)]">
                <td className="py-2 pr-4 font-mono text-[11px]">{srv.id}</td>
                <td className="py-2 pr-4 font-mono text-[10px] text-[var(--text-dim)]">{srv.command} {(srv.args || []).join(' ')}</td>
                <td className="py-2 pr-4">
                  {srv.status === 'connected' ? (
                    <span className="inline-flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" /><span className="text-green-400 text-[11px]">connected</span></span>
                  ) : (
                    <span className="inline-flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" /><span className="text-red-400 text-[11px]">disconnected</span></span>
                  )}
                </td>
                <td className="py-2">
                  <button onClick={() => openEdit(srv)} className="text-[var(--text-dim)] hover:text-[var(--text-primary)] text-[11px] px-1">Edit</button>
                  <button onClick={() => handleDelete(srv.id)} className="text-[var(--text-dim)] hover:text-red-400 text-[11px] px-1">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <Modal onClose={() => setShowModal(false)} loading={loading} width={460}>
          <h4 className="text-[14px] font-semibold m-0 mb-4">{editingId ? 'Edit Server' : 'Add Server'}</h4>
          <div className="space-y-3">
            <div><label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">ID</label>
              <input className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" value={id} onChange={e => setId(e.target.value)} disabled={!!editingId} /></div>
            <div><label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Command</label>
              <input className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" value={command} onChange={e => setCommand(e.target.value)} /></div>
            <div><label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Args (comma-separated)</label>
              <input className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" value={args} onChange={e => setArgs(e.target.value)} /></div>
            <div><label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Env (KEY=VALUE per line)</label>
              <textarea className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent)] resize-y" rows={3} value={envStr} onChange={e => setEnvStr(e.target.value)} /></div>
          </div>
          {error && <p className="text-[11px] text-[var(--red)] m-0 mt-3">{error}</p>}
          <ModalActions>
            <ModalButton onClick={() => setShowModal(false)} disabled={loading}>Cancel</ModalButton>
            <ModalButton variant="primary" onClick={handleSave} disabled={loading || !id.trim() || !command.trim()}>
              {loading ? 'Saving...' : 'Save'}
            </ModalButton>
          </ModalActions>
        </Modal>
      )}
    </div>
  )
}
