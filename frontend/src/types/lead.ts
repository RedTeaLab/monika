/**
 * Leads types for the Monika application
 * Based on backend/src/models/lead.py
 */

/**
 * Lead priority levels
 */
export type LeadPriority = 'critical' | 'high' | 'medium' | 'low'

/**
 * Lead types
 */
export type LeadType = 'investigate' | 'interact' | 'travel' | 'combat' | 'rest' | 'custom'

/**
 * Lead status
 */
export type LeadStatus = 'available' | 'in_progress' | 'completed' | 'failed' | 'expired' | 'archived'

/**
 * Lead visibility settings
 */
export type LeadVisibility = 'all' | 'kp' | 'specific_player'

/**
 * Lead execution methods
 */
export type LeadExecutionMethod = 'command' | 'choice' | 'automatic'

/**
 * Lead choice for interactive leads
 */
export interface LeadChoice {
  id: string
  lead_id: string
  choice_id: string
  label: string
  description?: string
  target_scene_id?: string
  target_lead_id?: string
  condition?: string
  requires_check: Record<string, unknown>
  consequences: string[]
  narrative?: string
  display_order: number
}

/**
 * Lead entry representing a game lead or clue
 */
export interface Lead {
  id: string
  session_id: string
  campaign_id?: string
  source_event_id?: string
  source_scene_id?: string
  title: string
  description: string
  priority: LeadPriority
  type: LeadType
  execution_method: LeadExecutionMethod
  execution_data: Record<string, unknown>
  visibility: LeadVisibility
  visible_to_player_ids: number[]
  status: LeadStatus
  expires_on_event_id?: string
  expires_on_condition?: string
  expires_at?: string
  completed_at?: string
  completed_by_player_id?: number
  rewards: Record<string, unknown>[]
  consequences: string[]
  narrative_on_complete?: string
  narrative_on_fail?: string
  related_lead_ids: string[]
  parent_lead_id?: string
  created_by_player_id?: number
  auto_generated: boolean
  ai_generated: boolean
  ai_confidence?: number
  created_at: string
  updated_at: string
  choices?: LeadChoice[]
}

/**
 * Lead filter options for querying
 */
export interface LeadFilter {
  status?: LeadStatus
  priority?: LeadPriority
  type?: LeadType
  visibility?: LeadVisibility
}

/**
 * Create lead request
 */
export interface CreateLeadRequest {
  title: string
  description: string
  priority?: LeadPriority
  type?: LeadType
  execution_method?: LeadExecutionMethod
  execution_data?: Record<string, unknown>
  visibility?: LeadVisibility
  visible_to_player_ids?: number[]
  rewards?: Record<string, unknown>[]
  consequences?: string[]
  narrative_on_complete?: string
  narrative_on_fail?: string
  expires_at?: string
  expires_on_event_id?: string
  expires_on_condition?: string
  source_event_id?: string
  source_scene_id?: string
  auto_generated?: boolean
  ai_generated?: boolean
  ai_confidence?: number
  choices?: Omit<LeadChoice, 'id' | 'lead_id'>[]
}

/**
 * Update lead status request
 */
export interface UpdateLeadStatusRequest {
  status: LeadStatus
}
