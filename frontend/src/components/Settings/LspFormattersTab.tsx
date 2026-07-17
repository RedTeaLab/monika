import { useState, useEffect } from 'react'
import { useStore } from '../../store'
import Modal, { ModalHeader, ModalBody, ModalFooter, ModalButton } from '../ui/Modal'
import { Button, IconButton, Input, Select, Checkbox, Tabs } from '../ui'
import {
    SettingsTabHeader,
    SettingsScopeToggle,
    SettingsSectionHeader,
    SettingsEmptyState,
} from './shared'
import { IconServer, IconTrash, IconPlus, IconEdit, IconRefresh } from '../Icons'

const LANGUAGES = [
    'go', 'python', 'typescript', 'javascript', 'rust', 'lua',
    'shell', 'c', 'cpp', 'java', 'ruby', 'php',
    'swift', 'kotlin', 'csharp', 'scss', 'css', 'html',
    'json', 'yaml', 'markdown',
]

const labelCls = 'block text-[11px] font-medium text-[var(--text-secondary)] mb-1.5'

// --- LSP Server Card ---

function LspServerCard({ name, srv, onEdit, onDelete }: {
    name: string
    srv: { command: string; args?: string[]; fileTypes: string[]; rootMarkers?: string[]; disabled?: boolean }
    onEdit: () => void
    onDelete: () => void
}) {
    return (
        <div className="rounded-lg px-4 py-3 w-full relative group/card" style={{ background: 'var(--bg-card)' }}>
            <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0" style={{ color: 'var(--text-dim)' }}>
                    <IconServer size={16} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-[14px] font-semibold text-[var(--text-primary)]">{name}</span>
                        {srv.disabled && (
                            <span className="text-[10px] px-1 py-0.5 rounded-sm font-medium bg-[var(--bg-input)] text-[var(--red)]">disabled</span>
                        )}
                    </div>
                    <div className="text-[11px] text-[var(--text-dim)] font-mono">
                        {srv.command} {(srv.args || []).join(' ')}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                        {(srv.fileTypes || []).map(ft => (
                            <span key={ft} className="text-[10px] px-1.5 py-0.5 rounded-sm" style={{ background: 'var(--bg-input)', color: 'var(--text-dim)' }}>
                                {ft}
                            </span>
                        ))}
                    </div>
                </div>
                <div className="opacity-0 group-hover/card:opacity-100 transition-opacity flex gap-1 shrink-0">
                    <button onClick={onEdit} title="Edit" className="inline-flex items-center text-[var(--text-dim)] hover:text-[var(--accent)] text-[11px] px-1.5 py-0.5 cursor-pointer bg-transparent border-none rounded transition-colors">
                        <IconEdit size={13} />
                    </button>
                    <button onClick={onDelete} className="inline-flex items-center text-[var(--text-dim)] hover:text-[var(--red)] text-[11px] px-1.5 py-0.5 cursor-pointer bg-transparent border-none rounded transition-colors">
                        <IconTrash size={13} />
                    </button>
                </div>
            </div>
        </div>
    )
}

// --- Formatter Card ---

function FormatterCard({ lang, cfg, onEdit, onDelete }: {
    lang: string
    cfg: { command: string; args?: string[]; ref?: string }
    onEdit: () => void
    onDelete: () => void
}) {
    const isLsp = cfg.ref === 'lsp'
    return (
        <div className="rounded-lg px-4 py-3 w-full relative group/card" style={{ background: 'var(--bg-card)' }}>
            <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0 font-mono text-[12px] font-semibold" style={{ color: 'var(--accent)' }}>
                    {lang}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                        {isLsp ? (
                            <span className="text-[12px] text-[var(--text-dim)]">Use LSP formatting</span>
                        ) : (
                            <span className="text-[12px] text-[var(--text-primary)] font-mono">
                                {cfg.command} {(cfg.args || []).join(' ')}
                            </span>
                        )}
                    </div>
                </div>
                <div className="opacity-0 group-hover/card:opacity-100 transition-opacity flex gap-1 shrink-0">
                    <button onClick={onEdit} title="Edit" className="inline-flex items-center text-[var(--text-dim)] hover:text-[var(--accent)] text-[11px] px-1.5 py-0.5 cursor-pointer bg-transparent border-none rounded transition-colors">
                        <IconEdit size={13} />
                    </button>
                    <button onClick={onDelete} className="inline-flex items-center text-[var(--text-dim)] hover:text-[var(--red)] text-[11px] px-1.5 py-0.5 cursor-pointer bg-transparent border-none rounded transition-colors">
                        <IconTrash size={13} />
                    </button>
                </div>
            </div>
        </div>
    )
}

// --- Main Tab Component ---

export default function LspFormattersTab() {
    const scope = useStore(s => s.settingsScope)
    const lspServers = useStore(s => s.lspConfigServers)
    const formatterConfig = useStore(s => s.formatterConfig)
    const loadLSPConfig = useStore(s => s.loadLSPConfig)
    const saveLSPConfig = useStore(s => s.saveLSPConfig)
    const loadFormatterConfig = useStore(s => s.loadFormatterConfig)
    const saveFormatterConfig = useStore(s => s.saveFormatterConfig)
    const loadLSPStatus = useStore(s => s.loadLSPStatus)

    const [subtab, setSubtab] = useState<'lsp' | 'formatters'>('lsp')

    // LSP modal state
    const [lspModal, setLspModal] = useState(false)
    const [editingLsp, setEditingLsp] = useState<string | null>(null)
    const [lspName, setLspName] = useState('')
    const [lspCommand, setLspCommand] = useState('')
    const [lspArgs, setLspArgs] = useState('')
    const [lspFileTypes, setLspFileTypes] = useState('')
    const [lspRootMarkers, setLspRootMarkers] = useState('')
    const [lspDisabled, setLspDisabled] = useState(false)

    // Formatter modal state
    const [fmtModal, setFmtModal] = useState(false)
    const [editingLang, setEditingLang] = useState<string | null>(null)
    const [fmtLang, setFmtLang] = useState('')
    const [fmtCommand, setFmtCommand] = useState('')
    const [fmtArgs, setFmtArgs] = useState('')

    useEffect(() => {
        loadLSPConfig(scope)
        loadFormatterConfig(scope)
    }, [scope, loadLSPConfig, loadFormatterConfig])

    // --- LSP handlers ---

    const openLspAdd = () => {
        setEditingLsp(null)
        setLspName('')
        setLspCommand('')
        setLspArgs('')
        setLspFileTypes('')
        setLspRootMarkers('')
        setLspDisabled(false)
        setLspModal(true)
    }

    const openLspEdit = (name: string, srv: any) => {
        setEditingLsp(name)
        setLspName(name)
        setLspCommand(srv.command || '')
        setLspArgs((srv.args || []).join(' '))
        setLspFileTypes((srv.fileTypes || []).join(', '))
        setLspRootMarkers((srv.rootMarkers || []).join(', '))
        setLspDisabled(srv.disabled || false)
        setLspModal(true)
    }

    const handleLspSave = () => {
        const args = lspArgs.trim() ? lspArgs.split(/\\s*,\\s*/).filter(Boolean) : []
        const fileTypes = lspFileTypes.split(/\\s*,\\s*/).filter(Boolean)
        const rootMarkers = lspRootMarkers.split(/\\s*,\\s*/).filter(Boolean)
        const existing = lspServers[lspName] || {}
        const updated = {
            ...lspServers,
            [lspName]: {
                command: lspCommand.trim(),
                args,
                fileTypes,
                rootMarkers,
                disabled: lspDisabled,
                ...(existing.initOptions ? { initOptions: existing.initOptions } : {}),
                ...(existing.settings ? { settings: existing.settings } : {}),
            },
        }
        saveLSPConfig(scope, updated)
        setLspModal(false)
    }

    const handleLspDelete = (name: string) => {
        const updated = { ...lspServers }
        delete updated[name]
        saveLSPConfig(scope, updated)
    }

    // --- Formatter handlers ---

    const openFmtAdd = () => {
        setEditingLang(null)
        setFmtLang('')
        setFmtCommand('')
        setFmtArgs('')
        setFmtModal(true)
    }

    const openFmtEdit = (lang: string, cfg: any) => {
        setEditingLang(lang)
        setFmtLang(lang)
        setFmtCommand(cfg.command || cfg.ref || '')
        setFmtArgs((cfg.args || []).join(' '))
        setFmtModal(true)
    }

    const handleFmtSave = () => {
        const cmd = fmtCommand.trim()
        const args = fmtArgs.trim() ? fmtArgs.split(/\s+/).filter(Boolean) : []
        const entry: any = cmd === 'lsp' ? { ref: 'lsp' } : { command: cmd, args }
        const updated = { ...formatterConfig, [fmtLang]: entry }
        saveFormatterConfig(scope, updated)
        setFmtModal(false)
    }

    const handleFmtDelete = (lang: string) => {
        const updated = { ...formatterConfig }
        delete updated[lang]
        saveFormatterConfig(scope, updated)
    }

    return (
        <div>
            <SettingsTabHeader
                title="LSP & Formatters"
                description="Language servers and code formatters"
                actions={
                    <>
                        <SettingsScopeToggle />
                        <IconButton
                            label="Refresh LSP status"
                            onClick={() => loadLSPStatus()}
                            size="sm"
                        >
                            <IconRefresh size={14} />
                        </IconButton>
                    </>
                }
            />

            {/* Subtabs */}
            <div className="mb-4">
                <Tabs
                    items={[
                        { id: 'lsp', label: 'LSP Servers' },
                        { id: 'formatters', label: 'Formatters' },
                    ]}
                    value={subtab}
                    onChange={(id) => setSubtab(id as 'lsp' | 'formatters')}
                    variant="underline"
                />
            </div>

            {/* LSP Subtab */}
            {subtab === 'lsp' && (
                <div>
                    <SettingsSectionHeader
                        title="LSP Servers"
                        count={Object.keys(lspServers).length}
                        actions={
                            <Button variant="outline" size="sm" onClick={openLspAdd}>
                                <IconPlus size={12} /> Add Server
                            </Button>
                        }
                    />
                    <div className="flex flex-col gap-2">
                        {Object.entries(lspServers).map(([name, srv]) => (
                            <LspServerCard
                                key={name}
                                name={name}
                                srv={srv}
                                onEdit={() => openLspEdit(name, srv)}
                                onDelete={() => handleLspDelete(name)}
                            />
                        ))}
                        {Object.keys(lspServers).length === 0 && (
                            <SettingsEmptyState
                                icon={<IconServer size={24} />}
                                title="No LSP servers"
                                description="No LSP servers configured for this scope."
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Formatters Subtab */}
            {subtab === 'formatters' && (
                <div>
                    <SettingsSectionHeader
                        title="Formatters"
                        count={Object.keys(formatterConfig).length}
                        actions={
                            <Button variant="outline" size="sm" onClick={openFmtAdd}>
                                <IconPlus size={12} /> Add Formatter
                            </Button>
                        }
                    />
                    <div className="flex flex-col gap-2">
                        {Object.entries(formatterConfig).map(([lang, cfg]) => (
                            <FormatterCard
                                key={lang}
                                lang={lang}
                                cfg={cfg}
                                onEdit={() => openFmtEdit(lang, cfg)}
                                onDelete={() => handleFmtDelete(lang)}
                            />
                        ))}
                        {Object.keys(formatterConfig).length === 0 && (
                            <SettingsEmptyState
                                icon={<IconEdit size={24} />}
                                title="No formatters"
                                description="No formatters configured. Files will use LSP formatting when available."
                            />
                        )}
                    </div>
                </div>
            )}

            {/* LSP Add/Edit Modal */}
            {lspModal && (
                <Modal onClose={() => setLspModal(false)} width={540}>
                    <ModalHeader icon={<IconServer size={15} />}>
                        <h4 className="text-[14px] font-semibold m-0">{editingLsp ? `Edit ${editingLsp}` : 'Add LSP Server'}</h4>
                    </ModalHeader>
                    <ModalBody>
                        <div className="space-y-4">
                            <div>
                                <label className={labelCls}>Server Name</label>
                                <Input type="text" value={lspName} onChange={e => setLspName(e.target.value)}
                                    placeholder="e.g. gopls" disabled={!!editingLsp} />
                            </div>
                            <div>
                                <label className={labelCls}>Command</label>
                                <Input type="text" value={lspCommand} onChange={e => setLspCommand(e.target.value)}
                                    placeholder="e.g. gopls" />
                            </div>
                            <div>
                                <label className={labelCls}>Arguments (comma-separated)</label>
                                <Input type="text" value={lspArgs} onChange={e => setLspArgs(e.target.value)}
                                    placeholder="e.g. serve" />
                            </div>
                            <div>
                                <label className={labelCls}>File Types (comma-separated)</label>
                                <Input type="text" value={lspFileTypes} onChange={e => setLspFileTypes(e.target.value)}
                                    placeholder="e.g. .go, .mod" />
                            </div>
                            <div>
                                <label className={labelCls}>Root Markers (comma-separated)</label>
                                <Input type="text" value={lspRootMarkers} onChange={e => setLspRootMarkers(e.target.value)}
                                    placeholder="e.g. go.mod" />
                            </div>
                            <label className="flex items-center gap-2 text-[12px]">
                                <Checkbox checked={lspDisabled} onChange={setLspDisabled} />
                                Disabled
                            </label>
                        </div>
                    </ModalBody>
                    <ModalFooter>
                        <ModalButton onClick={() => setLspModal(false)}>Cancel</ModalButton>
                        <ModalButton variant="primary" onClick={handleLspSave} disabled={!lspName.trim() || !lspCommand.trim()}>Save</ModalButton>
                    </ModalFooter>
                </Modal>
            )}

            {/* Formatter Add/Edit Modal */}
            {fmtModal && (
                <Modal onClose={() => setFmtModal(false)} width={540}>
                    <ModalHeader icon={<IconEdit size={15} />}>
                        <h4 className="text-[14px] font-semibold m-0">{editingLang ? `Edit ${editingLang} Formatter` : 'Add Formatter'}</h4>
                    </ModalHeader>
                    <ModalBody>
                        <div className="space-y-4">
                            <div>
                                <label className={labelCls}>Language</label>
                                <Select value={fmtLang} onChange={e => setFmtLang(e.target.value)} disabled={!!editingLang}>
                                    <option value="">Select language...</option>
                                    {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                                </Select>
                            </div>
                            <div>
                                <label className={labelCls}>Command (or type "lsp" for LSP formatting)</label>
                                <Input type="text" value={fmtCommand} onChange={e => setFmtCommand(e.target.value)}
                                    placeholder="e.g. black, prettier, or lsp" />
                            </div>
                            <div>
                                <label className={labelCls}>Arguments (space-separated)</label>
                                <Input type="text" value={fmtArgs} onChange={e => setFmtArgs(e.target.value)}
                                    placeholder="e.g. --write" />
                            </div>
                            <div className="text-[10px] text-[var(--text-dim)]">
                                Type <span className="font-mono">lsp</span> in the command field to use LSP formatting for this language.
                            </div>
                        </div>
                    </ModalBody>
                    <ModalFooter>
                        <ModalButton onClick={() => setFmtModal(false)}>Cancel</ModalButton>
                        <ModalButton variant="primary" onClick={handleFmtSave} disabled={!fmtLang.trim() || !fmtCommand.trim()}>Save</ModalButton>
                    </ModalFooter>
                </Modal>
            )}
        </div>
    )
}
