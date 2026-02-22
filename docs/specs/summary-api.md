# Summary API Specification

**Version**: 1.0.0
**Milestone**: M3 - Memory Web
**Component**: Summary System

---

## Overview

The Summary API provides endpoints for generating, storing, and querying structured summaries of game sessions. Summaries include narrative descriptions, key events, state changes, and statistics.

---

## Base Path

```
/api/v1/summaries
```

---

## Authentication

All endpoints require JWT authentication via the `Authorization` header:

```
Authorization: Bearer <token>
```

---

## Endpoints

### 1. Generate Summary

Generate a new summary for a session or time range.

**Endpoint**: `POST /summaries/generate`

**Request Body**:
```json
{
  "session_id": "uuid",
  "start_time": "2026-02-22T10:00:00Z",
  "end_time": "2026-02-22T12:00:00Z",
  "summary_type": "session|scene|checkpoint",
  "use_llm": true,
  "include_kp_only": false
}
```

**Parameters**:
- `session_id` (required): UUID of the session
- `start_time` (optional): Start of time range (default: session start)
- `end_time` (optional): End of time range (default: now)
- `summary_type` (optional): Type of summary (default: "session")
- `use_llm` (optional): Use LLM for narrative generation (default: true)
- `include_kp_only` (optional): Include KP-only events (default: false)

**Response** (200 OK):
```json
{
  "summary_id": "uuid",
  "session_id": "uuid",
  "status": "completed",
  "summary": {
    "summary_id": "uuid",
    "session_id": "uuid",
    "created_at": "2026-02-22T12:00:00Z",
    "updated_at": "2026-02-22T12:00:00Z",
    "session_info": {
      "started_at": "2026-02-22T10:00:00Z",
      "ended_at": "2026-02-22T12:00:00Z",
      "duration_seconds": 7200,
      "scene_id": "scene_001",
      "scene_title": "The Mysterious Library"
    },
    "narrative_summary": {
      "brief": "Investigation of the mysterious library revealed ancient cult activity.",
      "detailed": "The investigators entered the abandoned library and discovered evidence of dark rituals...",
      "mood": "mystery",
      "tone": "Suspenseful with elements of horror"
    },
    "key_events": [...],
    "state_changes": {...},
    "leads": {...},
    "promises": [...],
    "statistics": {...},
    "visibility": {...}
  }
}
```

**Response** (202 Accepted):
```json
{
  "summary_id": "uuid",
  "session_id": "uuid",
  "status": "pending",
  "message": "Summary generation in progress"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid parameters
- `404 Not Found`: Session not found
- `500 Internal Server Error`: Generation failed

---

### 2. Get Summary by ID

Retrieve a specific summary by its ID.

**Endpoint**: `GET /summaries/{summary_id}`

**Parameters**:
- `summary_id` (path): UUID of the summary

**Query Parameters**:
- `include_kp_only` (boolean): Include KP-only content (default: false)

**Response** (200 OK):
```json
{
  "summary_id": "uuid",
  "session_id": "uuid",
  "created_at": "2026-02-22T12:00:00Z",
  "updated_at": "2026-02-22T12:00:00Z",
  ...
}
```

**Error Responses**:
- `404 Not Found`: Summary not found
- `403 Forbidden`: Insufficient permissions

---

### 3. Get Session Summaries

Get all summaries for a specific session.

**Endpoint**: `GET /summaries/session/{session_id}`

**Parameters**:
- `session_id` (path): UUID of the session

**Query Parameters**:
- `summary_type` (string): Filter by type (session|scene|checkpoint)
- `limit` (integer): Max results (default: 10, max: 100)
- `offset` (integer): Pagination offset (default: 0)
- `order` (string): Sort order (asc|desc, default: desc)

**Response** (200 OK):
```json
{
  "total": 5,
  "limit": 10,
  "offset": 0,
  "summaries": [...]
}
```

---

### 4. Get Campaign Summaries

Get summaries for all sessions in a campaign.

**Endpoint**: `GET /summaries/campaign/{campaign_id}`

**Parameters**:
- `campaign_id` (path): UUID of the campaign

**Query Parameters**:
- `start_date` (datetime): Filter summaries after this date
- `end_date` (datetime): Filter summaries before this date
- `summary_type` (string): Filter by type
- `limit` (integer): Max results (default: 10)
- `offset` (integer): Pagination offset

**Response** (200 OK):
```json
{
  "campaign_id": "uuid",
  "total": 25,
  "summaries": [...]
}
```

---

### 5. Update Summary

Update an existing summary with new events.

**Endpoint**: `PUT /summaries/{summary_id}`

**Request Body**:
```json
{
  "regenerate": false,
  "append_events": true
}
```

**Parameters**:
- `regenerate` (boolean): Fully regenerate summary (default: false)
- `append_events` (boolean): Append new events since last update (default: true)

**Response** (200 OK):
```json
{
  "summary_id": "uuid",
  "session_id": "uuid",
  "updated_at": "2026-02-22T13:00:00Z",
  "events_added": 15,
  "summary": {...}
}
```

---

### 6. Delete Summary

Delete a summary (soft delete).

**Endpoint**: `DELETE /summaries/{summary_id}`

**Response** (204 No Content)

---

### 7. Export Summary

Export a summary in various formats.

**Endpoint**: `GET /summaries/{summary_id}/export`

**Query Parameters**:
- `format` (string): Export format (json|markdown|pdf, default: json)
- `include_kp_only` (boolean): Include KP-only content

**Response** (200 OK):
- `format=json`: JSON download
- `format=markdown`: Markdown file download
- `format=pdf`: PDF file download

---

## Data Structures

### SessionSummary

```typescript
interface SessionSummary {
  summary_id: string;
  session_id: string;
  created_at: datetime;
  updated_at: datetime;

  session_info: {
    started_at: datetime;
    ended_at?: datetime;
    duration_seconds?: number;
    scene_id?: string;
    scene_title?: string;
  };

  narrative_summary: {
    brief: string;
    detailed: string;
    mood: 'calm' | 'tense' | 'horror' | 'mystery' | 'action';
    tone: string;
  };

  key_events: KeyEvent[];
  state_changes: StateChanges;
  leads: Leads;
  promises: Promise[];
  statistics: SessionStatistics;
  visibility: Record<string, any>;
}
```

### KeyEvent

```typescript
interface KeyEvent {
  event_id: string;
  timestamp: datetime;
  type: 'clue_discovered' | 'combat_occurred' | 'san_check_failed' |
        'madness_triggered' | 'character_injured' | 'character_died' |
        'scene_transition' | 'puzzle_solved' | 'mystery_revealed' |
        'critical_failure';
  title: string;
  description: string;
  participants: EventParticipant[];
  outcome?: EventOutcome;
  related_clues: string[];
  visibility: 'public' | 'kp' | 'player:*';
}
```

### CharacterStateChange

```typescript
interface CharacterStateChange {
  character_id: number;
  character_name: string;
  changes: {
    hp: { old: number; new: number; delta: number };
    san: { old: number; new: number; delta: number; events: string[] };
    luck: { old: number; new: number; delta: number };
    mp?: { old: number; new: number; delta: number };
  };
  status_changes: StatusChange[];
  skill_changes: SkillChange[];
  inventory_changes: InventoryChange;
}
```

### SessionStatistics

```typescript
interface SessionStatistics {
  message_count: number;
  roll_count: number;
  combat_count: number;
  san_check_count: number;
  injury_count: number;
  clue_discovery_count: number;
}
```

---

## Error Handling

All error responses follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  }
}
```

### Common Error Codes

- `INVALID_REQUEST`: Malformed request
- `NOT_FOUND`: Resource not found
- `UNAUTHORIZED`: Missing or invalid authentication
- `FORBIDDEN`: Insufficient permissions
- `CONFLICT`: Resource state conflict
- `INTERNAL_ERROR`: Server error

---

## Rate Limiting

- Generate Summary: 10 requests per minute per user
- Get Summary: 100 requests per minute per user
- Export Summary: 20 requests per minute per user

---

## Webhooks

### Summary Completed

When summary generation completes, a webhook is sent to configured endpoints:

```json
{
  "event": "summary.completed",
  "timestamp": "2026-02-22T12:00:00Z",
  "data": {
    "summary_id": "uuid",
    "session_id": "uuid",
    "status": "completed"
  }
}
```

---

## Examples

### Generate Session Summary

```bash
curl -X POST https://api.monika.app/api/v1/summaries/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "123e4567-e89b-12d3-a456-426614174000",
    "summary_type": "session",
    "use_llm": true
  }'
```

### Get Latest Session Summary

```bash
curl https://api.monika.app/api/v1/summaries/session/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Export Summary as Markdown

```bash
curl https://api.monika.app/api/v1/summaries/abc123/export?format=markdown \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o summary.md
```

---

**Last Updated**: 2026-02-22
**API Version**: 1.0.0
