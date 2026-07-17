import { useState } from 'react'
import AgentsTab from './AgentsTab'
import PermissionsTab from './PermissionsTab'
import SkillsTab from './SkillsTab'
import McpTab from './McpTab'
import ModelsTab from './ModelsTab'
import AboutTab from './AboutTab'
import LspFormattersTab from './LspFormattersTab'
import DatabasesTab from './DatabasesTab'
import KnowledgeBaseTab from './KnowledgeBaseTab'
import NetworkTab from './NetworkTab'
import { Tabs } from '../ui'
import { IconDatabase, IconBot, IconShield, IconStar, IconPlug, IconServer, IconInfo, IconHardDrive, IconBookOpen } from '../Icons'

type Tab = 'agents' | 'permissions' | 'skills' | 'mcp' | 'models' | 'lsp-formatters' | 'databases' | 'knowledge-base' | 'network' | 'about'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'models', label: 'Providers', icon: <IconDatabase size={14} /> },
    { id: 'agents', label: 'Agents', icon: <IconBot size={14} /> },
    { id: 'permissions', label: 'Permissions', icon: <IconShield size={14} /> },
    { id: 'skills', label: 'Skills', icon: <IconStar size={14} /> },
    { id: 'mcp', label: 'MCP', icon: <IconPlug size={14} /> },
    { id: 'lsp-formatters', label: 'LSP & Format', icon: <IconServer size={14} /> },
    { id: 'databases', label: 'Databases', icon: <IconHardDrive size={14} /> },
    { id: 'knowledge-base', label: 'Memory', icon: <IconBookOpen size={14} /> },
    { id: 'network', label: 'Network', icon: <IconServer size={14} /> },
    { id: 'about', label: 'About', icon: <IconInfo size={14} /> },
]

function SettingsPage({ onClose }: { onClose: () => void }) {
    const [activeTab, setActiveTab] = useState<Tab>('models')

    return (
        <div
            className="fixed top-[28px] left-0 right-0 bottom-0 z-50 flex flex-col bg-[var(--bg-root)]"
            onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
        >
            <div className="flex items-center gap-2 px-3 h-[28px] bg-[var(--bg-elevated)] border-b border-[var(--border)]">
                <button
                    onClick={onClose}
                    className="bg-transparent border-none cursor-pointer text-[var(--text-dim)] hover:text-[var(--text-primary)] text-[15px] p-1"
                    aria-label="Back"
                >
                    &#8592;
                </button>
                <span className="text-[14px] font-semibold">Settings</span>
            </div>
            <div className="flex flex-1 overflow-hidden flex-col">
                <div className="px-6 pt-4 pb-0 border-b border-[var(--border)] bg-[var(--bg-root)]">
                    <Tabs
                        items={TABS.map(t => ({ id: t.id, label: t.label, icon: t.icon }))}
                        value={activeTab}
                        onChange={(id) => setActiveTab(id as Tab)}
                        variant="underline"
                    />
                </div>
                <main className="flex-1 p-6 overflow-y-auto" role="tabpanel">
                    {activeTab === 'agents' && <AgentsTab />}
                    {activeTab === 'permissions' && <PermissionsTab />}
                    {activeTab === 'skills' && <SkillsTab />}
                    {activeTab === 'mcp' && <McpTab />}
                    {activeTab === 'lsp-formatters' && <LspFormattersTab />}
                    {activeTab === 'models' && <ModelsTab />}
                    {activeTab === 'databases' && <DatabasesTab />}
                    {activeTab === 'knowledge-base' && <KnowledgeBaseTab />}
                    {activeTab === 'network' && <NetworkTab />}
                    {activeTab === 'about' && <AboutTab />}
                </main>
            </div>
        </div>
    )
}

export default SettingsPage
