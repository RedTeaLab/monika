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
export type EventCategory =
  | "dice"      // roll, push_roll, luck_spend
  | "sanity"    // san_check, san_loss, insanity_gain
  | "combat"    // combat_start, combat_end, combat_round, damage, heal
  | "chase"     // chase_start, chase_end, chase_round, chase_obstacle
  | "state"     // hp_change, mp_change, san_change, luck_change
  | "narrative" // message, scene_change, npc_appear
  | "system"    // session_start, session_end, retcon

/**
 * Get category for an event type
 */
export function getEventCategory(eventType: EventType): EventCategory {
  const diceTypes: EventType[] = ["roll", "push_roll", "luck_spend"]
  const sanityTypes: EventType[] = ["san_check", "san_loss", "insanity_gain"]
  const combatTypes: EventType[] = ["combat_start", "combat_end", "combat_round", "damage", "heal"]
  const chaseTypes: EventType[] = ["chase_start", "chase_end", "chase_round", "chase_obstacle"]
  const stateTypes: EventType[] = ["hp_change", "mp_change", "san_change", "luck_change"]
  const narrativeTypes: EventType[] = ["message", "scene_change", "npc_appear"]
  const systemTypes: EventType[] = ["session_start", "session_end", "retcon"]

  if (diceTypes.includes(eventType)) return "dice"
  if (sanityTypes.includes(eventType)) return "sanity"
  if (combatTypes.includes(eventType)) return "combat"
  if (chaseTypes.includes(eventType)) return "chase"
  if (stateTypes.includes(eventType)) return "state"
  if (narrativeTypes.includes(eventType)) return "narrative"
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
