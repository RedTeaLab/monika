import { useState } from 'react'
import AgentsTab from './AgentsTab'
import PermissionsTab from './PermissionsTab'
import SkillsTab from './SkillsTab'
import McpTab from './McpTab'
import ModelsTab from './ModelsTab'

type Tab = 'agents' | 'permissions' | 'skills' | 'mcp' | 'models'

const TABS: { id: Tab; label: string }[] = [
  { id: 'agents', label: 'Agents' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'skills', label: 'Skills' },
  { id: 'mcp', label: 'MCP' },
  { id: 'models', label: 'Models' },
]

function SettingsPage({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('agents')

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--bg-primary)]"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
    >
      <div className="flex items-center gap-3 px-5 py-2.5 bg-[var(--bg-elevated)] border-b border-[var(--border)]">
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
          className="w-[180px] bg-[var(--bg-secondary)] border-r border-[var(--border)] py-2.5 flex-shrink-0"
          role="tablist"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full text-left px-5 py-2 text-[12px] cursor-pointer border-none bg-transparent transition-colors ${
                activeTab === tab.id
                  ? 'text-[var(--text-primary)] bg-[var(--bg-primary)] border-l-2 border-[var(--accent)] font-medium'
                  : 'text-[var(--text-dim)] hover:text-[var(--text-primary)] border-l-2 border-transparent'
              }`}
              role="tab"
              aria-selected={activeTab === tab.id}
            >
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
        </main>
      </div>
    </div>
  )
}

export default SettingsPage
