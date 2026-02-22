// Session types for M3 Memory Web - Session list and recap features

export type SessionStatus = 'active' | 'paused' | 'completed' | 'abandoned'

export interface GameSession {
  id: string
  character_id: string
  scenario_id: string | null
  current_scene: string
  world_state: Record<string, unknown>
  created_at: string
  updated_at: string
  ended_at: string | null
  status: SessionStatus
  // Summary fields (populated when summary exists)
  summary?: SessionSummary
}

export interface SessionSummary {
  session_id: string
  created_at: string
  started_at: string
  ended_at: string | null
  duration?: number // in seconds
  scene_id: string

  narrative_summary: string // 2-3 paragraphs narrative summary

  key_events: KeyEvent[]
  state_snapshots: StateSnapshot[]
  discovered_clues: string[]
  pending_promises: PendingPromise[]

  visible_to: string[]
}

export interface KeyEvent {
  event_type: string
  description: string
  event_id: string
  timestamp?: string
}

export interface StateSnapshot {
  character_id: string
  hp_change: number
  san_change: number
  luck_change: number
}

export interface PendingPromise {
  description: string
  source_event_id: string
}

export interface SessionListQuery {
  status?: SessionStatus[]
  character_id?: string
  scenario_id?: string
  limit?: number
  offset?: number
  sort_by?: 'created_at' | 'updated_at' | 'duration'
  sort_order?: 'asc' | 'desc'
}

export interface SessionListResponse {
  sessions: GameSession[]
  total: number
  limit: number
  offset: number
}

// Statistics types for M3-073, M3-074, M3-075
export interface MessageStatistics {
  total_messages: number
  public_messages: number
  kp_only_messages: number
  party_messages: number
  private_messages: number
  hourly_frequency: Record<number, number> // hour (0-23) -> count
}

export interface RollStatistics {
  total_rolls: number
  successful_rolls: number
  failed_rolls: number
  success_rate: number
  pushed_rolls: number
  critical_successes: number
  critical_failures: number
  skill_usage: Array<{ skill: string; count: number }>
}

export interface PlayerPerformance {
  player_id: number
  total_actions: number
  roll_count: number
  message_count: number
  san_checks: number
  total_san_loss: number
  luck_spends: number
  total_luck_spent: number
}

export interface SessionStatistics {
  session_id: string
  messages: MessageStatistics
  rolls: RollStatistics
  players: PlayerPerformance[]
}
