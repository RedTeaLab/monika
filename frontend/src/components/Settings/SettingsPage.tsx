import { useState } from 'react'
import { X } from 'lucide-react'
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
import { IconButton } from '../ui'
import { IconDatabase, IconBot, IconShield, IconStar, IconPlug, IconServer, IconInfo, IconHardDrive, IconBookOpen } from '../Icons'

type Tab = 'models' | 'agents' | 'permissions' | 'skills' | 'mcp' | 'lsp-formatters' | 'databases' | 'knowledge-base' | 'network' | 'about'

interface NavItem {
  id: Tab
  label: string
  icon: React.ReactNode
}

const NAV: NavItem[] = [
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
      className="fixed top-[28px] left-0 right-0 bottom-0 z-50 flex bg-[var(--bg-root)]"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
    >
      {/* Sidebar */}
      <nav className="flex flex-col w-[184px] border-r border-[var(--border)] bg-[var(--surface-sidebar)] shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-10 border-b border-[var(--border)]">
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">Settings</span>
          <IconButton label="Close settings" size="sm" onClick={onClose}>
            <X size={14} />
          </IconButton>
        </div>

        {/* Nav items */}
        <div className="flex-1 overflow-y-auto py-1">
          {NAV.map((item) => {
            const active = item.id === activeTab
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2.5 w-full px-3.5 py-2 text-left text-[12px] transition-colors cursor-pointer
                  ${active
                    ? 'text-[var(--accent)] bg-[var(--accent-muted)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                  }`}
              >
                <span className={`flex-shrink-0 ${active ? 'text-[var(--accent)]' : 'text-[var(--text-dim)]'}`}>
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* Content area */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-6 overflow-y-auto" role="tabpanel">
          {activeTab === 'models' && <ModelsTab />}
          {activeTab === 'agents' && <AgentsTab />}
          {activeTab === 'permissions' && <PermissionsTab />}
          {activeTab === 'skills' && <SkillsTab />}
          {activeTab === 'mcp' && <McpTab />}
          {activeTab === 'lsp-formatters' && <LspFormattersTab />}
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
