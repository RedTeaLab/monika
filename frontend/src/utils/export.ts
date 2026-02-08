/**
 * Export utility functions for exporting data to various formats
 */

import type { EventEntry } from '@/types/event'

/**
 * Format timestamp for filename
 */
function formatDateForFilename(date: Date): string {
  return date.toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19)
}

/**
 * Generate filename for export
 */
export function generateExportFilename(sessionId: string, format: 'json' | 'csv'): string {
  const timestamp = formatDateForFilename(new Date())
  return `monika_events_${sessionId}_${timestamp}.${format}`
}

/**
 * Export events as JSON file
 */
export function exportAsJSON(events: EventEntry[], sessionId: string): void {
  const data = {
    session_id: sessionId,
    exported_at: new Date().toISOString(),
    total_events: events.length,
    events: events,
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = generateExportFilename(sessionId, 'json')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Convert events to CSV format
 */
function eventsToCSV(events: EventEntry[]): string {
  // CSV header
  const headers = [
    'Timestamp',
    'Event Type',
    'Actor Role',
    'Description',
    'Character ID',
    'Visibility',
  ]

  // Convert events to CSV rows
  const rows = events.map((event) => {
    const timestamp = new Date(event.timestamp).toLocaleString()
    const description = event.description || JSON.stringify(event.payload)

    // Escape CSV fields (handle quotes and commas)
    const escapeField = (field: string): string => {
      const escaped = field.replace(/"/g, '""')
      if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')) {
        return `"${escaped}"`
      }
      return escaped
    }

    return [
      escapeField(timestamp),
      escapeField(event.event_type),
      escapeField(event.actor_role),
      escapeField(description),
      escapeField(event.character_id?.toString() || ''),
      escapeField(event.visibility),
    ].join(',')
  })

  // Combine header and rows
  return [headers.join(','), ...rows].join('\n')
}

/**
 * Export events as CSV file
 */
export function exportAsCSV(events: EventEntry[], sessionId: string): void {
  const csv = eventsToCSV(events)

  // Add BOM for Excel UTF-8 compatibility
  const bom = '\uFEFF'
  const blob = new Blob([bom + csv], {
    type: 'text/csv;charset=utf-8',
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = generateExportFilename(sessionId, 'csv')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Export events with specified format
 */
export function exportEvents(
  events: EventEntry[],
  sessionId: string,
  format: 'json' | 'csv'
): void {
  if (format === 'json') {
    exportAsJSON(events, sessionId)
  } else {
    exportAsCSV(events, sessionId)
  }
}
