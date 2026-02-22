/**
 * Event types for game event log
 */

export type EventType =
  // Dice rolls
  | "roll"
  | "push_roll"
  | "luck_spend"
  // SAN and mental
  | "san_check"
  | "san_loss"
  | "insanity_gain"
  // Combat
  | "combat_start"
  | "combat_end"
  | "combat_round"
  | "damage"
  | "heal"
  // Chase
  | "chase_start"
  | "chase_end"
  | "chase_round"
  | "chase_obstacle"
  // State changes
  | "hp_change"
  | "mp_change"
  | "san_change"
  | "luck_change"
  // Narrative
  | "message"
  | "scene_change"
  | "npc_appear"
  // System
  | "session_start"
  | "session_end"
  | "retcon"

export type ActorRole = "kp" | "player" | "system"
export type VisibilityLevel = "public" | "kp" | "player"

export interface EventEntry {
  id: string
  session_id: string
  actor_player_id: number | null
  actor_role: ActorRole
  character_id: number | null
  event_type: EventType
  payload: Record<string, unknown>
  visibility: VisibilityLevel
  timestamp: string
  parent_event_id: string | null
  description: string | null
}

// Full GameEvent structure from event-structure.md spec
export interface GameEvent {
  // Basic info
  event_id: string
  session_id: string
  timestamp: string
  sequence: number

  // Actor info
  actor: {
    player_id: string | null
    character_id: string | null
    role: 'KP' | 'Player' | 'System'
  }

  // Event type
  type: {
    category: EventCategory
    type: string
    sub_type?: string
  }

  // Input content
  input: {
    raw_message: string
    parsed_command?: ParsedCommand
  }

  // Execution result
  result: {
    success: boolean
    error?: string
    data?: unknown
  }

  // Narrative content
  narration: {
    text: string
    style: 'narrative' | 'compact' | 'detailed'
  }

  // State changes
  state_changes: StateChange[]

  // Large object references
  large_objects?: {
    before_ref?: string
    after_ref?: string
  }

  // Visibility
  visibility: EventVisibility

  // Metadata
  metadata: {
    client_timestamp?: number
    source: 'web' | 'api' | 'system'
    tags?: string[]
  }
}

export interface ParsedCommand {
  command: string
  [key: string]: unknown
}

export interface StateChange {
  path: string
  type: 'set' | 'add' | 'remove' | 'increment' | 'decrement'
  old_value?: unknown
  new_value?: unknown
  added?: unknown[]
  removed?: unknown[]
  delta?: number
  metadata?: {
    reason?: string
    source?: string
  }
}

export interface EventVisibility {
  base: VisibilityBase
  overrides?: VisibilityOverride[]
  conditional?: VisibilityCondition[]
}

export type VisibilityBase =
  | 'public'      // Everyone can see
  | 'party'       // All players can see
  | 'kp'          // Only KP can see
  | 'private'     // Private event

export interface VisibilityOverride {
  type: 'exclude' | 'include'
  target: string
}

export interface VisibilityCondition {
  expression: string
  show_if_true: boolean
}

export interface EventListResponse {
  events: EventEntry[]
  total: number
}

export interface EventFilter {
  eventType?: EventType
  actorRole?: ActorRole
  limit?: number
  offset?: number
}

// Event type categories for grouping/filtering
// Aligned with event-structure.md spec
export type EventCategory =
  | "interaction"  // message, description, scene_change
  | "check"        // roll, push_roll, luck_spend
  | "combat"       // combat_start, combat_action, combat_end, damage, death
  | "chase"        // chase_start, chase_round, chase_end
  | "sanity"       // san_check, san_loss, madness_start, madness_end
  | "state"        // condition_added, condition_removed, heal
  | "system"       // checkpoint, session_start, session_end

/**
 * Get category for an event type
 */
export function getEventCategory(eventType: EventType): EventCategory {
  const checkTypes: EventType[] = ["roll", "push_roll", "luck_spend"]
  const sanityTypes: EventType[] = ["san_check", "san_loss", "insanity_gain"]
  const combatTypes: EventType[] = ["combat_start", "combat_end", "combat_round", "damage", "heal"]
  const chaseTypes: EventType[] = ["chase_start", "chase_end", "chase_round", "chase_obstacle"]
  const stateTypes: EventType[] = ["hp_change", "mp_change", "san_change", "luck_change"]
  const interactionTypes: EventType[] = ["message", "scene_change", "npc_appear"]
  const systemTypes: EventType[] = ["session_start", "session_end", "retcon"]

  if (checkTypes.includes(eventType)) return "check"
  if (sanityTypes.includes(eventType)) return "sanity"
  if (combatTypes.includes(eventType)) return "combat"
  if (chaseTypes.includes(eventType)) return "chase"
  if (stateTypes.includes(eventType)) return "state"
  if (interactionTypes.includes(eventType)) return "interaction"
  if (systemTypes.includes(eventType)) return "system"

  return "system"
}

/**
 * Get human-readable label for event type
 */
export function getEventTypeLabel(eventType: EventType): string {
  const labels: Record<EventType, string> = {
    roll: "Roll",
    push_roll: "Push Roll",
    luck_spend: "Luck Spend",
    san_check: "SAN Check",
    san_loss: "SAN Loss",
    insanity_gain: "Insanity",
    combat_start: "Combat Start",
    combat_end: "Combat End",
    combat_round: "Combat Round",
    damage: "Damage",
    heal: "Heal",
    chase_start: "Chase Start",
    chase_end: "Chase End",
    chase_round: "Chase Round",
    chase_obstacle: "Obstacle",
    hp_change: "HP Change",
    mp_change: "MP Change",
    san_change: "SAN Change",
    luck_change: "Luck Change",
    message: "Message",
    scene_change: "Scene Change",
    npc_appear: "NPC Appeared",
    session_start: "Session Start",
    session_end: "Session End",
    retcon: "Retcon",
  }
  return labels[eventType] || eventType
}
