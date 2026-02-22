// Campaign types for M2 Multiplayer support

export type CampaignStatus = 'active' | 'paused' | 'ended' | 'archived'
export type CampaignRole = 'keeper' | 'co-keeper' | 'player' | 'observer'
export type MemberStatus = 'active' | 'inactive' | 'kicked' | 'left'

export interface Campaign {
  id: string
  name: string
  description: string | null
  keeper_id: number
  scenario_id: string | null
  invite_code: string
  max_players: number
  status: CampaignStatus
  settings: Record<string, any>
  created_at: string
  updated_at: string
}

export interface CampaignMember {
  id: string
  campaign_id: string
  user_id: number
  character_id: number | null
  role: CampaignRole
  status: MemberStatus
  joined_at: string
  last_seen_at: string | null
}

export interface CreateCampaignRequest {
  name: string
  description?: string
  max_players?: number
  scenario_id?: string
  settings?: Record<string, any>
}

export interface UpdateCampaignRequest {
  name?: string
  description?: string
  max_players?: number
  scenario_id?: string
  status?: CampaignStatus
  settings?: Record<string, any>
}

export interface JoinCampaignRequest {
  invite_code: string
  character_id?: number
}

export interface UpdateMemberRoleRequest {
  role: CampaignRole
}

export interface Member {
  id: string
  user_id: number
  username?: string
  character_id: number | null
  character_name?: string | null
  role: CampaignRole
  status: MemberStatus
  joined_at: string
  last_seen_at: string | null
}
