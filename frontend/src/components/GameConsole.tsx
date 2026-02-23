import { useState, useCallback, useEffect, useMemo } from "react"
import { Header } from "@/components/Header"
import { MessageList } from "@/components/MessageList"
import { StatePanel } from "@/components/StatePanel"
import { Footer } from "@/components/Footer"
import { CombatOverlay } from "@/components/combat/CombatOverlay"
import { RuleSearch } from "@/components/rules"
import { EventLogPanel } from "@/components/events"
import { HelpPanel, COMMANDS, getCommandByName, type CommandDefinition } from "@/components/HelpPanel"
import { Tour, DEFAULT_TOUR_STEPS } from "@/components/Tour"
import { useGameWebSocket } from "@/hooks/useGameWebSocket"
import { useLLMResponse } from "@/hooks/useLLMResponse"
import { useCombatState } from "@/hooks/useCombatState"
import { useCombatActions } from "@/hooks/useCombatActions"
import { useAuth } from "@/contexts/AuthContext"
import { useBreakpoint } from "@/hooks/useBreakpoint"
import { useTouchOptimizer, hapticFeedback } from "@/hooks/useTouchOptimizer"
import { useSwipeToSwipe } from "@/hooks/useGestures"
import { TabView } from "@/components/TabView"
import { BottomTabBar } from "@/components/BottomTabBar"
import { MobileFooter } from "@/components/MobileFooter"
import type { ServerMessage, KeeperMessage, StateUpdate, ChaseStartedMessage, ChaseEndedMessage } from "@/types/websocket"
import type { AttackRequest, HealRequest } from "@/types/combat"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Maximize2, Sword, GitFork, BookOpen, X } from "lucide-react"
import { ChaseOverlay } from "@/components/chase"

export interface Message {
  id: string
  role: 'kp' | 'player' | 'system'
  content: string
  timestamp: Date
  sender?: string
  toolResults?: import('@/types/websocket').ToolResult[]
}

interface CharacterState {
  hp: number
  hpMax: number
  san: number
  sanMax: number
  luck: number
  luckMax: number
  mp: number
  mpMax: 10
}

interface WorldState {
  currentScene: string
  location: string
  timer?: string
  leads: Array<{ id: string; text: string; verified: boolean }>
}

export function GameConsole() {
  const { user } = useAuth()

  // Touch optimization for mobile devices
  useTouchOptimizer()

  // Combat state management
  const [combatId, setCombatId] = useState<string | null>(null)
  const [isCombatMinimized, setIsCombatMinimized] = useState(false)

  // Chase state management
  const [chaseId, setChaseId] = useState<string | null>(null)
  const [isChaseMinimized, setIsChaseMinimized] = useState(false)

  // Rules panel state
  const [showRules, setShowRules] = useState(false)

  // Help panel state
  const [showHelp, setShowHelp] = useState(false)

  // Tour state - show on first visit
  const [showTour, setShowTour] = useState(() => {
    if (typeof window !== 'undefined') {
      return !localStorage.getItem('monika_tour_seen')
    }
    return false
  })

  // Events panel state
  const [showEvents, setShowEvents] = useState(false)

  // Responsive breakpoint detection
  const { isMobile, isTablet, isDesktop } = useBreakpoint()

  // Tab state for tablet layout
  const [activeTab, setActiveTab] = useState<'messages' | 'state' | 'rules' | 'events'>('messages')

  // Swipe gesture for tablet tab switching
  const tabletSwipeBind = useSwipeToSwipe((direction) => {
    const tabs: Array<'messages' | 'state' | 'rules' | 'events'> = ['messages', 'state', 'rules', 'events']
    const currentIndex = tabs.indexOf(activeTab)

    if (direction === 'left' && currentIndex < tabs.length - 1) {
      setActiveTab(tabs[currentIndex + 1])
    } else if (direction === 'right' && currentIndex > 0) {
      setActiveTab(tabs[currentIndex - 1])
    }
  })

  // Haptic feedback on tab change
  useEffect(() => {
    hapticFeedback('light')
  }, [activeTab])

  const {
    combat,
    combatants,
    currentTurn,
    isLoading: isCombatLoading,
    updateFromTurnResponse,
    updateCombatant,
  } = useCombatState(combatId)

  const {
    nextTurn,
    attack,
    heal,
    endCombat,
  } = useCombatActions(combatId)

  // State management
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "kp",
      content: "欢迎来到 Monika！你是调查员，刚刚醒来发现自己在一间陌生的房间里。",
      timestamp: new Date(),
    },
  ])

  const [character] = useState<CharacterState>({
    hp: 12,
    hpMax: 12,
    san: 60,
    sanMax: 60,
    luck: 50,
    luckMax: 50,
    mp: 10,
    mpMax: 10,
  })

  const [world, setWorld] = useState<WorldState>({
    currentScene: "陌生的房间",
    location: "未知地点",
    timer: undefined,
    leads: [
      { id: "1", text: "调查房间环境", verified: false },
      { id: "2", text: "检查门锁", verified: false },
      { id: "3", text: "搜寻物品", verified: false },
    ],
  })

  // Get sessionId from user or localStorage (for demo purposes)
  // In production, this would come from the game session state
  const sessionId = user?.id?.toString() || localStorage.getItem('monika_session_id') || null

  // LLM streaming response management
  const { processStream, finalizeResponse, reset: resetLLM } = useLLMResponse()

  /**
   * Add a keeper message to the message list
   * Converts LLM response to Message format
   */
  const addKeeperMessage = useCallback((llmResponse: import('@/types/websocket').LLMResponse) => {
    const keeperMessage: Message = {
      id: Date.now().toString(),
      role: "kp",
      content: llmResponse.narrative,
      timestamp: new Date(),
      toolResults: llmResponse.tool_results,
    }
    setMessages(prev => [...prev, keeperMessage])
  }, [])

  /**
   * Handle incoming messages from the WebSocket server
   * Processes keeper messages, chase events, and updates the message list
   */
  const handleServerMessage = useCallback((message: ServerMessage) => {
    if (message.type === 'keeper_message') {
      const keeperMsg = message as KeeperMessage

      if (keeperMsg.is_streaming) {
        // Process streaming chunks for progressive display
        processStream(keeperMsg.content)
      } else {
        // Finalize the response when streaming is complete
        finalizeResponse(keeperMsg.content)

        // Add complete message to the message list
        addKeeperMessage(keeperMsg.content)
      }
    } else if (message.type === 'error') {
      toast.error(message.content)
    } else if (message.type === 'chase_started') {
      const chaseEvent = message as ChaseStartedMessage
      setChaseId(chaseEvent.chase_id)
      toast.success('Chase started!')
    } else if (message.type === 'chase_ended') {
      const chaseEvent = message as ChaseEndedMessage
      setChaseId(null)
      setIsChaseMinimized(false)
      if (chaseEvent.winner) {
        toast.info(`Chase ended! Winner: ${chaseEvent.winner}`)
      } else {
        toast.info('Chase ended')
      }
    }
  }, [processStream, finalizeResponse, addKeeperMessage])

  /**
   * Handle state updates from the WebSocket server
   * Updates world state and character state based on server changes
   */
  const handleStateUpdate = useCallback((update: StateUpdate) => {
    // Update world state based on server changes
    if (update.content.world_state) {
      setWorld((prevWorld) => ({
        ...prevWorld,
        ...(update.content.world_state.location && { location: update.content.world_state.location }),
        ...(update.content.world_state.leads && {
          leads: update.content.world_state.leads.map((text: string, idx: number) => ({
            id: `lead-${Date.now()}-${idx}`,
            text,
            verified: false
          }))
        })
      }))
    }

    // Update current scene if provided
    if (update.content.current_scene) {
      setWorld((prevWorld) => ({
        ...prevWorld,
        currentScene: update.content.current_scene
      }))
    }
  }, [])

  /**
   * Simulate mock response when WebSocket is not connected
   * This is a fallback for development/testing
   */
  const simulateMockResponse = useCallback((content: string) => {
    setTimeout(() => {
      const responseMessages: Record<string, Message> = {
        "观察": {
          id: (Date.now() + 1).toString(),
          role: "kp",
          content: "你仔细观察房间...房间里有一张旧床、一个破旧的柜子，还有一扇看起来紧闭的木门。墙壁上有些奇怪的符号。",
          timestamp: new Date(),
        },
        "default": {
          id: (Date.now() + 1).toString(),
          role: "kp",
          content: "你做出了行动...",
          timestamp: new Date(),
        }
      }

      const response = Object.entries(responseMessages).find(([key]) =>
        content.includes(key)
      )?.[1] || responseMessages.default

      setMessages((prev) => [...prev, response])
    }, 500)
  }, [])

  // WebSocket connection for real-time game communication
  const { isConnected, error, sendMessage } = useGameWebSocket(sessionId, {
    onMessage: handleServerMessage,
    onStateUpdate: handleStateUpdate
  })

  /**
    * Handle sending user messages
    * Sends message via WebSocket and resets LLM state
    */
  const handleSendMessage = useCallback((content: string) => {
    // Handle help command locally
    if (content.startsWith('/help')) {
      const parts = content.split(' ')
      if (parts.length === 1) {
        setShowHelp(true)
        return
      } else {
        const cmdName = parts[1]
        const cmd = getCommandByName(cmdName)
        if (cmd) {
          const systemMessage: Message = {
            id: Date.now().toString(),
            role: "system",
            content: `命令: /${cmd.name}\n说明: ${cmd.description}\n用法: ${cmd.usage}${cmd.example ? `\n例: ${cmd.example}` : ''}`,
            timestamp: new Date(),
          }
          setMessages((prev) => [...prev, systemMessage])
          return
        } else {
          const systemMessage: Message = {
            id: Date.now().toString(),
            role: "system",
            content: `未找到命令: /${cmdName}`,
            timestamp: new Date(),
          }
          setMessages((prev) => [...prev, systemMessage])
          return
        }
      }
    }

    // Handle ? command (shorthand for help)
    if (content === '?') {
      setShowHelp(true)
      return
    }

    // Add player message to the message list
    const playerMessage: Message = {
      id: Date.now().toString(),
      role: "player",
      content,
      timestamp: new Date(),
      sender: user?.username || "调查员",
    }
    setMessages((prev) => [...prev, playerMessage])

    // Send message via WebSocket if connected
    if (isConnected) {
      sendMessage(content)
      resetLLM()
    } else {
      // Fallback to mock response when not connected
      toast.warning('WebSocket未连接，使用模拟响应')
      simulateMockResponse(content)
    }
  }, [isConnected, sendMessage, resetLLM, user?.username, simulateMockResponse])

  /**
   * Show error toast when WebSocket connection fails
   */
  useEffect(() => {
    if (error) {
      toast.error(`WebSocket错误: ${error}`)
    }
  }, [error])

  /**
   * Handle combat attack action
   */
  const handleCombatAttack = async (request: AttackRequest) => {
    try {
      const response = await attack(request)

      // Update the target combatant with new HP
      const targetCombatant = combatants.find(c => c.id === request.target_id)
      if (targetCombatant) {
        updateCombatant({
          ...targetCombatant,
          hp: response.target_hp_after,
        })
      }

      toast.success(`${response.attacker} attacked ${response.target} for ${response.damage} damage!`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Attack failed")
    }
  }

  /**
   * Handle combat heal action
   */
  const handleCombatHeal = async (request: HealRequest) => {
    try {
      const response = await heal(request)

      // Update the target combatant with new HP
      const targetCombatant = combatants.find(c => c.id === request.target_id)
      if (targetCombatant) {
        updateCombatant({
          ...targetCombatant,
          hp: response.hp_after,
        })
      }

      toast.success(`Healed ${response.target} for ${response.healing} HP!`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Heal failed")
    }
  }

  /**
   * Handle dodge action
   */
  const handleCombatDodge = async () => {
    try {
      toast.success("Dodge prepared!")
      // TODO: Implement dodge API and state update
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dodge failed")
    }
  }

  /**
   * Handle next turn action
   */
  const handleCombatNextTurn = async () => {
    try {
      const response = await nextTurn()
      updateFromTurnResponse(response)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Next turn failed")
    }
  }

  /**
   * Handle end combat action
   */
  const handleCombatEnd = async () => {
    try {
      await endCombat()
      setCombatId(null)
      setIsCombatMinimized(false)
      toast.success("Combat ended!")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "End combat failed")
    }
  }

  /**
   * Handle combat minimize
   */
  const handleCombatMinimize = () => {
    setIsCombatMinimized(true)
  }

  /**
   * Handle combat expand (from minimized state)
   */
  const handleCombatExpand = () => {
    setIsCombatMinimized(false)
  }

  /**
   * Handle chase end action
   */
  const handleChaseEnd = () => {
    setChaseId(null)
    setIsChaseMinimized(false)
    toast.success("Chase ended!")
  }

  /**
   * Handle chase minimize
   */
  const handleChaseMinimize = () => {
    setIsChaseMinimized(true)
  }

  /**
   * Handle chase expand (from minimized state)
   */
  const handleChaseExpand = () => {
    setIsChaseMinimized(false)
  }

  return (
    <div className="flex flex-col h-screen">
      <Header
        characterName="调查员"
        onToggleRules={() => setShowRules(!showRules)}
        showRules={showRules}
        onToggleEvents={() => setShowEvents(!showEvents)}
        showEvents={showEvents}
        onToggleHelp={() => setShowHelp(true)}
      />
      <div {...tabletSwipeBind} className="flex-1 flex overflow-hidden">
        {isMobile ? (
          // Mobile: Observer mode with proper scrolling
          <div id="main-content" className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <MessageList messages={messages} />
            </div>
            <StatePanel
              fullWidth
              character={character}
              world={world}
            />
            <MobileFooter />
          </div>
        ) : isTablet ? (
          // Tablet: Tab navigation
          <TabView
            activeTab={activeTab}
            onChange={setActiveTab}
            messages={messages}
            onSendMessage={handleSendMessage}
            character={{
              id: 1,
              name: user?.username || "调查员",
              hp: character.hp,
              maxHp: character.hpMax,
              mp: character.mp,
              maxMp: character.mpMax,
              san: character.san,
              maxSan: character.sanMax,
              luck: character.luck,
            }}
            world={{
              currentScene: world.currentScene,
              location: world.location,
              timer: world.timer?.toString(),
              leads: world.leads,
            }}
            sessionId={sessionId}
          />
        ) : isDesktop ? (
          // Desktop: Original three-column layout
          <>
            <div id="main-content" className="flex-1 flex flex-col min-w-0">
              <MessageList messages={messages} />
              <Footer 
                onSendMessage={handleSendMessage} 
                onRoll={() => {}}
                onOpenHelp={() => setShowHelp(true)}
              />
            </div>
            <StatePanel
              character={character}
              world={world}
            />
            {showRules && (
              <div className="w-80 border-l border-gray-200 bg-white overflow-y-auto">
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-blue-600" />
                      <h3 className="font-semibold text-gray-900">Rules</h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowRules(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <RuleSearch />
                  <div className="text-xs text-gray-500 mt-4 p-3 bg-gray-50 rounded-lg">
                    <p className="font-medium mb-1">Quick Tips:</p>
                    <ul className="space-y-1 list-disc list-inside">
                      <li>Search for rules like "pushing", "sanity"</li>
                      <li>Click results to see full details</li>
                      <li>Use keywords like "combat", "chase"</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
            {showEvents && sessionId && (
              <div className="w-80 border-l border-gray-200 bg-white overflow-hidden flex flex-col">
                <EventLogPanel sessionId={sessionId} className="flex-1" />
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Combat Overlay */}
      {combat && !isCombatMinimized && (
        <CombatOverlay
          combat={combat}
          onAttack={handleCombatAttack}
          onHeal={handleCombatHeal}
          onDodge={handleCombatDodge}
          onNextTurn={handleCombatNextTurn}
          onEndCombat={handleCombatEnd}
          onMinimize={handleCombatMinimize}
          isLoading={isCombatLoading}
          combatLogs={[]} // TODO: Implement combat log state
        />
      )}

      {/* Minimized Combat Card */}
      {combat && isCombatMinimized && (
        <Card className="fixed bottom-4 right-4 w-[200px] p-3 shadow-lg border-2 border-primary">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Sword className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Round {combat.round}</span>
            </div>
            {currentTurn && (
              <div className="text-xs text-muted-foreground">
                {currentTurn.name}&apos;s turn
              </div>
            )}
            <Button
              onClick={handleCombatExpand}
              size="sm"
              className="w-full"
            >
              <Maximize2 className="h-3 w-3 mr-1" />
              Expand
            </Button>
          </div>
        </Card>
      )}

      {/* Chase Overlay */}
      {chaseId && !isChaseMinimized && (
        <ChaseOverlay
          chaseId={chaseId}
          onClose={handleChaseEnd}
          onMinimize={handleChaseMinimize}
        />
      )}

      {/* Minimized Chase Card */}
      {chaseId && isChaseMinimized && (
        <Card className="fixed bottom-4 left-4 w-[200px] p-3 shadow-lg border-2 border-orange-500">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <GitFork className="h-4 w-4 text-orange-500" />
              <span className="text-sm font-semibold">Chase Active</span>
            </div>
            <div className="text-xs text-muted-foreground">
              In progress
            </div>
            <Button
              onClick={handleChaseExpand}
              size="sm"
              className="w-full"
              variant="outline"
            >
              <Maximize2 className="h-3 w-3 mr-1" />
              Expand
            </Button>
          </div>
        </Card>
      )}

      {/* Bottom Tab Bar for tablet */}
      {isTablet && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t">
          <BottomTabBar
            activeTab={activeTab}
            onChange={setActiveTab}
          />
        </div>
      )}

      {/* Help Panel */}
      <HelpPanel isOpen={showHelp} onClose={() => setShowHelp(false)} />

      {/* Tour Guide */}
      <Tour
        isOpen={showTour}
        onClose={() => setShowTour(false)}
        steps={DEFAULT_TOUR_STEPS}
      />
    </div>
  )
}
