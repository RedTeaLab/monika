import { MessageList } from '@/components/MessageList'
import { StatePanel } from '@/components/StatePanel'
import { RuleSearch } from '@/components/rules/RuleSearch'
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
}

type TabId = 'messages' | 'state' | 'rules'

interface Tab {
  id: TabId
  label: string
  icon: string
}

const TABS: Tab[] = [
  { id: 'messages', label: '消息', icon: '💬' },
  { id: 'state', label: '状态', icon: '❤️' },
  { id: 'rules', label: '规则', icon: '📖' }
]

export function TabView({ activeTab, onChange, messages, onSendMessage, character, world }: TabViewProps) {

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 bg-white">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`
              flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2
              transition-colors duration-200
              ${activeTab === tab.id
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }
            `}
          >
            <span className="text-lg">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'messages' && (
          <div className="flex flex-col h-full">
            <MessageList messages={messages} />
          </div>
        )}
        {activeTab === 'state' && (
          <div className="h-full overflow-y-auto p-4 bg-gray-50">
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
          <div className="h-full overflow-y-auto p-4 bg-gray-50">
            <RuleSearch />
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
