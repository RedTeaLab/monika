import { useState } from 'react'
import AgentsTab from './AgentsTab'
import PermissionsTab from './PermissionsTab'
import SkillsTab from './SkillsTab'
import McpTab from './McpTab'
import ModelsTab from './ModelsTab'
import AboutTab from './AboutTab'
import { IconDatabase, IconBot, IconShield, IconStar, IconPlug, IconInfo } from '../Icons'

type Tab = 'agents' | 'permissions' | 'skills' | 'mcp' | 'models' | 'about'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'models', label: 'Providers', icon: <IconDatabase size={14} /> },
  { id: 'agents', label: 'Agents', icon: <IconBot size={14} /> },
  { id: 'permissions', label: 'Permissions', icon: <IconShield size={14} /> },
  { id: 'skills', label: 'Skills', icon: <IconStar size={14} /> },
  { id: 'mcp', label: 'MCP', icon: <IconPlug size={14} /> },
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
      <div className="flex flex-1 overflow-hidden">
        <nav
          className="w-[180px] bg-[var(--bg-sidebar)] border-r border-[var(--border)] py-2 flex-shrink-0"
          role="tablist"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full text-left text-[13px] cursor-pointer border-none bg-transparent transition-colors px-3 py-1.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)] flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'text-[var(--text-primary)] bg-[var(--bg-active)] font-medium'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
              role="tab"
              aria-selected={activeTab === tab.id}
            >
              <span className="shrink-0" style={{ color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-dim)' }}>
                {tab.icon}
              </span>
              {tab.label}
            </button>
          ))}
        </nav>
        <main className="flex-1 p-6 overflow-y-auto" role="tabpanel">
          {activeTab === 'agents' && <AgentsTab />}
          {activeTab === 'permissions' && <PermissionsTab />}
          {activeTab === 'skills' && <SkillsTab />}
          {activeTab === 'mcp' && <McpTab />}
          {activeTab === 'models' && <ModelsTab />}
          {activeTab === 'about' && <AboutTab />}
        </main>
      </div>
    </div>
  )
}

export default SettingsPage
