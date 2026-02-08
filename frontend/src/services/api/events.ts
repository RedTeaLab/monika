/**
 * Events API client for fetching game events
 */

import type { EventEntry, EventFilter } from '@/types/event'

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
 * Fetch events for a session
 */
export async function getEvents(
  sessionId: string,
  filter: EventFilter = {}
): Promise<EventEntry[]> {
  const params = new URLSearchParams({
    session_id: sessionId,
    limit: (filter.limit || 100).toString(),
    offset: (filter.offset || 0).toString(),
  })

  if (filter.eventType) {
    params.append('event_type', filter.eventType)
  }
  if (filter.actorRole) {
    params.append('actor_role', filter.actorRole)
  }

  const response = await fetch(`${API_BASE}/events?${params}`, {
    headers: getHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Get event summary for a session
 */
export async function getEventSummary(sessionId: string) {
  const response = await fetch(`${API_BASE}/events/summary/${sessionId}`, {
    headers: getHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch event summary: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Get state changes for a session
 */
export async function getStateChanges(sessionId: string) {
  const response = await fetch(`${API_BASE}/events/state-changes/${sessionId}`, {
    headers: getHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch state changes: ${response.statusText}`)
  }

  return response.json()
}
