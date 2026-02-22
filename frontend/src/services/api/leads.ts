/**
 * Leads API client for fetching game leads and clues
 */

import type { Lead, LeadFilter, CreateLeadRequest, UpdateLeadStatusRequest } from '@/types/lead'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

/**
 * Get authentication token from localStorage
 */
function getAuthToken(): string | null {
  return localStorage.getItem('access_token')
}

/**
 * Get API headers with authentication
 */
function getHeaders(): HeadersInit {
  const token = getAuthToken()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

/**
 * Get leads for a session with optional filtering
 */
export async function getLeads(
  sessionId: string,
  filter: LeadFilter = {}
): Promise<Lead[]> {
  const params = new URLSearchParams({
    session_id: sessionId,
  })

  if (filter.status) {
    params.append('status', filter.status)
  }
  if (filter.priority) {
    params.append('priority', filter.priority)
  }
  if (filter.type) {
    params.append('type', filter.type)
  }
  if (filter.visibility) {
    params.append('visibility', filter.visibility)
  }

  const response = await fetch(`${API_BASE}/leads?${params}`, {
    headers: getHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch leads: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Get a specific lead by ID
 */
export async function getLead(leadId: string): Promise<Lead> {
  const response = await fetch(`${API_BASE}/leads/${leadId}`, {
    headers: getHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch lead: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Create a new lead
 */
export async function createLead(
  sessionId: string,
  leadData: CreateLeadRequest
): Promise<Lead> {
  const response = await fetch(`${API_BASE}/leads?session_id=${sessionId}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(leadData),
  })

  if (!response.ok) {
    throw new Error(`Failed to create lead: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Update lead status
 */
export async function updateLeadStatus(
  leadId: string,
  statusUpdate: UpdateLeadStatusRequest
): Promise<Lead> {
  const response = await fetch(`${API_BASE}/leads/${leadId}/status`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(statusUpdate),
  })

  if (!response.ok) {
    throw new Error(`Failed to update lead status: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Delete a lead
 */
export async function deleteLead(leadId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/leads/${leadId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Failed to delete lead: ${response.statusText}`)
  }
}

/**
 * Add related lead
 */
export async function addRelatedLead(
  leadId: string,
  relatedLeadId: string
): Promise<Lead> {
  const response = await fetch(
    `${API_BASE}/leads/${leadId}/related?related_lead_id=${relatedLeadId}`,
    {
      method: 'POST',
      headers: getHeaders(),
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to add related lead: ${response.statusText}`)
  }

  return response.json()
}
