// Campaign API service
import { api } from '@/lib/api'
import type {
  Campaign,
  CampaignMember,
  CreateCampaignRequest,
  UpdateCampaignRequest,
  JoinCampaignRequest,
  UpdateMemberRoleRequest,
} from '@/types/campaign'

/**
 * Create a new campaign
 */
export async function createCampaign(data: CreateCampaignRequest): Promise<Campaign> {
  const response = await api.post<Campaign>('/campaigns', data)
  return response.data
}

/**
 * List all campaigns for current user
 */
export async function listCampaigns(): Promise<Campaign[]> {
  const response = await api.get<Campaign[]>('/campaigns')
  return response.data
}

/**
 * Get a campaign by ID
 */
export async function getCampaign(campaignId: string): Promise<Campaign> {
  const response = await api.get<Campaign>(`/campaigns/${campaignId}`)
  return response.data
}

/**
 * Update a campaign
 */
export async function updateCampaign(
  campaignId: string,
  data: UpdateCampaignRequest
): Promise<Campaign> {
  const response = await api.put<Campaign>(`/campaigns/${campaignId}`, data)
  return response.data
}

/**
 * Delete a campaign
 */
export async function deleteCampaign(campaignId: string): Promise<{ message: string }> {
  const response = await api.delete<{ message: string }>(`/campaigns/${campaignId}`)
  return response.data
}

/**
 * Generate a new invite code for a campaign
 */
export async function generateInviteCode(campaignId: string): Promise<{ invite_code: string }> {
  const response = await api.post<{ invite_code: string }>(`/campaigns/${campaignId}/invite`)
  return response.data
}

/**
 * Join a campaign with an invite code
 */
export async function joinCampaign(
  campaignId: string,
  data: JoinCampaignRequest
): Promise<CampaignMember> {
  const response = await api.post<CampaignMember>(`/campaigns/${campaignId}/join`, data)
  return response.data
}

/**
 * List members of a campaign
 */
export async function listCampaignMembers(campaignId: string): Promise<CampaignMember[]> {
  const response = await api.get<CampaignMember[]>(`/campaigns/${campaignId}/members`)
  return response.data
}

/**
 * Remove a member from a campaign
 */
export async function removeCampaignMember(
  campaignId: string,
  memberId: string
): Promise<{ message: string }> {
  const response = await api.delete<{ message: string }>(
    `/campaigns/${campaignId}/members/${memberId}`
  )
  return response.data
}

/**
 * Update a member's role
 */
export async function updateMemberRole(
  campaignId: string,
  memberId: string,
  data: UpdateMemberRoleRequest
): Promise<CampaignMember> {
  const response = await api.put<CampaignMember>(
    `/campaigns/${campaignId}/members/${memberId}/role`,
    data
  )
  return response.data
}

/**
 * Export all campaign API functions as a service object
 */
export const campaignsApi = {
  createCampaign,
  listCampaigns,
  getCampaign,
  updateCampaign,
  deleteCampaign,
  generateInviteCode,
  joinCampaign,
  listCampaignMembers,
  removeCampaignMember,
  updateMemberRole,
}
