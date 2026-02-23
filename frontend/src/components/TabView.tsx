import { MessageList } from '@/components/MessageList'
import { StatePanel } from '@/components/StatePanel'
import { RuleSearch } from '@/components/rules/RuleSearch'
import { EventLogPanel } from '@/components/events'
import { Footer } from '@/components/Footer'
import type { Message } from '@/components/GameConsole'

interface TabViewProps {
  activeTab: TabId
  onChange: (tab: TabId) => void
  messages: Message[]
  onSendMessage: (content: string) => void
  character: {
    id: number
    name: string
    hp: number
    maxHp: number
    mp: number
    maxMp: number
    san: number
    maxSan: number
    luck: number
  }
  world: {
    currentScene: string
    location: string
    timer?: string
    leads: Array<{
      id: string
      text: string
      verified: boolean
    }>
  }
  sessionId?: string | null
}

type TabId = 'messages' | 'state' | 'rules' | 'events'

interface Tab {
  id: TabId
  label: string
  icon: string
}

const TABS: Tab[] = [
  { id: 'messages', label: '消息', icon: '💬' },
  { id: 'state', label: '状态', icon: '❤️' },
  { id: 'rules', label: '规则', icon: '📖' },
  { id: 'events', label: '日志', icon: '📋' }
]

export function TabView({ activeTab, onChange, messages, onSendMessage, character, world, sessionId }: TabViewProps) {

  return (
    <div className="flex-1 flex flex-col overflow-hidden" role="main">
      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 bg-white" role="tablist" aria-label="Content tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            aria-label={`${tab.label} tab`}
            aria-selected={activeTab === tab.id}
            role="tab"
            className={`
              flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2
              transition-colors duration-200
              ${activeTab === tab.id
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }
            `}
          >
            <span className="text-lg" aria-hidden="true">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'messages' && (
          <div className="flex flex-col h-full" role="tabpanel" aria-label="Messages">
            <MessageList messages={messages} />
          </div>
        )}
        {activeTab === 'state' && (
          <div className="h-full overflow-y-auto p-4 bg-gray-50" role="tabpanel" aria-label="Character state">
            <StatePanel
              character={{
                hp: character.hp,
                hpMax: character.maxHp,
                san: character.san,
                sanMax: character.maxSan,
                luck: character.luck,
                luckMax: character.luck,
                mp: character.mp,
                mpMax: character.maxMp
              }}
              world={world}
              fullWidth
            />
          </div>
        )}
        {activeTab === 'rules' && (
          <div className="h-full overflow-y-auto p-4 bg-gray-50" role="tabpanel" aria-label="Rules search">
            <RuleSearch />
          </div>
        )}
        {activeTab === 'events' && (
          <div className="h-full overflow-hidden bg-gray-50" role="tabpanel" aria-label="Event log">
            {sessionId ? (
              <EventLogPanel sessionId={sessionId} className="h-full" />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                No session ID available
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer only for messages tab */}
      {activeTab === 'messages' && (
        <Footer onSendMessage={onSendMessage} />
      )}
    </div>
  )
}

export { TABS }
export type { TabId }
