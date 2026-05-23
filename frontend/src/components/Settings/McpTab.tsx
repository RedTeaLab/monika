import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../../store'
import Modal, { ModalActions, ModalButton } from '../ui/Modal'
import ConfirmModal from '../Chat/ConfirmModal'
import { IconServer, IconEdit, IconTrash, IconPlus } from '../Icons'

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
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

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
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
        >
          <IconPlus size={12} />
          Add Server
        </button>
      </div>

      {servers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-dim)]">
          <IconServer size={32} />
          <span className="text-[13px] mt-3">No MCP servers configured.</span>
          <span className="text-[11px] mt-1">Click "Add Server" to configure one.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map((srv) => (
            <div
              key={srv.id}
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
                    <span className="font-mono text-[11px]">{srv.command} {(srv.args || []).join(' ')}</span>
                  </div>
                </div>
                <div className="opacity-0 group-hover/card:opacity-100 transition-opacity flex gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(srv)}
                    className="inline-flex items-center text-[var(--text-dim)] hover:text-[var(--text-primary)] text-[11px] px-1.5 py-0.5 cursor-pointer bg-transparent border-none rounded transition-colors"
                    aria-label={`Edit ${srv.id}`}
                  >
                    <IconEdit size={13} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(srv.id)}
                    className="inline-flex items-center text-[var(--text-dim)] hover:text-[var(--red)] text-[11px] px-1.5 py-0.5 cursor-pointer bg-transparent border-none rounded transition-colors"
                    aria-label={`Delete ${srv.id}`}
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
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

      {confirmDelete && (
        <ConfirmModal
          title="Delete MCP Server"
          message={`Are you sure you want to delete "${confirmDelete}"? This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={async () => { await handleDelete(confirmDelete); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
